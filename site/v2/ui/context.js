// The line under the wordmark: the week in season, the phase outside it, the same in every section;
// and the kickoffs the sections go by.

import {asArray, exportUrl, fetchExport, weekEnd, weekKickoff} from "../lib/mfl.js";
import {seasonWeeks} from "../lib/rules.js";
import {cached} from "./store.js";
import {leagueDate, pageFetch, viewer as viewerOf} from "./page-fetch.js";
import {strict} from "./checked.js";

const DAY = 24 * 60 * 60 * 1000;

// a week's first kickoff, in seconds, kept a day; null until MFL schedules the week
export const kickoffAt = (season, week) => cached(`fuad.kickoff.${season}.${week}`, DAY, async () => {
    const date = await weekKickoff(season, week, {fetchImpl: pageFetch, check: strict});
    return date ? date.getTime() / 1000 : null;
});

// MFL's page says the season has begun once a week is done or scored
const mflSaysStarted = () => Number(window.completedWeek) > 0 || Number(window.liveScoringWeek) > 1;

// Whether week 1 has kicked off, for the line, Moves and Lineup alike: by week 1's kickoff (ms); when
// it couldn't be read, or no facts could, by MFL's page (`mflStarted`); a schedule MFL hasn't
// published yet (`week1Known` with no kickoff) means not yet, whatever week MFL's page shows.
export function seasonStarted(facts, now = Date.now(), mflStarted = mflSaysStarted()) {
    if (facts && facts.week1) {
        return now >= facts.week1;
    }
    return !(facts && facts.week1Known === true) && mflStarted;
}

// before week 1's kickoff: MFL's page says so once a week is done or scored; otherwise week 1's
// kickoff, and if that can't be had, in season. Unlike seasonStarted, a failed read counts as in
// season, and so does MFL's page showing a week before the schedule is out: League and Rosters would
// rather show the season's views than hide them.
export async function beforeWeek1(season) {
    if (mflSaysStarted()) {
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
// publishes the schedule); `week1Known` false when the kickoff couldn't be read, and then `started`
// (MFL's page) decides; `drafted` whether the rookie draft's picks are in; `draftDays` the dates
// (YYYY-MM-DD, in the league's zone) of calendar events named for the draft
export function contextLine({now, week, week1, week1Known = true, started = false, seasonEnd, drafted, draftDays = []}) {
    if (seasonEnd && now >= seasonEnd) {
        return "Season over";
    }
    if (seasonStarted({week1: week1 && week1.getTime(), week1Known}, now.getTime(), started)) {
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

// Kept a day, per viewer, as the calendar answers for whoever is logged in. A part that can't be read
// is left out rather than hold up the line, and logged; the result is then not kept, so the next page
// asks again for what failed, and for the draft results before week 1 (page-fetch keeps the
// schedules, league and calendar a day). An export MFL has changed fails every time until the code
// follows, so it's kept as none, and strict has logged it.
export function seasonFacts({season, leagueId}) {
    const host = window.location.origin;
    const options = {fetchImpl: pageFetch, check: strict};
    const viewer = viewerOf();
    let complete = true;
    let week1Known = true;
    const without = (part) => (error) => {
        if (!(error && error.changed)) {
            complete = false;
            console.error(`[fuad] the season's facts couldn't read ${part}:`, error);
        }
        return null;
    };
    const league = (type) => fetchExport(exportUrl(host, season, type, {L: leagueId}), type, options);
    return cached(`fuad.context.${season}.${viewer}`, DAY, async () => {
        const week1Promise = weekKickoff(season, 1, options).catch((error) => {
            week1Known = false;
            return without("week 1's kickoff")(error);
        });
        const [week1, seasonEnd, draftResults, calendar] = await Promise.all([
            week1Promise,
            league("league").then((info) => {
                const weeks = seasonWeeks(info);
                return weeks ? weekEnd(season, weeks.championship, options) : null;
            }).catch(without("the season's end")),
            // only before week 1 does the draft matter
            week1Promise.then((date) => (seasonStarted({week1: date && date.getTime(), week1Known})
                ? null : league("draftResults").catch(without("the draft results")))),
            // logged out MFL refuses the calendar, and there's no draft day to show
            viewer === "guest" ? null : league("calendar").catch(without("the calendar"))
        ]);
        return {
            week1: week1 && week1.getTime(),
            week1Known,
            seasonEnd: seasonEnd && seasonEnd.getTime(),
            drafted: draftPicked(draftResults),
            // whether `drafted` was read, rather than assumed because the draft results weren't asked
            // for or MFL didn't give them
            draftKnown: Boolean(draftResults),
            draftDays: draftDays(calendar)
        };
    }, {keep: () => complete});
}

export async function loadContext(context) {
    const facts = await seasonFacts(context);
    return contextLine({
        now: new Date(),
        week: window.liveScoringWeek,
        week1: facts.week1 && new Date(facts.week1),
        week1Known: facts.week1Known !== false,
        started: mflSaysStarted(),
        seasonEnd: facts.seasonEnd && new Date(facts.seasonEnd),
        drafted: facts.drafted,
        draftDays: facts.draftDays
    });
}
