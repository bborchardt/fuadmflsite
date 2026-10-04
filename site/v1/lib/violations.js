// The league's roster and salary cap rules, checked against a built league. Shared by the Main
// tab's violations box and the daily job, so the two report the same things. No DOM.

import {INJURY_CHECK_LAST_WEEK, ROSTER_CHECK_LAST_WEEK, ROSTER_MAX, ROSTER_MIN, SALARY_CAP} from "./rules.js";
import {contractDeadline, windowClosed} from "./adds.js";

/** "Last, First" as "First Last". */
const displayName = (name) => String(name).split(",").reverse().map((part) => part.trim()).join(" ");

/** Whether the NFL lists a player on injured reserve: IR, or a variant such as IR-R or IR-PUP. */
export const onNflIR = (player) => /^IR/.test(player.injuryStatus || "");

/** A Unix time as members see it on MFL: "9:42 PM CT". */
function centralTime(seconds) {
    return new Date(seconds * 1000).toLocaleTimeString("en-US", {timeZone: "America/Chicago", hour: "numeric", minute: "2-digit"}) + " CT";
}

/**
 * Everything the box shows, as [{kind, franchiseId, text, warning}]. `warning` items are rule
 * violations; the others are notices. Kinds: "cap", "roster-over", "roster-under", "ir" (on
 * MFL's IR without an NFL IR designation), "ir-roster" (moving those back would break the
 * roster limit), "injured-starter", and "contract" (an add whose posting window is still open).
 * `pendingAdds` comes from adds.js; `now` is Unix seconds. Once `league.seasonOver` (the kickoff
 * of NFL week SEASON_OVER_WEEK has passed), only the cap is checked: MFL keeps reporting the
 * last week all offseason.
 */
export function ruleViolations(league, {pendingAdds = [], now = Date.now() / 1000} = {}) {
    const items = [];
    // past every week limit once the season is over
    const week = league.seasonOver ? Infinity : Number(league.week);
    const push = (kind, franchise, text, warning = true) => items.push({kind, franchiseId: franchise.franchiseId, text, warning});
    for (const franchise of league.franchises.values()) {
        if (franchise.capTotal > SALARY_CAP) {
            push("cap", franchise, franchise.unchargedPenalty
                ? `${franchise.teamName} is over the salary cap with a total salary of ${franchise.capTotal}, counting $${franchise.unchargedPenalty} in drop penalties not yet charged!`
                : `${franchise.teamName} is over the salary cap with a total salary of ${franchise.capTotal}!`);
        }
        if (week <= ROSTER_CHECK_LAST_WEEK && franchise.numPlayers > ROSTER_MAX) {
            push("roster-over", franchise, `${franchise.teamName} is over the roster limit with ${franchise.numPlayers} players!`);
        }
        if (week <= ROSTER_CHECK_LAST_WEEK && franchise.numPlayers < ROSTER_MIN) {
            push("roster-under", franchise, `${franchise.teamName} is under the roster limit with ${franchise.numPlayers} players!`);
        }
        // during the season only: the NFL's injury report is what makes a player IR-eligible
        if (week >= 1 && week <= ROSTER_CHECK_LAST_WEEK) {
            const healthy = (franchise.irPlayers || []).filter((player) => !onNflIR(player));
            for (const player of healthy) {
                push("ir", franchise, `${franchise.teamName} has ${player.fullName} on injured reserve, but the NFL doesn't list him on IR: move him to the active roster!`);
            }
            if (healthy.length && franchise.numPlayers + healthy.length > ROSTER_MAX) {
                push("ir-roster", franchise, `Moving ${healthy.length === 1 ? "him" : "them"} back would put ${franchise.teamName} at ${franchise.numPlayers + healthy.length} players, over the roster limit!`);
            }
        }
        if (week <= INJURY_CHECK_LAST_WEEK) {
            for (const player of franchise.lineup.filter((starter) => starter.injured)) {
                push("injured-starter", franchise, `${franchise.teamName} started injured/suspended player ${player.fullName} in week ${league.week}!`);
            }
        }
    }
    // a blind bid's length is in its comment, so only free agent and waiver adds need a post
    for (const add of pendingAdds.filter((entry) => entry.type !== "BBID_WAIVER" && !windowClosed(entry, now))) {
        const franchise = league.franchises.get(add.franchiseId);
        if (franchise) {
            push("contract", franchise, `${franchise.teamName} added ${displayName(add.name)}: post his contract length on the message board by `
                + `${centralTime(contractDeadline(add))}, or it will be 1 year.`, false);
        }
    }
    return items;
}
