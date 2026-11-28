export const API_BASE = "https://api.myfantasyleague.com";

/** MFL's JSON turns a one-item list into a bare object and leaves out an empty one. */
export function asArray(value) {
    if (value === undefined || value === null) {
        return [];
    }
    return Array.isArray(value) ? value : [value];
}

// A number from an export, 0 when it's blank; NaN, unknown, when a display panel's check found MFL
// had left it out (null: ui/checked.js lenient), so anything worked out from it is unknown too
export const numberOf = (value) => (value === null ? NaN : Number(value) || 0);

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
// a value inside an XML attribute
export const xmlAttr = (value) => String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
// MFL's salaries import, `players` [{id, salary, years}]; sent with APPEND=1 it's laid over what MFL
// has, and without it it replaces every salary
export function salariesImportXml(players) {
    return `<salaries><leagueUnit unit="LEAGUE">${players.map((player) =>
        `<player id="${xmlAttr(player.id)}" salary="${xmlAttr(player.salary)}" contractYear="${xmlAttr(player.years)}"/>`).join("")}</leagueUnit></salaries>`;
}

export const nflCode = (team) => NFL_CODES[team] || team;

// league-independent exports (players, injuries, nflSchedule) live on the api host
// the section an export's answer comes in: its type, but the year to date's weekly results come
// back as `allWeeklyResults`
export const exportSection = (type, params = {}) => (type === "weeklyResults" && params.W === "YTD" ? "allWeeklyResults" : type);

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

// v2's own answer to a read it holds back after MFL's refusal (ui/page-fetch.js), told apart from
// MFL's in what's logged, as the devices form counts both
export const HELD = "held by v2 after MFL's 429";
export const httpStatus = (response) => `HTTP ${response.status}${response.statusText === HELD ? `, ${HELD}` : ""}`;

// "network error (fetch failed: UND_ERR_CONNECT_TIMEOUT)": a failed request's message, and in Node the
// code under it (a connect timeout, a reset, a DNS failure), or its message where it has no code,
// which "fetch failed" alone doesn't say.
// A browser gives no cause, so it reads "network error (Load failed)".
export function networkError(error) {
    const cause = error && error.cause;
    const code = cause && (cause.code || (Array.isArray(cause.errors) && cause.errors.map((each) => each && each.code).find(Boolean)) || cause.message);
    return `network error (${String((error && error.message) || error)}${code ? `: ${code}` : ""})`;
}

// `check(section, body)`, when given, gives back the section or throws (the job's lib/shapes.js checkShape).
// `fetchImpl` has no default: v2's reads go through ui/page-fetch.js, which a browser's own fetch
// would skip unnoticed, and the job sends its own headers.
export async function fetchExport(url, section, {fetchImpl, init, check} = {}) {
    if (typeof fetchImpl !== "function") {
        throw new TypeError(`fetchExport(${section}) needs a fetchImpl`);
    }
    let response;
    try {
        response = await fetchImpl(url, init);
    } catch (error) {
        // `cutOff`: no answer came (ui/panel.js cutOff)
        throw Object.assign(new MflError(section, networkError(error)), {cutOff: true});
    }
    if (!response.ok) {
        throw new MflError(section, httpStatus(response), response.status);
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
