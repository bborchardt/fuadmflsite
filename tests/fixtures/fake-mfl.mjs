// Loaded with `node --import` ahead of jobs/daily.mjs, in place of MFL and GitHub Pages: answers the
// job's requests from the scenario in FAKE_MFL (a JSON file) and writes each request to FAKE_MFL_LOG,
// one JSON line each. Nothing leaves the machine.
//
// The scenario:
//   exports       {TYPE: section body}, answered as {TYPE: body}; a number in place of a body is an
//                 HTTP status ("rosters": 500). "TYPE:W" or "TYPE:BRACKET_ID" ("weeklyResults:YTD",
//                 "playoffBracket:1") answers that request ahead of TYPE's; the year to date's
//                 section is allWeeklyResults, as MFL names it
//   seasons       the years the league has a site (others answer 404)
//   week1         the 2026 season's first kickoff, in seconds; week n's is a week later each, its last
//                 game three days after its first, and other seasons' 52 weeks earlier or later a year
//   login         "ok" (default), "refused", or "escaped": MFL takes the session cookie only with
//                 its +, / and = escaped
//   myLeagues     the leagues the login is in, default ["48571"]
//   leagueUrls    more of them, as entries with only a url
//   importError   MFL's <error> for every import, or none
//   published     {file: text} on GitHub Pages; others answer 404
//   waivers       the processed waivers page's HTML

import {appendFileSync, readFileSync} from "node:fs";

const scenario = JSON.parse(readFileSync(process.env.FAKE_MFL, "utf8"));
const WEEK = 7 * 86400;

const record = (entry) => appendFileSync(process.env.FAKE_MFL_LOG, JSON.stringify(entry) + "\n");
const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {"Content-Type": "application/json"}});
const text = (body, status = 200) => new Response(body, {status});

const LEAGUE_HOST = "www44.myfantasyleague.com";

function exportAnswer(host, year, params, cookie) {
    const type = params.get("TYPE");
    // the NFL's data is there every year; the league's only for seasons it has a site
    if (host === LEAGUE_HOST && !(scenario.seasons || []).includes(year)) {
        return text("", 404);
    }
    if (type === "nflSchedule") {
        const week = Number(params.get("W"));
        const first = scenario.week1 + (year - 2026) * 52 * WEEK + (week - 1) * WEEK;
        return json({nflSchedule: {week: String(week), matchup: [{kickoff: String(first)}, {kickoff: String(first + 3 * 86400)}]}});
    }
    if (type === "myleagues") {
        const accepted = scenario.login === "escaped" ? cookie === "MFL_USER_ID=abc%2Bdef%3D" : Boolean(cookie);
        return json({leagues: {league: accepted ? [...(scenario.myLeagues || ["48571"]).map((league_id) => ({league_id})), ...(scenario.leagueUrls || []).map((url) => ({url}))] : []}});
    }
    const exports = scenario.exports || {};
    const keyed = params.get("W") || params.get("BRACKET_ID");
    const body = keyed && `${type}:${keyed}` in exports ? exports[`${type}:${keyed}`] : exports[type];
    if (typeof body === "number") {
        return text("", body);
    }
    const section = type === "weeklyResults" && keyed === "YTD" ? "allWeeklyResults" : type;
    return body === undefined ? json({error: `no ${type} in the scenario`}) : json({[section]: body});
}

globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const body = init.body ? String(init.body) : "";
    record({method: init.method || "GET", url: url.href, body, userAgent: (init.headers || {})["User-Agent"] || null, cookie: (init.headers || {}).Cookie || null});
    if (url.hostname === "bborchardt.github.io") {
        const file = url.pathname.split("/").pop();
        const published = (scenario.published || {})[file];
        return published === undefined ? text("", 404) : text(published);
    }
    if (![LEAGUE_HOST, "api.myfantasyleague.com"].includes(url.hostname)) {
        return text("", 404);
    }
    const [, year, page] = url.pathname.split("/");
    if (page === "login") {
        return scenario.login === "refused" ? text("<error>Invalid password</error>") : text('<status MFL_USER_ID="abc+def=">OK</status>');
    }
    if (page === "import") {
        return scenario.importError ? text(`<error>${scenario.importError}</error>`) : text("<status>OK</status>");
    }
    if (page === "processed_waivers") {
        return text(scenario.waivers || "<a>Logout</a>");
    }
    if (page === "export") {
        return exportAnswer(url.hostname, Number(year), url.searchParams, (init.headers || {}).Cookie);
    }
    return text("", 404);
};

// the job spaces its requests a second apart, as MFL asks; here they needn't wait
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (callback, ms, ...args) => realSetTimeout(callback, 0, ...args);
