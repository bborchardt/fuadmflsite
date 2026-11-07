// The daily job's side of backup starters (bylaw 16.5): who was inactive, from nflverse, and the
// commissioner's forms it fills on MFL. Reading posts and the week's lineup is lib/backups.js.

// nflverse's weekly rosters: each player's status for each week's game, INA when he was inactive
export const NFLVERSE_ROSTERS = (season) => `https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_${season}.csv`;
// DynastyProcess's player ids, MFL's beside the NFL's (gsis)
export const PLAYER_IDS = "https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv";

// nflverse's team codes where MFL's differ
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

// the job's reply in the thread, which also marks the team's week done: "Week 9, Golden Ratio: …"
export function replyText(week, teamName, {swaps, restored}, nameOf) {
    const parts = [
        ...restored.map((pair) => `${nameOf(pair.starter)} and ${nameOf(pair.backup)} were locked in as they were at their deadline (16.5.5), so the later change was undone`),
        ...swaps.map((pair) => `${nameOf(pair.backup)} started for ${nameOf(pair.starter)}, who was inactive`)
    ];
    return `Week ${week}, ${teamName.trim()}: ${parts.join(". ")}. Standings recalculated.`;
}

export const REPLY = /^\s*Week (\d+), (.+?): /;
