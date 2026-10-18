// The line under the wordmark: the week in season, the phase outside it, the same in every section.

import {asArray, exportUrl, fetchExport, weekEnd, weekKickoff} from "../lib/mfl.js";
import {ROSTER_CHECK_LAST_WEEK} from "../lib/rules.js";
import {cached} from "./store.js";

const DAY = 24 * 60 * 60 * 1000;

const centralDate = (date) => date.toLocaleDateString("en-CA", {timeZone: "America/Chicago"});

// `week1` is week 1's first kickoff and `seasonEnd` when week 17's games are over (null until MFL
// publishes the schedule); `drafted` whether the rookie draft's picks are in; `draftDays` the dates
// (YYYY-MM-DD, Central) of calendar events named for the draft
export function contextLine({now, week, week1, seasonEnd, drafted, draftDays = []}) {
    if (seasonEnd && now >= seasonEnd) {
        return "Season over";
    }
    if (week1 && now >= week1) {
        return week ? `Week ${week}` : "";
    }
    if (draftDays.includes(centralDate(now))) {
        return "Draft day";
    }
    return drafted ? "Before week 1" : "Before the draft";
}

export const draftPicked = (draftResults) => asArray(draftResults && draftResults.draftUnit)
    .flatMap((unit) => asArray(unit.draftPick))
    .some((pick) => pick.player);

// the calendar export needs a login; without one there's no draft day
export function draftDays(calendar) {
    return asArray(calendar && calendar.event)
        .filter((event) => /draft/i.test(event.title || event.name || ""))
        .map((event) => Number(event.start_time || event.startTime || event.start))
        .filter((seconds) => seconds > 0)
        .map((seconds) => centralDate(new Date(seconds * 1000)));
}

// cached for a day; a part that can't be read is left out rather than hold up the line
export async function loadContext({season, leagueId}) {
    const host = window.location.origin;
    const league = (type) => fetchExport(exportUrl(host, season, type, {L: leagueId}), type).catch(() => null);
    const facts = await cached(`fuad.context.${season}`, DAY, async () => {
        const [week1, seasonEnd, draftResults, calendar] = await Promise.all([
            weekKickoff(season, 1).catch(() => null),
            weekEnd(season, ROSTER_CHECK_LAST_WEEK).catch(() => null),
            league("draftResults"),
            league("calendar")
        ]);
        return {
            week1: week1 && week1.getTime(),
            seasonEnd: seasonEnd && seasonEnd.getTime(),
            drafted: draftPicked(draftResults),
            draftDays: draftDays(calendar)
        };
    });
    return contextLine({
        now: new Date(),
        week: window.liveScoringWeek,
        week1: facts.week1 && new Date(facts.week1),
        seasonEnd: facts.seasonEnd && new Date(facts.seasonEnd),
        drafted: facts.drafted,
        draftDays: facts.draftDays
    });
}
