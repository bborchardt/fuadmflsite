// The daily job's side of backup starters (bylaw 16.5): who was inactive, from nflverse, and the
// commissioner's forms it fills on MFL, and the chore itself. Reading posts and the week's lineup is
// lib/backups.js.

import {existsSync, readFileSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {mflForm} from "./mfl-form.mjs";
import {networkError} from "./network-error.mjs";

// nflverse's weekly rosters: each player's status for each week's game, INA when he was inactive
export const NFLVERSE_ROSTERS = (season) => `https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_${season}.csv`;
// DynastyProcess's player ids, MFL's beside the NFL's (gsis)
export const PLAYER_IDS = "https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv";

// nflverse's team codes where MFL's differ (nflverse's LA too, unlike the NFL's own feeds)
const MFL_TEAMS = {GB: "GBP", JAX: "JAC", KC: "KCC", LA: "LAR", LV: "LVR", NE: "NEP", NO: "NOS", SF: "SFO", TB: "TBB"};
export const mflTeam = (team) => MFL_TEAMS[team] || team;

// A CSV file's rows as objects, by its header; a field may be quoted, with "" for a quote
export function readCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === "\"" && text[i + 1] === "\"") {
                field += "\"";
                i++;
            } else if (ch === "\"") {
                quoted = false;
            } else {
                field += ch;
            }
        } else if (ch === "\"") {
            quoted = true;
        } else if (ch === ",") {
            row.push(field);
            field = "";
        } else if (ch === "\n" || ch === "\r") {
            if (ch === "\r" && text[i + 1] === "\n") {
                i++;
            }
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
        } else {
            field += ch;
        }
    }
    if (field || row.length) {
        row.push(field);
        rows.push(row);
    }
    const [header = [], ...body] = rows;
    return body.filter((cells) => cells.length > 1).map((cells) => Object.fromEntries(header.map((name, i) => [name, cells[i] || ""])));
}

// A week's game-day status by MFL player id ({status, team}, team as MFL writes it), and the teams
// whose inactive list nflverse has: a team with a game always has inactive players, so one without
// any isn't in yet
export function weekStatuses(rosterRows, idRows, week) {
    const mflId = new Map(idRows.filter((row) => row.mfl_id && row.gsis_id).map((row) => [row.gsis_id, row.mfl_id]));
    const statuses = new Map();
    const reported = new Set();
    for (const row of rosterRows) {
        if (Number(row.week) !== week) {
            continue;
        }
        const team = mflTeam(row.team);
        if (row.status === "INA") {
            reported.add(team);
        }
        const id = mflId.get(row.gsis_id);
        if (id) {
            statuses.set(id, {status: row.status, team});
        }
    }
    return {statuses, reported};
}

const attribute = (tag, name) => {
    const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
    return match ? (match[1] ?? match[2] ?? match[3]) : null;
};

// The commissioner's Submit Lineup form for a team's week: its own fields, and a box per player
// that can start (a disabled one, a bye, has no name)
export function readLineupForm(html, {team, week}) {
    const form = [...String(html).matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gi)].map((match) => match[0])
        .find((each) => /\/lineup["']/.test(each.slice(0, 200)) && /name=["']?WEEK\b/.test(each));
    if (!form) {
        throw new Error(`MFL's Submit Lineup page for team ${team}, week ${week}, has no lineup form; is the job the commissioner?`);
    }
    const fields = [];
    const boxes = new Map();
    for (const tag of form.match(/<input\b[^>]*>/gi) || []) {
        const type = (attribute(tag, "type") || "text").toLowerCase();
        const name = attribute(tag, "name");
        if (type === "hidden" && name) {
            fields.push([name, attribute(tag, "value") || ""]);
        } else if (type === "checkbox" && name) {
            boxes.set(attribute(tag, "value"), name);
        }
    }
    const source = /<select\b[^>]*name=["']?PROJSRC[\s\S]*?<\/select>/i.exec(form);
    if (source) {
        const chosen = /<option\b[^>]*selected[^>]*>/i.exec(source[0]) || /<option\b[^>]*>/i.exec(source[0]);
        fields.push(["PROJSRC", chosen ? attribute(chosen[0], "value") || "" : ""]);
    }
    const own = Object.fromEntries(fields);
    if (own.FRANCHISE !== team || Number(own.WEEK) !== week) {
        throw new Error(`MFL's Submit Lineup page gave team ${own.FRANCHISE}, week ${own.WEEK}, not team ${team}, week ${week}`);
    }
    return {fields, boxes};
}

// the form's fields for a lineup of these players
export function lineupFields(form, starters, message = "") {
    const missing = starters.filter((id) => !form.boxes.has(id));
    if (missing.length) {
        throw new Error(`MFL's lineup form has no box for player(s) ${missing.join(", ")}`);
    }
    const team = Object.fromEntries(form.fields).FRANCHISE;
    return [...form.fields, ...starters.map((id) => [form.boxes.get(id), id]), [`MESSAGE${team}`, message], ["SUBMIT", "Submit Lineup"]];
}

export const lineupSaved = (body) => /lineup\s+SUBMITTED/i.test(body) && !/Error\(s\) submitting lineup/i.test(body);

// Recalculate Standings for one week, with no email to the owners
export function recalcFields(html, week) {
    const form = [...String(html).matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gi)].map((match) => match[0])
        .find((each) => /name=["']?form_name["']?\s+value=["']?recalc\b/i.test(each));
    const hidden = new Map((form ? form.match(/<input\b[^>]*>/gi) || [] : [])
        .filter((tag) => /type=["']?hidden/i.test(tag)).map((tag) => [attribute(tag, "name"), attribute(tag, "value") || ""]));
    if (!form || !hidden.get("input_expires") || !new RegExp(`<option\\b[^>]*value=["']?${week}["'\\s>]`).test(form)) {
        throw new Error(`MFL's Recalculate Standings page has no form for week ${week}`);
    }
    return [...hidden.entries(), ["WEEK", String(week)], ["SENDMAIL", "No"], ["PREVWEEK", "No"], ["SUBMIT", "Recalculate Standings"]];
}

// what the job changed in a team's lineup, for its log: "Josh Allen started for Tyler Warren, who was inactive"
export function changeText({swaps, restored}, nameOf) {
    return [
        ...restored.map((pair) => `${nameOf(pair.starter)} and ${nameOf(pair.backup)} were locked in as they were at their deadline (16.5.5), so the later change was undone`),
        ...swaps.map((pair) => `${nameOf(pair.backup)} started for ${nameOf(pair.starter)}, who was inactive`)
    ].join("; ");
}

export const sameLineup = (a, b) => a.length === b.length && a.every((id) => b.includes(id));
// a team's starters in MFL's saved results for a week
export const startersIn = (results, team) => String((results.find((each) => each.id === team) || {}).starters || "").split(",").filter(Boolean);

// What a team's week comes to (bylaw 16.5), once its pairs stand: `change`, the lineup to put in
// ({lineup, submit, what}; `submit` false when only the week's recalculation is still to come), or
// null; `flags`, for the commissioner; and `notes`, for the log, the pairs that changed nothing and
// why. `submissions`: the week's Lineup Details, with times in seconds and starters as ids;
// `statuses`: nflverse's (weekStatuses); `rules`, `lineupAt` and `weekLineup` are the version's lib's.
// `results` reads MFL as needed: `saved()` the week's results, `lastWeek()` the week before's,
// `scores(ids)` the players' scores ([{id, score}]).
export async function teamChange({team, week, pairs, submissions, statuses, positionOf, rules, kickoffOf, nameOf}, {lineupAt, weekLineup}, results) {
    const flags = [];
    const flag = (why) => flags.push(why);
    if (submissions.some((submission) => submission.unread || submission.at === null)) {
        flag("a lineup on MFL's Lineup Details couldn't be read");
        return {flags, change: null, notes: []};
    }
    if (submissions.some((submission) => submission.starters.includes(undefined))) {
        flag("a lineup on MFL's Lineup Details names a player not on the team's roster that week");
        return {flags, change: null, notes: []};
    }
    const saved = startersIn(await results.saved(), team);
    // without a lineup of the week's, MFL keeps last week's: what it scored, when nothing
    // was submitted all week, else last week's result
    const carried = submissions.length ? startersIn(week > 1 ? await results.lastWeek() : [], team) : saved;
    // MFL's own record of what the team's lineup was, unless the job's change is still to be scored
    const latest = submissions.filter((submission) => !submission.failed).at(-1);
    const final = latest && latest.commish || !saved.length ? lineupAt(submissions, Infinity, carried) : saved;
    const usable = [];
    for (const pair of pairs) {
        const starting = lineupAt(submissions, pair.deadline, carried);
        if (!starting.length) {
            flag(`the lineup at the deadline of ${nameOf(pair.backup)} for ${nameOf(pair.starter)} isn't known (no lineup submitted before it, nor last week's)`);
            continue;
        }
        // a pair whose starter wasn't starting, or backup wasn't benched, does nothing
        if (!starting.includes(pair.starter) || starting.includes(pair.backup)) {
            continue;
        }
        const status = (statuses.get(pair.starter) || {}).status;
        if (status !== "ACT" && status !== "INA") {
            flag(`${nameOf(pair.starter)}'s week ${week} status on nflverse is ${status || "missing"}, so his backup ${nameOf(pair.backup)} wasn't started`);
            continue;
        }
        // one nflverse doesn't list (no id match) can't be told benched from active
        if (!statuses.has(pair.backup)) {
            flag(`${nameOf(pair.backup)}, ${nameOf(pair.starter)}'s backup, isn't in nflverse's week ${week} rosters, so he wasn't started`);
            continue;
        }
        usable.push({...pair, starting});
    }
    // a backup inactive too, or on no game-day roster (IR, suspended, cut), stays on the bench
    const out = new Set([...usable.map((pair) => pair.starter).filter((id) => statuses.get(id).status === "INA"),
        ...usable.map((pair) => pair.backup).filter((id) => (statuses.get(id) || {}).status !== "ACT")]);
    if (out.size) {
        const scores = await results.scores([...out]);
        for (const id of [...out]) {
            const score = Number((scores.find((each) => each.id === id) || {}).score);
            if (score > 0) {
                out.delete(id);
                flag(`nflverse lists ${nameOf(id)} as inactive, but he scored ${score}, so he's taken as active`);
            }
        }
    }
    // a pair left as it was, for the log, so a request read is seen to have been
    const notes = usable.flatMap((pair) => {
        if (statuses.get(pair.starter).status === "ACT") {
            return [`${nameOf(pair.starter)} was active, so ${nameOf(pair.backup)} wasn't started for him`];
        }
        return out.has(pair.starter) && out.has(pair.backup)
            ? [`${nameOf(pair.starter)} was inactive, but so was ${nameOf(pair.backup)}, so he wasn't started for him`] : [];
    });
    const result = weekLineup({pairs: usable, final, out, positionOf, rules, kickoff: kickoffOf});
    for (const {pair, why} of result.flags) {
        flag(`${nameOf(pair.backup)} for ${nameOf(pair.starter)}: ${{"same-backup": "the same backup for two starters (16.5.2)",
            "cant-restore": "the lineup changed after the pair's deadline and couldn't be put back",
            "wont-fit": "swapping him in would break the lineup's position limits"}[why]}`);
    }
    // the pairs in effect that the team hadn't made itself
    // and one an earlier run made that MFL's saved result doesn't have yet
    const swaps = [...result.swaps, ...usable.filter((pair) => !result.swaps.includes(pair) && out.has(pair.starter)
        && result.lineup.includes(pair.backup) && !result.lineup.includes(pair.starter) && saved.includes(pair.starter))];
    // MFL's saved result, not the lineup, says whether the week was recalculated, as a run can
    // fail between the two
    const change = !sameLineup(result.lineup, final) || !sameLineup(result.lineup, saved)
        ? {lineup: result.lineup, submit: !sameLineup(result.lineup, final), what: changeText({swaps, restored: result.restored}, nameOf)}
        : null;
    return {flags, change, notes};
}

// The week whose games are still to come at a moment (seconds), or null after the championship: a post
// on Sunday afternoon is for this week. `kickoffs(week)`: the week's kickoffs, in seconds, kept by
// the caller, as this asks for a few weeks' at each moment.
export function weekFinder(kickoffs, championship) {
    let firstKickoff = null;
    return async (at) => {
        if (firstKickoff === null) {
            firstKickoff = Math.min(...await kickoffs(1));
        }
        let week = Math.min(championship, Math.max(1, Math.floor((at - firstKickoff) / (7 * 86400)) + 1));
        while (week > 1 && Math.max(...await kickoffs(week - 1)) > at) {
            week--;
        }
        while (week <= championship && !(Math.max(...await kickoffs(week)) > at)) {
            week++;
        }
        return week <= championship ? week : null;
    };
}

// the season's weeks whose backups are settled, on league-data, so each week is read once
const backupsFile = ({dataDir}) => join(dataDir, "backup-starters.json");
// null for a season the chore hasn't run in yet, as for a dry run of another league
function backupWeeksDone(ctx) {
    const {dataIsThisLeagues, season} = ctx;
    const file = backupsFile(ctx);
    if (!dataIsThisLeagues) {
        return null;
    }
    return (existsSync(file) ? JSON.parse(readFileSync(file, "utf8"))[season] : null) || null;
}
// the first week not yet settled; none before the chore's first run
export function firstOpenBackupWeek(ctx) {
    const record = backupWeeksDone(ctx);
    if (record === null) {
        return Infinity;
    }
    let week = 1;
    while (record.includes(week)) {
        week++;
    }
    return week;
}
// payouts' first week to wait, when the chore didn't finish and so didn't say: the first not yet
// settled, or none while the chore only logs, as run's own openFrom
export const openFromAfterFailure = (ctx) => (ctx.apply.backups ? firstOpenBackupWeek(ctx) : Infinity);
function markBackupWeeks(ctx, weeks) {
    const {season} = ctx;
    const file = backupsFile(ctx);
    const all = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
    all[season] = [...new Set([...(all[season] || []), ...weeks])].sort((a, b) => a - b);
    writeFileSync(file, JSON.stringify(all, null, 2) + "\n");
}

// nflverse's files; plain fetches, not MFL's
async function loadNflverse(season) {
    const load = async (url) => {
        const response = await fetch(url, {signal: AbortSignal.timeout(60000)}).catch((error) => {
            throw new Error(`Couldn't load ${url}: ${networkError(error)}`);
        });
        if (!response.ok) {
            throw new Error(`Couldn't load ${url}: HTTP ${response.status}`);
        }
        return readCsv(await response.text());
    };
    const [rosters, ids] = await Promise.all([load(NFLVERSE_ROSTERS(season)), load(PLAYER_IDS)]);
    return {rosters, ids};
}

// Bylaw 16.5: once a week's games are over and nflverse has every team's inactive list, each team's
// backups for inactive starters go in, each pair locked as it was at its deadline, and the week is
// recalculated. Resolves to {changed, openFrom}: whether league-data changed, and the first week
// whose backups are still to go in, which payouts wait for. docs/design.md has the rules.
export async function run(ctx, {league, playerNames, built}) {
    const {lib, session, loggedIn, dryRun, now, season, host, leagueId, dataIsThisLeagues, backupsOff, log, choreLog, needsAttention, fetchFrom, weekResults} = ctx;
    const {API_BASE, GAME_HOURS, asArray, displayName} = lib.mfl;
    const {THREAD_TITLE, backupMessages, lineupAt, lineupRules, matchPlayer, namedWeek, pairDeadline, postAsks, postWeek, readLineupDetails, readTopicPage,
        sourceRequests, standingPairs, weekLineup} = lib.backups;
    const {DEFAULT_END_WEEK} = lib.rules;
    const {WEEK_ROSTERS} = lib.shapes;
    const {mflTime} = lib.zone;
    const {normalize} = lib.names;
    const applyBackups = ctx.apply.backups;
    const untouched = {changed: false, openFrom: Infinity};
    if (backupsOff) {
        log("Backup starters: off (BACKUP_STARTERS isn't apply or log).");
        return untouched;
    }
    if (!loggedIn) {
        log("Backup starters: not checked, as the run isn't logged in (the board and the lineups need the commissioner).");
        return untouched;
    }
    // read once, for the first week that needs them
    let nflverse = null;
    const nflverseFiles = async () => {
        nflverse = nflverse || await loadNflverse(season);
        return nflverse;
    };
    const schedules = new Map();
    const schedule = async (week) => {
        if (!schedules.has(week)) {
            schedules.set(week, asArray((await fetchFrom(API_BASE, "nflSchedule", {W: week})).matchup));
        }
        return schedules.get(week);
    };
    const kickoffs = async (week) => (await schedule(week)).map((game) => Number(game.kickoff)).filter((seconds) => seconds > 0);
    const championship = (built.weeks && built.weeks.championship) || DEFAULT_END_WEEK;
    const weekOf = weekFinder(kickoffs, championship);
    const settled = [];
    const record = backupWeeksDone(ctx);
    // the board's posts by week; every week over is checked, as any team's lineup can carry a message
    const byWeek = new Map();
    let done = new Set();
    let current = null;
    // the season's first run, backups or not, is written down, so a later one doesn't take its place
    const finish = () => {
        // the chore only logging, payouts don't wait
        const openFrom = applyBackups ? Math.min(...Array.from({length: Math.max(0, current - 1)}, (_, i) => i + 1)
            .filter((week) => !done.has(week) && !settled.includes(week))) : Infinity;
        if ((!settled.length && record !== null) || dryRun || !dataIsThisLeagues) {
            return {changed: false, openFrom};
        }
        markBackupWeeks(ctx, settled);
        return {changed: true, openFrom};
    };
    if (!(await kickoffs(1)).length) {
        log("Backup starters: MFL has no NFL schedule for the season yet.");
        return untouched;
    }
    current = await weekOf(now.getTime() / 1000) || championship + 1;
    // the chore's first run of a season starts with this week, earlier ones left as the commissioner settled them
    if (record === null) {
        for (let week = 1; week < current; week++) {
            settled.push(week);
        }
        log(`Backup starters: first run this season, so weeks before week ${current} are left as they are.`);
    }
    done = new Set([...(record || []), ...settled]);
    const board = await fetchFrom(host, "messageBoard", {L: leagueId, COUNT: 100});
    const threads = asArray(board.thread).filter((thread) => String(thread.subject || "").trim().toLowerCase() === THREAD_TITLE.toLowerCase());
    const posts = [];
    for (const thread of threads) {
        // by the pager's page number, page 1 being the topic's own address
        const pages = new Map([["1", `/${season}/mb/topic_show.pl?bid=${season}${leagueId}&tid=${thread.id}`]]);
        for (const path of pages.values()) {
            const topic = readTopicPage(await session.page(path, `"${THREAD_TITLE}" thread`));
            // a request counts from its last edit; its week is the post's own
            posts.push(...topic.posts.map((post) => ({...post, thread: thread.id, at: mflTime(post.edited || post.posted), postedAt: mflTime(post.posted)})));
            for (const href of topic.pages) {
                const url = new URL(href, `${host}/${season}/mb/`);
                const page = url.searchParams.get("page") || "1";
                if (!pages.has(page)) {
                    pages.set(page, url.pathname + url.search);
                }
            }
        }
    }
    // every week before `open` is settled, so a post made before its last game is for one of them
    let open = 1;
    while (done.has(open)) {
        open++;
    }
    const settledUntil = open > 1 ? Math.max(...await kickoffs(open - 1)) : -Infinity;
    const teamNames = new Map(asArray(league.franchises && league.franchises.franchise).map((team) => [team.id, String(team.name || team.id).trim()]));
    for (const post of posts.filter((each) => each.franchiseId && (!each.at || !each.postedAt))) {
        needsAttention(`Backup starters: the time of ${teamNames.get(post.franchiseId) || post.franchiseId}'s post of ${post.posted} couldn't be read, so it wasn't.`);
    }
    for (const post of posts.filter((each) => each.franchiseId && each.at && each.postedAt)) {
        const asks = postAsks(post);
        if (!asks.week && post.at <= settledUntil) {
            continue;
        }
        const named = namedWeek(asks, championship);
        const postedWeek = named ? null : await weekOf(post.postedAt);
        const editedWeek = named || post.at === post.postedAt ? postedWeek : await weekOf(post.at);
        const {week, badWeek, editedLate} = postWeek(asks, {postedWeek, editedWeek}, championship);
        if (week && !done.has(week)) {
            byWeek.set(week, [...(byWeek.get(week) || []), {...post, asks, badWeek, editedLate}]);
        }
    }
    const rules = lineupRules(league);
    const nameOf = (id) => displayName((playerNames.get(id) || {name: id}).name);
    const positionOf = (id) => (playerNames.get(id) || {}).position;
    let former = null;
    // a name as v2 writes it, of a player in the league's player list
    const formerPlayer = (phrase) => {
        former = former || new Set([...playerNames.values()].map((player) => normalize(displayName(player.name))));
        return former.has(normalize(phrase));
    };
    let everyone = null;
    const anyPlayer = () => {
        everyone = everyone || new Map([...playerNames].map(([id, player]) => [`${player.name}|${player.position}`, id]));
        return everyone;
    };
    const weeks = [...new Set([...byWeek.keys(), ...Array.from({length: Math.max(0, current - 1)}, (_, i) => i + 1)])]
        .filter((week) => !done.has(week)).sort((a, b) => a - b);
    for (const week of weeks) {
        // a week that fails is flagged and left for the next run; the others go on
        try {
            const games = await schedule(week);
            if (!games.length) {
                log(`Backup starters: MFL has no NFL schedule for week ${week}.`);
                continue;
            }
            const end = Math.max(...games.map((game) => Number(game.kickoff))) + GAME_HOURS * 3600;
            if (!(end * 1000 < now.getTime())) {
                log(`Backup starters: week ${week}'s games aren't over yet.`);
                continue;
            }
            // every team's lineups for the week, each with its Optional Message
            const details = new Map();
            for (const team of teamNames.keys()) {
                const name = teamNames.get(team) || team;
                details.set(team, readLineupDetails(await session.page(`/${season}/options?L=${leagueId}&O=210&FRANCHISE=${team}&W=${week}`, `${name}'s week ${week} Lineup Details`))
                    .filter((submission) => submission.week === week));
            }
            const sources = new Map();
            const add = (team, source) => sources.set(team, [...(sources.get(team) || []), source]);
            for (const post of byWeek.get(week) || []) {
                add(post.franchiseId, {...post, label: `the post of ${post.edited || post.posted}`, dated: Boolean(post.asks.week)});
            }
            for (const [team, submissions] of details) {
                for (const {submission, asks} of backupMessages(submissions, week)) {
                    const at = mflTime(submission.at);
                    if (at) {
                        add(team, {asks, at, label: `the lineup message of ${submission.at}`, dated: true});
                    }
                }
            }
            // a week without backups doesn't wait for nflverse
            if (!sources.size) {
                settled.push(week);
                continue;
            }
            const {rosters: rosterRows, ids} = await nflverseFiles();
            const {statuses, reported} = weekStatuses(rosterRows, ids, week);
            const playing = games.flatMap((game) => asArray(game.team).map((team) => team.id));
            const missing = playing.filter((team) => !reported.has(team));
            if (missing.length) {
                const days = (now.getTime() / 1000 - end) / 86400;
                const message = `Backup starters: nflverse doesn't have week ${week}'s inactive players for ${missing.join(", ")} yet`;
                if (days > 4) {
                    needsAttention(`${message}, ${Math.floor(days)} days after the week's games; its backups wait.`);
                } else {
                    log(`${message}; the week waits.`);
                }
                continue;
            }
            const teamOf = (id) => (statuses.get(id) || {}).team || (playerNames.get(id) || {}).team;
            const kickoffOf = (id) => {
                const game = games.find((each) => asArray(each.team).some((team) => team.id === teamOf(id)));
                return game ? Number(game.kickoff) : null;
            };
            const rostersThen = asArray((await fetchFrom(host, "rosters", {L: leagueId, W: week}, "rosters", season, WEEK_ROSTERS)).franchise);
            let lastWeek = null;
            let savedResults = null;
            const changed = [];
            const problems = [];
            for (const [team, teamSources] of sources) {
                const name = teamNames.get(team) || team;
                const flag = (why) => problems.push(`${name}, week ${week}: ${why}`);
                const roster = asArray((rostersThen.find((each) => each.id === team) || {}).player)
                    .map((entry) => ({id: entry.id, name: (playerNames.get(entry.id) || {name: ""}).name}));
                const who = (phrase, source) => {
                    const found = matchPlayer(phrase, roster);
                    if (found.player) {
                        return found.player.id;
                    }
                    // a player since dropped or traded: what named him no longer applies
                    if (!found.ambiguous && formerPlayer(phrase)) {
                        choreLog(`Backup starters: ${name}, week ${week}: "${phrase.trim()}" in ${source.label} isn't on the team, so that request doesn't apply.`);
                        return null;
                    }
                    flag(`couldn't tell who "${phrase.trim()}" is in ${source.label}${found.ambiguous ? ` (${found.ambiguous.map((player) => displayName(player.name)).join(" or ")})` : ""}`);
                    return null;
                };
                const requests = sourceRequests(teamSources, who, (why, source, clause) => flag({
                    "edited-late": () => `the post of ${source.posted} was edited ${source.edited}, after its week; it wasn't read for week ${week}, as a new week's backups go in a new post`,
                    "bad-week": () => `${source.label} names week ${source.asks.week}, which the season doesn't have; it was taken as week ${week}'s`,
                    "weeks": () => `${source.label} names weeks ${source.asks.weeks.join(" and ")}`,
                    "unreadable": () => `couldn't read "${clause}" in ${source.label}`
                }[why]()));
                const {pairs, late} = standingPairs(requests, pairDeadline(kickoffOf));
                // a message restating every pair restates the locked ones too: those change nothing
                const restated = (request) => pairs.some((pair) => pair.starter === request.starter && pair.backup === request.backup);
                for (const request of late.filter((each) => each.backup && !restated(each))) {
                    const why = `${nameOf(request.backup)} for ${nameOf(request.starter)} doesn't count, ${request.noGame ? "as one of them had no game" : "as it came after the pair's deadline"}`;
                    // a post naming no week, made once the week's games began, may have meant the next
                    if (!request.noGame && !request.source.dated) {
                        flag(`${why}; ${request.source.label} names no week, so it was taken as week ${week}'s`);
                    } else {
                        choreLog(`Backup starters: ${name}, week ${week}: ${why}.`);
                    }
                }
                if (!pairs.length) {
                    continue;
                }
                // a lineup from early in the week can name a player gone by its end: the team's own first
                const byName = (entry) => (roster.find((player) => player.name === entry.name && positionOf(player.id) === entry.pos)
                    || roster.find((player) => player.name === entry.name) || {}).id || anyPlayer().get(`${entry.name}|${entry.pos}`);
                const submissions = (details.get(team) || [])
                    .map((submission) => ({...submission, at: mflTime(submission.at), starters: submission.starters.map(byName)}));
                const {flags, change, notes} = await teamChange({team, week, pairs, submissions, statuses, positionOf, rules, kickoffOf, nameOf}, {lineupAt, weekLineup}, {
                    saved: async () => {
                        if (savedResults === null) {
                            savedResults = await weekResults(week);
                        }
                        return savedResults;
                    },
                    lastWeek: async () => {
                        if (lastWeek === null) {
                            lastWeek = await weekResults(week - 1);
                        }
                        return lastWeek;
                    },
                    scores: async (ids) => asArray((await fetchFrom(host, "playerScores", {L: leagueId, W: week, PLAYERS: ids.join(",")})).playerScore)
                });
                flags.forEach(flag);
                notes.forEach((note) => choreLog(`Backup starters: ${name}, week ${week}: ${note}.`));
                if (change) {
                    changed.push({team, name, ...change});
                }
            }
            for (const problem of problems) {
                needsAttention(`Backup starters: ${problem}.`);
            }
            if (!applyBackups) {
                for (const {name, lineup, submit, what} of changed) {
                    choreLog(`Backup starters: ${dryRun ? "dry run, would" : `BACKUP_STARTERS isn't "apply": would`} ${submit ? `set ${name}'s week ${week} lineup to ${lineup.map(nameOf).join(", ")}`
                        : `recalculate week ${week}, as MFL's results don't have ${name}'s lineup yet`}${what ? `: ${what}` : ""}.`);
                }
            } else if (changed.length) {
                const headers = await session.asCommissioner(season);
                const unsaved = new Set();
                const skipped = new Set();
                for (const each of changed.filter((entry) => entry.submit)) {
                    const form = readLineupForm(await session.page(`/${season}/lineup?L=${leagueId}&WEEK=${week}&F=${each.team}`, `Submit Lineup for team ${each.team}, week ${week}`, headers), {team: each.team, week});
                    // a player on a bye, or gone from the team since, has no box: the commissioner's to finish
                    const missing = each.lineup.filter((id) => !form.boxes.has(id));
                    if (missing.length) {
                        needsAttention(`Backup starters: ${each.name}'s week ${week} lineup wasn't set, as MFL's form has no box for ${missing.map(nameOf).join(", ")} (on a bye, or no longer on the team); it should be ${each.lineup.map(nameOf).join(", ")}.`);
                        skipped.add(each.team);
                        continue;
                    }
                    await mflForm({what: "Submit Lineup", path: `/${season}/lineup`, fields: lineupFields(form, each.lineup), ok: lineupSaved},
                        {dryRun, host, headers, fetchImpl: session.ask});
                }
                const applied = changed.filter((each) => !skipped.has(each.team));
                if (applied.length) {
                    const fields = recalcFields(await session.page(`/${season}/csetup?L=${leagueId}&C=RECALC`, "Recalculate Standings", headers), week);
                    await mflForm({what: "Recalculate Standings", path: `/${season}/csetup`, fields,
                        // MFL's saved results, read next, say whether it worked: nothing in its answer is relied on
                        ok: () => true}, {dryRun, host, headers, fetchImpl: session.ask});
                    const results = await weekResults(week);
                    for (const {team, name, lineup, submit, what} of applied) {
                        const saved = startersIn(results, team);
                        if (!sameLineup(saved, lineup)) {
                            unsaved.add(team);
                            needsAttention(`Backup starters: ${name}, week ${week}: ${submit ? "the lineup was set, but " : ""}after Recalculate Standings MFL's results `
                                + `still have ${saved.map(nameOf).join(", ") || "no starters"}, so it may not have run; the next run tries again.`);
                        } else {
                            choreLog(`Backup starters: ${submit ? `set ${name}'s week ${week} lineup and recalculated the week`
                                : `recalculated week ${week}, as MFL's results didn't have ${name}'s lineup yet`}${what ? `: ${what}` : ""}.`);
                        }
                    }
                }
                // the next run tries again
                if (unsaved.size) {
                    continue;
                }
            }
            // while the chore only logs, the commissioner settles the week by hand
            settled.push(week);
        } catch (error) {
            needsAttention(`Backup starters: week ${week} stopped: ${error.message}`);
        }
    }
    return finish();
}
