import {MflError, asArray} from "./mfl.js";

// What the job, v2's checks and forms, and its display panels rely on in each export they read, by the section MFL answers with: a list's items
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
    leagueStandings: [{path: ["franchise"], need: ["id", "h2hwlt", "all_play_wlt", "pf", "pa", "avgpf", "avgpa"], numbers: ["pf", "pa", "avgpf", "avgpa"]}],
    transactions: [
        {path: ["transaction"], need: ["type", "timestamp"], numbers: ["timestamp"]},
        // the commissioner's lock and unlock, and MFL's own waiver runs, name no team
        withTypes(["FREE_AGENT", "BBID_WAIVER"], ["franchise", "transaction"]),
        withTypes(["WAIVER", "IR"], ["franchise"]),
        withTypes(["TRADE"], ["franchise", "franchise2"]),
        // each side, empty ("" or ",") for one that gave nothing; Trades tells an offer accepted by them
        {path: ["transaction"], have: ["franchise1_gave_up", "franchise2_gave_up"], only: (item) => item.type === "TRADE"}
    ],
    // the contract and backup topics are found by subject
    messageBoard: [{path: ["thread"], need: ["id", "lastPostTime"], have: ["subject"], numbers: ["lastPostTime"]}],
    messageBoardThread: [{path: ["post"], need: ["franchise", "postTime"], have: ["body"], numbers: ["postTime"]}],
    // a member's own claims and trades, as v2's checks read them (docs/mfl.md)
    pendingWaivers: [{path: ["blindBidWaiverRequest"], need: ["round", "addsDrops"], numbers: ["round"]}],
    pendingTrades: [{path: ["pendingTrade"], need: ["trade_id", "offeringteam", "offeredto"], have: ["will_give_up", "will_receive"],
        numbers: ["expires", "timestamp"]}],
    weeklyResults: scores,
    allWeeklyResults: [
        {path: ["weeklyResults"], need: ["week"], numbers: ["week"]},
        ...scores.map((rule) => ({...rule, path: ["weeklyResults", ...rule.path]}))
    ],
    playerScores: [{path: ["playerScore"], need: ["id"], numbers: ["score"]}],
    // MFL ends the list with a blank entry
    projectedScores: [{path: ["playerScore"], need: ["id"], numbers: ["score"], only: (item) => !(item.id === "" && item.score === "")}],
    playoffBrackets: [{path: ["playoffBracket"], need: ["id"]}],
    playoffBracket: [side("home"), side("away")],
    // a pick not yet made has no player; `keys` (for a display panel): a pick that doesn't say these can't
    // be put on the board, nor told from one not yet made
    draftResults: [{path: ["draftUnit", "draftPick"], need: ["round", "pick"], have: ["player"], keys: ["round", "pick", "player"]}],
    futureDraftPicks: [
        {path: ["franchise"], need: ["id"]},
        {path: ["franchise", "futureDraftPick"], need: ["year", "round", "originalPickFor"], numbers: ["year", "round"], keys: ["year", "round", "originalPickFor"]}
    ],
    nflByeWeeks: [{path: ["team"], need: ["id", "bye_week"], numbers: ["bye_week"]}],
    // League's live scores are worked out from them (ui/live-scoring.js readRules); MFL gives each field as {$t}
    rules: [{path: ["positionRules"], need: ["positions"]}, {path: ["positionRules", "rule"], need: ["event", "points", "range"]}],
    injuries: [{path: ["injury"], need: ["id", "status"]}],
    calendar: [{path: ["event"], need: ["type", "start_time"], numbers: ["start_time"]}],
    // who starts, and a player's points and seconds left where the stats feed can't be read
    liveScoring: [
        {path: ["matchup", "franchise"], need: ["id"], numbers: ["score"]},
        {path: ["matchup", "franchise", "players", "player"], need: ["id", "status"], numbers: ["score", "gameSecondsRemaining"]}
    ],
    // a week's matchups, and each side's result once played
    schedule: [
        {path: ["weeklySchedule"], need: ["week"], numbers: ["week"]},
        {path: ["weeklySchedule", "matchup", "franchise"], need: ["id"], numbers: ["score"]}
    ],
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

// the fields that say which item an item is (a team, a player, a trade), and a rule's own `keys`: an
// item without one can't be shown in its place, so a display panel goes without the whole export
const KEYS = new Set(["id", "franchise_id", "franchise", "franchise2", "offeringteam", "offeredto", "trade_id"]);

// For a display panel (ui/checked.js lenient): each field an item breaks its rules on is set to null,
// which the panel shows as "—", as it does anything worked out from it (a total, a record). `problem`
// is the first, as text; `every` is true when no item of a rule's list is whole, or one has no key.
export function markMissing(section, body, rules = SHAPES[section] || []) {
    let problem = null;
    let every = false;
    for (const rule of rules) {
        const items = itemsAt(body, rule.path);
        let whole = 0;
        for (const {item, name} of items) {
            if (!item || typeof item !== "object") {
                problem = problem || `${name} isn't an item`;
                continue;
            }
            if (rule.only && !rule.only(item)) {
                whole++;
                continue;
            }
            const broken = [
                ...(rule.need || []).filter((field) => empty(item[field])).map((field) => [field, `${name} has no ${field}`]),
                ...(rule.have || []).filter((field) => !(field in item)).map((field) => [field, `${name} has no ${field}`]),
                ...(rule.numbers || []).filter((field) => !empty(item[field]) && !NUMBER.test(String(item[field])))
                    .map((field) => [field, `${name}'s ${field} isn't a number ("${item[field]}")`])
            ];
            if (!broken.length) {
                whole++;
                continue;
            }
            problem = problem || broken[0][1];
            every = every || broken.some(([field]) => KEYS.has(field) || (rule.keys || []).includes(field));
            broken.forEach(([field]) => {
                item[field] = null;
            });
        }
        every = every || (items.length > 0 && whole === 0);
    }
    return {problem, every};
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
