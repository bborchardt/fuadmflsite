// One request per URL for the life of the page: the context line, the season's checks and Home
// each read the NFL schedule, the calendar and the draft, and MFL throttles bursts. A failed request
// is forgotten, so Retry asks again. Exports that rarely change are also kept in the browser
// (`keepFor`), so the next page reuses them instead of asking MFL again.

import {storage} from "./store.js";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const KEEP = "fuad.keep.";
const WAIT_KEY = "fuad.mflWait";
const WAIT = 30 * 1000;
const MOVES_KEPT = 2 * MINUTE;

const centralDate = (date) => date.toLocaleDateString("en-CA", {timeZone: "America/Chicago"});

// whether this week's NFL schedule has a game today; unknown counts as a game day
export function gameToday(schedule, now) {
    if (!schedule) {
        return true;
    }
    const matchups = [].concat(schedule.matchup || []);
    return matchups.some((matchup) => Number(matchup.kickoff) > 0 && centralDate(new Date(Number(matchup.kickoff) * 1000)) === centralDate(now));
}

// How long an export may be kept, in ms (0: not kept). `liveWeek` is the week MFL's page is on;
// `gameDay()` says whether an NFL game is played today. Nothing here feeds Moves' checks.
export function keepFor(url, {liveWeek, gameDay}) {
    const parsed = new URL(url);
    if (!parsed.pathname.endsWith("/export")) {
        return 0;
    }
    const params = parsed.searchParams;
    const week = params.get("W");
    switch (params.get("TYPE")) {
        case "nflSchedule":
        case "league":
        case "calendar":
            return DAY;
        // for display only: Moves' checks ask MFL fresh, and a move made in v2 clears them (`forget`)
        case "rosters":
        case "salaryAdjustments":
        case "transactions":
        case "freeAgents":
        case "pendingWaivers":
        case "pendingTrades":
        case "messageBoard":
            return MOVES_KEPT;
        case "weeklyResults":
            return week ? 0 : HOUR;
        case "injuries":
            // a past week's report is final; this week's (Lineup) is always asked; today's is what
            // shows a starter ruled out, so on game days it's kept only a few minutes
            if (week) {
                return liveWeek && Number(week) < liveWeek ? DAY : 0;
            }
            return gameDay() ? 5 * MINUTE : HOUR;
        default:
            return 0;
    }
}

function kept(key) {
    try {
        const entry = JSON.parse(storage.get(key));
        return entry && entry.expires > Date.now() ? entry.body : null;
    } catch (error) {
        return null;
    }
}

// MFL's own pages share this browser storage, so what's expired goes as something new is kept
function keep(key, body, maxAge) {
    const now = Date.now();
    try {
        for (const name of Object.keys(window.localStorage)) {
            if (name.startsWith(KEEP) && !(JSON.parse(window.localStorage.getItem(name)) || {}).expires > now) {
                window.localStorage.removeItem(name);
            }
        }
    } catch (error) {
    }
    storage.set(key, JSON.stringify({expires: now + maxAge, body}));
}

// after a move made in v2, so the next page shows it: what a move changes is asked again
export function forget() {
    for (const [key] of responses) {
        if (keepFor(key, {liveWeek: 0, gameDay: () => true}) === MOVES_KEPT) {
            responses.delete(key);
        }
    }
    try {
        for (const name of Object.keys(window.localStorage)) {
            if ((name.startsWith(KEEP) && keepFor(name.slice(KEEP.length), {liveWeek: 0, gameDay: () => true}) === MOVES_KEPT)
                || name.startsWith("fuad.capUsed.")) {
                window.localStorage.removeItem(name);
            }
        }
    } catch (error) {
    }
}

const liveWeek = () => (typeof window !== "undefined" && Number(window.liveScoringWeek)) || 0;

function thisWeeksSchedule() {
    const week = liveWeek();
    const season = typeof window !== "undefined" && window.location && (window.location.pathname.match(/^\/(\d{4})\//) || [])[1];
    if (!week || !season) {
        return null;
    }
    const body = kept(`${KEEP}https://api.myfantasyleague.com/${season}/export?TYPE=nflSchedule&W=${week}&JSON=1`);
    try {
        return body ? JSON.parse(body).nflSchedule : null;
    } catch (error) {
        return null;
    }
}

// Every read from MFL. After MFL answers 429 nothing is asked of it for a while, on any page; a read
// in that time answers 429 at once, so it fails as MFL's refusal would. Moves aren't held.
export async function mflFetch(url, init) {
    const until = Number(storage.get(WAIT_KEY)) || 0;
    if (Date.now() < until) {
        return new Response("", {status: 429});
    }
    const response = await fetch(url, init);
    if (response.status === 429) {
        storage.set(WAIT_KEY, String(Date.now() + WAIT));
    }
    return response;
}

const responses = new Map();

export function pageFetch(url, init) {
    const key = String(url);
    if (!responses.has(key)) {
        const maxAge = keepFor(key, {liveWeek: liveWeek(), gameDay: () => gameToday(thisWeeksSchedule(), new Date())});
        const body = maxAge ? kept(KEEP + key) : null;
        const request = body !== null
            ? Promise.resolve(new Response(body, {status: 200, headers: {"Content-Type": "application/json"}}))
            : mflFetch(url, init).then(async (response) => {
                if (!response.ok) {
                    responses.delete(key);
                } else if (maxAge) {
                    keep(KEEP + key, await response.clone().text(), maxAge);
                }
                return response;
            }, (error) => {
                responses.delete(key);
                throw error;
            });
        responses.set(key, request);
    }
    // each caller reads its own copy of the body
    return responses.get(key).then((response) => response.clone());
}
