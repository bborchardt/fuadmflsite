// The drop penalties chore. Takes a league built by the version's lib, so it imports none itself.

import {atOneYear, rfasSet} from "./rfa-salaries.mjs";

// more drops than this in one run looks like a bug rather than a busy day, so nothing is applied
export const MAX_PENALTIES_PER_RUN = 6;

// "10/03", in the league's time zone (`timeZone`, the version's zone.js TIME_ZONE), as v2 shows dates
export function dropDate(timestamp, timeZone) {
    if (!timeZone) {
        throw new Error("dropDate needs the league's time zone");
    }
    return new Intl.DateTimeFormat("en-US", {timeZone, month: "2-digit", day: "2-digit"})
        .format(new Date(timestamp * 1000));
}

export function pendingPenalties(league, timeZone) {
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
            explanation: `${player.fullName} (${player.years}yrs@${player.salary}${player.years === 0 ? ", length due" : ""}, ${dropDate(dropped, timeZone)})`
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

// Of `penalties` for drops whose length was due, the ones that may be renewal RFAs not yet at $0.01,
// whose contract ran out and owe nothing: at 1 year last season on the same salary, with no add this
// season and not set to $0.01 by this job. One won back at the auction looks the same, so they're
// left for the commissioner, never guessed. Throws when last season's rosters can't be read.
async function maybeRfas(ctx, penalties) {
    const {asArray} = ctx.lib.mfl;
    const candidates = penalties.filter((penalty) => penalty.lengthDue && needsCharge(penalty) && !penalty.addedThisSeason);
    if (!candidates.length) {
        return [];
    }
    const atOne = atOneYear(await ctx.lastSeasonRosters(), asArray);
    const done = rfasSet(ctx);
    return candidates.filter((penalty) => atOne.get(penalty.playerId) === penalty.salary && !done.has(penalty.playerId));
}

// a penalty already charged (by a run that failed before the clearing, or by hand), or a $0 one,
// only gets the contract cleared
export async function run(ctx, {penalties, lengthDueUnknown}, over) {
    const {loggedIn, dryRun, log, choreLog, needsAttention, wouldPrefix, mflImport, contractsXml} = ctx;
    const applyDropPenalties = ctx.apply.dropPenalties;
    // blank clears them, and the free agents export then reads $1.00 / 0, as a player never on a roster
    const clearSalaryXml = (penalty) => contractsXml([{playerId: penalty.playerId, salary: "", years: ""}]);
    if (!penalties.length) {
        log("No dropped players owe a cap penalty.");
        return;
    }
    const describe = (penalty) => `$${penalty.amount} to ${penalty.teamName} for ${penalty.explanation}`;
    const noCharge = (penalty) => penalty.amount > 0 ? "penalty already charged" : "no penalty owed";
    const lengthDue = penalties.filter((penalty) => penalty.lengthDue && !over.has(penalty.franchiseId));
    let unpriced = [];
    let why = lengthDueUnknown;
    // one charged already, by hand or by an earlier run, only needs the contract cleared
    if (lengthDueUnknown) {
        unpriced = lengthDue.filter(needsCharge);
    } else {
        unpriced = await maybeRfas(ctx, lengthDue).catch((error) => {
            why = `last season's rosters couldn't be read: ${error.message}`;
            return lengthDue.filter((penalty) => needsCharge(penalty) && !penalty.addedThisSeason);
        });
        why = why || "each ended last season at 1 year on the same salary: an RFA whose contract ran out owes nothing, one won back at the auction a year's";
    }
    if (unpriced.length) {
        needsAttention(`Cap chores: left as they are, since it can't be told whether they owe a penalty (${why}): `
            + `${unpriced.map((penalty) => penalty.explanation).join(", ")}. Charge any owed by hand with his full name, as here, and the next run `
            + "clears his contract; clear the salary and years of one who owes nothing on MFL's Edit Player Salaries and Contracts page.");
    }
    const toApply = penalties.filter((penalty) => !over.has(penalty.franchiseId) && !unpriced.includes(penalty));
    // held penalties don't count: they can wait for weeks on a team over the cap
    if ((applyDropPenalties || dryRun) && toApply.length > MAX_PENALTIES_PER_RUN) {
        throw new Error(`${toApply.length} dropped players owe a cap penalty, more than the ${MAX_PENALTIES_PER_RUN} `
            + `expected in a day, so none were charged. Check the drops and charge them on MFL's Edit Salary Adjustments page by hand.`);
    }
    if (!applyDropPenalties) {
        for (const penalty of toApply) {
            choreLog(needsCharge(penalty)
                ? `${wouldPrefix("DROP_PENALTIES")} charge ${describe(penalty)}, then clear the player's contract.`
                : `${wouldPrefix("DROP_PENALTIES")} clear ${penalty.fullName}'s contract (${noCharge(penalty)}).`);
        }
        return;
    }
    if (toApply.length && !loggedIn) {
        throw new Error(`${toApply.length} dropped player(s) owe a cap penalty, but the job isn't logged in, so none were charged.`);
    }
    for (const penalty of toApply) {
        if (needsCharge(penalty)) {
            await mflImport("salaryAdj", salaryAdjXml(penalty));
            await mflImport("salaries", clearSalaryXml(penalty), {APPEND: "1"});
            choreLog(`Charged ${describe(penalty)}, and cleared the player's contract.`);
        } else {
            await mflImport("salaries", clearSalaryXml(penalty), {APPEND: "1"});
            choreLog(`Cleared ${penalty.fullName}'s contract (${noCharge(penalty)}).`);
        }
    }
}
