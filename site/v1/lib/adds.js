// Players a team added that are waiting for a contract length, and the window owners have to
// post one. Shared by the Main tab's violations box and the daily job's contract years chore,
// so the two follow the same rule. No DOM and no fetching.

/** League rule: a free agent or waiver add's length must be posted within this long of the add. */
export const CONTRACT_WINDOW_HOURS = 1;

/** When an add's posting window closes, as Unix seconds. */
export function contractDeadline(add) {
    return add.added + CONTRACT_WINDOW_HOURS * 3600;
}

/** Whether an add's posting window has closed at `now` (Unix seconds), so its years can be decided. */
export function windowClosed(add, now) {
    return now >= contractDeadline(add);
}

const ADD_TYPES = new Set(["FREE_AGENT", "WAIVER", "BBID_WAIVER"]);
const ids = (list) => String(list || "").split(",").filter((id) => id && id !== "0000");
const asList = (value) => value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];

/** The player ids a transaction adds and drops, for the types that move players. */
function moves(transaction) {
    switch (transaction.type) {
    case "FREE_AGENT":
    case "LOAD_ROSTERS": {
        const [added, dropped] = String(transaction.transaction || "").split("|");
        return {added: ids(added), dropped: ids(dropped)};
    }
    case "WAIVER":
        return {added: ids(transaction.added), dropped: ids(transaction.dropped)};
    case "BBID_WAIVER": {
        const [added, , dropped] = String(transaction.transaction || "").split("|");
        return {added: ids(added), dropped: ids(dropped)};
    }
    case "TRADE":
        return {added: [...ids(transaction.franchise1_gave_up), ...ids(transaction.franchise2_gave_up)], dropped: []};
    default:
        return {added: [], dropped: []};
    }
}

/**
 * The rostered players waiting for contract years: 0 years, and last moved by an add (free
 * agent, waiver or blind bid) by the team that has them. That leaves out RFAs after the
 * rollover, drafted rookies and players the commissioner loaded, which aren't adds.
 * `rosters` is the rosters export, `transactions` the transactions export's list and `players`
 * a Map of id -> {name} from the players export ("Last, First").
 */
export function pendingAdds({rosters, transactions, players}) {
    const latest = new Map();
    for (const transaction of transactions) {
        const {added, dropped} = moves(transaction);
        for (const id of [...added, ...dropped]) {
            const seen = latest.get(id);
            if (!seen || Number(transaction.timestamp) >= Number(seen.timestamp)) {
                latest.set(id, transaction);
            }
        }
    }
    const pending = [];
    for (const franchise of asList(rosters.franchise)) {
        for (const entry of asList(franchise.player)) {
            const transaction = latest.get(entry.id);
            if (parseFloat(entry.contractYear) !== 0 || !transaction || !ADD_TYPES.has(transaction.type)
                || transaction.franchise !== franchise.id || !moves(transaction).added.includes(entry.id)) {
                continue;
            }
            pending.push({
                playerId: entry.id,
                name: (players.get(entry.id) || {name: `Player ${entry.id}`}).name,
                franchiseId: franchise.id,
                // the salary exactly as MFL has it, so writing the years leaves it unchanged
                salary: entry.salary,
                type: transaction.type,
                added: Number(transaction.timestamp)
            });
        }
    }
    return pending;
}

