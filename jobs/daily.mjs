// Daily league chores, run by .github/workflows/daily.yml (Node 24+).
//
// One chore so far: after the trade deadline, snapshot the season's franchise salaries.
// Everything the job writes goes to a checkout of the league-data branch (DATA_DIR):
// snapshots in data/, and chore-log.md.
//
// Environment:
//   DATA_DIR                    checkout of the league-data branch (required)
//   MFL_USERNAME, MFL_PASSWORD  commissioner login; without them the job reads public data only
//   MFL_LEAGUE_ID               default 48571
//   MFL_HOST                    league host, default https://www44.myfantasyleague.com
//   MFL_USER_AGENT              optional; set it if the client is registered with MFL
//   SEASON                      default: the NFL season that started most recently
//   RULES_VERSION               which site version's league logic to use, default v1
//   PAGES_DATA_URL              published snapshots, default https://bborchardt.github.io/fuadmflsite/data/
//   GITHUB_OUTPUT               set by GitHub Actions; receives changed=true|false and publish=true|false
//   NOW                         optional ISO time, for testing

import {existsSync, readFileSync, readdirSync, writeFileSync, appendFileSync, mkdirSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = process.env.RULES_VERSION || "v1";
const lib = (name) => import(pathToFileURL(join(root, "site", version, "lib", name)).href);
const {API_BASE, exportUrl, fetchExport, weekKickoff} = await lib("mfl.js");
const {buildLeague, playersFromExport} = await lib("league.js");
const {TRADE_DEADLINE_WEEK, franchiseTopSalaries, franchiseSalary} = await lib("rules.js");
const {latestSeason, makeSnapshot, snapshotFileName} = await lib("franchise.js");

if (!process.env.DATA_DIR) {
    throw new Error("DATA_DIR must point at a checkout of the league-data branch");
}
const dataDir = resolve(process.env.DATA_DIR);
const leagueId = process.env.MFL_LEAGUE_ID || "48571";
const host = process.env.MFL_HOST || "https://www44.myfantasyleague.com";
const now = process.env.NOW ? new Date(process.env.NOW) : new Date();
const season = Number(process.env.SEASON || latestSeason(now));
const userAgent = process.env.MFL_USER_AGENT || "fuadmflsite-daily-chores (github.com/bborchardt/fuadmflsite)";
const headers = {"User-Agent": userAgent};
const pagesData = process.env.PAGES_DATA_URL || "https://bborchardt.github.io/fuadmflsite/data/";
const LATE_AFTER_DAYS = 7;
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
 * login is configured).
 */
async function login() {
    const username = process.env.MFL_USERNAME;
    const password = process.env.MFL_PASSWORD;
    if (!username || !password) {
        log("No MFL login configured; reading public league data only.");
        return null;
    }
    const response = await fetch(`${API_BASE}/${season}/login`, {
        method: "POST",
        headers: {...headers, "Content-Type": "application/x-www-form-urlencoded"},
        body: new URLSearchParams({USERNAME: username, PASSWORD: password, XML: "1"})
    });
    const body = await response.text();
    const error = (/<error>([^<]*)<\/error>/.exec(body) || [])[1];
    const cookie = /<status\s+([A-Za-z_][\w-]*)="([^"]*)"/.exec(body);
    if (error || !response.ok || !cookie) {
        return `MFL login failed: ${error || `HTTP ${response.status}, no session cookie in the response`}`;
    }
    const [, name, value] = cookie;
    for (const candidate of [value, encodeURIComponent(value)]) {
        if (await loginWorks(`${name}=${candidate}`)) {
            headers.Cookie = `${name}=${candidate}`;
            log("Logged in to MFL as commissioner.");
            return null;
        }
    }
    return "MFL login succeeded but MFL didn't accept the session cookie";
}

/** A request that only answers with a login: the account's leagues for the season. */
async function loginWorks(cookie) {
    try {
        const leagues = await fetchExport(exportUrl(API_BASE, season, "myleagues"), "leagues", {init: {headers: {...headers, Cookie: cookie}}});
        return JSON.stringify(leagues).includes(leagueId);
    } catch (error) {
        return false;
    }
}

const fetchFrom = (base, type, params, section = type) =>
    fetchExport(exportUrl(base, season, type, params), section, {init: {headers}});

/** After the deadline, write the season's franchise snapshot if it doesn't exist yet. */
async function franchiseSnapshot() {
    const file = join(dataDir, "data", snapshotFileName(season));
    if (existsSync(file)) {
        log(`The ${season} franchise snapshot already exists.`);
        return false;
    }
    const deadline = await weekKickoff(season, TRADE_DEADLINE_WEEK, {init: {headers}});
    if (!deadline) {
        log(`MFL hasn't published the ${season} week ${TRADE_DEADLINE_WEEK} schedule yet; nothing to snapshot.`);
        return false;
    }
    if (now < deadline) {
        log(`The ${season} trade deadline is ${deadline.toISOString()}; nothing to snapshot yet.`);
        return false;
    }
    const [players, league, rosters] = await Promise.all([
        fetchFrom(API_BASE, "players"),
        fetchFrom(host, "league", {L: leagueId}),
        fetchFrom(host, "rosters", {L: leagueId})
    ]);
    const built = buildLeague({players: playersFromExport(players), league, rosters});
    const top = franchiseTopSalaries(built.rosteredPlayers);
    const daysLate = Math.floor((now - deadline) / 86400000);
    const late = daysLate >= LATE_AFTER_DAYS;
    const source = late
        ? `Daily job, ${daysLate} days after the trade deadline: rosters may have changed since, so check it`
        : "Daily job, after the trade deadline";
    const snapshot = makeSnapshot(season, top, {takenAt: now.toISOString(), source});
    mkdirSync(dirname(file), {recursive: true});
    writeFileSync(file, JSON.stringify(snapshot, null, 2) + "\n");
    const summary = Object.entries(top).map(([position, list]) => `${position} $${franchiseSalary(list)}`).join(", ");
    choreLog(late
        ? `Took the ${season} franchise salary snapshot ${daysLate} days late (${summary}). Rosters may have changed since the deadline; check it.`
        : `Took the ${season} franchise salary snapshot (${summary}).`);
    return true;
}

/**
 * Snapshots on league-data that the published site doesn't have yet, e.g. one committed by
 * hand. Any of these means the site needs publishing.
 */
async function unpublishedSnapshots() {
    const dir = join(dataDir, "data");
    const files = existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith(".json")) : [];
    const missing = [];
    for (const file of files) {
        try {
            const response = await fetch(new URL(file, pagesData), {method: "HEAD", headers});
            if (response.status === 404) {
                missing.push(file);
            }
        } catch (error) {
            log(`Couldn't check whether ${file} is published (${error.message}); will check again tomorrow.`);
        }
    }
    return missing;
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
    // Snapshots only need public league data, so a broken login is reported but doesn't stop them.
    const loginProblem = await login();
    if (loginProblem) {
        choreLog(`${loginProblem}. Continuing with public league data.`);
        process.exitCode = 1;
    }
    snapshotWritten = await franchiseSnapshot();
    const missing = snapshotWritten ? [] : await unpublishedSnapshots();
    if (missing.length) {
        choreLog(`Publishing snapshots that weren't on the site yet: ${missing.join(", ")}.`);
    }
    publish = snapshotWritten || missing.length > 0;
} catch (error) {
    choreLog(`Failed: ${error.message}`);
    process.exitCode = 1;
} finally {
    const logChanged = updateChoreLog();
    setOutput("changed", snapshotWritten || logChanged ? "true" : "false");
    setOutput("publish", publish ? "true" : "false");
}
