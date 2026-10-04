// Daily league chores, run by .github/workflows/daily.yml (Node 24+).
//
// Chores:
// - flag roster limit, injured reserve and anti-tanking violations, as the Main tab's League
//   Alerts box shows them; a team over the roster limit is held like one over the cap.
// - flag every team over the cap, counting drop penalties still owed, and fail the run so the
//   commissioner hears about it.
// - charge the cap penalty for each dropped player still carrying a contract, then reset the
//   player to $1 / 0 years, except on a team over the cap. Only logged unless
//   DROP_PENALTIES=apply.
// - set contract years for added players from the blind bid comment or the message board's
//   contract thread (1 year if none is stated), flagging anything unclear. Only logged unless
//   CONTRACT_YEARS=apply.
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
//   GITHUB_STEP_SUMMARY         set by GitHub Actions; receives this run's chore log entries, shown on
//                               the run's page (GitHub's failure email links to it)
//   DROP_PENALTIES              "apply" to charge drop penalties; anything else only logs them
//   CONTRACT_YEARS              "apply" to set contract years for adds; anything else only logs them
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
const {MAX_PENALTIES_PER_RUN, needsCharge, pendingPenalties, resetSalaryXml, salaryAdjXml} =
    await import("./drop-penalties.mjs");
const {contractDeadline, pendingAdds, windowClosed} = await lib("adds.js");
const {ruleViolations, seasonPhase} = await lib("violations.js");
const {MAX_CONTRACTS_PER_RUN, contractsXml, decideYears, readProcessedWaivers, teamPlayers} =
    await import("./contract-years.mjs");
const {RECENT_MOVE_DAYS, overCapMessage, recentMoves} = await import("./over-cap.mjs");

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
const applyContractYears = process.env.CONTRACT_YEARS === "apply";
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

/** Put this run's chore log entries on the run's summary page, where the failure email leads. */
function writeSummary() {
    if (!process.env.GITHUB_STEP_SUMMARY) {
        return;
    }
    const outcome = process.exitCode ? "Needs attention" : "OK";
    const lines = entries.length ? entries.map((entry) => `- ${entry}`).join("\n") : "Nothing to do.";
    try {
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Daily chores: ${outcome}\n\n${lines}\n`);
    } catch (error) {
        // the summary is a convenience; the chore log already has everything
        log(`Couldn't write the run summary: ${error.message}`);
    }
}

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
 * MFL's Previously Processed Waivers page for one blind bid period, as the commissioner sees
 * it. Blind bid comments are only on this page, not in the API.
 */
async function processedWaivers(period) {
    const url = `${host}/${season}/processed_waivers?LEAGUE_ID=${leagueId}&PERIOD=${period}`;
    let response;
    try {
        response = await fetch(url, {headers: mflHeaders});
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

/**
 * Set contract years for players added with none: from the blind bid comment, or the team's
 * posts in the message board's contract thread, or 1 year if neither states one. Anything
 * unclear is flagged and left for the commissioner, and the run fails so they hear about it.
 * Teams over the cap are skipped, like their drop penalties: the add may be reversed, and a
 * dropped player with contract years would owe a penalty. Without CONTRACT_YEARS=apply it only
 * logs what it would do.
 */
async function contractYears(loggedIn, {rosters, transactions, playerNames}, over) {
    const held = pendingAdds({rosters, transactions, players: playerNames}).filter((add) => over.has(add.franchiseId));
    for (const add of held) {
        choreLog(`Contract years: ${add.name} held, since the team is over the cap or the roster limit. Left for the commissioner.`);
    }
    const waiting = pendingAdds({rosters, transactions, players: playerNames}).filter((add) => !over.has(add.franchiseId));
    // decided once the owner's posting window has closed
    const adds = waiting.filter((add) => windowClosed(add, now.getTime() / 1000));
    if (waiting.length > adds.length) {
        log(`${waiting.length - adds.length} add(s) still in their posting window will be decided at the next run.`);
    }
    if (!adds.length) {
        log("No added players are waiting for contract years.");
        return;
    }
    if (!loggedIn) {
        throw new Error(`${adds.length} added player(s) are waiting for contract years, but reading the bids `
            + "and the message board needs the commissioner login, so none were set.");
    }
    // owners post lengths in threads of any name, so read every thread with a post since the
    // earliest pending add
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
        adds, posts, bidRequests, teams: teamPlayers({rosters, players: playerNames}), contractDeadline
    });
    for (const flag of flags) {
        choreLog(`Contract years: ${flag}. Left for the commissioner.`);
        process.exitCode = 1;
    }
    const describe = (contract) => {
        const name = contract.name.split(",").reverse().map((part) => part.trim()).join(" ");
        return `${name} to ${contract.years} year${contract.years === 1 ? "" : "s"} (${contract.source})`;
    };
    if (!contracts.length) {
        return;
    }
    if (!applyContractYears) {
        contracts.forEach((contract) => choreLog(`Dry run: would set ${describe(contract)}.`));
        return;
    }
    if (contracts.length > MAX_CONTRACTS_PER_RUN) {
        throw new Error(`${contracts.length} added players are waiting for contract years, more than the `
            + `${MAX_CONTRACTS_PER_RUN} expected in a day, so none were set. Check the Commish tab and set them by hand.`);
    }
    await mflImport("salaries", contractsXml(contracts), {APPEND: "1"});
    contracts.forEach((contract) => choreLog(`Set ${describe(contract)}.`));
}

/** The league as the league chores need it: built with adjustments, transactions and free agents. */
async function leagueState() {
    const [players, league, salaryAdjustments, rosters, transactions, freeAgents, weeklyResults] = await Promise.all([
        fetchFrom(API_BASE, "players"),
        fetchFrom(host, "league", {L: leagueId}),
        fetchFrom(host, "salaryAdjustments", {L: leagueId}),
        fetchFrom(host, "rosters", {L: leagueId}),
        fetchFrom(host, "transactions", {L: leagueId}),
        fetchFrom(host, "freeAgents", {L: leagueId}),
        fetchFrom(host, "weeklyResults", {L: leagueId})
    ]);
    // today's NFL injury report, for injured reserve eligibility; without it that check is skipped
    const currentInjuries = await fetchFrom(API_BASE, "injuries").catch((error) => {
        log(`Couldn't load today's NFL injury report (${error.message}); the injured reserve check is skipped.`);
        return null;
    });
    // the results week's report, for the anti-tanking check; without it that check flags nothing
    const injuries = await fetchFrom(API_BASE, "injuries", {W: weeklyResults.week || ""}).catch((error) => {
        log(`Couldn't load the week ${weeklyResults.week} NFL injury report (${error.message}); the anti-tanking check is skipped.`);
        return null;
    });
    const playerMap = playersFromExport(players);
    const built = buildLeague({players: playerMap, league, salaryAdjustments, rosters, transactions, freeAgents, weeklyResults, injuries, currentInjuries});
    // as the Main tab's box: the anti-tanking check stops when the playoffs start, the roster
    // and IR checks when the championship week is over. If that can't be told, the league
    // rules are skipped rather than risk flagging the offseason.
    try {
        Object.assign(built, await seasonPhase(season, now, {init: {headers: mflHeaders}}));
    } catch (error) {
        log(`Couldn't tell where the ${season} season is (${error.message}); the league rules are skipped.`);
        built.seasonOver = null;
    }
    return {
        players: playerMap,
        built,
        penalties: pendingPenalties(built),
        transactions: asArray(transactions.transaction),
        rosters,
        // players as MFL names them ("Last, First"), which the waivers page uses too
        playerNames: new Map(asArray(players.player).map((player) => [player.id, player]))
    };
}

/** The League Alerts the job flags, as the Main tab's box shows them; the cap has its own flag. */
const RULE_KINDS = new Set(["roster-over", "roster-under", "ir", "ir-roster", "injured-starter"]);

/**
 * Flag roster limit, injured reserve and anti-tanking violations, from the same rules as the
 * Main tab's box. Going over the roster limit voids the move, like going over the cap, so that
 * flag lists the team's recent moves and any drop penalties held. The run fails so the
 * commissioner hears about it, every day until it's fixed. Returns the teams over the roster
 * limit, whose drop penalties and contract years are held.
 */
function leagueRules({players, built, penalties, transactions}) {
    const overRoster = new Set();
    if (built.seasonOver === null) {
        return overRoster;
    }
    const since = now.getTime() / 1000 - RECENT_MOVE_DAYS * 86400;
    const violations = ruleViolations(built).filter((item) => RULE_KINDS.has(item.kind));
    for (const violation of violations) {
        let text = violation.text;
        if (violation.kind === "roster-over") {
            overRoster.add(violation.franchiseId);
            const moves = recentMoves(transactions, violation.franchiseId, {players, franchises: built.franchises, since});
            const held = penalties.filter((penalty) => penalty.franchiseId === violation.franchiseId).map((penalty) => penalty.explanation);
            text += ` Moves in the last ${RECENT_MOVE_DAYS} days: ${moves.length ? moves.join("; ") : "none"}.`
                + (held.length ? ` Drop penalties held so the move can be reversed: ${held.join(", ")}.` : "");
        }
        choreLog(`League rules: ${text}`);
        process.exitCode = 1;
    }
    if (!violations.length) {
        log("No roster, injured reserve or anti-tanking violations.");
    }
    return overRoster;
}

/**
 * Flag every team over the cap, counting drop penalties still owed, with its recent moves. The
 * run fails so the commissioner hears about it, every day until the team is back under. Returns
 * the over-cap franchise ids, whose drop penalties are held.
 */
function overCap({players, built, penalties, transactions}) {
    const since = now.getTime() / 1000 - RECENT_MOVE_DAYS * 86400;
    const over = new Set();
    for (const {franchiseId, capTotal: total} of built.franchises.values()) {
        if (total <= SALARY_CAP) {
            continue;
        }
        over.add(franchiseId);
        choreLog(`Over the cap: ${overCapMessage({
            teamName: built.franchises.get(franchiseId).teamName,
            total,
            cap: SALARY_CAP,
            moves: recentMoves(transactions, franchiseId, {players, franchises: built.franchises, since}),
            held: penalties.filter((penalty) => penalty.franchiseId === franchiseId).map((penalty) => penalty.explanation)
        })}`);
        process.exitCode = 1;
    }
    if (!over.size) {
        log("No team is over the cap.");
    }
    return over;
}

/**
 * Charge the cap penalty for each dropped player still carrying a contract, then reset the
 * player to $1 / 0 years, which clears them from the Commish tab. A penalty already charged
 * (by an earlier run that failed before the reset, or by hand), or a $0 one, is skipped, and
 * only the reset is done. Teams over the cap are skipped: their flag names the held penalties,
 * since charging them would reset a contract the commissioner may restore by reversing the
 * move. Without DROP_PENALTIES=apply it only logs what it would do.
 */
async function dropPenalties(loggedIn, {penalties}, over) {
    if (!penalties.length) {
        log("No dropped players owe a cap penalty.");
        return;
    }
    const describe = (penalty) => `$${penalty.amount} to ${penalty.teamName} for ${penalty.explanation}`;
    const noCharge = (penalty) => penalty.amount > 0 ? "penalty already charged" : "no penalty owed";
    const toApply = penalties.filter((penalty) => !over.has(penalty.franchiseId));
    if (!applyDropPenalties) {
        for (const penalty of toApply) {
            choreLog(needsCharge(penalty)
                ? `Dry run: would charge ${describe(penalty)}, then reset the player to $1 / 0 years.`
                : `Dry run: would reset ${penalty.fullName} to $1 / 0 years (${noCharge(penalty)}).`);
        }
        return;
    }
    // held penalties don't count: they can wait for weeks on a team over the cap
    if (toApply.length > MAX_PENALTIES_PER_RUN) {
        throw new Error(`${toApply.length} dropped players owe a cap penalty, more than the ${MAX_PENALTIES_PER_RUN} `
            + `expected in a day, so none were charged. Check the Commish tab and charge them by hand.`);
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
    const loggedIn = !loginProblem && Boolean(process.env.MFL_USERNAME && process.env.MFL_PASSWORD);
    // each chore fails on its own; the snapshot doesn't depend on any of them
    let state = null;
    try {
        state = await leagueState();
    } catch (error) {
        choreLog(`League chores: ${error.message}`);
        process.exitCode = 1;
    }
    if (state) {
        // teams over the roster limit or the cap: their moves may be reversed, so drop penalties
        // and contract years are held
        let overRoster = new Set();
        try {
            overRoster = leagueRules(state);
        } catch (error) {
            choreLog(`League rules: ${error.message}`);
            process.exitCode = 1;
        }
        let over = null;
        try {
            over = new Set([...overCap(state), ...overRoster]);
            await dropPenalties(loggedIn, state, over);
        } catch (error) {
            choreLog(`Cap chores: ${error.message}`);
            process.exitCode = 1;
        }
        try {
            if (!over) {
                throw new Error("skipped: the cap check didn't finish, so it isn't known which teams are held");
            }
            await contractYears(loggedIn, state, over);
        } catch (error) {
            choreLog(`Contract years: ${error.message}`);
            process.exitCode = 1;
        }
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
    writeSummary();
}
