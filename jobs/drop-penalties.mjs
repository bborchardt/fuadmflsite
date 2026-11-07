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
            lengthDue: player.years === 0,
            salary: player.salary,
            // added this season by a free agent, waiver or blind bid move
            addedThisSeason: player.transactions.some((transaction) => transaction.added),
            dropped,
            explanation: `${player.fullName} (${player.years}yrs@${player.salary}${player.years === 0 ? ", length due" : ""}, ${dropDate(dropped)})`
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

