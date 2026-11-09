// Lineup's backup starters (bylaw 16.5, lib/backups.js; on with the `backupStarters` setting): the
// team's pairs for the week as the daily job reads them, from its lineups' messages and the
// "Conditional starters" thread, who may back up whom, and the message Save writes. The rules are in
// docs/design.md.

import {DEADLINE_BEFORE_KICKOFF, backupMessages, backupText, matchPlayer, pairDeadline, pairsBreak, postAsks, postWeek, sourceRequests, standingPairs} from "../lib/backups.js";
import {asArray} from "../lib/mfl.js";
import {mflTime} from "../lib/zone.js";

// MFL's nflSchedule as each NFL team's kickoff, in seconds
export function kickoffsOf(schedule) {
    const kickoffs = new Map();
    for (const game of asArray(schedule && schedule.matchup)) {
        for (const team of asArray(game.team)) {
            kickoffs.set(team.id, Number(game.kickoff) || null);
        }
    }
    return kickoffs;
}

// The week as Lineup needs it: `kickoff(id)`, `deadline(starter, backup)` (seconds, or null when
// either has no game), `positionOf(id)`, and `inWeek(at)`, whether a moment is the job's for this
// week: from the week before's last kickoff (`before`, its kickoffs; none for week 1) to this one's
export function weekFacts(page, kickoffs, before = new Map()) {
    const byId = new Map(page.players.map((player) => [player.id, player]));
    const kickoff = (id) => {
        const player = byId.get(id);
        return (player && !player.onBye && kickoffs.get(player.nfl.replace("*", ""))) || null;
    };
    const deadline = pairDeadline(kickoff);
    const last = (map) => Math.max(-Infinity, ...[...map.values()].filter(Boolean));
    const [from, until] = [last(before), last(kickoffs)];
    return {byId, kickoff, deadline, positionOf: (id) => (byId.get(id) || {}).pos, inWeek: (at) => at >= from && at < until};
}

export const samePairs = (a, b) => a.size === b.size && [...a].every(([starter, backup]) => b.get(starter) === backup);

// The team's requests for the week and the pairs standing from them, read as the job reads them
// (lib/backups.js): from its lineups' messages (backupMessages) and its posts, a post naming its week
// or being the week's by when it was posted, and an edit into another week leaving it out. Names match
// the whole roster, IR too, as the job's do; one on IR asks nothing here. `posts`: readTopicPage's, with
// `at` (its last edit) and `postedAt`, in seconds; `lineups`: readLineupDetails' for the week. A post
// naming a week the season doesn't have counts for none here: the job takes it as its posted week's
// and flags it, and Lineup doesn't read the season's weeks for that alone.
export function teamBackups(posts, lineups, {team, week, page, facts}) {
    const roster = [
        ...page.players.map((player) => ({id: player.id, name: player.mflName})),
        ...(page.irNames || []).map((name, i) => ({id: `ir${i}`, name}))
    ];
    // this week, or another: all the job's reading needs to tell
    const weekAt = (at) => (facts.inWeek(at) ? week : -1);
    const sources = [];
    for (const post of posts) {
        if (post.franchiseId !== team || !post.at || !post.postedAt) {
            continue;
        }
        const asks = postAsks(post);
        const found = postWeek(asks, {postedWeek: weekAt(post.postedAt), editedWeek: weekAt(post.at)}, Infinity);
        if (found.week === week) {
            sources.push({at: post.at, asks, badWeek: found.badWeek, editedLate: found.editedLate});
        }
    }
    for (const {submission, asks} of backupMessages(lineups, week)) {
        const at = mflTime(submission.at);
        if (at) {
            sources.push({at, asks});
        }
    }
    const who = (phrase) => {
        const id = (matchPlayer(phrase, roster).player || {}).id;
        return id && facts.byId.has(id) ? id : null;
    };
    const requests = sourceRequests(sources, who);
    return {requests, pairs: standingPairs(requests, facts.deadline).pairs};
}

// The pairs as Lineup holds them, starter → backup: `locked` (16.5.5) the ones past their deadline
// that count, their starter starting and backup sitting in the lineup MFL has (16.5.3); `unlocked`
// every pair still open, whatever the lineup: one whose starter sits, or whose backup starts, is set
// aside rather than gone, as it counts again if the lineup changes back
export function heldPairs(pairs, base, now) {
    const locked = new Map();
    const unlocked = new Map();
    for (const pair of pairs) {
        if (pair.deadline > now) {
            unlocked.set(pair.starter, pair.backup);
        } else if (base.has(pair.starter) && !base.has(pair.backup)) {
            locked.set(pair.starter, pair.backup);
        }
    }
    return {locked, unlocked};
}

// the pairs a lineup puts in force: its starter starting, its backup sitting (16.5.3)
export function keptPairs(pairs, on) {
    return new Map([...pairs].filter(([starter, backup]) => on.has(starter) && !on.has(backup)));
}

// What the member's open pairs change from the unlocked ones standing: `set`, the pairs to save
// ([starter, backup]); `dropped`, the starters whose pair the member took away
export function pendingPairs(open, standing) {
    return {
        set: [...open].filter(([starter, backup]) => standing.get(starter) !== backup),
        dropped: [...standing.keys()].filter((starter) => !open.has(starter))
    };
}

// whether a starter may be given a backup now: his game hasn't started and is still 5 minutes off
export function canHaveBackup(player, on, facts, now) {
    const kickoff = facts.kickoff(player.id);
    return on.has(player.id) && !player.locked && Boolean(kickoff) && kickoff - DEADLINE_BEFORE_KICKOFF > now;
}

// "would start 4 at RB (most 3)"
function breakWhy(broken) {
    if (!broken.pos) {
        return "doesn't fit the lineup";
    }
    return broken.over ? `would start ${broken.count} at ${broken.pos} (most ${broken.limit})` : `would leave ${broken.count} at ${broken.pos} (least ${broken.limit})`;
}

// The picker's choices for `starter`: the bench players who can back him up, his own position
// first, each with when the pair would lock, then the others with why not. `pairs`: the team's
// other pairs (locked and open, set aside too), starter → backup; the ones the lineup puts in force
// count toward the fit.
export function choices(page, {starter, on, pairs, facts, now}) {
    const rules = {count: page.total, limits: page.limits};
    const starters = [...on];
    const rest = new Map([...pairs].filter(([id]) => id !== starter.id));
    const others = [...keptPairs(rest, on)].map(([id, backup]) => ({starter: id, backup}));
    const backing = new Map([...rest].map(([id, backup]) => [backup, id]));
    const can = [];
    const cant = [];
    for (const player of page.players.filter((each) => !on.has(each.id))) {
        const deadline = facts.deadline(starter.id, player.id);
        const backed = backing.get(player.id);
        const broken = (pairsBroken) => pairsBroken && breakWhy(pairsBroken);
        const why = player.onBye ? "on a bye"
            : !facts.kickoff(player.id) ? "has no game this week"
                : player.locked ? "his game has started"
                    : /^(Out|IR|Suspended)$/.test(player.injury) ? player.injury
                        : backed ? `${facts.byId.get(backed).name}'s backup`
                            : deadline <= now ? "past the deadline"
                                : broken(pairsBreak(starters, [...others, {starter: starter.id, backup: player.id}], facts.positionOf, rules));
        if (why) {
            cant.push({player, why});
        } else {
            can.push({player, deadline});
        }
    }
    can.sort((a, b) => (a.player.pos === starter.pos ? 0 : 1) - (b.player.pos === starter.pos ? 0 : 1));
    return {can, cant};
}

// the starters whose standing pair has locked, counting or set aside: theirs can't change (16.5.5)
export function lockedStarters(team, now) {
    return new Set(team.pairs.filter((pair) => pair.deadline <= now).map((pair) => pair.starter));
}

// whether a starter gets the "+ Backup" button: he may have one, his pair hasn't locked, and someone
// can be it
export function backupOffered(page, {starter, on, pairs, facts, now, locked}) {
    return canHaveBackup(starter, on, facts, now) && !locked.has(starter.id) && choices(page, {starter, on, pairs, facts, now}).can.length > 0;
}

// What stops Save from posting the member's pairs: a change to a pair that has locked since it was
// made ({starter, lockedAt}), or one in force that no longer holds, as the lineup or the injury
// report changed after it was picked ({starter, why}, or {why} for the pairs together)
export function pairProblems(page, {open, standing, on, team, facts, now}) {
    const locked = lockedStarters(team, now);
    const changed = (starter) => standing.get(starter) !== open.get(starter);
    const problems = [];
    for (const starter of new Set([...open.keys(), ...standing.keys()])) {
        const deadlines = [...team.pairs.filter((pair) => pair.starter === starter).map((pair) => pair.deadline), facts.deadline(starter, open.get(starter) || standing.get(starter))];
        if (changed(starter) && (locked.has(starter) || Math.min(...deadlines) <= now)) {
            problems.push({starter, lockedAt: Math.min(...deadlines)});
        }
    }
    const inForce = [...keptPairs(open, on)].map(([starter, backup]) => ({starter, backup}));
    for (const pair of inForce.filter((each) => changed(each.starter))) {
        const backup = facts.byId.get(pair.backup);
        if (/^(Out|IR|Suspended)$/.test(backup.injury)) {
            problems.push({starter: pair.starter, why: `${backup.name} is ${{Out: "out", IR: "on IR", Suspended: "suspended"}[backup.injury]}`});
        }
    }
    const broken = pairsBreak([...on], inForce, facts.positionOf, {count: page.total, limits: page.limits});
    if (broken && broken.pos) {
        problems.push({why: `the backups together ${breakWhy(broken)}`});
    }
    return problems;
}

// The message Save writes in the lineup, or null when the open pairs are as they stand. `open`: the
// member's unlocked pairs (starter → backup); `before`: the standing unlocked ones; `team`:
// teamBackups'. It restates every pair, the locked ones too (the job takes a restated locked pair as no
// change), so the latest message alone has them all, and takes back each unlocked pair the member
// dropped, which an older message or a post may have made.
export function backupMessage(team, {open, before, week, facts, now}) {
    if (samePairs(open, before)) {
        return null;
    }
    const name = (id) => facts.byId.get(id).name;
    const locked = team.pairs.filter((pair) => pair.deadline <= now && facts.byId.has(pair.starter) && facts.byId.has(pair.backup));
    const pairs = [...locked.map((pair) => [pair.starter, pair.backup]), ...open].map(([starter, backup]) => ({starter: name(starter), backup: name(backup)}));
    const removed = [...before.keys()].filter((starter) => !open.has(starter)).map(name);
    return backupText(week, pairs, removed);
}
