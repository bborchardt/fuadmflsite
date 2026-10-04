// Flags only: reversing a move is left to the commissioner.

import {dropDate} from "./drop-penalties.mjs";

export const RECENT_MOVE_DAYS = 7;

// longer lists, like the commissioner loading a whole roster, are summed up as a count
const MAX_NAMES = 5;

const ids = (list) => String(list || "").split(",").filter((id) => id && id !== "0000");

// IR moves and league-wide events don't change a salary, so they're left out.
export function recentMoves(transactions, franchiseId, {players, franchises, since}) {
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
        const date = dropDate(Number(transaction.timestamp));
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
