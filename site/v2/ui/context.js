// The line under the wordmark: the week in season, the phase outside it, the same in every section;
// and the kickoffs the sections go by.

import {asArray, exportUrl, fetchExport, weekEnd, weekKickoff} from "../lib/mfl.js";
import {seasonWeeks} from "../lib/rules.js";
import {cached} from "./store.js";
import {leagueDate, pageFetch} from "./page-fetch.js";

const DAY = 24 * 60 * 60 * 1000;

// a week's first kickoff, in seconds, kept a day; null until MFL schedules the week
export const kickoffAt = (season, week) => cached(`fuad.kickoff.${season}.${week}`, DAY, async () => {
    const date = await weekKickoff(season, week, {fetchImpl: pageFetch});
    return date ? date.getTime() / 1000 : null;
});

// before week 1's kickoff: MFL's page says so once a week is done; otherwise week 1's kickoff, and
// if that can't be had, in season
export async function beforeWeek1(season) {
    if (Number(window.completedWeek) > 0 || Number(window.liveScoringWeek) > 1) {
        return false;
    }
    try {
        const kickoff = await kickoffAt(season, 1);
        return !kickoff || Date.now() / 1000 < kickoff;
    } catch (error) {
        return false;
    }
}

// `week1` is week 1's first kickoff and `seasonEnd` when week 17's games are over (null until MFL
// publishes the schedule); `drafted` whether the rookie draft's picks are in; `draftDays` the dates
// (YYYY-MM-DD, in the league's zone) of calendar events named for the draft
export function contextLine({now, week, week1, seasonEnd, drafted, draftDays = []}) {
    if (seasonEnd && now >= seasonEnd) {
        return "Season over";
    }
    if (week1 && now >= week1) {
        return week ? `Week ${week}` : "";
    }
    if (draftDays.includes(leagueDate(now))) {
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
        // some events carry a week number there ("12" on the trade deadline)
        .filter((seconds) => seconds > 1e9)
        .map((seconds) => leagueDate(new Date(seconds * 1000)));
}

// cached for a day; a part that can't be read is left out rather than hold up the line
export function seasonFacts({season, leagueId}) {
    const host = window.location.origin;
    const league = (type) => fetchExport(exportUrl(host, season, type, {L: leagueId}), type, {fetchImpl: pageFetch}).catch(() => null);
    return cached(`fuad.context.${season}`, DAY, async () => {
        const week1Promise = weekKickoff(season, 1, {fetchImpl: pageFetch}).catch(() => null);
        const [week1, seasonEnd, draftResults, calendar] = await Promise.all([
            week1Promise,
            league("league").then((info) => {
                const weeks = seasonWeeks(info);
                return weeks ? weekEnd(season, weeks.championship, {fetchImpl: pageFetch}) : null;
            }).catch(() => null),
            // only before week 1 does the draft matter
            week1Promise.then((date) => (date && Date.now() >= date.getTime() ? null : league("draftResults"))),
            league("calendar")
        ]);
        return {
            week1: week1 && week1.getTime(),
            seasonEnd: seasonEnd && seasonEnd.getTime(),
            drafted: draftPicked(draftResults),
            // whether `drafted` was read, rather than assumed from a failed request
            draftKnown: Boolean(draftResults),
            draftDays: draftDays(calendar)
        };
    });
}

export async function loadContext(context) {
    const facts = await seasonFacts(context);
    return contextLine({
        now: new Date(),
        week: window.liveScoringWeek,
        week1: facts.week1 && new Date(facts.week1),
        seasonEnd: facts.seasonEnd && new Date(facts.seasonEnd),
        drafted: facts.drafted,
        draftDays: facts.draftDays
    });
}
