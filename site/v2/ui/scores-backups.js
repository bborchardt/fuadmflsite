// Scores' backup starters (bylaw 16.5; with the `backupStarters` setting): an open card's pairs as the
// daily job reads them (lineup-backups.js), shown once locked: "If out → B" on a starter still
// starting, "in for A" on a backup the job swapped in.

import {DEADLINE_BEFORE_KICKOFF, lineupAt} from "../lib/backups.js";
import {mflTime} from "../lib/zone.js";
import {kickoffsOf, teamBackups, weekFacts} from "./lineup-backups.js";
import {readLineups, readThreads, weekKickoffs} from "./lineup-board.js";

// A team's pairs locked by `now`, from its lineups and the board as the job reads them, each with
// `counted`: whether its starter started and its backup sat at its deadline (16.5.3). With no lineup
// sent before a deadline (last week's carried) the pair counts, as that lineup isn't read here.
// `lines`: the card's starters and bench (league-model's), standing in for Lineup's page.
export function lockedPairs(lines, {posts, lineups, team, week, kickoffs, before, now}) {
    const page = {
        players: lines.map((line) => ({id: line.id, name: line.name, mflName: line.sortName || line.name, pos: line.position, nfl: line.team || "", onBye: false}))
    };
    const facts = weekFacts(page, kickoffs, before);
    const byName = (entry) => (page.players.find((player) => player.mflName === entry.name && player.pos === entry.pos)
        || page.players.find((player) => player.mflName === entry.name) || {}).id;
    const submissions = lineups.map((submission) => ({...submission, at: mflTime(submission.at), starters: submission.starters.map(byName)}));
    return teamBackups(posts, lineups, {team, week, page, facts}).pairs
        .filter((pair) => pair.deadline <= now)
        .map((pair) => {
            const starting = lineupAt(submissions, pair.deadline, null);
            const counted = !starting || (starting.includes(pair.starter) && !starting.includes(pair.backup));
            return {starter: pair.starter, backup: pair.backup, deadline: pair.deadline, counted};
        });
}

// What the pairs put on a team's lines, by player: {backup} on a starter still starting, {inFor} on
// a backup starting in his starter's place. Two pairs with one backup count for neither, as the job
// uses neither.
export function backupMarks(team, pairs) {
    const marks = new Map();
    const starting = new Set(team.starters.map((line) => line.id));
    const all = new Map(team.starters.concat(team.bench).map((line) => [line.id, line]));
    const counted = pairs.filter((each) => each.counted);
    const shared = (pair) => counted.filter((each) => each.backup === pair.backup).length > 1;
    for (const pair of counted.filter((each) => !shared(each) && all.has(each.starter) && all.has(each.backup))) {
        if (starting.has(pair.starter) && !starting.has(pair.backup)) {
            marks.set(pair.starter, {backup: all.get(pair.backup).name});
        } else if (!starting.has(pair.starter) && starting.has(pair.backup)) {
            marks.set(pair.backup, {inFor: all.get(pair.starter).name});
        }
    }
    return marks;
}

// Scores' reads: `pairsOf(week, team, lines)`, nothing before the week's first deadline, then once
// for the visit, and again once another deadline has passed, as each pair locks at its own
export function backupReader(context, now = () => Date.now() / 1000) {
    const schedules = new Map();
    const kickoffs = (week) => {
        if (!schedules.has(week)) {
            schedules.set(week, weekKickoffs(context.season, week, {keep: true}).then(kickoffsOf, (error) => {
                schedules.delete(week);
                throw error;
            }));
        }
        return schedules.get(week);
    };
    // {at, read}: the read and when it was asked, again once a deadline has passed since
    const reads = new Map();
    const fresh = (key, deadlines, at, load) => {
        const found = reads.get(key);
        if (found && !deadlines.some((deadline) => found.at < deadline && deadline <= at)) {
            return found.read;
        }
        const read = load().catch((error) => {
            reads.delete(key);
            throw error;
        });
        reads.set(key, {at, read});
        return read;
    };
    return async (week, team, lines) => {
        const at = now();
        const [these, before] = await Promise.all([kickoffs(week), week > 1 ? kickoffs(week - 1) : new Map()]);
        const deadlines = [...new Set([...these.values()].filter(Boolean))].map((kickoff) => kickoff - DEADLINE_BEFORE_KICKOFF);
        if (!deadlines.length || at < Math.min(...deadlines)) {
            return [];
        }
        const load = async () => {
            const [posts, lineups] = await Promise.all([fresh("posts", deadlines, at, () => readThreads(context)), readLineups(context, team, week)]);
            return lockedPairs(lines, {posts, lineups, team, week, kickoffs: these, before, now: at});
        };
        return fresh(`${week}|${team}`, deadlines, at, load);
    };
}
