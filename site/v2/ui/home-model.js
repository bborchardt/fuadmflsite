// What Home shows, from MFL's exports, with no DOM or fetching so it can be tested on saved ones.

import {asArray, nflCode} from "../lib/mfl.js";
import {projectBids} from "../lib/bids.js";
import {onNflIR, ruleViolations} from "../lib/violations.js";
import {contractDeadline, windowClosed} from "../lib/adds.js";
import {INJURY_CHECK_LAST_WEEK, PLAYOFFS_START_WEEK, ROSTER_MAX, ROSTER_MIN, SALARY_CAP, TRADE_DEADLINE_WEEK} from "../lib/rules.js";

const DAY = 24 * 60 * 60;
// a date this close moves from Coming up into My alerts
export const SOON_DAYS = 3;
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
const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
const money = (amount) => `$${Math.round(amount * 100) / 100}`;

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

// The commissioner's own dates and MFL's, one-off only: `{what, at, week}` with `at` in seconds.
// The trade deadline and other week-numbered events take that week's first kickoff (`kickoffs`).
export function calendarDates(calendar, kickoffs = new Map()) {
    const dates = [];
    for (const event of asArray(calendar && calendar.event)) {
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
            dates.push({what: title.charAt(0).toUpperCase() + title.slice(1), at, week, kind: /cut/i.test(title) ? "cut" : /draft/i.test(title) ? "draft" : null});
        }
    }
    return dates;
}

// the event whose name contains "cut" (the commissioner's to-do)
export const cutDownDate = (dates) => (dates.find((date) => date.kind === "cut") || {}).at || null;

// Coming up: the next few one-off dates. Without the calendar (logged out) the season's own dates
// still show: week 1, the trade deadline and the playoffs.
export function comingUp({dates, kickoffs = new Map(), now}) {
    const all = dates.slice();
    const has = (what) => all.some((date) => date.what === what);
    if (kickoffs.get(1)) {
        all.push({what: "Week 1 kickoff", at: kickoffs.get(1), week: 1});
    }
    if (!has("Trade deadline") && kickoffs.get(TRADE_DEADLINE_WEEK)) {
        all.push({what: "Trade deadline", at: kickoffs.get(TRADE_DEADLINE_WEEK), week: TRADE_DEADLINE_WEEK});
    }
    if (kickoffs.get(PLAYOFFS_START_WEEK)) {
        all.push({what: "Playoffs begin", at: kickoffs.get(PLAYOFFS_START_WEEK), week: PLAYOFFS_START_WEEK});
    }
    return all.filter((date) => date.at > now)
        .sort((a, b) => a.at - b.at)
        .slice(0, 3)
        .map((date) => ({...date, when: date.week && date.week !== 1 ? `${dayText(date.at)} · Week ${date.week} kickoff` : whenText(date.at), soon: date.at - now <= SOON_DAYS * DAY}));
}

// MFL's weekly blind bid run after `now`: the first run, repeated weekly
export function nextBidRun(calendar, now) {
    const event = asArray(calendar && calendar.event).find((entry) => entry.type === "WAIVER_BBID" && Number(entry.start_time) > 1e9);
    if (!event) {
        return null;
    }
    const first = Number(event.start_time);
    return first > now ? first : first + Math.ceil((now - first) / (7 * DAY)) * 7 * DAY;
}

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
    const own = ruleViolations(league, {now}).filter((item) => item.franchiseId === franchiseId);
    const kinds = new Set(own.map((item) => item.kind));
    if (kinds.has("cap")) {
        push(tones.red, "$", `Over the salary cap: ${money(franchise.capTotal)} of $${SALARY_CAP}`, "The commissioner will reverse the move that did it", null);
    }
    if (kinds.has("roster-over")) {
        push(tones.red, String(franchise.numPlayers), `Over the roster limit: ${franchise.numPlayers} active of ${ROSTER_MAX}`, "The commissioner will reverse the move that did it", null);
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
                `Draft-day players need them ${byCut}; $5 a day late (12.6)`, links.contracts, "Message board");
        }
        if (franchise.numPlayers > ROSTER_MAX) {
            push(tones.orange, String(ROSTER_MAX), `Get to ${ROSTER_MAX} active ${byCut}`, `You have ${franchise.numPlayers}`, links.drop, "Drop");
        } else if (franchise.numPlayers < ROSTER_MIN) {
            push(tones.orange, String(ROSTER_MIN), `Get to ${ROSTER_MIN} active ${byCut}`, `You have ${franchise.numPlayers}`, links.add, "Add");
        }
    }

    if (lineup && phase === "season") {
        for (const {player, why} of lineup.problems) {
            push(tones.red, "!", `${player.fullName} ${why} and in your lineup`, week <= INJURY_CHECK_LAST_WEEK ? "A loss won’t count toward draft order (13.2)" : "", links.lineup, "Lineup");
        }
        const short = lineup.required - lineup.starters;
        if (short > 0) {
            push(tones.red, "!", `Your lineup is ${plural(short, "starter")} short`, "", links.lineup, "Lineup");
        }
    }

    if (groups.length) {
        const projected = projectBids(franchise, groups, league.players);
        if (projected.overCap || projected.overRoster) {
            push(tones.red, "$", "Current bids invalid", projected.overCap
                ? `If all high bids win: cap used ${money(franchise.capTotal)} → ${money(projected.cap)}`
                : `If all high bids win: ${franchise.numPlayers} → ${projected.roster} active`, links.add, "Add");
        } else {
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

    for (const date of coming.filter((entry) => entry.soon)) {
        push(tones.orange, "!", date.what, date.when, null);
    }
    return alerts;
}

// Every other team's violations, as League Alerts and the daily job flag them. The red or orange
// figure says how far off the limit the team is.
export function leagueAlerts(league, franchiseId, {now} = {}) {
    return ruleViolations(league, {now})
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
const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th"];

// "Spencer Shrader (IND PK)"; a draft pick "2027 1st (Golden Ratio)"
function asset(id, players, teamName) {
    const pick = id.match(/^FP_(\d{4})_(\d{4})_(\d+)$/);
    if (pick) {
        return `${pick[2]} ${ORDINAL[Number(pick[3])] || `round ${pick[3]}`} (${teamName(pick[1])})`;
    }
    const current = id.match(/^DP_(\d+)_(\d+)$/);
    if (current) {
        return `pick ${Number(current[1]) + 1}.${String(Number(current[2]) + 1).padStart(2, "0")}`;
    }
    const player = players.get(id);
    return player ? `${player.fullName} (${[player.team && nflCode(player.team), player.nflPosition].filter(Boolean).join(" ")})` : `player ${id}`;
}

const list = (items) => items.length <= 2 ? items.join(" and ") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

// The league's latest adds, bids won, IR moves and trades, newest first: [{kind, team, what, at}]
export function recentMoves(transactions, {players, franchises, limit = RECENT_MOVES}) {
    const teamName = (id) => (franchises.get(id) || {teamName: `Team ${id}`}).teamName;
    const named = (list_) => list(list_.map((id) => asset(id, players, teamName)));
    const moves = [];
    for (const transaction of asArray(transactions && transactions.transaction)) {
        const at = Number(transaction.timestamp);
        const team = teamName(transaction.franchise);
        let kind = null;
        let what = "";
        if (transaction.type === "FREE_AGENT" || transaction.type === "WAIVER") {
            const [added, dropped] = transaction.type === "WAIVER"
                ? [ids(transaction.added), ids(transaction.dropped)]
                : String(transaction.transaction || "").split("|").map(ids);
            kind = added.length ? "Add" : "Drop";
            what = [added.length && `added ${named(added)}`, dropped.length && `dropped ${named(dropped)}`].filter(Boolean).join(", ");
        } else if (transaction.type === "BBID_WAIVER") {
            const [added, bid, dropped] = String(transaction.transaction || "").split("|");
            kind = "Bid";
            what = [`won ${named(ids(added).slice(0, 1))} for $${Number(bid) || 0}`, ids(dropped).length && `dropped ${named(ids(dropped).slice(0, 1))}`].filter(Boolean).join(", ");
        } else if (transaction.type === "IR") {
            const off = ids(transaction.activated);
            const on = ids(transaction.deactivated);
            kind = "IR";
            what = [on.length && `moved ${named(on)} to IR`, off.length && `moved ${named(off)} off IR`].filter(Boolean).join(", ");
        } else if (transaction.type === "TRADE") {
            kind = "Trade";
            what = `traded ${named(ids(transaction.franchise1_gave_up))} to ${teamName(transaction.franchise2)} for ${named(ids(transaction.franchise2_gave_up))}`;
        }
        if (kind && what) {
            moves.push({kind, team, what, at, when: dayText(at)});
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
