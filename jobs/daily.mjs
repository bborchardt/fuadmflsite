// Daily league chores, run by .github/workflows/daily.yml (Node 20+).
//
// v1 does one chore: after the trade deadline, snapshot this season's franchise
// salaries into site/data/franchise-<season>.json. It also keeps the chore log.
//
// Environment:
//   MFL_USERNAME, MFL_PASSWORD  commissioner login (GitHub secrets); without them the job reads public data only
//   MFL_LEAGUE_ID               default 48571
//   MFL_HOST                    league host, default https://www44.myfantasyleague.com
//   MFL_USER_AGENT              optional; set it if the client is registered with MFL
//   SEASON                      default: the current year
//   RULES_VERSION               which site version's league logic to use, default v1
//   CHORE_LOG_FILE              chore log to append to (the chore-log branch's checkout)
//   GITHUB_OUTPUT               set by GitHub Actions; receives snapshot=written|none
//   NOW                         optional ISO time, for testing

import {existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = process.env.RULES_VERSION || "v1";
const lib = (name) => import(pathToFileURL(join(root, "site", version, "lib", name)).href);
const {API_BASE, exportUrl, fetchExport, firstKickoff} = await lib("mfl.js");
const {buildLeague, playersFromExport} = await lib("league.js");
const {TRADE_DEADLINE_WEEK, franchiseTopSalaries, franchiseSalary} = await lib("rules.js");
const {makeSnapshot, snapshotFileName} = await lib("franchise.js");

const leagueId = process.env.MFL_LEAGUE_ID || "48571";
const host = process.env.MFL_HOST || "https://www44.myfantasyleague.com";
const now = process.env.NOW ? new Date(process.env.NOW) : new Date();
const season = Number(process.env.SEASON || now.getUTCFullYear());
const userAgent = process.env.MFL_USER_AGENT || "fuadmflsite-daily-chores (github.com/bborchardt/fuadmflsite)";
const headers = {"User-Agent": userAgent};
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

/** Log in as commissioner and keep the session cookie for later requests. */
async function login() {
    const username = process.env.MFL_USERNAME;
    const password = process.env.MFL_PASSWORD;
    if (!username || !password) {
        log("No MFL login configured; reading public league data only.");
        return;
    }
    const response = await fetch(`${API_BASE}/${season}/login`, {
        method: "POST",
        headers: {...headers, "Content-Type": "application/x-www-form-urlencoded"},
        body: new URLSearchParams({USERNAME: username, PASSWORD: password, XML: "1"})
    });
    const body = await response.text();
    const cookie = /cookie_name="([^"]+)"[^>]*cookie_value="([^"]+)"/.exec(body)
        || /cookie_value="([^"]+)"[^>]*cookie_name="([^"]+)"/.exec(body);
    if (!response.ok || !cookie) {
        const reason = (/<error>([^<]*)<\/error>/.exec(body) || [])[1] || `HTTP ${response.status}`;
        throw new Error(`MFL login failed: ${reason}`);
    }
    const [name, value] = cookie[0].startsWith("cookie_name") ? [cookie[1], cookie[2]] : [cookie[2], cookie[1]];
    headers.Cookie = `${name}=${value}`;
    log("Logged in to MFL as commissioner.");
}

const fetchFrom = (base, type, params, section = type) =>
    fetchExport(exportUrl(base, season, type, params), section, {init: {headers}});

/** After the deadline, write this season's franchise snapshot if it doesn't exist yet. */
async function franchiseSnapshot() {
    const file = join(root, "site", "data", snapshotFileName(season));
    if (existsSync(file)) {
        log(`The ${season} franchise snapshot already exists.`);
        return false;
    }
    const deadline = firstKickoff(await fetchFrom(API_BASE, "nflSchedule", {W: TRADE_DEADLINE_WEEK}));
    if (!deadline) {
        throw new Error(`MFL's ${season} schedule lists no week ${TRADE_DEADLINE_WEEK} games`);
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
    const snapshot = makeSnapshot(season, top, {takenAt: now.toISOString(), source: "Daily job, after the trade deadline"});
    mkdirSync(dirname(file), {recursive: true});
    writeFileSync(file, JSON.stringify(snapshot, null, 2) + "\n");
    const summary = Object.entries(top).map(([position, list]) => `${position} $${franchiseSalary(list)}`).join(", ");
    choreLog(`Took the ${season} franchise salary snapshot (${summary}).`);
    return true;
}

/** Append this run's entries to the chore log, or a monthly heartbeat if nothing happened. */
function updateChoreLog() {
    const file = process.env.CHORE_LOG_FILE;
    if (!file) {
        return;
    }
    const stamp = now.toISOString().slice(0, 16).replace("T", " ") + " UTC";
    let text = existsSync(file) ? readFileSync(file, "utf8") : "# Chore log\n\nWhat the daily job did, newest last.\n\n";
    if (entries.length) {
        text += entries.map((entry) => `- ${stamp}: ${entry}\n`).join("");
    } else {
        const last = [...text.matchAll(/^- (\d{4}-\d{2}-\d{2})/gm)].pop();
        const days = last ? (now - new Date(`${last[1]}T00:00:00Z`)) / 86400000 : Infinity;
        if (days < 30) {
            return;
        }
        text += `- ${stamp}: Heartbeat. Nothing to do; the daily job is running.\n`;
    }
    mkdirSync(dirname(file), {recursive: true});
    writeFileSync(file, text);
}

try {
    await login();
    const written = await franchiseSnapshot();
    setOutput("snapshot", written ? "written" : "none");
} catch (error) {
    choreLog(`Failed: ${error.message}`);
    updateChoreLog();
    setOutput("snapshot", "none");
    process.exitCode = 1;
    throw error;
}
updateChoreLog();
