// What Home shows, from MFL's exports, with no DOM or fetching so it can be tested on saved ones.

import {asArray, nflCode} from "../lib/mfl.js";
import {projectBids} from "../lib/bids.js";
import {onNflIR, ruleViolations} from "../lib/violations.js";
import {contractDeadline, windowClosed} from "../lib/adds.js";
import {CHAMPIONSHIP_WEEK, INJURY_CHECK_LAST_WEEK, PLAYOFFS_START_WEEK, ROSTER_MAX, ROSTER_MIN, SALARY_CAP, TRADE_DEADLINE_WEEK} from "../lib/rules.js";
import {money, plural} from "./format.js";

const DAY = 24 * 60 * 60;
// a date members act by is also in My alerts this close to it
export const SOON_DAYS = 3;
// the dates members act by, each with the page they act on; the rollover is the last cut whose
// penalty clears before the new season
const TO_DO = new Map([
    ["draft", {}],
    ["cut", {page: "drop", where: "Drop"}],
    ["rollover", {page: "drop", where: "Drop", why: "Cut by then for the penalty to clear before next season"}],
    ["bids", {page: "add", where: "Add"}],
    ["adds", {page: "add", where: "Add"}],
    ["trades", {page: "trades", where: "Trades"}]
]);
// a commissioner's event's kind from its title, the first that matches
const TITLE_KINDS = [[/^trade deadline$/i, "trades"], [/contract year ends?\b/i, "rollover"], [/\bcut/i, "cut"], [/\bdraft/i, "draft"]];
const titleKind = (title) => (TITLE_KINDS.find(([pattern]) => pattern.test(title)) || [])[1] || null;
export const RECENT_MOVES = 10;
export const TOPICS = 5;

const CT = "America/Chicago";
// "Thu Oct 8"
export const dayText = (seconds) => new Date(seconds * 1000).toLocaleDateString("en-US", {weekday: "short", month: "short", day: "numeric", timeZone: CT}).replace(",", "");
// "7:42 p.m."
export const clock = (seconds) => new Date(seconds * 1000).toLocaleTimeString("en-US", {hour: "numeric", minute: "2-digit", timeZone: CT})
    .replace(/\s?AM$/, " a.m.").replace(/\s?PM$/, " p.m.");
// "Thu Oct 8, 7:42 p.m."
export const whenText = (seconds) => `${dayText(seconds)}, ${clock(seconds)}`;
const lastName = (player) => String(player.fullName).split(" ").slice(1).join(" ") || player.fullName;

const tones = {red: "red", orange: "orange", lime: "lime"};

// The season's phase for Home: "before-draft", "before-cut" (draft picks in, before the cut-down
// date), "preseason" (after it, before week 1's kickoff), "season", or "over".
export function homePhase({now, week1, seasonOver, drafted, cutDown}) {
    if (seasonOver) {
        return "over";
    }
    if (week1 && now >= week1) {
        return "season";
    }
    if (!drafted) {
        return "before-draft";
    }
    return cutDown && now >= cutDown ? "preseason" : "before-cut";
}

// The commissioner's own dates and MFL's, one-off only, and the end of MFL's weekly waiver lock:
// `{what, at, week, kind}` with `at` in seconds and `kind` naming the ones members act by. The trade
// deadline and other week-numbered events take that week's first kickoff (`kickoffs`).
export function calendarDates(calendar, kickoffs = new Map()) {
    const dates = [];
    const events = asArray(calendar && calendar.event);
    const closes = freeAgencyEnd(calendar);
    if (closes) {
        dates.push({what: "Free agency closes", at: closes, kind: "adds"});
    }
    for (const event of events) {
        const start = Number(event.start_time);
        if (event.type === "WAIVER_BBID" && start > 1e9) {
            dates.push({what: "First blind bids", at: start, kind: "bids"});
            continue;
        }
        if (event.happens || !["CUSTOM", "TRADE"].includes(event.type)) {
            continue;
        }
        const title = event.type === "TRADE" ? "Trade deadline" : String(event.title || "").trim();
        if (!title) {
            continue;
        }
        const week = start > 0 && start < 100 ? start : null;
        const at = week ? kickoffs.get(week) : start;
        if (at) {
            dates.push({what: title.charAt(0).toUpperCase() + title.slice(1), at, week, kind: event.type === "TRADE" ? "trades" : titleKind(title)});
        }
        if (at && event.type === "TRADE" && Number(event.end_time) > at) {
            dates.push({what: "Trades reopen", at: Number(event.end_time)});
        }
    }
    return dates;
}

// the event with a word starting "cut" in its name (the commissioner's to-do)
export const cutDownDate = (dates) => (dates.find((date) => date.kind === "cut") || {}).at || null;

// The season's dates, soonest first, each with its `when`. Without the calendar (logged out) the
// season's own dates still show: week 1, the trade deadline, the playoffs and the championship.
function seasonDates({dates, kickoffs = new Map()}) {
    const all = dates.slice();
    if (kickoffs.get(1)) {
        all.push({what: "Week 1 kickoff", at: kickoffs.get(1), week: 1});
    }
    if (!all.some((date) => date.kind === "trades") && kickoffs.get(TRADE_DEADLINE_WEEK)) {
        all.push({what: "Trade deadline", at: kickoffs.get(TRADE_DEADLINE_WEEK), week: TRADE_DEADLINE_WEEK, kind: "trades"});
    }
    if (kickoffs.get(PLAYOFFS_START_WEEK)) {
        all.push({what: "Playoffs begin", at: kickoffs.get(PLAYOFFS_START_WEEK), week: PLAYOFFS_START_WEEK});
    }
    if (kickoffs.get(CHAMPIONSHIP_WEEK)) {
        all.push({what: "Championship week", at: kickoffs.get(CHAMPIONSHIP_WEEK), week: CHAMPIONSHIP_WEEK});
    }
    return all.sort((a, b) => a.at - b.at)
        .map((date) => ({...date, when: date.week && date.week !== 1 ? `${dayText(date.at)} · Week ${date.week} kickoff` : whenText(date.at)}));
}

// The week's waiver cycle once the first blind bids have run: the next run, after which the free
// agent window opens, and the next lock, which closes it. Free agency's last is "Free agency closes".
function waiverCycle(calendar, now) {
    const runs = weeklyEvents(calendar, ["WAIVER_BBID"]);
    if (!runs.length || now < Math.min(...runs.map((event) => Number(event.start_time)))) {
        return [];
    }
    const closes = freeAgencyEnd(calendar);
    const run = nextBidRun(calendar, now);
    const lock = nextWeekly(calendar, "WAIVER_LOCK", now);
    const cycle = [];
    if (run && run !== closes) {
        const opens = Boolean(nextWeekly(calendar, "WAIVER_LOCK", run));
        cycle.push({what: "Blind bids process", at: run, detail: opens ? "then the free agent window opens" : ""});
    }
    if (lock && lock !== closes) {
        cycle.push({what: "Free agent window closes", at: lock, detail: run ? "then blind bids only" : ""});
    }
    return cycle;
}

// Coming up: the dates still ahead and the week's waiver cycle, `soon` when a to-do is close enough
// for My alerts
export function comingUp({dates, kickoffs, calendar = null, now}) {
    const all = seasonDates({dates: dates.concat(waiverCycle(calendar, now)), kickoffs});
    // the first blind bids follow the draft, so before it they aren't yet worth a line
    const draftAhead = all.some((date) => date.kind === "draft" && date.at > now);
    return all.filter((date) => date.at > now && !(draftAhead && date.kind === "bids"))
        .map((date) => ({...date, soon: TO_DO.has(date.kind) && date.at - now <= SOON_DAYS * DAY}));
}

// Central time's offset from UTC at a moment, in seconds (−18000 in daylight time)
const centralOffset = (seconds) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {timeZone: CT, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric"})
        .formatToParts(new Date(seconds * 1000)).map((part) => [part.type, Number(part.value)]));
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) / 1000 - Math.floor(seconds / 60) * 60;
};

// `weeks` after `first` at the same Central clock time: MFL's weekly runs stay at 11 p.m. CT when
// daylight time ends
const weeksLater = (first, weeks) => {
    const plain = first + weeks * 7 * DAY;
    return plain + centralOffset(first) - centralOffset(plain);
};

// MFL's weekly calendar events with a time: `happens` is how many weeks one repeats after the first
const weeklyEvents = (calendar, types) => asArray(calendar && calendar.event).filter((event) => types.includes(event.type) && Number(event.start_time) > 1e9);
const lastRun = (event) => weeksLater(Number(event.start_time), Number(event.happens) || 0);

// Free agency ends with the last time free agents go on waivers, or the last bid run after it;
// null without a waiver lock on the calendar
export function freeAgencyEnd(calendar) {
    const waivers = weeklyEvents(calendar, ["WAIVER_LOCK", "WAIVER_BBID"]);
    return waivers.some((event) => event.type === "WAIVER_LOCK") ? Math.max(...waivers.map(lastRun)) : null;
}

// The first time after `now` of an event repeated weekly from `first`, `repeats` times after it;
// null once the last has passed
export function weeklyAfter(first, now, repeats) {
    let weeks = Math.max(0, Math.floor((now - first) / (7 * DAY)));
    for (;;) {
        if (weeks > repeats) {
            return null;
        }
        const at = weeksLater(first, weeks);
        if (at > now) {
            return at;
        }
        weeks += 1;
    }
}

// MFL's weekly event of a type after `now`, each repeated weekly as often as it says
export function nextWeekly(calendar, type, now) {
    const next = weeklyEvents(calendar, [type]).map((event) => weeklyAfter(Number(event.start_time), now, Number(event.happens) || 0)).filter(Boolean);
    return next.length ? Math.min(...next) : null;
}

// the last blind bid run on the calendar, null without one
export function lastBidRun(calendar) {
    const runs = weeklyEvents(calendar, ["WAIVER_BBID"]);
    return runs.length ? Math.max(...runs.map(lastRun)) : null;
}

// MFL's next blind bid run
export const nextBidRun = (calendar, now) => nextWeekly(calendar, "WAIVER_BBID", now);

// The viewer's starters this week that can't play: out, on IR, suspended, on a bye or with no NFL
// team. `kickoffs` maps NFL teams to this week's kickoff (a team missing is on a bye); a game that
// has started can't be changed, so it's left out.
export function lineupProblems({starters, kickoffs, now}) {
    const problems = [];
    for (const player of starters) {
        const kickoff = kickoffs.get(player.team);
        if (kickoff && kickoff <= now) {
            continue;
        }
        const status = player.injuryStatus || "";
        const why = !player.team || player.team === "FA" || player.team === "FA*" ? "has no NFL team"
            : onNflIR(player) ? "is on IR"
                : status === "Out" ? "is out"
                    : status === "Suspended" ? "is suspended"
                        : !kickoff ? "is on a bye" : null;
        if (why) {
            problems.push({player, why});
        }
    }
    return problems;
}

// players the commissioner's draft-day loads put on the roster without a length yet (12.4–12.5)
export const draftDayUnsigned = (franchise) => (franchise.signedPlayers || []).filter((player) => player.salary >= 1);

// `trades` are offers waiting for the viewer's answer: [{from, summary, expires}]
export function myAlerts({league, franchiseId, phase, links, lineup = null, groups = [], bidRun = null, trades = [], readings = new Map(), coming = [], cutDown = null, now}) {
    const franchise = league.franchises.get(franchiseId);
    if (!franchise) {
        return [];
    }
    const alerts = [];
    const push = (tone, mark, title, detail, href, where) => alerts.push({tone, mark, title, detail: [detail, href && where].filter(Boolean).join(" · "), href: href || null});
    const week = Number(league.week);
    const byCut = cutDown ? `by ${dayText(cutDown)}` : "before the season";

    // the same violations League Alerts and the daily job flag, for the viewer's team
    const own = ruleViolations(league, {now, cutDown}).filter((item) => item.franchiseId === franchiseId);
    const kinds = new Set(own.map((item) => item.kind));
    if (kinds.has("cap")) {
        push(tones.red, "$", `Over the salary cap: ${money(franchise.capTotal)} of $${SALARY_CAP}`, "The commissioner will reverse the move that did it", null);
    }
    if (kinds.has("roster-over")) {
        // before week 1 it's the cut-down missed, fixed by dropping; in season a move did it
        if (league.started === false) {
            push(tones.red, String(franchise.numPlayers), `Over the roster limit: ${franchise.numPlayers} active of ${ROSTER_MAX}`, "", links.drop, "Drop");
        } else {
            push(tones.red, String(franchise.numPlayers), `Over the roster limit: ${franchise.numPlayers} active of ${ROSTER_MAX}`, "The commissioner will reverse the move that did it", null);
        }
    }
    if (kinds.has("roster-under")) {
        push(tones.orange, String(franchise.numPlayers), `Under the roster minimum: ${franchise.numPlayers} active of ${ROSTER_MIN}`, "", links.add, "Add");
    }
    if (kinds.has("ir")) {
        const healthy = franchise.irPlayers.filter((player) => !onNflIR(player));
        const after = franchise.numPlayers + healthy.length;
        for (const player of healthy) {
            push(tones.red, "IR", `${lastName(player)} must come off IR`, after > ROSTER_MAX
                ? `That makes ${after} active, so it needs a drop`
                : "The NFL no longer lists him on IR", links.ir, "IR");
        }
    }

    if (phase === "before-cut") {
        const unsigned = draftDayUnsigned(franchise);
        if (unsigned.length) {
            push(tones.orange, "Y", unsigned.length === 1 ? `Post a contract length for ${lastName(unsigned[0])}` : `Post contract lengths for ${unsigned.length} players`,
                `Draft-day players need them ${byCut}; $5 a day late`, links.contracts, "Message board");
        }
        if (franchise.numPlayers > ROSTER_MAX) {
            push(tones.orange, String(ROSTER_MAX), `Get to ${ROSTER_MAX} active ${byCut}`, `You have ${franchise.numPlayers}`, links.drop, "Drop");
        } else if (franchise.numPlayers < ROSTER_MIN) {
            push(tones.orange, String(ROSTER_MIN), `Get to ${ROSTER_MIN} active ${byCut}`, `You have ${franchise.numPlayers}`, links.add, "Add");
        }
    }

    if (lineup && phase === "season") {
        for (const {player, why} of lineup.problems) {
            push(tones.red, "!", `${player.fullName} ${why} and in your lineup`, week <= INJURY_CHECK_LAST_WEEK ? "A loss won’t count toward draft order" : "", links.lineup, "Lineup");
        }
        const short = lineup.required - lineup.starters;
        if (short > 0) {
            push(tones.red, "!", `Your lineup is ${plural(short, "starter")} short`, "", links.lineup, "Lineup");
        }
    }

    let bidsTimed = false;
    if (groups.length) {
        const projected = projectBids(franchise, groups, league.players);
        if (projected.overCap || projected.overRoster) {
            push(tones.red, "$", "Current bids invalid", projected.overCap
                ? `If all high bids win: cap used ${money(franchise.capTotal)} → ${money(projected.cap)}`
                : `If all high bids win: ${franchise.numPlayers} → ${projected.roster} active`, links.add, "Add");
        } else {
            bidsTimed = Boolean(bidRun);
            push(tones.orange, "$", `${plural(projected.bids, "blind bid")} pending`, bidRun ? `They process ${whenText(bidRun)} CT` : "", links.add, "Add");
        }
    }

    // free agent and waiver adds still in their hour; a blind bid's length is in its comment
    for (const add of (league.pendingAdds || []).filter((entry) => entry.franchiseId === franchiseId && entry.type !== "BBID_WAIVER" && !windowClosed(entry, now))) {
        const player = league.players.get(add.playerId) || {fullName: add.name};
        const reading = readings.get(add.playerId);
        const due = `${clock(contractDeadline(add))} CT`;
        if (reading && reading.state === "read") {
            push(tones.lime, "Y", `${lastName(player)}: ${plural(reading.years, "year")}`, `Read from the message board; to change it, post again by ${due}`, links.contracts, "Message board");
        } else if (reading && reading.state === "problem") {
            push(tones.red, "Y", `Couldn’t read ${lastName(player)}’s contract length`, `Post it again by ${due}, like “${lastName(player)}: 2 years”`, links.contracts, "Message board");
        } else {
            push(tones.orange, "Y", `Post a contract length for ${lastName(player)}`, `Free agent add, due ${due}, or it’s 1 year`, links.contracts, "Message board");
        }
    }

    for (const trade of trades) {
        push(tones.lime, "⇄", `Trade offer from ${trade.from}`, [trade.summary, trade.expires && `expires ${dayText(trade.expires)}`].filter(Boolean).join(" · "), links.trades, "Trades");
    }

    // pending bids that say when they process stand in for the first run
    for (const date of coming.filter((entry) => entry.soon && !(entry.kind === "bids" && bidsTimed))) {
        const {page, where, why} = TO_DO.get(date.kind) || {};
        push(tones.orange, "!", date.what, [date.when, why].filter(Boolean).join(" · "), links[page], where);
    }
    return alerts;
}

// Every other team's violations, as League Alerts and the daily job flag them. The red or orange
// figure says how far off the limit the team is.
export function leagueAlerts(league, franchiseId, {now, cutDown = null} = {}) {
    return ruleViolations(league, {now, cutDown})
        .filter((item) => item.franchiseId !== franchiseId && item.kind !== "contract" && item.kind !== "ir-roster")
        .map((item) => {
            const franchise = league.franchises.get(item.franchiseId);
            switch (item.kind) {
            case "cap":
                return {franchise, text: `Over the salary cap: ${money(franchise.capTotal)} of $${SALARY_CAP}`, figure: `+${money(franchise.capTotal - SALARY_CAP)}`, tone: tones.red};
            case "roster-over":
                return {franchise, text: `Over the roster limit: ${franchise.numPlayers} active of ${ROSTER_MAX}`, figure: String(franchise.numPlayers), tone: tones.red};
            case "roster-under":
                return {franchise, text: `Under the roster minimum: ${franchise.numPlayers} active of ${ROSTER_MIN}`, figure: String(franchise.numPlayers), tone: tones.orange};
            case "ir":
                return {franchise, text: item.text.replace(`${franchise.teamName} has `, "").replace(/: move him.*$/, ""), figure: "IR", tone: tones.red};
            case "injured-starter":
                return {franchise, text: item.text.replace(`${franchise.teamName} started injured/suspended player `, "Started injured or suspended ").replace(/!$/, ""), figure: "!", tone: tones.red};
            default:
                return {franchise, text: item.text, figure: "", tone: tones.red};
            }
        });
}

const ids = (list) => String(list || "").split(",").filter((id) => id && id !== "0000");
export const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th"];

// A move's line as parts: plain `{text}`, a player's name `{text, player}` (his id), a team's
// `{text, team}`; `what` is the parts' text joined
const plain = (text) => ({text});
const joined = (pieces, between) => pieces.flatMap((piece, i) => (i ? [plain(between), ...piece] : piece));
const textOf = (parts) => parts.map((part) => part.text).join("");

// "Spencer Shrader (IND PK)", the name his part; a draft pick "2027 1st (Golden Ratio)"
function asset(id, players, teamName) {
    const pick = id.match(/^FP_(\d{4})_(\d{4})_(\d+)$/);
    if (pick) {
        return [plain(`${pick[2]} ${ORDINAL[Number(pick[3])] || `round ${pick[3]}`} (${teamName(pick[1])})`)];
    }
    const current = id.match(/^DP_(\d+)_(\d+)$/);
    if (current) {
        return [plain(`pick ${Number(current[1]) + 1}.${String(Number(current[2]) + 1).padStart(2, "0")}`)];
    }
    const player = players.get(id);
    return player
        ? [{text: player.fullName, player: id}, plain(` (${[player.team && nflCode(player.team), player.nflPosition].filter(Boolean).join(" ")})`)]
        : [plain(`player ${id}`)];
}

// "A and B", "A, B and C"
const list = (items) => (items.length <= 2 ? joined(items, " and ") : [...joined(items.slice(0, -1), ", "), plain(" and "), ...items[items.length - 1]]);

// The league's latest adds, bids won, IR moves and trades, newest first: [{kind, team, teamIds, what,
// parts, at}] (`teamIds` both sides of a trade, `parts` the line `what` reads, as above),
// a won bid with its `bid` ({period, player, team}) for the run's other bids
export function recentMoves(transactions, {players, franchises, limit = RECENT_MOVES}) {
    const teamName = (id) => (franchises.get(id) || {teamName: `Team ${id}`}).teamName;
    const named = (list_) => list(list_.map((id) => asset(id, players, teamName)));
    // "added X", or nothing for no players
    const clause = (before, list_, after = "") => (list_.length ? [plain(before), ...named(list_), ...(after ? [plain(after)] : [])] : null);
    const moves = [];
    for (const transaction of asArray(transactions && transactions.transaction)) {
        const at = Number(transaction.timestamp);
        const team = teamName(transaction.franchise);
        let kind = null;
        let parts = [];
        let extra = {};
        if (transaction.type === "FREE_AGENT" || transaction.type === "WAIVER") {
            const [added, dropped] = transaction.type === "WAIVER"
                ? [ids(transaction.added), ids(transaction.dropped)]
                : String(transaction.transaction || "").split("|").map(ids);
            kind = added.length ? "Add" : "Drop";
            parts = joined([clause("added ", added), clause("dropped ", dropped)].filter(Boolean), ", ");
        } else if (transaction.type === "BBID_WAIVER") {
            const [added, bid, dropped] = String(transaction.transaction || "").split("|");
            kind = "Bid";
            parts = joined([[plain("won "), ...named(ids(added).slice(0, 1)), plain(` for $${Number(bid) || 0}`)], clause("dropped ", ids(dropped).slice(0, 1))].filter(Boolean), ", ");
            // the run is MFL's processed waivers period, the transaction's time (docs/mfl.md)
            extra = {bid: {period: at, player: ids(added)[0] || "", team: transaction.franchise}};
        } else if (transaction.type === "IR") {
            const off = ids(transaction.activated);
            const on = ids(transaction.deactivated);
            kind = "IR";
            parts = joined([clause("moved ", on, " to IR"), clause("moved ", off, " off IR")].filter(Boolean), ", ");
        } else if (transaction.type === "TRADE") {
            kind = "Trade";
            parts = [plain("traded "), ...named(ids(transaction.franchise1_gave_up)), plain(" to "), {text: teamName(transaction.franchise2), team: transaction.franchise2},
                plain(" for "), ...named(ids(transaction.franchise2_gave_up))];
        }
        const what = textOf(parts);
        if (kind && what) {
            const teamIds = [transaction.franchise, transaction.type === "TRADE" ? transaction.franchise2 : null].filter(Boolean);
            moves.push({kind, team, teamIds, what, parts, at, when: dayText(at), ...extra});
        }
    }
    return moves.sort((a, b) => b.at - a.at).slice(0, limit);
}

// MFL's `messageBoard`: the newest topics first
export function boardTopics(messageBoard, limit = TOPICS) {
    return asArray(messageBoard && messageBoard.thread)
        .map((thread) => ({id: thread.id, title: String(thread.subject || "").trim() || "(no subject)", at: Number(thread.lastPostTime)}))
        .sort((a, b) => b.at - a.at)
        .slice(0, limit)
        .map((topic) => ({...topic, when: dayText(topic.at).replace(/^\w+ /, "")}));
}

// the newest topic whose subject names contracts, where lengths are posted
export function contractTopic(messageBoard) {
    return asArray(messageBoard && messageBoard.thread)
        .filter((thread) => /contract/i.test(thread.subject || ""))
        .sort((a, b) => Number(b.lastPostTime) - Number(a.lastPostTime))[0] || null;
}
