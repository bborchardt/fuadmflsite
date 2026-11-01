// The daily job. What it does: README.md; why: docs/design.md.
//
// Environment:
//   DATA_DIR                    checkout of the league-data branch (required)
//   MFL_USERNAME, MFL_PASSWORD  commissioner login; without them the job reads public data only
//   MFL_LEAGUE_ID               the league's id (required)
//   MFL_HOST                    the league's host, as https://www44.myfantasyleague.com (required)
//   MFL_USER_AGENT              optional, the repository secret: the client name registered with MFL
//   SEASON                      default: the newest season the league has a site for
//   RULES_VERSION               which site version's league logic to use, default v2
//   PAGES_DATA_URL              published snapshots, default the repository's GitHub Pages data/
//   GITHUB_REPOSITORY           set by GitHub Actions ("owner/name"); names the Pages address and the job
//   GITHUB_OUTPUT               set by GitHub Actions; receives changed=true|false and publish=true|false
//   GITHUB_STEP_SUMMARY         set by GitHub Actions; receives this run's chore log entries, shown on
//                               the run's page (GitHub's failure email links to it)
//   DROP_PENALTIES              "apply" to charge drop penalties; anything else only logs them
//   CONTRACT_YEARS              "apply" to set contract years for adds; anything else only logs them
//   PAYOUTS                     "apply" to record the league's payouts in MFL's accounting; anything
//                               else only logs them
//   NOW                         optional ISO time, for testing
//   DRY_RUN                     "true": writes nothing to MFL or DATA_DIR, whatever the variables above
//                               say, and may name a league the version doesn't list
//   MFL_SETTINGS                on a dry run, an unlisted league's settings, as its header line's
//   DATA_LEAGUE_ID              on a dry run, the league DATA_DIR's files are from; another starts with none

import {existsSync, readFileSync, readdirSync, writeFileSync, appendFileSync, mkdirSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = process.env.RULES_VERSION || "v2";
if (!/^v\d+$/.test(version)) {
    throw new Error(`RULES_VERSION must name a version, as v2, not "${version}"`);
}
const lib = (name) => import(pathToFileURL(join(root, "site", version, "lib", name)).href);
const {API_BASE, asArray, exportUrl, fetchExport, weekKickoff} = await lib("mfl.js");
// v1's lib has no payouts: the chore is skipped
const {latestScoredWeek, missingPayouts, placeBrackets, playoffPlaces, unpaidPlaces} = version === "v1" ? {} : await lib("payouts.js");
const {buildLeague, playersFromExport} = await lib("league.js");
const {ROSTER_MAX, SALARY_CAP, TRADE_DEADLINE_WEEK, franchiseTopSalaries, franchiseSalary} = await lib("rules.js");
const {makeSnapshot, snapshotFileName} = await lib("franchise.js");
const {MAX_PENALTIES_PER_RUN, needsCharge, pendingPenalties, resetSalaryXml, salaryAdjXml} =
    await import("./drop-penalties.mjs");
const {contractDeadline, pendingAdds, windowClosed} = await lib("adds.js");
// v1's has no cutDownAt: its roster limits start with week 1
const {cutDownAt = null, ruleViolations, seasonPhase} = await lib("violations.js");
const {decideYears, readProcessedWaivers, teamPlayers} = await lib("contract-years.js");
const {MAX_CONTRACTS_PER_RUN, contractsXml} = await import("./contract-years.mjs");
const {RECENT_MOVE_DAYS, overCapMessage, recentMoves} = await import("./over-cap.mjs");

if (!process.env.DATA_DIR) {
    throw new Error("DATA_DIR must point at a checkout of the league-data branch");
}
const dataDir = resolve(process.env.DATA_DIR);
if (!process.env.MFL_LEAGUE_ID || !/^https:\/\/[^/]+\/?$/.test(process.env.MFL_HOST || "")) {
    throw new Error("MFL_LEAGUE_ID and MFL_HOST must name the league (the repository variables of the same names; MFL_HOST as https://www44.myfantasyleague.com)");
}
const leagueId = process.env.MFL_LEAGUE_ID;
const dryRun = process.env.DRY_RUN === "true";
if (dryRun && !/^\d+$/.test(leagueId)) {
    throw new Error(`A dry run's league must be its id, a number, not "${leagueId}"`);
}
// a dry run's host is typed in, and is sent the commissioner's session
if (dryRun && !/^https:\/\/([a-z0-9-]+\.)*myfantasyleague\.com\/?$/i.test(process.env.MFL_HOST)) {
    throw new Error(`A dry run's host must be on myfantasyleague.com, not ${process.env.MFL_HOST}`);
}
// v1's lib has no settings file. A league with no entry has only assumed rules, too little to go by.
const {league: leagueSettings} = version === "v1" ? {} : await lib("settings.js");
if (leagueSettings && !leagueSettings.listed && !dryRun) {
    throw new Error(`League ${leagueId} isn't listed in site/${version}/settings.json`);
}
if (dryRun && process.env.MFL_SETTINGS) {
    if (!leagueSettings) {
        throw new Error("v1 has no settings, so a dry run on it can't take any");
    }
    if (leagueSettings.listed) {
        throw new Error(`League ${leagueId} is listed in site/${version}/settings.json, which ignores settings given for a run`);
    }
    if (leagueSettings.problems.length) {
        throw new Error(`The run's settings can't be used: ${leagueSettings.problems.join("; ")}`);
    }
}
const host = process.env.MFL_HOST.replace(/\/+$/, "");
const repo = process.env.GITHUB_REPOSITORY || "";
const [owner = "", repoName = ""] = repo.split("/");
const now = process.env.NOW ? new Date(process.env.NOW) : new Date();
if (Number.isNaN(now.getTime()) || (process.env.SEASON && !/^\d{4}$/.test(process.env.SEASON))) {
    throw new Error(`NOW must be an ISO time and SEASON a year, not "${process.env.NOW}" and "${process.env.SEASON}"`);
}
let season;
const userAgent = process.env.MFL_USER_AGENT || `${repoName || "league-site"}-daily-chores${repo ? ` (github.com/${repo})` : ""}`;
// after login these carry the commissioner's session cookie: never send them anywhere else
const mflHeaders = {"User-Agent": userAgent};
// what the login's leagues are, once it's known to work
let loginLeagues = [];
// a repository named owner.github.io publishes at the site's root
const pagesData = process.env.PAGES_DATA_URL || (repo
    ? `https://${owner.toLowerCase()}.github.io/${repoName.toLowerCase() === `${owner.toLowerCase()}.github.io` ? "" : `${repoName}/`}data/`
    : null);
if (!pagesData) {
    throw new Error("PAGES_DATA_URL must be set outside GitHub Actions");
}
const LATE_AFTER_DAYS = 7;
const applyDropPenalties = !dryRun && process.env.DROP_PENALTIES === "apply";
const applyContractYears = !dryRun && process.env.CONTRACT_YEARS === "apply";
const applyPayouts = !dryRun && process.env.PAYOUTS === "apply";
const dataIsThisLeagues = !dryRun || process.env.DATA_LEAGUE_ID === leagueId;
// a season's weekly prizes and all-play payouts, with room for a backfill: more means something's wrong
const MAX_PAYOUTS_PER_RUN = 30;
const entries = [];
// at the top of a dry run's summary
const dryRunNotes = [];

function log(message) {
    console.log(message);
}

function choreLog(message) {
    log(message);
    entries.push(message);
}

const attention = [];

function needsAttention(message) {
    choreLog(message);
    attention.push(message);
    process.exitCode = 1;
}

// the run fails on purpose so GitHub emails the commissioner; the annotation says why
function explainFailure() {
    if (!attention.length) {
        return;
    }
    const count = attention.length === 1 ? "1 item needs" : `${attention.length} items need`;
    const text = `Failing the run so it gets noticed: ${count} the commissioner.\n${attention.map((item) => `- ${item}`).join("\n")}`;
    // workflow commands end at a newline, so it and % are escaped
    console.log(`::error title=Daily chores need attention::${text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")}`);
}

// MFL asks for about a second between requests
const MFL_REQUEST_SPACING_MS = 1000;
const MFL_TIMEOUT_MS = 30000;
let nextRequestAt = 0;

// spaced even when several start at once: MFL throttles bursts with HTTP 429
async function mflFetch(url, init) {
    const wait = nextRequestAt - Date.now();
    nextRequestAt = Math.max(Date.now(), nextRequestAt) + MFL_REQUEST_SPACING_MS;
    if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait));
    }
    // a stalled reply mustn't hang the job
    return fetch(url, {...init, signal: AbortSignal.timeout(MFL_TIMEOUT_MS)});
}

function setOutput(name, value) {
    if (process.env.GITHUB_OUTPUT) {
        appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
    }
}

// MFL_USER_ID is Base64 and MFL's docs say it may need +, / and = escaped, so both forms are tried.
// Never throws: snapshots only need public data.
async function login() {
    const username = process.env.MFL_USERNAME;
    const password = process.env.MFL_PASSWORD;
    if (!username || !password) {
        log("No MFL login configured; reading public league data only.");
        return null;
    }
    let response, body;
    try {
        response = await mflFetch(`${API_BASE}/${season}/login`, {
            method: "POST",
            headers: {...mflHeaders, "Content-Type": "application/x-www-form-urlencoded"},
            body: new URLSearchParams({USERNAME: username, PASSWORD: password, XML: "1"})
        });
        body = await response.text();
    } catch (error) {
        return `MFL login failed: network error (${error.message})`;
    }
    const error = (/<error>([^<]*)<\/error>/.exec(body) || [])[1];
    const value = (/<status\b[^>]*\bMFL_USER_ID="([^"]*)"/.exec(body) || [])[1];
    if (error || !response.ok || !value) {
        return `MFL login failed: ${error || `HTTP ${response.status}, no MFL_USER_ID in the response`}`;
    }
    for (const candidate of [value, encodeURIComponent(value)]) {
        if (await loginWorks(`MFL_USER_ID=${candidate}`)) {
            mflHeaders.Cookie = `MFL_USER_ID=${candidate}`;
            log("Logged in to MFL as commissioner.");
            return null;
        }
    }
    return "MFL login succeeded but MFL didn't accept the session cookie";
}

// the league renews on no fixed date; a season with no site answers 404 or an error document
async function leagueSeason() {
    if (process.env.SEASON) {
        return Number(process.env.SEASON);
    }
    const year = now.getUTCFullYear();
    let response, body;
    try {
        response = await mflFetch(exportUrl(host, year, "league", {L: leagueId}), {headers: mflHeaders});
        // only read the body of a reply that can say: a 404, or a 200 with JSON
        body = response.ok ? await response.json() : null;
    } catch (error) {
        throw new Error(`Couldn't tell whether the league has a ${year} site: ${error.message}`);
    }
    if (response.status === 404 || (response.ok && body && body.error)) {
        return year - 1;
    }
    if (response.ok && body && body.league) {
        return year;
    }
    throw new Error(`Couldn't tell whether the league has a ${year} site: HTTP ${response.status}`);
}

// last season too, in case MFL doesn't list a newly renewed league yet
async function loginWorks(cookie) {
    for (const year of [season, season - 1]) {
        try {
            const leagues = await fetchExport(exportUrl(API_BASE, year, "myleagues", {YEAR: year}), "leagues",
                {fetchImpl: mflFetch, init: {headers: {...mflHeaders, Cookie: cookie}}});
            if (asArray(leagues.league).length > 0) {
                loginLeagues = asArray(leagues.league);
                return true;
            }
        } catch (error) {
            // try the next year; a cookie that works nowhere fails below
        }
    }
    return false;
}

// a dry run can name any league; the session is only for one the login is in
const loginIsInLeague = () => loginLeagues.some((entry) => entry.league_id === leagueId
    || (/\/home\/(\d+)/.exec(entry.url || "") || [])[1] === leagueId);

const fetchFrom = (base, type, params, section = type, year = season) =>
    fetchExport(exportUrl(base, year, type, params), section, {fetchImpl: mflFetch, init: {headers: mflHeaders}});

function writeSummary() {
    if (!process.env.GITHUB_STEP_SUMMARY) {
        return;
    }
    const outcome = attention.length ? "Needs attention" : "OK";
    const lines = entries.length ? entries.map((entry) => `- ${entry}`).join("\n") : "Nothing to do.";
    const notes = dryRunNotes.map((note) => `${note}\n\n`).join("");
    try {
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Daily chores${dryRun ? " (dry run)" : ""}: ${outcome}\n\n${notes}${lines}\n`);
    } catch (error) {
        // the summary is a convenience; the chore log already has everything
        log(`Couldn't write the run summary: ${error.message}`);
    }
}

// MFL reports errors with HTTP 200, so anything but <status>OK</status> throws. `data` null: an
// import that takes its fields as parameters
async function mflImport(type, data, params = {}) {
    if (dryRun) {
        throw new Error(`A dry run reached MFL's ${type} import, which it must never send`);
    }
    let response, body;
    try {
        response = await mflFetch(`${host}/${season}/import`, {
            method: "POST",
            headers: {...mflHeaders, "Content-Type": "application/x-www-form-urlencoded"},
            body: new URLSearchParams({TYPE: type, L: leagueId, ...(data === null ? {} : {DATA: data}), ...params})
        });
        body = await response.text();
    } catch (error) {
        throw new Error(`MFL's ${type} import failed: network error (${error.message})`);
    }
    const error = (/<error>([^<]*)<\/error>/.exec(body) || [])[1];
    if (error || !response.ok || !/<status\b[^>]*>\s*OK\s*<\/status>/i.test(body)) {
        throw new Error(`MFL's ${type} import failed: ${error || `HTTP ${response.status}, "${body.trim().slice(0, 200)}"`}`);
    }
}

// bid comments appear only on this page, not in the API
async function processedWaivers(period) {
    const url = `${host}/${season}/processed_waivers?LEAGUE_ID=${leagueId}&PERIOD=${period}`;
    let response;
    try {
        response = await mflFetch(url, {headers: mflHeaders});
    } catch (error) {
        throw new Error(`Couldn't load MFL's processed waivers for period ${period}: network error (${error.message})`);
    }
    if (!response.ok) {
        throw new Error(`Couldn't load MFL's processed waivers for period ${period}: HTTP ${response.status}`);
    }
    const html = await response.text();
    // comments only show to a logged-in member; a logged-out page would look like bids without any
    if (!/>\s*Logout\s*</i.test(html)) {
        throw new Error(`MFL's processed waivers for period ${period} came back logged out, so bid comments couldn't be read`);
    }
    return readProcessedWaivers(html);
}

// teams over the cap or 30 players are held: the add may be reversed, and a dropped player with
// contract years would owe a penalty
async function contractYears(loggedIn, {rosters, transactions, playerNames}, over) {
    const pending = pendingAdds({rosters, transactions, players: playerNames});
    const held = pending.filter((add) => over.has(add.franchiseId));
    for (const add of held) {
        choreLog(`Contract years: ${add.name} held, since the team is over the cap or the roster limit. Left for the commissioner.`);
    }
    const waiting = pending.filter((add) => !over.has(add.franchiseId));
    const adds = waiting.filter((add) => windowClosed(add, now.getTime() / 1000));
    if (waiting.length > adds.length) {
        log(`${waiting.length - adds.length} add(s) still in their posting window will be decided at the next run.`);
    }
    if (!adds.length) {
        log("No added players are waiting for contract years.");
        return;
    }
    if (!loggedIn && dryRun) {
        choreLog(`Contract years: not checked for ${adds.length} added player(s), as the run isn't logged in.`);
        return;
    }
    if (!loggedIn) {
        throw new Error(`${adds.length} added player(s) are waiting for contract years, but reading the bids `
            + "and the message board needs the commissioner login, so none were set.");
    }
    // owners post lengths in threads of any name
    const earliest = Math.min(...adds.map((add) => add.added));
    const board = await fetchFrom(host, "messageBoard", {L: leagueId, COUNT: 100});
    const threads = asArray(board.thread).filter((thread) => Number(thread.lastPostTime) >= earliest);
    const posts = [];
    for (const thread of threads) {
        posts.push(...asArray((await fetchFrom(host, "messageBoardThread", {L: leagueId, THREAD: thread.id})).post));
    }
    const bidRequests = [];
    for (const period of new Set(adds.filter((add) => add.type === "BBID_WAIVER").map((add) => add.added))) {
        // each request tagged with its period, so a bid is only matched on its own week's page
        bidRequests.push(...(await processedWaivers(period)).map((request) => ({...request, period})));
    }
    const {contracts, flags} = decideYears({
        adds, pending, posts, bidRequests, teams: teamPlayers({rosters, players: playerNames}), contractDeadline
    });
    for (const flag of flags) {
        needsAttention(`Contract years: ${flag}. Left for the commissioner.`);
    }
    const describe = (contract) => {
        const name = contract.name.split(",").reverse().map((part) => part.trim()).join(" ");
        return `${name} to ${contract.years} year${contract.years === 1 ? "" : "s"} (${contract.source})`;
    };
    if (!contracts.length) {
        return;
    }
    if ((applyContractYears || dryRun) && contracts.length > MAX_CONTRACTS_PER_RUN) {
        throw new Error(`${contracts.length} added players are waiting for contract years, more than the `
            + `${MAX_CONTRACTS_PER_RUN} expected in a day, so none were set. Check the Commish tab and set them by hand.`);
    }
    if (!applyContractYears) {
        contracts.forEach((contract) => choreLog(`Dry run: would set ${describe(contract)}.`));
        return;
    }
    await mflImport("salaries", contractsXml(contracts), {APPEND: "1"});
    contracts.forEach((contract) => choreLog(`Set ${describe(contract)}.`));
}

// A week's scores are final once the next week has kicked off, when the NFL's stat corrections are
// usually out. Payouts already in the accounting, by hand or by an earlier run, aren't added again.
async function payouts(loggedIn, {built}) {
    if (!missingPayouts) {
        log(`The ${version} lib has no payouts; none recorded.`);
        return;
    }
    if (!loggedIn) {
        log("Reading MFL's accounting needs the commissioner login; no payouts recorded.");
        return;
    }
    if (!built.weeks) {
        throw new Error("the league export gives no last regular season week or end week, so no payouts were recorded");
    }
    const lastRegular = built.weeks.playoffsStart - 1;
    const endWeek = built.weeks.championship;
    // the year to date comes back as `allWeeklyResults`
    const weeklyResults = await fetchFrom(host, "weeklyResults", {L: leagueId, W: "YTD"}, "allWeeklyResults");
    const latest = latestScoredWeek(weeklyResults);
    if (!latest) {
        log("No week has scores yet; no payouts to record.");
        return;
    }
    const next = await weekKickoff(season, latest + 1, {fetchImpl: mflFetch, init: {headers: mflHeaders}});
    const finalWeek = next && now >= next ? latest : latest - 1;
    if (!finalWeek) {
        log("No week's scores are final yet; no payouts to record.");
        return;
    }
    const accounting = await fetchFrom(host, "accounting", {L: leagueId});
    let places = null;
    if (finalWeek >= endWeek && unpaidPlaces(accounting).length) {
        const list = asArray((await fetchFrom(host, "playoffBrackets", {L: leagueId})).playoffBracket);
        const brackets = [];
        for (const bracket of placeBrackets(list)) {
            brackets.push(bracket ? await fetchFrom(host, "playoffBracket", {L: leagueId, BRACKET_ID: bracket.id}) : null);
        }
        places = playoffPlaces(brackets);
    }
    const {records, problem} = missingPayouts({accounting, weeklyResults, lastRegularWeek: lastRegular, endWeek, finalWeek, places});
    if (problem) {
        needsAttention(`Payouts: the places can't be recorded: ${problem}. Left for the commissioner.`);
    }
    if (!records.length) {
        log("No payouts to record.");
        return;
    }
    const teamName = (id) => (built.franchises.get(id) || {}).teamName || id;
    const describe = (record) => `"${record.description}" $${record.amount.toFixed(2)} to ${teamName(record.franchise)}`;
    if ((applyPayouts || dryRun) && records.length > MAX_PAYOUTS_PER_RUN) {
        throw new Error(`${records.length} payouts are waiting to be recorded, more than the ${MAX_PAYOUTS_PER_RUN} expected, so none were. `
            + "Check MFL's accounting and enter them by hand.");
    }
    if (!applyPayouts) {
        records.forEach((record) => choreLog(`Dry run: would record ${describe(record)}.`));
        return;
    }
    for (const record of records) {
        await mflImport("accounting", null, {FRANCHISE: record.franchise, AMOUNT: String(record.amount), DESCRIPTION: record.description});
        choreLog(`Recorded ${describe(record)}.`);
    }
}

async function leagueState({loggedIn}) {
    const [players, league, salaryAdjustments, rosters, transactions, freeAgents, weeklyResults, calendar] = await Promise.all([
        fetchFrom(API_BASE, "players"),
        fetchFrom(host, "league", {L: leagueId}),
        fetchFrom(host, "salaryAdjustments", {L: leagueId}),
        fetchFrom(host, "rosters", {L: leagueId}),
        fetchFrom(host, "transactions", {L: leagueId}),
        fetchFrom(host, "freeAgents", {L: leagueId}),
        // only the anti-tanking check needs the week's results; without them it flags nothing
        fetchFrom(host, "weeklyResults", {L: leagueId}).catch((error) => {
            log(`Couldn't load the league's weekly results (${error.message}); the anti-tanking check is skipped.`);
            return {};
        }),
        // the final cut-down date, when the roster limits start before week 1; without it, from week 1
        // (MFL shows the calendar only to a member)
        cutDownAt && loggedIn ? fetchFrom(host, "calendar", {L: leagueId}).catch((error) => {
            log(`Couldn't load the league's calendar (${error.message}); the roster limits start with week 1.`);
            return null;
        }) : null
    ]);
    // today's NFL injury report, for injured reserve eligibility; without it that check is skipped
    const currentInjuries = await fetchFrom(API_BASE, "injuries").catch((error) => {
        log(`Couldn't load today's NFL injury report (${error.message}); the injured reserve check is skipped.`);
        return null;
    });
    // the results week's report, for the anti-tanking check; without it that check flags nothing
    const injuries = await fetchFrom(API_BASE, "injuries", {W: weeklyResults.week || ""}).catch((error) => {
        log(`Couldn't load the week ${weeklyResults.week || "(unknown)"} NFL injury report (${error.message}); the anti-tanking check is skipped.`);
        return null;
    });
    const playerMap = playersFromExport(players);
    const built = buildLeague({players: playerMap, league, salaryAdjustments, rosters, transactions, freeAgents, weeklyResults, injuries, currentInjuries});
    // if the season's phase can't be told, skip the league rules rather than flag the offseason
    try {
        // v2's lib reads the playoff and championship weeks from the league export (v1's has them fixed)
        if ("weeks" in built && !built.weeks) {
            throw new Error("the league export gives no last regular season week or end week");
        }
        Object.assign(built, await seasonPhase(season, now, {fetchImpl: mflFetch, init: {headers: mflHeaders}}, built.weeks));
    } catch (error) {
        needsAttention(`Couldn't tell where the ${season} season is (${error.message}); the League Alerts checks were skipped, and teams over 30 are held.`);
        built.seasonOver = null;
    }
    return {
        players: playerMap,
        built,
        cutDown: cutDownAt ? cutDownAt(calendar, season) : null,
        penalties: pendingPenalties(built),
        transactions: asArray(transactions.transaction),
        rosters,
        // players as MFL names them ("Last, First"), which the waivers page uses too
        playerNames: new Map(asArray(players.player).map((player) => [player.id, player]))
    };
}

const RULE_KINDS = new Set(["roster-over", "roster-under", "ir", "ir-roster", "injured-starter"]);

// going over 30 voids the move like the cap, so the flag lists recent moves. Returns the teams over
// 30, whose chores are held.
function leagueRules({players, built, cutDown, penalties, transactions}) {
    const overRoster = new Set();
    if (built.seasonOver === null) {
        return overRoster;
    }
    const since = now.getTime() / 1000 - RECENT_MOVE_DAYS * 86400;
    const violations = ruleViolations(built, {now: now.getTime() / 1000, cutDown}).filter((item) => RULE_KINDS.has(item.kind));
    for (const violation of violations) {
        let text = violation.text;
        if (violation.kind === "roster-over") {
            overRoster.add(violation.franchiseId);
            const moves = recentMoves(transactions, violation.franchiseId, {players, franchises: built.franchises, since});
            const held = penalties.filter((penalty) => penalty.franchiseId === violation.franchiseId).map((penalty) => penalty.explanation);
            text += ` Moves in the last ${RECENT_MOVE_DAYS} days: ${moves.length ? moves.join("; ") : "none"}.`
                + (held.length ? ` Drop penalties held so the move can be reversed: ${held.join(", ")}.` : "");
        }
        needsAttention(`League rules: ${text}`);
    }
    if (!violations.length) {
        log("No roster, injured reserve or anti-tanking violations.");
    }
    return overRoster;
}

// returns the over-cap franchise ids, whose chores are held
function overCap({players, built, penalties, transactions}) {
    const since = now.getTime() / 1000 - RECENT_MOVE_DAYS * 86400;
    const over = new Set();
    for (const {franchiseId, capTotal: total} of built.franchises.values()) {
        if (total <= SALARY_CAP) {
            continue;
        }
        over.add(franchiseId);
        needsAttention(`Over the cap: ${overCapMessage({
            teamName: built.franchises.get(franchiseId).teamName,
            total,
            cap: SALARY_CAP,
            moves: recentMoves(transactions, franchiseId, {players, franchises: built.franchises, since}),
            held: penalties.filter((penalty) => penalty.franchiseId === franchiseId).map((penalty) => penalty.explanation)
        })}`);
    }
    if (!over.size) {
        log("No team is over the cap.");
    }
    return over;
}

// a penalty already charged (by a run that failed before the reset, or by hand), or a $0 one,
// only gets the reset
async function dropPenalties(loggedIn, {penalties}, over) {
    if (!penalties.length) {
        log("No dropped players owe a cap penalty.");
        return;
    }
    const describe = (penalty) => `$${penalty.amount} to ${penalty.teamName} for ${penalty.explanation}`;
    const noCharge = (penalty) => penalty.amount > 0 ? "penalty already charged" : "no penalty owed";
    const toApply = penalties.filter((penalty) => !over.has(penalty.franchiseId));
    // held penalties don't count: they can wait for weeks on a team over the cap
    if ((applyDropPenalties || dryRun) && toApply.length > MAX_PENALTIES_PER_RUN) {
        throw new Error(`${toApply.length} dropped players owe a cap penalty, more than the ${MAX_PENALTIES_PER_RUN} `
            + `expected in a day, so none were charged. Check the Commish tab and charge them by hand.`);
    }
    if (!applyDropPenalties) {
        for (const penalty of toApply) {
            choreLog(needsCharge(penalty)
                ? `Dry run: would charge ${describe(penalty)}, then reset the player to $1 / 0 years.`
                : `Dry run: would reset ${penalty.fullName} to $1 / 0 years (${noCharge(penalty)}).`);
        }
        return;
    }
    if (toApply.length && !loggedIn) {
        throw new Error(`${toApply.length} dropped player(s) owe a cap penalty, but the job isn't logged in, so none were charged.`);
    }
    for (const penalty of toApply) {
        if (needsCharge(penalty)) {
            await mflImport("salaryAdj", salaryAdjXml(penalty));
            await mflImport("salaries", resetSalaryXml(penalty), {APPEND: "1"});
            choreLog(`Charged ${describe(penalty)}, and reset the player to $1 / 0 years.`);
        } else {
            await mflImport("salaries", resetSalaryXml(penalty), {APPEND: "1"});
            choreLog(`Reset ${penalty.fullName} to $1 / 0 years (${noCharge(penalty)}).`);
        }
    }
}

async function franchiseSnapshot(year) {
    const file = join(dataDir, "data", snapshotFileName(year));
    if (dataIsThisLeagues && existsSync(file)) {
        log(`The ${year} franchise snapshot already exists.`);
        return false;
    }
    const deadline = await weekKickoff(year, TRADE_DEADLINE_WEEK, {fetchImpl: mflFetch, init: {headers: mflHeaders}});
    if (!deadline) {
        log(`MFL hasn't published the ${year} week ${TRADE_DEADLINE_WEEK} schedule yet; nothing to snapshot.`);
        return false;
    }
    if (now < deadline) {
        log(`The ${year} trade deadline is ${deadline.toISOString()}; nothing to snapshot yet.`);
        return false;
    }
    const [players, league, rosters] = await Promise.all([
        fetchFrom(API_BASE, "players", {}, "players", year),
        fetchFrom(host, "league", {L: leagueId}, "league", year),
        fetchFrom(host, "rosters", {L: leagueId}, "rosters", year)
    ]);
    const built = buildLeague({players: playersFromExport(players), league, rosters});
    const top = franchiseTopSalaries(built.rosteredPlayers);
    const daysLate = Math.floor((now - deadline) / 86400000);
    const late = daysLate >= LATE_AFTER_DAYS;
    const source = late
        ? `Daily job, ${daysLate} days after the trade deadline: rosters may have changed since, so check it`
        : "Daily job, after the trade deadline";
    const snapshot = makeSnapshot(year, top, {takenAt: now.toISOString(), source});
    const summary = Object.entries(top).map(([position, list]) => `${position} $${franchiseSalary(list)}`).join(", ");
    if (dryRun) {
        choreLog(`Dry run: would take the ${year} franchise salary snapshot${late ? ` ${daysLate} days late` : ""} (${summary}).`);
        return false;
    }
    mkdirSync(dirname(file), {recursive: true});
    writeFileSync(file, JSON.stringify(snapshot, null, 2) + "\n");
    choreLog(late
        ? `Took the ${year} franchise salary snapshot ${daysLate} days late (${summary}). Rosters may have changed since the deadline; check it.`
        : `Took the ${year} franchise salary snapshot (${summary}).`);
    return true;
}

// including ones committed or corrected by hand on league-data
async function snapshotsToPublish() {
    if (!dataIsThisLeagues) {
        return [];
    }
    const dir = join(dataDir, "data");
    const files = existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith(".json")) : [];
    const stale = [];
    for (const file of files) {
        try {
            const response = await fetch(new URL(file, pagesData), {headers: {"User-Agent": userAgent}, cache: "no-store"});
            const local = readFileSync(join(dir, file), "utf8");
            if (response.status === 404 || (response.ok && (await response.text()) !== local)) {
                stale.push(file);
            }
        } catch (error) {
            log(`Couldn't check whether ${file} is published (${error.message}); will check again tomorrow.`);
        }
    }
    return stale;
}

// a monthly heartbeat when nothing happened
function updateChoreLog() {
    const file = join(dataDir, "chore-log.md");
    const stamp = now.toISOString().slice(0, 16).replace("T", " ") + " UTC";
    let text = existsSync(file) ? readFileSync(file, "utf8") : "# Chore log\n\nWhat the daily job did, newest last.\n\n";
    if (entries.length) {
        text += entries.map((entry) => `- ${stamp}: ${entry}\n`).join("");
    } else {
        const last = [...text.matchAll(/^- (\d{4}-\d{2}-\d{2})/gm)].pop();
        const days = last ? (now - new Date(`${last[1]}T00:00:00Z`)) / 86400000 : Infinity;
        if (days < 30) {
            return false;
        }
        text += `- ${stamp}: Heartbeat. Nothing to do; the daily job is running.\n`;
    }
    writeFileSync(file, text);
    return true;
}

let snapshotWritten = false;
let publish = false;
try {
    season = await leagueSeason();
    if (dryRun) {
        const given = process.env.MFL_SETTINGS ? `, with the settings ${process.env.MFL_SETTINGS}` : "";
        dryRunNotes.push(`League ${leagueId}, the ${season} season, ${version}'s rules, as of ${now.toISOString()}${given}. Nothing was written to MFL, committed or published, and writes to MFL weren't tested.`);
    }
    log(`Working on the ${season} league site.`);
    // snapshots only need public data, so a failed login doesn't stop them
    const loginProblem = await login();
    if (loginProblem) {
        needsAttention(`${loginProblem}. Continuing with public league data.`);
    }
    if (dryRun && mflHeaders.Cookie && !loginIsInLeague()) {
        delete mflHeaders.Cookie;
        log(`League ${leagueId} isn't among the login's leagues, so the session isn't used on it.`);
    }
    const loggedIn = !loginProblem && Boolean(mflHeaders.Cookie);
    if (dryRun && !loggedIn) {
        dryRunNotes.push("**Public data only:** the run isn't logged in to this league. Contract years, payouts and the final cut-down date weren't checked, so roster limits start with week 1.");
    }
    // each chore fails on its own; the snapshot doesn't depend on any of them
    let state = null;
    try {
        state = await leagueState({loggedIn});
    } catch (error) {
        needsAttention(`League chores: ${error.message}`);
    }
    if (state) {
        // their moves may be reversed, so their chores are held; if the league rules can't run, any
        // team over 30 is still held
        const overThirty = () => new Set([...state.built.franchises.values()]
            .filter((franchise) => franchise.numPlayers > ROSTER_MAX).map((franchise) => franchise.franchiseId));
        let overRoster;
        try {
            overRoster = state.built.seasonOver === null ? overThirty() : leagueRules(state);
        } catch (error) {
            needsAttention(`League rules: ${error.message}`);
            overRoster = overThirty();
        }
        let over = null;
        try {
            over = new Set([...overCap(state), ...overRoster]);
            await dropPenalties(loggedIn, state, over);
        } catch (error) {
            needsAttention(`Cap chores: ${error.message}`);
        }
        try {
            if (!over) {
                throw new Error("skipped: the cap check didn't finish, so it isn't known which teams are held");
            }
            await contractYears(loggedIn, state, over);
        } catch (error) {
            needsAttention(`Contract years: ${error.message}`);
        }
        try {
            await payouts(loggedIn, state);
        } catch (error) {
            needsAttention(`Payouts: ${error.message}`);
        }
    }
    // last season is for a job that missed its snapshot; a test league may have no site for it
    for (const year of dataIsThisLeagues ? [season - 1, season] : [season]) {
        snapshotWritten = (await franchiseSnapshot(year)) || snapshotWritten;
    }
    const stale = snapshotWritten ? [] : await snapshotsToPublish();
    if (stale.length) {
        choreLog(`${dryRun ? "Dry run: would publish" : "Publishing"} snapshots that are new or changed since the site was last published: ${stale.join(", ")}.`);
    }
    publish = !dryRun && (snapshotWritten || stale.length > 0);
} catch (error) {
    needsAttention(`Failed: ${error.message}`);
} finally {
    explainFailure();
    const logChanged = !dryRun && updateChoreLog();
    setOutput("changed", snapshotWritten || logChanged ? "true" : "false");
    setOutput("publish", publish ? "true" : "false");
    writeSummary();
}
