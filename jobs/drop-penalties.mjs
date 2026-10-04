// Takes a league built by the version's lib, so it imports none itself.

// more drops than this in one run looks like a bug rather than a busy day, so nothing is applied
export const MAX_PENALTIES_PER_RUN = 6;

// as members see dates, in US Eastern time: "10/03"
export function dropDate(timestamp) {
    return new Intl.DateTimeFormat("en-US", {timeZone: "America/New_York", month: "2-digit", day: "2-digit"})
        .format(new Date(timestamp * 1000));
}

export function pendingPenalties(league) {
    return [...league.franchises.values()].flatMap((franchise) => franchise.pendingDroppedPlayers.map((player) => {
        const dropped = player.transactions[0].timestamp;
        return {
            franchiseId: franchise.franchiseId,
            teamName: franchise.teamName,
            playerId: player.playerId,
            fullName: player.fullName,
            amount: player.capPenalty,
            charged: player.penaltyCharged,
            dropped,
            explanation: `${player.fullName} (${player.years}yrs@${player.salary}, ${dropDate(dropped)})`
        };
    }));
}

// a $0 penalty (no years left) is only reset: MFL would reject or keep a $0 adjustment
export function needsCharge(penalty) {
    return penalty.amount > 0 && !penalty.charged;
}

const xmlAttr = (value) => String(value)
    .replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function salaryAdjXml(penalty) {
    return `<salary_adjustments><salary_adjustment franchise_id="${xmlAttr(penalty.franchiseId)}"`
        + ` amount="${xmlAttr(penalty.amount)}" explanation="${xmlAttr(penalty.explanation)}"/></salary_adjustments>`;
}

// only send it with APPEND=1, or MFL replaces every salary
export function resetSalaryXml(penalty) {
    return `<salaries><leagueUnit unit="LEAGUE"><player id="${xmlAttr(penalty.playerId)}" salary="1" contractYear="0"/>`
        + `</leagueUnit></salaries>`;
}
