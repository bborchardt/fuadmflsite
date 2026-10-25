// The daily job end to end, against tests/fixtures/fake-mfl.mjs in place of MFL: which chores run when
// another fails, what's held, what's posted, and what the run leaves for GitHub and the chore log.

import {after, test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const at = (iso) => Date.parse(iso) / 1000;
// week 1 kicks off Thursday 10 Sep 2026; the trade deadline (week 12) on 26 Nov
const WEEK1 = at("2026-09-11T00:20:00Z");
const MID_SEASON = "2026-10-24T12:00:00Z";
const DROPPED = at("2026-10-23T16:00:00Z");
const SNAPSHOT_2025 = '{"season":2025}\n';

// two teams of 23: Alpha's QB at `alphaSalary`; Beta dropped Gordon ($10, 2 years: an $8 penalty) and
// Alpha dropped Mixon ($1, 1 year: $1)
function league({alphaSalary = 100} = {}) {
    const players = [{id: "4", name: "Gordon, Ollie", position: "RB", team: "MIA"}, {id: "5", name: "Mixon, Joe", position: "RB", team: "HOU"}];
    const roster = (team, first) => Array.from({length: 23}, (_, i) => {
        const id = String(first + i);
        players.push({id, name: `Player, ${team}${i}`, position: "WR", team: "BUF"});
        return {id, salary: i === 0 && team === "A" ? String(alphaSalary) : "1", contractYear: "1", status: "ROSTER"};
    });
    const rosters = {franchise: [{id: "0001", player: roster("A", 100)}, {id: "0002", player: roster("B", 200)}]};
    return {
        players: {player: players},
        league: {franchises: {franchise: [{id: "0001", name: "Alpha"}, {id: "0002", name: "Beta"}]}},
        rosters,
        salaryAdjustments: {},
        transactions: {transaction: [
            {type: "FREE_AGENT", franchise: "0002", transaction: "|4,", timestamp: String(DROPPED)},
            {type: "FREE_AGENT", franchise: "0001", transaction: "|5,", timestamp: String(DROPPED)}
        ]},
        freeAgents: {leagueUnit: {player: [{id: "4", salary: "10", contractYear: "2"}, {id: "5", salary: "1", contractYear: "1"}]}},
        weeklyResults: {},
        injuries: {injury: []}
    };
}

// an hour before DROPPED, so each add's hour to post its length has closed by MID_SEASON
const ADDED = DROPPED - 3600;

// `exports` with two adds waiting for a length: Beta picked up Olave as a free agent and posted
// "Olave: 3 years"; Alpha won Waddle by blind bid, its comment on MFL's processed waivers page
function withAdds(exports, {post = "Olave: 3 years"} = {}) {
    const rosters = structuredClone(exports.rosters);
    rosters.franchise[1].player.push({id: "300", salary: "1", contractYear: "0", status: "ROSTER"});
    rosters.franchise[0].player.push({id: "301", salary: "4", contractYear: "0", status: "ROSTER"});
    return {
        ...exports,
        players: {player: [...exports.players.player, {id: "300", name: "Olave, Chris", position: "WR", team: "NOS"}, {id: "301", name: "Waddle, Jaylen", position: "WR", team: "MIA"}]},
        rosters,
        transactions: {transaction: [
            ...exports.transactions.transaction,
            {type: "FREE_AGENT", franchise: "0002", transaction: "300,|", timestamp: String(ADDED)},
            {type: "BBID_WAIVER", franchise: "0001", transaction: "301,|4.00|", timestamp: String(ADDED)}
        ]},
        messageBoard: {thread: [{id: "7001", lastPostTime: String(ADDED + 600)}]},
        messageBoardThread: {post: post ? [{franchise: "0002", postTime: String(ADDED + 600), body: post}] : []}
    };
}
const waiversPage = (comment) => `<a href="#">Logout</a><table class="report"><tr><th>Original Waiver Request</th></tr>
<tr><td>1</td><td><a class="franchise_0001" href="#">Alpha</a></td><td>Waddle, Jaylen MIA WR ($4.00)</td><td>None</td>
<td>Add Waddle, Jaylen MIA WR for $4.00 and drop None<br />Submitted Fri Oct 23 9:00:00 a.m. CT 2026<br />${comment ? `Comments: ${comment}<br />` : ""}</td><td></td></tr></table>`;

const dirs = [];
after(() => dirs.forEach((dir) => rmSync(dir, {recursive: true, force: true})));

// runs the job in a fresh league-data checkout; `files` are put in it first
function run({scenario = {}, env = {}, files = {"data/franchise-2025.json": SNAPSHOT_2025}, now = MID_SEASON} = {}) {
    const dir = mkdtempSync(join(tmpdir(), "fuad-daily-"));
    dirs.push(dir);
    const dataDir = join(dir, "league-data");
    for (const [path, text] of Object.entries(files)) {
        mkdirSync(dirname(join(dataDir, path)), {recursive: true});
        writeFileSync(join(dataDir, path), text);
    }
    mkdirSync(dataDir, {recursive: true});
    const paths = {fake: join(dir, "scenario.json"), log: join(dir, "requests.jsonl"), output: join(dir, "output"), summary: join(dir, "summary.md")};
    writeFileSync(paths.fake, JSON.stringify({seasons: [2025, 2026], week1: WEEK1, exports: league(), published: {"franchise-2025.json": SNAPSHOT_2025}, ...scenario}));
    writeFileSync(paths.log, "");
    const result = spawnSync(process.execPath, ["--import", join(root, "tests", "fixtures", "fake-mfl.mjs"), join(root, "jobs", "daily.mjs")], {
        encoding: "utf8",
        timeout: 60000,
        // nothing from the real environment: no login, no live league
        env: {PATH: process.env.PATH, DATA_DIR: dataDir, NOW: now, FAKE_MFL: paths.fake, FAKE_MFL_LOG: paths.log, GITHUB_OUTPUT: paths.output, GITHUB_STEP_SUMMARY: paths.summary, ...env}
    });
    const read = (file) => (existsSync(file) ? readFileSync(file, "utf8") : "");
    const choreLog = read(join(dataDir, "chore-log.md"));
    return {
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
        entries: choreLog.split("\n").filter((line) => line.startsWith("- ")).map((line) => line.replace(/^- \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC: /, "")),
        choreLog,
        requests: read(paths.log).split("\n").filter(Boolean).map((line) => JSON.parse(line)),
        output: Object.fromEntries(read(paths.output).split("\n").filter(Boolean).map((line) => line.split("="))),
        summary: read(paths.summary),
        dataDir
    };
}

const LOGIN = {MFL_USERNAME: "commish", MFL_PASSWORD: "secret"};
const imports = (result) => result.requests.filter((request) => request.method === "POST" && request.url.includes("/import"))
    .map((request) => Object.fromEntries(new URLSearchParams(request.body)));

test("an ordinary day without the login: penalties only logged, nothing posted, the run passes", () => {
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Working on the 2026 league site\./);
    assert.deepEqual(result.entries, [
        "Dry run: would charge $1 to Alpha for Joe Mixon (1yrs@1, 10/23), then reset the player to $1 / 0 years.",
        "Dry run: would charge $8 to Beta for Ollie Gordon (2yrs@10, 10/23), then reset the player to $1 / 0 years."
    ]);
    assert.ok(!result.requests.some((request) => request.method === "POST"));
    assert.deepEqual(result.output, {changed: "true", publish: "false"});
    assert.match(result.summary, /^## Daily chores: OK\n\n- Dry run: would charge \$1 to Alpha/);
    assert.doesNotMatch(result.stdout, /::error/);
});

test("a team over the cap fails the run and holds its penalty; the other team's is charged", () => {
    const result = run({scenario: {exports: league({alphaSalary: 290})}, env: {...LOGIN, DROP_PENALTIES: "apply"}});
    assert.equal(result.status, 1);
    assert.match(result.entries[0], /^Over the cap: Alpha/);
    assert.match(result.entries[0], /Joe Mixon/);
    assert.deepEqual(result.entries.slice(1), ["Charged $8 to Beta for Ollie Gordon (2yrs@10, 10/23), and reset the player to $1 / 0 years."]);
    // the charge, then the reset, Beta's only, with the session MFL gave the login
    const posted = imports(result);
    assert.deepEqual(posted.map((data) => data.TYPE), ["salaryAdj", "salaries"]);
    assert.match(posted[0].DATA, /franchise_id="0002"/);
    assert.match(posted[1].DATA, /id="4"/);
    assert.equal(posted[1].APPEND, "1");
    assert.ok(result.requests.filter((request) => request.url.includes("/import"))
        .every((request) => request.url.startsWith("https://www44.myfantasyleague.com/2026/import") && request.cookie === "MFL_USER_ID=abc+def="));
    // GitHub's annotation, one line, says why the run failed
    assert.match(result.stdout, /::error title=Daily chores need attention::Failing the run so it gets noticed: 1 item needs the commissioner\.%0A- Over the cap: Alpha/);
    assert.match(result.summary, /^## Daily chores: Needs attention/);
});

test("an import MFL refuses fails the cap chores, and the rest still run", () => {
    const result = run({scenario: {importError: "Invalid data"}, env: {...LOGIN, DROP_PENALTIES: "apply"}});
    assert.equal(result.status, 1);
    assert.deepEqual(result.entries, ["Cap chores: MFL's salaryAdj import failed: Invalid data"]);
    // the first refusal stops the penalties: nothing reset without its charge
    assert.deepEqual(imports(result).map((data) => data.TYPE), ["salaryAdj"]);
    assert.match(result.stdout, /No added players are waiting for contract years\./);
    assert.match(result.stdout, /The 2025 franchise snapshot already exists\./);
});

test("when the league's exports can't be read, the run fails but the snapshots are still seen to", () => {
    const result = run({scenario: {exports: {...league(), rosters: 500}}});
    assert.equal(result.status, 1);
    assert.deepEqual(result.entries, ['League chores: Couldn\'t load rosters: HTTP 500']);
    assert.ok(result.requests.some((request) => request.url.startsWith("https://bborchardt.github.io/")));
});

test("a refused login is flagged, and no penalty is charged without it", () => {
    const result = run({scenario: {login: "refused"}, env: {...LOGIN, DROP_PENALTIES: "apply"}});
    assert.equal(result.status, 1);
    assert.deepEqual(result.entries, [
        "MFL login failed: Invalid password. Continuing with public league data.",
        "Cap chores: 2 dropped player(s) owe a cap penalty, but the job isn't logged in, so none were charged."
    ]);
    assert.deepEqual(imports(result), []);
});

test("a session cookie MFL takes only escaped is escaped", () => {
    const result = run({scenario: {login: "escaped", exports: league({alphaSalary: 290})}, env: {...LOGIN, DROP_PENALTIES: "apply"}});
    assert.match(result.stdout, /Logged in to MFL as commissioner\./);
    assert.ok(imports(result).length);
    assert.ok(result.requests.filter((request) => request.url.includes("/import")).every((request) => request.cookie === "MFL_USER_ID=abc%2Bdef%3D"));
});

test("before the league renews, the job works on last season's site", () => {
    const result = run({scenario: {seasons: [2025]}, now: "2026-03-01T12:00:00Z"});
    assert.match(result.stdout, /Working on the 2025 league site\./);
});

test("after the trade deadline the snapshot is taken, and the site is to be published", () => {
    const result = run({now: "2026-11-27T12:00:00Z"});
    const snapshot = JSON.parse(readFileSync(join(result.dataDir, "data", "franchise-2026.json"), "utf8"));
    assert.equal(snapshot.season, 2026);
    assert.equal(snapshot.source, "Daily job, after the trade deadline");
    assert.ok(result.entries.some((entry) => /^Took the 2026 franchise salary snapshot \(WR \$\d+\)\.$/.test(entry)));
    assert.deepEqual(result.output, {changed: "true", publish: "true"});
    // a week late, it says to check it
    const late = run({now: "2026-12-05T12:00:00Z"});
    assert.ok(late.entries.some((entry) => /^Took the 2026 franchise salary snapshot 8 days late .*check it\.$/.test(entry)));
});

test("a snapshot changed by hand on league-data is published again", () => {
    const result = run({scenario: {published: {"franchise-2025.json": '{"season":2025,"old":true}\n'}}});
    assert.ok(result.entries.includes("Publishing snapshots that are new or changed since the site was last published: franchise-2025.json."));
    assert.equal(result.output.publish, "true");
});

test("with nothing to do the chore log is left alone, but gets a heartbeat once a month", () => {
    const quiet = {...league(), transactions: {transaction: []}};
    const recent = "# Chore log\n\n- 2026-10-10 06:00 UTC: Set Joe Mixon to 2 years (bid comment).\n";
    const fresh = run({scenario: {exports: quiet}, files: {"data/franchise-2025.json": SNAPSHOT_2025, "chore-log.md": recent}});
    assert.equal(fresh.status, 0, fresh.stderr);
    assert.equal(fresh.choreLog, recent);
    assert.deepEqual(fresh.output, {changed: "false", publish: "false"});
    assert.match(fresh.summary, /Nothing to do\./);
    const old = run({scenario: {exports: quiet}, files: {"data/franchise-2025.json": SNAPSHOT_2025, "chore-log.md": recent.replace("2026-10-10", "2026-09-01")}});
    assert.match(old.choreLog, /- 2026-10-24 12:00 UTC: Heartbeat\. Nothing to do; the daily job is running\.\n$/);
    assert.equal(old.output.changed, "true");
});

test("v2's lib, the default, runs the same day as v1's", () => {
    const day = {scenario: {exports: league({alphaSalary: 290})}, env: {...LOGIN, DROP_PENALTIES: "apply"}};
    const v1 = run({...day, env: {...day.env, RULES_VERSION: "v1"}});
    const v2 = run(day);
    assert.equal(v2.status, v1.status, v2.stderr);
    assert.deepEqual(v2.entries, v1.entries);
    assert.deepEqual(imports(v2), imports(v1));
});

const contractEntries = (result) => result.entries.filter((entry) => /Contract years|would set|^Set /.test(entry));

test("contract years: a posted length and a bid comment's, logged in a dry run and set when applied", () => {
    const day = {scenario: {exports: withAdds(league()), waivers: waiversPage("2 years")}, env: LOGIN};
    const dry = run(day);
    assert.equal(dry.status, 0, dry.stderr);
    assert.deepEqual(contractEntries(dry), [
        "Dry run: would set Jaylen Waddle to 2 years (blind bid comment \"2 years\").",
        "Dry run: would set Chris Olave to 3 years (post \"Olave: 3 years\")."
    ]);
    // the bid's own week's page, by its period
    assert.ok(dry.requests.some((request) => request.url.endsWith(`/processed_waivers?LEAGUE_ID=48571&PERIOD=${ADDED}`)));
    assert.deepEqual(imports(dry), []);
    const applied = run({...day, env: {...LOGIN, CONTRACT_YEARS: "apply"}});
    const posted = imports(applied);
    assert.deepEqual(posted.map((data) => data.TYPE), ["salaries"]);
    assert.equal(posted[0].APPEND, "1");
    // each at the salary MFL has, so only the years change
    assert.match(posted[0].DATA, /<player id="301" salary="4" contractYear="2"\/><player id="300" salary="1" contractYear="3"\/>/);
    assert.deepEqual(contractEntries(applied), [
        "Set Jaylen Waddle to 2 years (blind bid comment \"2 years\").",
        "Set Chris Olave to 3 years (post \"Olave: 3 years\")."
    ]);
});

test("contract years: what can't be read is left for the commissioner, never guessed", () => {
    const result = run({scenario: {exports: withAdds(league(), {post: "Olave: 3 years\nOlave: 4 years"}), waivers: waiversPage("")}, env: {...LOGIN, CONTRACT_YEARS: "apply"}});
    assert.equal(result.status, 1);
    const entries = contractEntries(result);
    assert.ok(entries.some((entry) => /^Contract years: Chris Olave: .*Left for the commissioner\.$/.test(entry)), entries.join("\n"));
    assert.ok(!imports(result).some((data) => /id="300"/.test(data.DATA)));
    const hedged = run({scenario: {exports: withAdds(league(), {post: "Olave: 3 or 4 years"}), waivers: waiversPage("")}, env: {...LOGIN, CONTRACT_YEARS: "apply"}});
    assert.ok(contractEntries(hedged).some((entry) => /^Contract years: Chris Olave: .*more than one length\. Left for the commissioner\.$/.test(entry)),
        contractEntries(hedged).join("\n"));
    assert.ok(!imports(hedged).some((data) => /id="300"/.test(data.DATA)));
    // a bid without a comment takes the default length
    assert.ok(entries.includes("Set Jaylen Waddle to 1 year (no length stated: the default)."), entries.join("\n"));
    const missing = run({scenario: {exports: withAdds(league()), waivers: '<a href="#">Logout</a><table class="report"><tr><th>Original Waiver Request</th></tr></table>'}, env: LOGIN});
    assert.ok(missing.entries.includes("Contract years: Jaylen Waddle: its blind bid isn't on MFL's processed waivers page, so its comment couldn't be read. Left for the commissioner."), missing.entries.join("\n"));
});

test("contract years: held for a team over the cap, and none set without the login or a readable bids page", () => {
    const over = run({scenario: {exports: withAdds(league({alphaSalary: 290})), waivers: waiversPage("2 years")}, env: LOGIN});
    assert.ok(over.entries.includes("Contract years: Waddle, Jaylen held, since the team is over the cap or the roster limit. Left for the commissioner."), over.entries.join("\n"));
    assert.ok(contractEntries(over).some((entry) => /would set Chris Olave/.test(entry)));
    const anonymous = run({scenario: {exports: withAdds(league())}});
    assert.ok(anonymous.entries.includes("Contract years: 2 added player(s) are waiting for contract years, but reading the bids and the message board needs the commissioner login, so none were set."), anonymous.entries.join("\n"));
    const loggedOut = run({scenario: {exports: withAdds(league()), waivers: "<p>Login</p>"}, env: LOGIN});
    assert.ok(loggedOut.entries.some((entry) => /^Contract years: MFL's processed waivers for period \d+ came back logged out/.test(entry)), loggedOut.entries.join("\n"));
    // still inside the hour: decided at the next run
    const early = run({scenario: {exports: withAdds(league())}, now: new Date((ADDED + 1800) * 1000).toISOString()});
    assert.deepEqual(contractEntries(early), []);
    assert.match(early.stdout, /2 add\(s\) still in their posting window will be decided at the next run\./);
});
