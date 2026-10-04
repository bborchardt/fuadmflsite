// The cap penalty chore: find dropped players still carrying a contract, and build the MFL
// imports that charge the penalty and reset the player. No fetching, so it can be tested on
// saved data; jobs/daily.mjs does the I/O. It takes a league built by the version's lib, so it
// imports none itself.

/** More drops than this in one run looks like a bug rather than a busy day, so nothing is applied. */
export const MAX_PENALTIES_PER_RUN = 6;

/** A drop's date as members see it, in US Eastern time: "10/03". */
export function dropDate(timestamp) {
    return new Intl.DateTimeFormat("en-US", {timeZone: "America/New_York", month: "2-digit", day: "2-digit"})
        .format(new Date(timestamp * 1000));
}

/**
 * The penalties owed, one per dropped player, from a league built with transactions and free
 * agents. The description names the contract and the drop date, e.g. "Name (2yrs@10, 10/03)".
 */
export function pendingPenalties(league) {
    return [...league.franchises.values()].flatMap((franchise) => franchise.pendingDroppedPlayers.map((player) => {
        const dropped = player.transactions[0].timestamp;
        return {
            franchiseId: franchise.franchiseId,
            teamName: franchise.teamName,
            playerId: player.playerId,
            fullName: player.fullName,
            amount: player.capPenalty,
            dropped,
            explanation: `${player.fullName} (${player.years}yrs@${player.salary}, ${dropDate(dropped)})`
        };
    }));
}

/**
 * Whether a penalty is already charged: the franchise has an adjustment naming the player,
 * made at or after the drop. This also recognizes ones entered by hand in the older
 * "Name (2yrs@10)" format, including several players in one adjustment. `adjustments` is the
 * salaryAdjustments export's list of salaryAdjustment entries.
 */
export function alreadyCharged(penalty, adjustments) {
    return adjustments.some((adjustment) =>
        adjustment.franchise_id === penalty.franchiseId
        && Number(adjustment.timestamp) >= penalty.dropped
        && String(adjustment.description || "").includes(penalty.fullName));
}

/**
 * Whether a penalty still has to be charged. A dropped player with no years left owes nothing,
 * so they're only reset; MFL would reject or keep a $0 adjustment.
 */
export function needsCharge(penalty, adjustments) {
    return penalty.amount > 0 && !alreadyCharged(penalty, adjustments);
}

const xmlAttr = (value) => String(value)
    .replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** DATA for MFL's salaryAdj import. */
export function salaryAdjXml(penalty) {
    return `<salary_adjustments><salary_adjustment franchise_id="${xmlAttr(penalty.franchiseId)}"`
        + ` amount="${xmlAttr(penalty.amount)}" explanation="${xmlAttr(penalty.explanation)}"/></salary_adjustments>`;
}

/** DATA for MFL's salaries import, resetting a player to $1 / 0 years. Only send it with APPEND=1. */
export function resetSalaryXml(penalty) {
    return `<salaries><leagueUnit unit="LEAGUE"><player id="${xmlAttr(penalty.playerId)}" salary="1" contractYear="0"/>`
        + `</leagueUnit></salaries>`;
}
