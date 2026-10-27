// MFL's League History pages, read on the current season's site and kept in the browser until the
// next week's results (MFL's page says which week is complete) or a week, whichever comes first
// (history-model.js reads them).

import {pageFetch} from "./page-fetch.js";
import {cached} from "./store.js";
import {readCareer, readChampions, readSeries} from "./history-model.js";

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
const done = () => Number(window.completedWeek) || 0;
// tests/stored-shapes.test.mjs ties each to what its reader returns
export const KEYS = {champions: "fuad.history.champions", career: "fuad.history.career", series: "fuad.history.series"};

async function historyPage({season, leagueId}, query, read, what) {
    const response = await pageFetch(`${window.location.origin}/${season}/options?L=${leagueId}&${query}`, {credentials: "include"});
    if (!response.ok) {
        throw Object.assign(new Error(`HTTP ${response.status}`), {status: response.status});
    }
    const value = read(await response.text());
    if (!value) {
        throw new Error(`MFL's ${what} page has changed`);
    }
    return value;
}

// a new champion shows the day the title is won
export const champions = (context) => cached(`${KEYS.champions}.${context.season}.${done()}`, DAY,
    () => historyPage(context, "O=194", readChampions, "League Champions"));

export const careers = (context) => cached(`${KEYS.career}.${context.season}.${done()}`, WEEK,
    () => historyPage(context, "O=208", readCareer, "Career Records"));

export const series = (context, teamId) => cached(`${KEYS.series}.${context.season}.${done()}.${teamId}`, WEEK,
    () => historyPage(context, `O=171&FID=${encodeURIComponent(teamId)}`, readSeries, "All-Time Series Records"));
