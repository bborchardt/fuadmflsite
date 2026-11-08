// Loaded with `node --import` ahead of jobs/daily.mjs, in place of MFL and GitHub Pages: answers the
// job's requests from the scenario in FAKE_MFL (a JSON file) and writes each request to FAKE_MFL_LOG,
// one JSON line each. Nothing leaves the machine.
//
// The scenario:
//   exports       {TYPE: section body}, answered as {TYPE: body}; a number in place of a body is an
//                 HTTP status ("rosters": 500). "TYPE:W" or "TYPE:BRACKET_ID" ("weeklyResults:YTD",
//                 "playoffBracket:1") answers that request ahead of TYPE's; the year to date's
//                 section is allWeeklyResults, as MFL names it; "TYPE@YEAR" ("rosters@2026") answers
//                 that season's request ahead of either
//   seasons       the years the league has a site (others answer 404)
//   week1         the 2026 season's first kickoff, in seconds; week n's is a week later each, its last
//                 game three days after its first, and other seasons' 52 weeks earlier or later a year
//   login         "ok" (default), "refused", or "escaped": MFL takes the session cookie only with
//                 its +, / and = escaped
//   myLeagues     the leagues the login is in, default ["48571"]
//   leagueUrls    more of them, as entries with only a url
//   nflSchedule   an HTTP status to answer the NFL schedule with, in place of the schedule
//   importError   MFL's <error> for every import, or a list of them, one per import in turn (null:
//                 OK; any past the list's end are OK)
//   published     {file: text} on GitHub Pages, an icon's still as "icons/<file>": {base64}; others
//                 answer 404
//   waivers       the processed waivers page's HTML
//   pictures      {address: {base64, etag}} for the team icons, anywhere; an etag the request sends
//                 back is answered 304, a number in place of one is an HTTP status
//   pages         {"/2026/path?query": html}: MFL's pages, by the address the job asks for
//   forms         {"/2026/lineup": html}: what a form posted there answers (default: Submit
//                 Lineup's "SUBMITTED", and Recalculate Standings' page as `pages` has it)
//   files         {address: text}: anywhere else, as nflverse's files on GitHub
//   recalculated  {"TYPE:W": body} in place of `exports`' once Recalculate Standings has been posted
//   "nflSchedule:W" in `exports` answers that week's schedule, with its teams, ahead of week1's

import {appendFileSync, readFileSync} from "node:fs";

const scenario = JSON.parse(readFileSync(process.env.FAKE_MFL, "utf8"));
const WEEK = 7 * 86400;
// imports answered so far, for a list of importError
let importsSeen = 0;
let recalculated = false;

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
    if (type === "nflSchedule" && scenario.nflSchedule) {
        return text("", scenario.nflSchedule);
    }
    if (type === "nflSchedule" && `nflSchedule:${params.get("W")}` in (scenario.exports || {})) {
        return json({nflSchedule: scenario.exports[`nflSchedule:${params.get("W")}`]});
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
    const exports = {...scenario.exports, ...(recalculated ? scenario.recalculated : {})};
    const keyed = params.get("W") || params.get("BRACKET_ID");
    const body = `${type}@${year}` in exports ? exports[`${type}@${year}`]
        : keyed && `${type}:${keyed}` in exports ? exports[`${type}:${keyed}`] : exports[type];
    if (typeof body === "number") {
        return text("", body);
    }
    const section = type === "weeklyResults" && keyed === "YTD" ? "allWeeklyResults" : type;
    // a board without threads, unless the scenario has one
    if (body === undefined && type === "messageBoard") {
        return json({messageBoard: {}});
    }
    return body === undefined ? json({error: `no ${type} in the scenario`}) : json({[section]: body});
}

globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const body = init.body ? String(init.body) : "";
    record({method: init.method || "GET", url: url.href, body, userAgent: (init.headers || {})["User-Agent"] || null, cookie: (init.headers || {}).Cookie || null, ifNoneMatch: (init.headers || {})["If-None-Match"] || null});
    const picture = (scenario.pictures || {})[url.href];
    if (picture !== undefined) {
        if (typeof picture === "number") {
            return text("", picture);
        }
        if (picture.etag && (init.headers || {})["If-None-Match"] === picture.etag) {
            return new Response(null, {status: 304});
        }
        return new Response(Buffer.from(picture.base64, "base64"), {status: 200, headers: picture.etag ? {ETag: picture.etag} : {}});
    }
    if (url.hostname === "bborchardt.github.io") {
        const file = url.pathname.split("/").pop();
        const published = (scenario.published || {})[url.pathname.includes("/data/icons/") ? `icons/${file}` : file];
        if (published && published.base64) {
            return new Response(Buffer.from(published.base64, "base64"));
        }
        return published === undefined ? text("", 404) : text(published);
    }
    if (![LEAGUE_HOST, "api.myfantasyleague.com"].includes(url.hostname)) {
        const file = (scenario.files || {})[url.href];
        return file === undefined ? text("", 404) : text(file);
    }
    const [, year, page] = url.pathname.split("/");
    const address = url.pathname + url.search;
    if (page === "logout" && url.searchParams.get("BECOME") === "0000") {
        return new Response(null, {status: 302, headers: {Location: `/${year}/home/48571`, "Set-Cookie": "MFL_IS_COMMISH=yes; domain=.myfantasyleague.com; path=/"}});
    }
    if ((init.method || "GET") === "POST" && ["lineup", "csetup"].includes(page)) {
        recalculated = recalculated || page === "csetup";
        const answer = (scenario.forms || {})[url.pathname];
        return text(answer !== undefined ? answer : page === "lineup" ? "Week lineup SUBMITTED" : (scenario.pages || {})[`/${year}/csetup?L=48571&C=RECALC`] || "");
    }
    if ((scenario.pages || {})[address] !== undefined) {
        return text(scenario.pages[address]);
    }
    if (page === "login") {
        return scenario.login === "refused" ? text("<error>Invalid password</error>") : text('<status MFL_USER_ID="abc+def=">OK</status>');
    }
    if (page === "import") {
        const error = Array.isArray(scenario.importError) ? scenario.importError[importsSeen++] : scenario.importError;
        return error ? text(`<error>${error}</error>`) : text("<status>OK</status>");
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
