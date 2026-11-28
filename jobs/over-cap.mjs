// The over-cap and league rules checks. Flags only: reversing a move is left to the commissioner.

import {dropDate} from "./drop-penalties.mjs";

export const RECENT_MOVE_DAYS = 7;

// longer lists, like the commissioner loading a whole roster, are summed up as a count
const MAX_NAMES = 5;

const ids = (list) => String(list || "").split(",").filter((id) => id && id !== "0000");

// IR moves and league-wide events don't change a salary, so they're left out.
export function recentMoves(transactions, franchiseId, {players, franchises, since, timeZone}) {
    const name = (id) => id.startsWith("FP_") || id.startsWith("DP_")
        ? "a draft pick"
        : (players.get(id) || {fullName: `player ${id}`}).fullName;
    const names = (list) => ids(list).length > MAX_NAMES
        ? `${ids(list).length} players`
        : ids(list).map(name).join(", ");
    const sides = (added, dropped) => [
        names(added) && `added ${names(added)}`,
        names(dropped) && `dropped ${names(dropped)}`
    ].filter(Boolean).join(", ");
    const describe = (transaction) => {
        const date = dropDate(Number(transaction.timestamp), timeZone);
        switch (transaction.type) {
        case "FREE_AGENT": {
            const [added, dropped] = String(transaction.transaction).split("|");
            return `${date} free agent: ${sides(added, dropped)}`;
        }
        case "WAIVER":
            return `${date} waiver: ${sides(transaction.added, transaction.dropped)}`;
        case "BBID_WAIVER": {
            // "added,|bid|dropped,"
            const [added, bid, dropped] = String(transaction.transaction).split("|");
            const won = `won ${names(added)} for $${bid}`;
            return `${date} blind bid: ${names(dropped) ? `${won}, dropped ${names(dropped)}` : won}`;
        }
        case "LOAD_ROSTERS": {
            const [added, dropped] = String(transaction.transaction).split("|");
            return `${date} commissioner: ${sides(added, dropped)}`;
        }
        case "TRADE": {
            const first = transaction.franchise === franchiseId;
            const other = franchises.get(first ? transaction.franchise2 : transaction.franchise);
            const got = names(first ? transaction.franchise2_gave_up : transaction.franchise1_gave_up) || "nothing";
            const gave = names(first ? transaction.franchise1_gave_up : transaction.franchise2_gave_up) || "nothing";
            return `${date} trade with ${other ? other.teamName.trim() : "another team"}: got ${got}; gave ${gave}`;
        }
        default:
            return null;
        }
    };
    return transactions
        .filter((transaction) => Number(transaction.timestamp) >= since
            && (transaction.franchise === franchiseId || (transaction.type === "TRADE" && transaction.franchise2 === franchiseId)))
        .sort((a, b) => Number(b.timestamp) - Number(a.timestamp))
        .map(describe)
        .filter(Boolean);
}

// players only, not draft picks
const playerCount = (list) => ids(list).filter((id) => !id.startsWith("FP_") && !id.startsWith("DP_")).length;

// The team's newest move since `since` that left it with more players, if that was a trade: the
// bylaws (10) allow going over 30 in one, until the team gets back. Commissioner loads aren't moves.
export function tradeOverRoster(transactions, franchiseId, since) {
    const gain = (transaction) => {
        switch (transaction.type) {
        case "FREE_AGENT": {
            const [added, dropped] = String(transaction.transaction).split("|");
            return playerCount(added) - playerCount(dropped);
        }
        case "WAIVER":
            return playerCount(transaction.added) - playerCount(transaction.dropped);
        case "IR":
            return playerCount(transaction.activated) - playerCount(transaction.deactivated);
        case "BBID_WAIVER": {
            const [added, , dropped] = String(transaction.transaction).split("|");
            return playerCount(added) - playerCount(dropped);
        }
        case "TRADE": {
            const first = transaction.franchise === franchiseId;
            return playerCount(first ? transaction.franchise2_gave_up : transaction.franchise1_gave_up)
                - playerCount(first ? transaction.franchise1_gave_up : transaction.franchise2_gave_up);
        }
        default:
            return 0;
        }
    };
    const grew = transactions
        .filter((transaction) => Number(transaction.timestamp) >= since
            && (transaction.franchise === franchiseId || (transaction.type === "TRADE" && transaction.franchise2 === franchiseId)))
        .sort((a, b) => Number(b.timestamp) - Number(a.timestamp))
        .find((transaction) => gain(transaction) > 0);
    return grew && grew.type === "TRADE" ? grew : null;
}

// Going over the roster max voids the move, as going over the cap does, unless a trade did it: then the team has
// until the bylaws' deadline to get back.
export function overRosterMessage({text, max, graceHours, moves, held, trade, timeZone}) {
    let message = `${text} Moves in the last ${RECENT_MOVE_DAYS} days: ${moves.length ? moves.join("; ") : "none"}.`;
    if (trade) {
        message += ` Over ${max} after the ${dropDate(Number(trade.timestamp), timeZone)} trade, which the bylaws allow: it must be back to ${max}`
            + ` by the next game, the next blind-bid deadline or ${graceHours} hours after the trade, whichever is first.`;
    }
    if (held.length) {
        message += ` Drop penalties held${trade ? ` until it's back to ${max}` : " so the move can be reversed"}: ${held.join(", ")}.`;
    }
    return message;
}

const dollars = (amount) => `$${Number(amount.toFixed(2))}`;

// held penalties are named: charging them would reset a contract the commissioner may restore
export function overCapMessage({teamName, total, cap, moves, held}) {
    let message = `${teamName.trim()} is at ${dollars(total)}, over the ${dollars(cap)} cap. `
        + `Moves in the last ${RECENT_MOVE_DAYS} days: ${moves.length ? moves.join("; ") : "none"}.`;
    if (held.length) {
        message += ` Drop penalties held so the move can be reversed: ${held.join(", ")}.`;
    }
    return message;
}

const RULE_KINDS = new Set(["roster-over", "roster-under", "ir", "ir-roster", "injured-starter"]);

// The league rules' flags. The flag lists recent moves, so a move that broke the limit can be
// reversed. Returns the teams over 30, whose chores are held.
export function leagueRules(ctx, {players, built, cutDown, penalties, transactions}) {
    const {lib, now, log, needsAttention} = ctx;
    const {OVER_AFTER_TRADE_HOURS, ROSTER_MAX} = lib.rules;
    const {ruleViolations} = lib.violations;
    const {TIME_ZONE} = lib.zone;
    const overRoster = new Set();
    if (built.seasonOver === null) {
        return overRoster;
    }
    const since = now.getTime() / 1000 - RECENT_MOVE_DAYS * 86400;
    const violations = ruleViolations(built, {now: now.getTime() / 1000, cutDown}).filter((item) => RULE_KINDS.has(item.kind));
    for (const violation of violations) {
        let text = violation.text;
        if (violation.kind === "roster-over") {
            overRoster.add(violation.franchiseId);
            const moves = recentMoves(transactions, violation.franchiseId, {players, franchises: built.franchises, since, timeZone: TIME_ZONE});
            const held = penalties.filter((penalty) => penalty.franchiseId === violation.franchiseId).map((penalty) => penalty.explanation);
            text = overRosterMessage({text, max: ROSTER_MAX, graceHours: OVER_AFTER_TRADE_HOURS, moves, held, trade: tradeOverRoster(transactions, violation.franchiseId, since), timeZone: TIME_ZONE});
        }
        needsAttention(`League rules: ${text}`);
    }
    if (!violations.length) {
        log("No roster, injured reserve or anti-tanking violations.");
    }
    return overRoster;
}

// The cap's flags; returns the over-cap franchise ids, whose chores are held
export function overCap(ctx, {players, built, penalties, transactions}) {
    const {lib, now, log, needsAttention} = ctx;
    const {SALARY_CAP} = lib.rules;
    const {overOnlyByRookies} = lib.league;
    const {TIME_ZONE} = lib.zone;
    const since = now.getTime() / 1000 - RECENT_MOVE_DAYS * 86400;
    const over = new Set();
    let excused = 0;
    for (const {franchiseId, capTotal: total} of built.franchises.values()) {
        if (total <= SALARY_CAP) {
            continue;
        }
        const franchise = built.franchises.get(franchiseId);
        if (overOnlyByRookies(franchise)) {
            log(`${franchise.teamName} is at $${total} of $${SALARY_CAP} only by its unsigned rookies' $${franchise.unsignedRookieSalary}, `
                + "which count once their lengths are set (bylaw 4.6); its chores aren't held.");
            excused++;
            continue;
        }
        over.add(franchiseId);
        needsAttention(`Over the cap: ${overCapMessage({
            teamName: built.franchises.get(franchiseId).teamName,
            total,
            cap: SALARY_CAP,
            moves: recentMoves(transactions, franchiseId, {players, franchises: built.franchises, since, timeZone: TIME_ZONE}),
            held: penalties.filter((penalty) => penalty.franchiseId === franchiseId).map((penalty) => penalty.explanation)
        })}`);
    }
    if (!over.size && !excused) {
        log("No team is over the cap.");
    }
    return over;
}
