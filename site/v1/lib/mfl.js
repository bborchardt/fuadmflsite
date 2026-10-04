// Helpers for MFL's JSON exports, shared by the page and the daily job.

export const API_BASE = "https://api.myfantasyleague.com";

/** MFL's JSON turns a one-item list into a bare object and leaves out an empty one. */
export function asArray(value) {
    if (value === undefined || value === null) {
        return [];
    }
    return Array.isArray(value) ? value : [value];
}

/** MFL names players "Last, First"; the site shows "First Last". */
export function displayName(mflName) {
    const parts = String(mflName).split(",");
    return parts.length < 2 ? parts[0] : parts[1].trim() + " " + parts[0];
}

/** URL of an MFL export. League exports live on the league's host; league-independent ones (players, injuries, nflSchedule) on the api host. */
export function exportUrl(base, season, type, params = {}) {
    const query = new URLSearchParams({TYPE: type, ...params, JSON: "1"});
    return `${base}/${season}/export?${query}`;
}

export class MflError extends Error {
    constructor(what, why, status) {
        super(`Couldn't load ${what}: ${why}`);
        this.name = "MflError";
        this.what = what;
        // the HTTP status, when the failure was one
        this.status = status;
    }
}

/**
 * Fetch an export and return its top-level section, failing loudly on anything else:
 * a network error, a non-200 status, a non-JSON body, an MFL error document, or a
 * response without the expected section.
 */
export async function fetchExport(url, section, {fetchImpl = fetch, init} = {}) {
    let response;
    try {
        response = await fetchImpl(url, init);
    } catch (error) {
        throw new MflError(section, `network error (${error.message})`);
    }
    if (!response.ok) {
        throw new MflError(section, `HTTP ${response.status}`, response.status);
    }
    let body;
    try {
        body = await response.json();
    } catch (error) {
        throw new MflError(section, "the response wasn't JSON");
    }
    if (body.error) {
        const message = typeof body.error === "object" ? body.error.$t || JSON.stringify(body.error) : body.error;
        throw new MflError(section, `MFL said "${message}"`);
    }
    if (!(section in body)) {
        throw new MflError(section, `the response had no "${section}" section`);
    }
    return body[section];
}

/**
 * The first kickoff of an NFL week, or null if MFL hasn't published that season's schedule
 * yet (it answers 404 for an unknown season and lists no games for an empty week).
 */
export async function weekKickoff(season, week, options) {
    try {
        return firstKickoff(await fetchExport(exportUrl(API_BASE, season, "nflSchedule", {W: week}), "nflSchedule", options));
    } catch (error) {
        if (error instanceof MflError && error.status === 404) {
            return null;
        }
        throw error;
    }
}

/** How long after its kickoff a game is taken to be over. */
export const GAME_HOURS = 4;

/**
 * When an NFL week is over: its last kickoff plus GAME_HOURS, or null if MFL hasn't published
 * that season's schedule yet.
 */
export async function weekEnd(season, week, options) {
    try {
        const kickoffs = asArray((await fetchExport(exportUrl(API_BASE, season, "nflSchedule", {W: week}), "nflSchedule", options)).matchup)
            .map((matchup) => Number(matchup.kickoff)).filter((seconds) => seconds > 0);
        return kickoffs.length ? new Date((Math.max(...kickoffs) + GAME_HOURS * 3600) * 1000) : null;
    } catch (error) {
        if (error instanceof MflError && error.status === 404) {
            return null;
        }
        throw error;
    }
}

/** The first kickoff (a Date) in an nflSchedule export, or null if it lists no games. */
export function firstKickoff(nflSchedule) {
    const kickoffs = asArray(nflSchedule.matchup)
        .map((matchup) => Number(matchup.kickoff))
        .filter((seconds) => seconds > 0);
    return kickoffs.length ? new Date(Math.min(...kickoffs) * 1000) : null;
}
