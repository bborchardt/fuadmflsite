// The daily job's side of backup starters (bylaw 16.5): who was inactive, from nflverse, and the
// commissioner's forms it fills on MFL. Reading posts and the week's lineup is lib/backups.js.

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
// null, and `flags`, for the commissioner. `submissions`: the week's Lineup Details, with times in
// seconds and starters as ids; `statuses`: nflverse's (weekStatuses); `rules`, `lineupAt` and
// `weekLineup` are the version's lib's. `results` reads MFL as needed: `saved()` the week's results,
// `lastWeek()` the week before's, `scores(ids)` the players' scores ([{id, score}]).
export async function teamChange({team, week, pairs, submissions, statuses, positionOf, rules, kickoffOf, nameOf}, {lineupAt, weekLineup}, results) {
    const flags = [];
    const flag = (why) => flags.push(why);
    if (submissions.some((submission) => submission.unread || submission.at === null)) {
        flag("a lineup on MFL's Lineup Details couldn't be read");
        return {flags, change: null};
    }
    if (submissions.some((submission) => submission.starters.includes(undefined))) {
        flag("a lineup on MFL's Lineup Details names a player not on the team's roster that week");
        return {flags, change: null};
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
    return {flags, change};
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
