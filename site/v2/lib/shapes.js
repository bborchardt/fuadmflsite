import {MflError, asArray} from "./mfl.js";

// What the job relies on in each export it reads, by the section MFL answers with: a list's items
// are found by `path`, and each must have every field in `need` (not empty), every field in `have`
// (which may be empty) and a number in every field of `numbers` it has. `only` limits a rule to the
// items it's true for. MFL leaves out an empty list, which is fine: an item that's there without a field, or with a number that won't read, is
// MFL having changed, and the job writes nothing from that export (docs/design.md: Outside change).
// Each field is one the saved exports in tests/fixtures always have where it's needed.
const scores = [
    {path: ["matchup", "franchise"], need: ["id"], numbers: ["score"]},
    {path: ["matchup", "franchise", "player"], need: ["id", "status"], numbers: ["score"]}
];
const side = (name) => ({path: ["playoffRound", "playoffGame", name], numbers: ["points"],
    only: (item) => item.points !== undefined, need: ["franchise_id"]});
const withTypes = (types, need) => ({path: ["transaction"], need, only: (item) => types.includes(item.type)});

// a past week's rosters, of which the backup starters read only who was on each team
export const WEEK_ROSTERS = [
    {path: ["franchise"], need: ["id"]},
    {path: ["franchise", "player"], need: ["id"]}
];

export const SHAPES = {
    players: [{path: ["player"], need: ["id", "name", "position"]}],
    league: [{path: ["franchises", "franchise"], need: ["id", "name"]}],
    rosters: [
        {path: ["franchise"], need: ["id"]},
        {path: ["franchise", "player"], need: ["id", "status", "salary", "contractYear"], numbers: ["salary", "contractYear"]}
    ],
    freeAgents: [{path: ["leagueUnit", "player"], need: ["id", "salary", "contractYear"], numbers: ["salary", "contractYear"]}],
    // the commissioner may leave a description blank
    salaryAdjustments: [{path: ["salaryAdjustment"], need: ["franchise_id", "amount", "timestamp"], have: ["description"], numbers: ["amount", "timestamp"]}],
    accounting: [{path: ["entry"], need: ["franchise_id", "amount"], have: ["description"], numbers: ["amount"]}],
    transactions: [
        {path: ["transaction"], need: ["type", "timestamp"], numbers: ["timestamp"]},
        // the commissioner's lock and unlock, and MFL's own waiver runs, name no team
        withTypes(["FREE_AGENT", "BBID_WAIVER"], ["franchise", "transaction"]),
        withTypes(["WAIVER", "IR"], ["franchise"]),
        withTypes(["TRADE"], ["franchise", "franchise2"])
    ],
    messageBoard: [{path: ["thread"], need: ["id", "lastPostTime"], numbers: ["lastPostTime"]}],
    messageBoardThread: [{path: ["post"], need: ["franchise", "postTime"], have: ["body"], numbers: ["postTime"]}],
    weeklyResults: scores,
    allWeeklyResults: [
        {path: ["weeklyResults"], need: ["week"], numbers: ["week"]},
        ...scores.map((rule) => ({...rule, path: ["weeklyResults", ...rule.path]}))
    ],
    playerScores: [{path: ["playerScore"], need: ["id"], numbers: ["score"]}],
    playoffBrackets: [{path: ["playoffBracket"], need: ["id"]}],
    playoffBracket: [side("home"), side("away")],
    // a pick not yet made has no player
    draftResults: [{path: ["draftUnit", "draftPick"], need: ["round", "pick"], have: ["player"]}],
    injuries: [{path: ["injury"], need: ["id", "status"]}],
    calendar: [{path: ["event"], need: ["type", "start_time"], numbers: ["start_time"]}],
    nflSchedule: [
        {path: ["matchup"], need: ["kickoff"], numbers: ["kickoff"]},
        {path: ["matchup", "team"], need: ["id"]}
    ]
};

const NUMBER = /^\s*-?(\d+\.?\d*|\.\d+)\s*$/;
const empty = (value) => value === undefined || value === null || value === "";

// The items at `path` in `body`, each with a name to report it by
function itemsAt(body, path) {
    let items = [{item: body, name: ""}];
    for (const key of path) {
        items = items.flatMap(({item, name}) => asArray(item && typeof item === "object" ? item[key] : undefined)
            .map((next, index) => ({item: next, name: `${name}${name ? " " : ""}${key} ${next && next.id ? next.id : index + 1}`})));
    }
    return items;
}

// The first way `body` (export section `section`) breaks its rules, as text; null when it doesn't
export function shapeProblem(section, body, rules = SHAPES[section] || []) {
    for (const rule of rules) {
        for (const {item, name} of itemsAt(body, rule.path)) {
            if (!item || typeof item !== "object") {
                return `${name} isn't an item`;
            }
            if (rule.only && !rule.only(item)) {
                continue;
            }
            const missing = (rule.need || []).find((field) => empty(item[field]));
            if (missing) {
                return `${name} has no ${missing}`;
            }
            const absent = (rule.have || []).find((field) => !(field in item));
            if (absent) {
                return `${name} has no ${absent}`;
            }
            const unread = (rule.numbers || []).find((field) => !empty(item[field]) && !NUMBER.test(String(item[field])));
            if (unread) {
                return `${name}'s ${unread} isn't a number ("${item[unread]}")`;
            }
        }
    }
    return null;
}

// Throws an MflError marked `changed` when `body` breaks its export's rules; otherwise gives it back
export function checkShape(section, body, rules) {
    const problem = shapeProblem(section, body, rules);
    if (problem) {
        const error = new MflError(section, `MFL's export has changed: ${problem}`);
        error.changed = true;
        throw error;
    }
    return body;
}
