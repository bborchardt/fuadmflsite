// Daily league chores, run by .github/workflows/daily.yml (Node 24+).
//
// Chores:
// - charge the cap penalty for each dropped player still carrying a contract, then reset the
//   player to $1 / 0 years, unless that puts the team over the cap. Only logged unless
//   DROP_PENALTIES=apply.
// - after the trade deadline, snapshot the season's franchise salaries. Last season's is
//   checked too, so a missing one is still taken after the league is renewed.
// The season is the newest league site: this year's once the league is renewed for it, last
// year's until then.
// Everything the job writes goes to a checkout of the league-data branch (DATA_DIR):
// snapshots in data/, and chore-log.md.
//
// Environment:
//   DATA_DIR                    checkout of the league-data branch (required)
//   MFL_USERNAME, MFL_PASSWORD  commissioner login; without them the job reads public data only
//   MFL_LEAGUE_ID               default 48571
//   MFL_HOST                    league host, default https://www44.myfantasyleague.com
//   MFL_USER_AGENT              optional; set it if the client is registered with MFL
//   SEASON                      default: the newest season the league has a site for
//   RULES_VERSION               which site version's league logic to use, default v1
//   PAGES_DATA_URL              published snapshots, default https://bborchardt.github.io/fuadmflsite/data/
//   GITHUB_OUTPUT               set by GitHub Actions; receives changed=true|false and publish=true|false
//   DROP_PENALTIES              "apply" to charge drop penalties; anything else only logs them
//   NOW                         optional ISO time, for testing

import {existsSync, readFileSync, readdirSync, writeFileSync, appendFileSync, mkdirSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = process.env.RULES_VERSION || "v1";
const lib = (name) => import(pathToFileURL(join(root, "site", version, "lib", name)).href);
const {API_BASE, asArray, exportUrl, fetchExport, weekKickoff} = await lib("mfl.js");
const {buildLeague, playersFromExport} = await lib("league.js");
const {SALARY_CAP, TRADE_DEADLINE_WEEK, franchiseTopSalaries, franchiseSalary} = await lib("rules.js");
const {makeSnapshot, snapshotFileName} = await lib("franchise.js");
const {MAX_PENALTIES_PER_RUN, capHolds, needsCharge, pendingPenalties, resetSalaryXml, salaryAdjXml} =
    await import("./drop-penalties.mjs");

if (!process.env.DATA_DIR) {
    throw new Error("DATA_DIR must point at a checkout of the league-data branch");
}
const dataDir = resolve(process.env.DATA_DIR);
const leagueId = process.env.MFL_LEAGUE_ID || "48571";
const host = process.env.MFL_HOST || "https://www44.myfantasyleague.com";
const now = process.env.NOW ? new Date(process.env.NOW) : new Date();
// set at the start of the run, by leagueSeason()
let season;
const userAgent = process.env.MFL_USER_AGENT || "fuadmflsite-daily-chores (github.com/bborchardt/fuadmflsite)";
// Headers for MFL requests only: after login they carry the commissioner's session cookie,
// so never send them anywhere else.
const mflHeaders = {"User-Agent": userAgent};
const pagesData = process.env.PAGES_DATA_URL || "https://bborchardt.github.io/fuadmflsite/data/";
const LATE_AFTER_DAYS = 7;
const applyDropPenalties = process.env.DROP_PENALTIES === "apply";
const entries = [];

function log(message) {
    console.log(message);
}

function choreLog(message) {
    log(message);
    entries.push(message);
}

function setOutput(name, value) {
    if (process.env.GITHUB_OUTPUT) {
        appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
    }
}

/**
 * Log in as commissioner and keep the session cookie for later requests. MFL answers with
 * <status MFL_USER_ID="...">OK</status>, or <error>...</error> on bad credentials. The value
 * is Base64; MFL's docs say it may need +, / and = escaped, so both forms are tried against a
 * request that needs a login. Returns a problem description, or null if logged in (or no
 * login is configured). Never throws: snapshots only need public data.
 */
async function login() {
    const username = process.env.MFL_USERNAME;
    const password = process.env.MFL_PASSWORD;
    if (!username || !password) {
        log("No MFL login configured; reading public league data only.");
        return null;
    }
    let response, body;
    try {
        response = await fetch(`${API_BASE}/${season}/login`, {
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

/**
 * The season of the newest league site: this calendar year's once the commissioner has renewed
 * the league for it (in spring, on no fixed date), last year's until then. MFL answers 404, or
 * an error document, for a league with no site that year. Any other failure throws rather than
 * guessing.
 */
async function leagueSeason() {
    if (process.env.SEASON) {
        return Number(process.env.SEASON);
    }
    const year = now.getUTCFullYear();
    let response, body;
    try {
        response = await fetch(exportUrl(host, year, "league", {L: leagueId}), {headers: mflHeaders});
        body = response.status === 404 ? null : await response.json();
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

/**
 * Whether a session cookie works: logged in, MFL lists the account's leagues; logged out, it
 * lists none. Last season is checked too, in case MFL doesn't list a newly renewed league yet.
 */
async function loginWorks(cookie) {
    for (const year of [season, season - 1]) {
        try {
            const leagues = await fetchExport(exportUrl(API_BASE, year, "myleagues", {YEAR: year}), "leagues",
                {init: {headers: {...mflHeaders, Cookie: cookie}}});
            if (asArray(leagues.league).length > 0) {
                return true;
            }
        } catch (error) {
            // try the next year; a cookie that works nowhere fails below
        }
    }
    return false;
}

const fetchFrom = (base, type, params, section = type, year = season) =>
    fetchExport(exportUrl(base, year, type, params), section, {init: {headers: mflHeaders}});

/**
 * Send one of MFL's commissioner imports. MFL answers <status>OK</status>, or <error>...</error>
 * with HTTP 200; anything but OK throws, so a surprise stops the chore rather than being guessed at.
 */
async function mflImport(type, data, params = {}) {
    let response, body;
    try {
        response = await fetch(`${host}/${season}/import`, {
            method: "POST",
            headers: {...mflHeaders, "Content-Type": "application/x-www-form-urlencoded"},
            body: new URLSearchParams({TYPE: type, L: leagueId, DATA: data, ...params})
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

/**
 * Charge the cap penalty for each dropped player still carrying a contract, then reset the
 * player to $1 / 0 years, which clears them from the Commish tab. A penalty already charged
 * (by an earlier run that failed before the reset, or by hand), or a $0 one, is skipped, and
 * only the reset is done. A team the penalties would put over the cap is left alone for the commissioner to
 * reverse the move, and the run fails so they hear about it. Without DROP_PENALTIES=apply it
 * only logs what it would do.
 */
async function dropPenalties(loggedIn) {
    const [players, league, salaryAdjustments, rosters, transactions, freeAgents] = await Promise.all([
        fetchFrom(API_BASE, "players"),
        fetchFrom(host, "league", {L: leagueId}),
        fetchFrom(host, "salaryAdjustments", {L: leagueId}),
        fetchFrom(host, "rosters", {L: leagueId}),
        fetchFrom(host, "transactions", {L: leagueId}),
        fetchFrom(host, "freeAgents", {L: leagueId})
    ]);
    const built = buildLeague({players: playersFromExport(players), league, salaryAdjustments, rosters, transactions, freeAgents});
    const penalties = pendingPenalties(built);
    if (!penalties.length) {
        log("No dropped players owe a cap penalty.");
        return;
    }
    const adjustments = asArray(salaryAdjustments.salaryAdjustment);
    const describe = (penalty) => `$${penalty.amount} to ${penalty.teamName} for ${penalty.explanation}`;
    const noCharge = (penalty) => penalty.amount > 0 ? "penalty already charged" : "no penalty owed";
    const holds = capHolds(built, penalties, adjustments, SALARY_CAP);
    const held = [...holds].map(([franchiseId, total]) => {
        const team = penalties.filter((penalty) => penalty.franchiseId === franchiseId);
        return `${team[0].teamName} would be at $${total} with the penalties for ${team.map((penalty) => penalty.explanation).join(", ")}: `
            + `over the $${SALARY_CAP} cap, so the move should be reversed. Left for the commissioner.`;
    });
    if (!applyDropPenalties) {
        held.forEach((message) => choreLog(`Dry run: ${message}`));
        for (const penalty of penalties.filter((penalty) => !holds.has(penalty.franchiseId))) {
            choreLog(needsCharge(penalty, adjustments)
                ? `Dry run: would charge ${describe(penalty)}, then reset the player to $1 / 0 years.`
                : `Dry run: would reset ${penalty.fullName} to $1 / 0 years (${noCharge(penalty)}).`);
        }
        return;
    }
    if (penalties.length > MAX_PENALTIES_PER_RUN) {
        throw new Error(`${penalties.length} dropped players owe a cap penalty, more than the ${MAX_PENALTIES_PER_RUN} `
            + `expected in a day, so none were charged. Check the Commish tab and charge them by hand.`);
    }
    if (!loggedIn) {
        throw new Error(`${penalties.length} dropped player(s) owe a cap penalty, but the job isn't logged in, so none were charged.`);
    }
    for (const penalty of penalties.filter((penalty) => !holds.has(penalty.franchiseId))) {
        if (needsCharge(penalty, adjustments)) {
            await mflImport("salaryAdj", salaryAdjXml(penalty));
            await mflImport("salaries", resetSalaryXml(penalty), {APPEND: "1"});
            choreLog(`Charged ${describe(penalty)}, and reset the player to $1 / 0 years.`);
        } else {
            await mflImport("salaries", resetSalaryXml(penalty), {APPEND: "1"});
            choreLog(`Reset ${penalty.fullName} to $1 / 0 years (${noCharge(penalty)}).`);
        }
    }
    if (held.length) {
        throw new Error(held.join(" "));
    }
}

/** After a season's deadline, write its franchise snapshot if it doesn't exist yet. */
async function franchiseSnapshot(year) {
    const file = join(dataDir, "data", snapshotFileName(year));
    if (existsSync(file)) {
        log(`The ${year} franchise snapshot already exists.`);
        return false;
    }
    const deadline = await weekKickoff(year, TRADE_DEADLINE_WEEK, {init: {headers: mflHeaders}});
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
    mkdirSync(dirname(file), {recursive: true});
    writeFileSync(file, JSON.stringify(snapshot, null, 2) + "\n");
    const summary = Object.entries(top).map(([position, list]) => `${position} $${franchiseSalary(list)}`).join(", ");
    choreLog(late
        ? `Took the ${year} franchise salary snapshot ${daysLate} days late (${summary}). Rosters may have changed since the deadline; check it.`
        : `Took the ${year} franchise salary snapshot (${summary}).`);
    return true;
}

/**
 * Snapshots on league-data that the published site doesn't have, or has an older copy of
 * (e.g. one committed or corrected by hand). Any of these means the site needs publishing.
 */
async function snapshotsToPublish() {
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

/** Append this run's entries to the chore log, or a monthly heartbeat if nothing happened. */
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
    log(`Working on the ${season} league site.`);
    // Snapshots only need public league data, so a broken login is reported but doesn't stop them.
    const loginProblem = await login();
    if (loginProblem) {
        choreLog(`${loginProblem}. Continuing with public league data.`);
        process.exitCode = 1;
    }
    try {
        await dropPenalties(!loginProblem && Boolean(process.env.MFL_USERNAME && process.env.MFL_PASSWORD));
    } catch (error) {
        // the snapshot doesn't depend on this, so carry on
        choreLog(`Drop penalties: ${error.message}`);
        process.exitCode = 1;
    }
    for (const year of [season - 1, season]) {
        snapshotWritten = (await franchiseSnapshot(year)) || snapshotWritten;
    }
    const stale = snapshotWritten ? [] : await snapshotsToPublish();
    if (stale.length) {
        choreLog(`Publishing snapshots that are new or changed since the site was last published: ${stale.join(", ")}.`);
    }
    publish = snapshotWritten || stale.length > 0;
} catch (error) {
    choreLog(`Failed: ${error.message}`);
    process.exitCode = 1;
} finally {
    const logChanged = updateChoreLog();
    setOutput("changed", snapshotWritten || logChanged ? "true" : "false");
    setOutput("publish", publish ? "true" : "false");
}
