// One request per URL for the life of the page: the context line, the season's checks and Home
// each read the NFL schedule, the calendar and the draft, and MFL throttles bursts. A failed request
// is forgotten, so Retry asks again. Exports that rarely change are also kept in the browser
// (`keepFor`), so the next page reuses them instead of asking MFL again.

import {storage, sweep} from "./store.js";
import {TIME_ZONE} from "../lib/zone.js";
import {HELD} from "../lib/mfl.js";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const KEEP = "fuad.keep.";
const WAIT_KEY = "fuad.mflWait";
const WAIT = 30 * 1000;
export const MOVES_KEPT = 2 * MINUTE;

export const leagueDate = (date) => date.toLocaleDateString("en-CA", {timeZone: TIME_ZONE});

// whether this week's NFL schedule has a game today; unknown counts as a game day
export function gameToday(schedule, now) {
    if (!schedule) {
        return true;
    }
    const matchups = [].concat(schedule.matchup || []);
    return matchups.some((matchup) => Number(matchup.kickoff) > 0 && leagueDate(new Date(Number(matchup.kickoff) * 1000)) === leagueDate(now));
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

// Some exports answer for whoever is logged in (the calendar, pending bids and trades), so what's
// kept is the viewer's own: `fuad.keep.<team or guest>|<url>`
export const viewer = () => (typeof window !== "undefined" && window.franchise_id) || "guest";
const keyOf = (url) => `${KEEP}${viewer()}|${url}`;
const urlOf = (name) => name.slice(name.indexOf("|") + 1);

// only an answer with its section: MFL reports an error, a login one included, with HTTP 200
export function keepable(url, body) {
    try {
        const parsed = JSON.parse(body);
        return Boolean(parsed) && !parsed.error && new URL(url).searchParams.get("TYPE") in parsed;
    } catch (error) {
        return false;
    }
}

function keptEntry(key) {
    try {
        const entry = JSON.parse(storage.get(key));
        return entry && entry.expires > Date.now() ? entry : null;
    } catch (error) {
        return null;
    }
}
const kept = (key) => (keptEntry(key) || {}).body ?? null;

// what's expired goes with the store's sweep, whose entries have `expires` too
function keep(key, body, maxAge) {
    storage.set(key, JSON.stringify({expires: Date.now() + maxAge, body}));
    sweep();
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
            if ((name.startsWith(KEEP) && keepFor(urlOf(name), {liveWeek: 0, gameDay: () => true}) === MOVES_KEPT)
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
    const body = kept(keyOf(`https://api.myfantasyleague.com/${season}/export?TYPE=nflSchedule&W=${week}&JSON=1`));
    try {
        return body ? JSON.parse(body).nflSchedule : null;
    } catch (error) {
        return null;
    }
}

// how long a read waits for MFL to start answering; reading the answer isn't timed, as a slow phone
// takes a while over the players' list
export const READ_TIMEOUT = 20 * 1000;

// Every read from MFL. After MFL answers 429 nothing is asked of it for a while, on any page; a read
// in that time answers 429 at once, so it fails as MFL's refusal would. Moves aren't held. A read MFL
// doesn't answer in READ_TIMEOUT fails as one cut off does (ui/panel.js cutOff), so a panel isn't
// left on its placeholders. AbortSignal.timeout is newer than the oldest devices.
export async function mflFetch(url, init = {}) {
    const until = Number(storage.get(WAIT_KEY)) || 0;
    if (Date.now() < until) {
        return new Response("", {status: 429, statusText: HELD});
    }
    const controller = init.signal ? null : new AbortController();
    let timedOut = false;
    const timer = controller && setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, READ_TIMEOUT);
    let response;
    try {
        response = await fetch(url, controller ? {...init, signal: controller.signal} : init);
    } catch (error) {
        throw timedOut ? Object.assign(new Error(`MFL didn't answer in ${READ_TIMEOUT / 1000} seconds`), {cutOff: true}) : error;
    } finally {
        clearTimeout(timer);
    }
    if (response.status === 429) {
        storage.set(WAIT_KEY, String(Date.now() + WAIT));
    }
    return response;
}

// A move: sent even while reads are held, and a 429 holds them as one to a read does
export async function mflSend(url, init) {
    const response = await fetch(url, init);
    if (response.status === 429) {
        storage.set(WAIT_KEY, String(Date.now() + WAIT));
    }
    return response;
}

// Promise.all for reads asked at once: when several fail, a refusal (HTTP 429) is the error
// thrown, whichever failed first, so the page says the server is busy
export async function allAtOnce(reads) {
    const settled = await Promise.allSettled(reads);
    const failed = settled.filter((result) => result.status === "rejected").map((result) => result.reason);
    if (failed.length) {
        throw failed.find((error) => error && error.status === 429) || failed[0];
    }
    return settled.map((result) => result.value);
}

// how long until MFL may be asked again, in ms
export function waitLeft() {
    return Math.max(0, (Number(storage.get(WAIT_KEY)) || 0) - Date.now());
}

// each read's answer for this page, `{request, until}`: shared by every panel that asks within its keep
// time (MOVES_KEPT for one that isn't kept), as a page left open, or shown again, asks MFL afresh
const responses = new Map();

export function pageFetch(url, init) {
    const key = String(url);
    const held = responses.get(key);
    if (!held || held.until <= Date.now()) {
        // a failed read is asked again next time, unless a newer one has taken its place
        const drop = () => {
            if ((responses.get(key) || {}).request === request) {
                responses.delete(key);
            }
        };
        const maxAge = keepFor(key, {liveWeek: liveWeek(), gameDay: () => gameToday(thisWeeksSchedule(), new Date())});
        const stored = maxAge ? keptEntry(keyOf(key)) : null;
        const request = stored
            ? Promise.resolve(new Response(stored.body, {status: 200, headers: {"Content-Type": "application/json"}}))
            : mflFetch(url, init).then(async (response) => {
                if (!response.ok) {
                    drop();
                } else if (maxAge) {
                    const text = await response.clone().text();
                    if (keepable(key, text)) {
                        keep(keyOf(key), text, maxAge);
                    }
                }
                return response;
            }, (error) => {
                drop();
                throw error;
            });
        responses.set(key, {request, until: stored ? stored.expires : Date.now() + (maxAge || MOVES_KEPT)});
    }
    // each caller reads its own copy of the body
    return responses.get(key).request.then((response) => response.clone());
}
