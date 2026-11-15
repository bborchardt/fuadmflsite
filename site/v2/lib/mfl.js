export const API_BASE = "https://api.myfantasyleague.com";

/** MFL's JSON turns a one-item list into a bare object and leaves out an empty one. */
// A number from an export, 0 when it's blank; NaN, unknown, when a display panel's check found MFL
// had left it out (null: ui/checked.js lenient), so anything worked out from it is unknown too
export const numberOf = (value) => (value === null ? NaN : Number(value) || 0);

export function asArray(value) {
    if (value === undefined || value === null) {
        return [];
    }
    return Array.isArray(value) ? value : [value];
}

// The page MFL drew, by the name it gives every page's body ("options_101" from
// `<body id="body_options_101">`), from its HTML or a document; null for anything else, its login page
// being "login". A reader checks it before trusting what it finds (docs/design.md: Outside change).
export function mflProgram(page) {
    if (page && typeof page === "object") {
        const id = page.body ? page.body.id || "" : "";
        return id.startsWith("body_") ? id.slice(5) : null;
    }
    const found = /<body\b[^>]*\bid=["']body_([\w-]+)["']/i.exec(String(page || ""));
    return found ? found[1] : null;
}

// "Jackson, Lamar" → "Lamar Jackson"
export function displayName(mflName) {
    const [last, first] = String(mflName).split(",").map((part) => part.trim());
    return first ? `${first} ${last}` : last;
}

// MFL's team codes where they differ from the usual ones ("KCC" for "KC")
const NFL_CODES = {GBP: "GB", JAC: "JAX", KCC: "KC", LVR: "LV", NEP: "NE", NOS: "NO", SFO: "SF", TBB: "TB"};
// MFL's salaries import, `players` [{id, salary, years}]; sent with APPEND=1 it's laid over what MFL
// has, and without it it replaces every salary
export function salariesImportXml(players) {
    const attr = (value) => String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    return `<salaries><leagueUnit unit="LEAGUE">${players.map((player) =>
        `<player id="${attr(player.id)}" salary="${attr(player.salary)}" contractYear="${attr(player.years)}"/>`).join("")}</leagueUnit></salaries>`;
}

export const nflCode = (team) => NFL_CODES[team] || team;

// league-independent exports (players, injuries, nflSchedule) live on the api host
export function exportUrl(base, season, type, params = {}) {
    const query = new URLSearchParams({TYPE: type, ...params, JSON: "1"});
    return `${base}/${season}/export?${query}`;
}

export class MflError extends Error {
    constructor(what, why, status) {
        super(`Couldn't load ${what}: ${why}`);
        this.name = "MflError";
        this.what = what;
        this.status = status;
    }
}

// `check(section, body)`, when given, gives back the section or throws (the job's lib/shapes.js checkShape)
export async function fetchExport(url, section, {fetchImpl = fetch, init, check} = {}) {
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
    return check ? check(section, body[section]) : body[section];
}

// null until MFL publishes the season's schedule: it answers 404 for an unknown season and lists
// no games for an empty week
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

// null until MFL publishes the season's schedule
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

export function firstKickoff(nflSchedule) {
    const kickoffs = asArray(nflSchedule.matchup)
        .map((matchup) => Number(matchup.kickoff))
        .filter((seconds) => seconds > 0);
    return kickoffs.length ? new Date(Math.min(...kickoffs) * 1000) : null;
}
