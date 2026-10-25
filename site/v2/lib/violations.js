// League Alerts' rules, shared with the daily job so the two flag the same things.

import {ROSTER_MAX, ROSTER_MIN, SALARY_CAP} from "./rules.js";
import settings from "./settings.js";
import {contractDeadline, windowClosed} from "./adds.js";
import {displayName, weekEnd, weekKickoff} from "./mfl.js";

// MFL reports its last week all offseason, so the season's phase comes from its NFL schedule. A
// schedule MFL hasn't published counts as not yet. `weeks` is seasonWeeks' (lib/rules.js); without
// it the playoffs and the season's end can't be told, so the in-season checks are off.
export async function seasonPhase(season, now, options, weeks) {
    const [start, playoffs, end] = await Promise.all([
        weekKickoff(season, 1, options),
        weeks ? weekKickoff(season, weeks.playoffsStart, options) : null,
        weeks ? weekEnd(season, weeks.championship, options) : null
    ]);
    return {
        // the injured reserve check starts with week 1's kickoff, whatever week MFL reports before it
        started: Boolean(start) && now >= start,
        tankingOver: !weeks || (Boolean(playoffs) && now >= playoffs),
        seasonOver: !weeks || (Boolean(end) && now >= end)
    };
}

// the NFL's IR and its variants (IR-R, IR-PUP, IR-NFI)
export const onNflIR = (player) => /^IR/.test(player.injuryStatus || "");

// as members see times on MFL: "9:42 PM CT"
function centralTime(seconds) {
    return new Date(seconds * 1000).toLocaleTimeString("en-US", {timeZone: "America/Chicago", hour: "numeric", minute: "2-digit"}) + " CT";
}

// `reading` is contract-years.js's postReading, or none when the board couldn't be read
function contractNotice(teamName, add, reading) {
    const by = centralTime(contractDeadline(add));
    const example = `"${String(add.name).split(",")[0].trim()}: 3 years"`;
    const added = `${teamName} added ${displayName(add.name)}`;
    if (reading && reading.state === "read") {
        return `${added}: read ${reading.years} year${reading.years === 1 ? "" : "s"} from the message board. `
            + `To change it, edit your latest post or post again by ${by}.`;
    }
    if (reading && reading.state === "problem") {
        return `${added}: couldn't read his contract length from the message board. Edit your latest post or post again by ${by}, like ${example}.`;
    }
    return `${added}: post his contract length on the message board by ${by}, like ${example}, or it will be 1 year.`;
}

// Returns [{kind, franchiseId, text, warning}]; `warning` items are rule violations, the others
// notices.
// `cutDown` (in seconds): the final cut-down date, when the roster limits start (2.5); without it
// they start with week 1.
export function ruleViolations(league, {pendingAdds = [], readings = new Map(), now = Date.now() / 1000, cutDown = null} = {}) {
    const items = [];
    const week = Number(league.week);
    // the IR check runs from week 1's kickoff until the championship is over; otherwise only the cap
    const weeks = league.weeks;
    const rosterSeason = Boolean(weeks) && league.started !== false && !league.seasonOver && week <= weeks.championship;
    const limitsSeason = rosterSeason || (Boolean(cutDown) && now >= cutDown && !league.seasonOver);
    const push = (kind, franchise, text, warning = true) => items.push({kind, franchiseId: franchise.franchiseId, text, warning});
    for (const franchise of league.franchises.values()) {
        if (franchise.capTotal > SALARY_CAP) {
            push("cap", franchise, franchise.unchargedPenalty
                ? `${franchise.teamName} is over the salary cap with a total salary of ${franchise.capTotal}, counting $${franchise.unchargedPenalty} in drop penalties not yet charged!`
                : `${franchise.teamName} is over the salary cap with a total salary of ${franchise.capTotal}!`);
        }
        if (limitsSeason && franchise.numPlayers > ROSTER_MAX) {
            push("roster-over", franchise, `${franchise.teamName} is over the roster limit with ${franchise.numPlayers} players!`);
        }
        if (limitsSeason && franchise.numPlayers < ROSTER_MIN) {
            push("roster-under", franchise, `${franchise.teamName} is under the roster limit with ${franchise.numPlayers} players!`);
        }
        // today's NFL injury report is what makes a player IR-eligible
        if (league.injuryReportKnown && rosterSeason && week >= 1) {
            const healthy = (franchise.irPlayers || []).filter((player) => !onNflIR(player));
            for (const player of healthy) {
                push("ir", franchise, `${franchise.teamName} has ${player.fullName} on injured reserve, but the NFL doesn't list him on IR: move him to the active roster!`);
            }
            if (healthy.length && franchise.numPlayers + healthy.length > ROSTER_MAX) {
                push("ir-roster", franchise, `Moving ${healthy.length === 1 ? "him" : "them"} back would put ${franchise.teamName} at ${franchise.numPlayers + healthy.length} players, over the roster limit!`);
            }
        }
        // before week 1's kickoff MFL's results can list week 1's lineups, which nobody has played
        if (settings.antiTanking && weeks && league.started !== false && !league.tankingOver && week < weeks.playoffsStart) {
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
