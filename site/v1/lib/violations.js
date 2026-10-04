// The league's roster and salary cap rules, checked against a built league. Shared by the Main
// tab's violations box and the daily job, so the two report the same things. No DOM.

import {INJURY_CHECK_LAST_WEEK, PLAYOFFS_START_WEEK, ROSTER_CHECK_LAST_WEEK, ROSTER_MAX, ROSTER_MIN, SALARY_CAP} from "./rules.js";
import {contractDeadline, windowClosed} from "./adds.js";
import {weekEnd, weekKickoff} from "./mfl.js";

/**
 * Where a season is, from MFL's NFL schedule: {started} once week 1 has kicked off,
 * {tankingOver} once the playoffs' first kickoff has passed, {seasonOver} once the championship
 * week is over. A schedule MFL hasn't published
 * counts as not yet. `now` is a Date; `options` go to the fetches.
 */
export async function seasonPhase(season, now, options) {
    const [start, playoffs, end] = await Promise.all([
        weekKickoff(season, 1, options),
        weekKickoff(season, PLAYOFFS_START_WEEK, options),
        weekEnd(season, ROSTER_CHECK_LAST_WEEK, options)
    ]);
    return {
        // the injured reserve check starts with week 1's kickoff, whatever week MFL reports before it
        started: Boolean(start) && now >= start,
        tankingOver: Boolean(playoffs) && now >= playoffs,
        seasonOver: Boolean(end) && now >= end
    };
}

/** "Last, First" as "First Last". */
const displayName = (name) => String(name).split(",").reverse().map((part) => part.trim()).join(" ");

/** Whether the NFL lists a player on injured reserve: IR, or a variant such as IR-R or IR-PUP. */
export const onNflIR = (player) => /^IR/.test(player.injuryStatus || "");

/** A Unix time as members see it on MFL: "9:42 PM CT". */
function centralTime(seconds) {
    return new Date(seconds * 1000).toLocaleTimeString("en-US", {timeZone: "America/Chicago", hour: "numeric", minute: "2-digit"}) + " CT";
}

/**
 * The notice for an add whose hour is open, from what the message board says so far (a
 * contract-years.js postReading; none when the board couldn't be read). It shows the
 * recommended format, "Hill: 3 years".
 */
function contractNotice(teamName, add, reading) {
    const by = centralTime(contractDeadline(add));
    const example = `"${String(add.name).split(",")[0].trim()}: 3 years"`;
    const added = `${teamName} added ${displayName(add.name)}`;
    if (reading && reading.state === "read") {
        return `${added}: read ${reading.years} year${reading.years === 1 ? "" : "s"} from the message board. `
            + `To change it, edit the post or post again by ${by}.`;
    }
    if (reading && reading.state === "problem") {
        return `${added}: couldn't read his contract length from the message board. Edit the post or post again by ${by}, like ${example}.`;
    }
    return `${added}: post his contract length on the message board by ${by}, like ${example}, or it will be 1 year.`;
}

/**
 * Everything the box shows, as [{kind, franchiseId, text, warning}]. `warning` items are rule
 * violations; the others are notices. Kinds: "cap", "roster-over", "roster-under", "ir" (on
 * MFL's IR without an NFL IR designation), "ir-roster" (moving those back would break the
 * roster limit), "injured-starter", and "contract" (an add whose posting window is still open).
 * `pendingAdds` comes from adds.js and `readings` from contract-years.js's postReadings; `now`
 * is Unix seconds. `league.tankingOver` and
 * `league.seasonOver` come from seasonPhase: after them the anti-tanking and the roster and IR
 * checks stop (MFL keeps reporting week 17 all offseason).
 */
export function ruleViolations(league, {pendingAdds = [], readings = new Map(), now = Date.now() / 1000} = {}) {
    const items = [];
    const week = Number(league.week);
    // roster limits and IR apply from week 1's kickoff until the championship week is over;
    // in the preseason only the cap is checked
    const rosterSeason = league.started !== false && !league.seasonOver && week <= ROSTER_CHECK_LAST_WEEK;
    const push = (kind, franchise, text, warning = true) => items.push({kind, franchiseId: franchise.franchiseId, text, warning});
    for (const franchise of league.franchises.values()) {
        if (franchise.capTotal > SALARY_CAP) {
            push("cap", franchise, franchise.unchargedPenalty
                ? `${franchise.teamName} is over the salary cap with a total salary of ${franchise.capTotal}, counting $${franchise.unchargedPenalty} in drop penalties not yet charged!`
                : `${franchise.teamName} is over the salary cap with a total salary of ${franchise.capTotal}!`);
        }
        if (rosterSeason && franchise.numPlayers > ROSTER_MAX) {
            push("roster-over", franchise, `${franchise.teamName} is over the roster limit with ${franchise.numPlayers} players!`);
        }
        if (rosterSeason && franchise.numPlayers < ROSTER_MIN) {
            push("roster-under", franchise, `${franchise.teamName} is under the roster limit with ${franchise.numPlayers} players!`);
        }
        // during the season only, and only with today's NFL injury report loaded: it's what makes a
        // player IR-eligible
        if (league.injuryReportKnown && rosterSeason && week >= 1) {
            const healthy = (franchise.irPlayers || []).filter((player) => !onNflIR(player));
            for (const player of healthy) {
                push("ir", franchise, `${franchise.teamName} has ${player.fullName} on injured reserve, but the NFL doesn't list him on IR: move him to the active roster!`);
            }
            if (healthy.length && franchise.numPlayers + healthy.length > ROSTER_MAX) {
                push("ir-roster", franchise, `Moving ${healthy.length === 1 ? "him" : "them"} back would put ${franchise.teamName} at ${franchise.numPlayers + healthy.length} players, over the roster limit!`);
            }
        }
        if (!league.tankingOver && week <= INJURY_CHECK_LAST_WEEK) {
            for (const player of franchise.lineup.filter((starter) => starter.injured)) {
                push("injured-starter", franchise, `${franchise.teamName} started injured/suspended player ${player.fullName} in week ${league.week}!`);
            }
        }
    }
    // a blind bid's length is in its comment, so only free agent and waiver adds need a post
    for (const add of pendingAdds.filter((entry) => entry.type !== "BBID_WAIVER" && !windowClosed(entry, now))) {
        const franchise = league.franchises.get(add.franchiseId);
        if (franchise) {
            push("contract", franchise, contractNotice(franchise.teamName, add, readings.get(add.playerId)),
                Boolean(readings.get(add.playerId) && readings.get(add.playerId).state === "problem"));
        }
    }
    return items;
}
