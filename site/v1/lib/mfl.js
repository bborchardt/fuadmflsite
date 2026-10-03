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
    constructor(what, why) {
        super(`Couldn't load ${what}: ${why}`);
        this.name = "MflError";
        this.what = what;
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
        throw new MflError(section, `HTTP ${response.status}`);
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

/** The first kickoff (a Date) in an nflSchedule export, or null if it lists no games. */
export function firstKickoff(nflSchedule) {
    const kickoffs = asArray(nflSchedule.matchup)
        .map((matchup) => Number(matchup.kickoff))
        .filter((seconds) => seconds > 0);
    return kickoffs.length ? new Date(Math.min(...kickoffs) * 1000) : null;
}
