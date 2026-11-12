// The daily job end to end, against tests/fixtures/fake-mfl.mjs in place of MFL: which chores run when
// another fails, what's held, what's posted, and what the run leaves for GitHub and the chore log.

import {after, test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import sharp from "sharp";

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
        league: {lastRegularSeasonWeek: "14", endWeek: "17", franchises: {franchise: [{id: "0001", name: "Alpha"}, {id: "0002", name: "Beta"}]}},
        rosters,
        salaryAdjustments: {},
        transactions: {transaction: [
            {type: "FREE_AGENT", franchise: "0002", transaction: "|4,", timestamp: String(DROPPED)},
            {type: "FREE_AGENT", franchise: "0001", transaction: "|5,", timestamp: String(DROPPED)}
        ]},
        freeAgents: {leagueUnit: {player: [{id: "4", salary: "10", contractYear: "2"}, {id: "5", salary: "1", contractYear: "1"}]}},
        weeklyResults: {},
        injuries: {injury: []},
        draftResults: {}
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
        env: {PATH: process.env.PATH, DATA_DIR: dataDir, MFL_LEAGUE_ID: "48571", MFL_HOST: "https://www44.myfantasyleague.com", GITHUB_REPOSITORY: "bborchardt/fuadmflsite", NOW: now, FAKE_MFL: paths.fake, FAKE_MFL_LOG: paths.log, GITHUB_OUTPUT: paths.output, GITHUB_STEP_SUMMARY: paths.summary, ...env}
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

test("a player cut while his length is due costs the 1-year penalty; this season's rookie's only from the cut-down", () => {
    const base = league();
    const exports = {
        ...base,
        players: {player: [...base.players.player, {id: "6", name: "Kamara, Alvin", position: "RB", team: "NOS"}, {id: "7", name: "Rookie, Ray", position: "WR", team: "BUF"}]},
        transactions: {transaction: [...base.transactions.transaction,
            {type: "FREE_AGENT", franchise: "0002", transaction: "|6,", timestamp: String(DROPPED)},
            {type: "FREE_AGENT", franchise: "0001", transaction: "|7,", timestamp: String(DROPPED)}]},
        freeAgents: {leagueUnit: {player: [...base.freeAgents.leagueUnit.player, {id: "6", salary: "20", contractYear: "0"}, {id: "7", salary: "6", contractYear: "0"}]}},
        draftResults: {draftUnit: {draftPick: [{player: "7"}]}}
    };
    const cutDown = (iso) => ({event: [{type: "CUSTOM", title: "Final cut-down", start_time: String(at(iso))}]});
    const lengthDue = (result) => result.entries.filter((entry) => /Kamara|Rookie/.test(entry));
    // cut after the cut-down date: both pay a year's, 20 × 0.4 and 6 × 0.4 rounded up
    const after = run({scenario: {exports: {...exports, calendar: cutDown("2026-09-08T23:00:00Z")}}, env: LOGIN});
    assert.equal(after.status, 0, after.stderr);
    assert.deepEqual(lengthDue(after), [
        "Dry run: would charge $3 to Alpha for Ray Rookie (0yrs@6, length due, 10/23), then reset the player to $1 / 0 years.",
        "Dry run: would charge $8 to Beta for Alvin Kamara (0yrs@20, length due, 10/23), then reset the player to $1 / 0 years."
    ]);
    // cut before it: the rookie goes free
    const before = run({scenario: {exports: {...exports, calendar: cutDown("2026-10-30T23:00:00Z")}}, env: LOGIN});
    assert.deepEqual(lengthDue(before), [
        "Dry run: would reset Ray Rookie to $1 / 0 years (no penalty owed).",
        "Dry run: would charge $8 to Beta for Alvin Kamara (0yrs@20, length due, 10/23), then reset the player to $1 / 0 years."
    ]);
    // Kamara ended last season at 1 year on $20: the rollover left him an RFA not yet at $0.01, whose
    // contract ran out
    const lastSeason = {franchise: [{id: "0002", player: [{id: "6", salary: "20", contractYear: "1"}]}]};
    // contract ran out, or won back at the auction on the same salary: left for the commissioner
    const rfa = run({scenario: {exports: {...exports, "rosters@2025": lastSeason, calendar: cutDown("2026-09-08T23:00:00Z")}}, env: {...LOGIN, DROP_PENALTIES: "apply"}});
    assert.equal(rfa.status, 1);
    assert.ok(rfa.entries.includes("Cap chores: left as they are, since it can't be told whether they owe a penalty (each ended last season "
        + "at 1 year on the same salary: an RFA whose contract ran out owes nothing, one won back at the auction a year's): "
        + "Alvin Kamara (0yrs@20, length due, 10/23). Charge any owed by hand with his full name, as here, and the next run resets him; "
        + "set one who owes nothing to $1 / 0 years on MFL's Salaries page."), rfa.entries.join("\n"));
    assert.ok(!imports(rfa).some((data) => /id="6"/.test(data.DATA || "")));
    // charged by hand as the flag asks: the next run only resets him
    const byHand = {salaryAdjustment: [{franchise_id: "0002", amount: "8", description: "Alvin Kamara (1yr@20)", timestamp: String(DROPPED + 3600)}]};
    const charged = run({scenario: {exports: {...exports, salaryAdjustments: byHand, "rosters@2025": lastSeason, calendar: cutDown("2026-09-08T23:00:00Z")}}, env: LOGIN});
    assert.ok(charged.entries.includes("Dry run: would reset Alvin Kamara to $1 / 0 years (penalty already charged)."), charged.entries.join("\n"));
    assert.ok(!charged.entries.some((entry) => /can't be told/.test(entry)));
    // one the job set to $0.01 this season isn't one of them: he was settled, then won back
    const settled = run({scenario: {exports: {...exports, "rosters@2025": lastSeason, calendar: cutDown("2026-09-08T23:00:00Z")}}, env: LOGIN,
        files: {"data/franchise-2025.json": SNAPSHOT_2025, "rfa-salaries.json": '{"2026": ["6"]}'}});
    assert.ok(settled.entries.includes("Dry run: would charge $8 to Beta for Alvin Kamara (0yrs@20, length due, 10/23), then reset the player to $1 / 0 years."), settled.entries.join("\n"));
    // without the draft's results, length-due drops are left for the commissioner; the rest go on
    const unknown = run({scenario: {exports: {...exports, draftResults: 500, calendar: cutDown("2026-09-08T23:00:00Z")}}, env: {...LOGIN, DROP_PENALTIES: "apply"}});
    assert.equal(unknown.status, 1);
    assert.ok(unknown.entries.some((entry) => /^Cap chores: left as they are, since it can't be told whether they owe a penalty \(this season's draft couldn't be read: .*\): Ray Rookie \(0yrs@6, length due, 10\/23\), Alvin Kamara \(0yrs@20, length due, 10\/23\)\. Charge any owed by hand .*$/.test(entry)), unknown.entries.join("\n"));
    assert.ok(!imports(unknown).some((data) => /id="[67]"/.test(data.DATA || "")));
    assert.ok(unknown.entries.includes("Charged $8 to Beta for Ollie Gordon (2yrs@10, 10/23), and reset the player to $1 / 0 years."), unknown.entries.join("\n"));
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

test("an import MFL turns away fails at once, as one sent twice could charge a penalty twice", () => {
    const result = run({scenario: {turnedAway: {"/2026/import": 1}}, env: {...LOGIN, DROP_PENALTIES: "apply"}});
    assert.equal(result.status, 1);
    assert.deepEqual(result.entries, ["Cap chores: MFL's salaryAdj import failed: MFL turned it away with its home page"]);
    assert.equal(imports(result).length, 1);
    assert.doesNotMatch(result.stdout, /asking again/);
});

test("when the league's exports can't be read, the run fails but the snapshots are still seen to", () => {
    const result = run({scenario: {exports: {...league(), rosters: 500}}});
    assert.equal(result.status, 1);
    assert.deepEqual(result.entries, ['League chores: Couldn\'t load rosters: HTTP 500']);
    assert.ok(result.requests.some((request) => request.url.startsWith("https://bborchardt.github.io/")));
});

test("the league is named by the repository's variables, never assumed", () => {
    const result = run({env: {MFL_LEAGUE_ID: ""}});
    assert.equal(result.status, 1);
    assert.match(result.stderr, /MFL_LEAGUE_ID and MFL_HOST must name the league/);
    assert.equal(result.requests.length, 0);
    assert.equal(run({env: {MFL_HOST: "www44.myfantasyleague.com"}}).status, 1);
});

test("a league with no entry in the settings gets no run, as its rules are only assumed", () => {
    const result = run({env: {MFL_LEAGUE_ID: "99999"}});
    assert.equal(result.status, 1);
    assert.match(result.stderr, /League 99999 isn't listed/);
    assert.equal(result.requests.length, 0);
});

test("a penalty charged whose reset then failed is only reset the next day, not charged again", () => {
    // Alpha is over the cap, so only Beta's penalty goes: the charge lands, the reset is refused
    const exports = league({alphaSalary: 290});
    const first = run({scenario: {exports, importError: [null, "Invalid data"]}, env: {...LOGIN, DROP_PENALTIES: "apply"}});
    assert.equal(first.status, 1);
    assert.deepEqual(imports(first).map((data) => data.TYPE), ["salaryAdj", "salaries"]);
    assert.ok(first.entries.includes("Cap chores: MFL's salaries import failed: Invalid data"), first.entries.join("\n"));
    // the next day MFL has the charge, and Gordon still carries his contract
    const charged = {salaryAdjustment: [{franchise_id: "0002", amount: "8", description: "Ollie Gordon (2yrs@10, 10/23)", timestamp: String(DROPPED + 3600)}]};
    const next = run({scenario: {exports: {...exports, salaryAdjustments: charged}}, env: {...LOGIN, DROP_PENALTIES: "apply"}});
    assert.deepEqual(imports(next).map((data) => data.TYPE), ["salaries"]);
    assert.match(imports(next)[0].DATA, /<player id="4" salary="1" contractYear="0"\/>/);
    assert.ok(next.entries.includes("Reset Ollie Gordon to $1 / 0 years (penalty already charged)."), next.entries.join("\n"));
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

test("before week 1 the roster limits start at the cut-down date on MFL's calendar, as League Alerts' do", () => {
    const crowded = league();
    for (let i = 0; i < 8; i++) {
        crowded.players.player.push({id: String(400 + i), name: `Player, Extra${i}`, position: "WR", team: "BUF"});
        crowded.rosters.franchise[0].player.push({id: String(400 + i), salary: "1", contractYear: "1", status: "ROSTER"});
    }
    const calendar = {event: [{type: "CUSTOM", title: "Final cut down", start_time: String(at("2026-09-08T04:59:00Z")), happens: ""}]};
    const preseason = "2026-09-09T12:00:00Z";
    const flagged = (result) => result.entries.filter((entry) => /over the roster limit with 31 players/.test(entry));
    const after = run({scenario: {exports: {...crowded, calendar}}, env: LOGIN, now: preseason});
    assert.equal(flagged(after).length, 1, after.stdout);
    assert.equal(after.status, 1);
    assert.deepEqual(flagged(run({scenario: {exports: {...crowded, calendar}}, env: LOGIN, now: "2026-09-07T12:00:00Z"})), []);
    // without the calendar (MFL shows it only to a member), from week 1; a renewed league's calendar
    // may still hold last season's date
    assert.deepEqual(flagged(run({scenario: {exports: {...crowded, calendar}}, now: preseason})), []);
    assert.deepEqual(flagged(run({scenario: {exports: crowded}, env: LOGIN, now: preseason})), []);
    const stale = {event: [{...calendar.event[0], start_time: String(at("2025-09-08T04:59:00Z"))}]};
    assert.deepEqual(flagged(run({scenario: {exports: {...crowded, calendar: stale}}, env: LOGIN, now: preseason})), []);
});

test("when the season's phase can't be told, the League Alerts checks are skipped and a team over 30 is still held", () => {
    const crowded = league();
    for (let i = 0; i < 8; i++) {
        crowded.players.player.push({id: String(400 + i), name: `Player, Extra${i}`, position: "WR", team: "BUF"});
        crowded.rosters.franchise[0].player.push({id: String(400 + i), salary: "1", contractYear: "1", status: "ROSTER"});
    }
    const result = run({scenario: {exports: crowded, nflSchedule: 500}, env: {...LOGIN, DROP_PENALTIES: "apply"}});
    assert.equal(result.status, 1);
    assert.ok(result.entries.some((entry) => /^Couldn't tell where the 2026 season is \(.*\); the League Alerts checks were skipped, and teams over 30 are held\.$/.test(entry)), result.entries.join("\n"));
    assert.ok(!result.entries.some((entry) => /over the roster limit/.test(entry)));
    // Alpha, over 30, keeps Mixon's penalty held; Beta's is charged
    assert.deepEqual(imports(result).map((data) => data.TYPE), ["salaryAdj", "salaries"]);
    assert.match(imports(result)[0].DATA, /franchise_id="0002"/);
});

test("v1's lib is refused: it lacks what the job needs", () => {
    const result = run({scenario: {exports: league()}, env: {...LOGIN, DROP_PENALTIES: "apply", RULES_VERSION: "v1"}});
    assert.equal(result.status, 1);
    assert.match(result.stderr, /from v2 on/);
    assert.deepEqual(imports(result), []);
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

// weeks 1..`weeks` scored: Alpha's high score through week 10, Beta's after; week 2 a tie
function scoredWeeks(weeks) {
    return {weeklyResults: Array.from({length: 17}, (_, i) => {
        const week = i + 1;
        const scores = week > weeks ? [{id: "0001"}, {id: "0002"}]
            : [{id: "0001", score: week <= 10 ? "120" : "90"}, {id: "0002", score: week === 2 ? "120" : week <= 10 ? "100" : "130"}];
        return {week: String(week), matchup: [{franchise: scores}]};
    })};
}
const payoutEntries = (result) => result.entries.filter((entry) => /^Payouts|would record|^Recorded /.test(entry));
const handWeek1 = {entry: [{franchise_id: "0001", amount: "15", description: "Most Points Week 1"}]};

test("payouts: each week's high score once the next week has kicked off, logged in a dry run and recorded when applied", () => {
    // week 7 is under way at MID_SEASON, so week 6 is the last final one; week 1 was entered by hand
    const exports = {...league(), "weeklyResults:YTD": scoredWeeks(7), accounting: handWeek1};
    const dry = run({scenario: {exports}, env: LOGIN});
    assert.equal(dry.status, 0, dry.stderr);
    assert.deepEqual(payoutEntries(dry), [
        "Dry run: would record \"Most Points Week 2\" $7.50 to Alpha.",
        "Dry run: would record \"Most Points Week 2\" $7.50 to Beta.",
        ...[3, 4, 5, 6].map((week) => `Dry run: would record "Most Points Week ${week}" $15.00 to Alpha.`)
    ]);
    assert.deepEqual(imports(dry), []);
    const applied = run({scenario: {exports}, env: {...LOGIN, PAYOUTS: "apply"}});
    assert.equal(applied.status, 0, applied.stderr);
    const posted = imports(applied);
    assert.equal(posted.length, 6);
    // the accounting import takes its fields as parameters, not DATA
    assert.deepEqual(posted[0], {TYPE: "accounting", L: "48571", FRANCHISE: "0001", AMOUNT: "7.5", DESCRIPTION: "Most Points Week 2"});
    assert.deepEqual(payoutEntries(applied)[5], "Recorded \"Most Points Week 6\" $15.00 to Alpha.");
    // without the login the accounting isn't read, and nothing is recorded
    const anonymous = run({scenario: {exports}, env: {PAYOUTS: "apply"}});
    assert.deepEqual(payoutEntries(anonymous), []);
    assert.ok(!anonymous.requests.some((request) => /TYPE=accounting/.test(request.url)));
});

test("payouts: all-play and the places once the championship week is final, or a flag if there's no pot", () => {
    const weeklyPaid = {entry: [
        {franchise_id: "0001", amount: "150", description: "Most points weeks 1,2,3,4,5,6,7,8,9,10"},
        {franchise_id: "0002", amount: "60", description: "Most points weeks 11,12,13,14"}
    ]};
    const game = (home, away) => ({playoffRound: [{week: "17", playoffGame: [{home: {franchise_id: home[0], points: home[1]}, away: {franchise_id: away[0], points: away[1]}}]}]});
    const exports = {
        ...league(),
        "weeklyResults:YTD": scoredWeeks(17),
        playoffBrackets: {playoffBracket: [{id: "1", bracketWinnerTitle: "League Champion"}, {id: "2", name: "3rd Place Game"}]},
        "playoffBracket:1": game(["0002", "90"], ["0001", "120"]),
        "playoffBracket:2": game(["0003", "100"], ["0004", "80"])
    };
    // week 18 kicks off 8 Jan 2027; all-play 9-4-1 (week 2 a tie) pays Alpha $3.75, leaving $800 of a $1,013.75 pot
    const after = "2027-01-09T12:00:00Z";
    const pot = {franchise_id: "0000", amount: "1013.75", description: "Entry Fees"};
    const result = run({scenario: {exports: {...exports, accounting: {entry: [...weeklyPaid.entry, pot]}}}, env: LOGIN, now: after});
    assert.deepEqual(payoutEntries(result), [
        "Dry run: would record \"All-play (9-4-1)\" $3.75 to Alpha.",
        "Dry run: would record \"1st Place\" $440.00 to Alpha.",
        "Dry run: would record \"2nd Place\" $240.00 to Beta.",
        "Dry run: would record \"3rd Place\" $120.00 to 0003."
    ]);
    const noPot = run({scenario: {exports: {...exports, accounting: weeklyPaid}}, env: LOGIN, now: after});
    assert.equal(noPot.status, 1);
    assert.deepEqual(payoutEntries(noPot), [
        "Payouts: the places can't be recorded: the accounting has no league-wide entries, so there's no pot to split. Left for the commissioner.",
        "Dry run: would record \"All-play (9-4-1)\" $3.75 to Alpha."
    ]);
});

test("payouts: without the login, or with the places recorded, MFL isn't asked for what isn't needed", () => {
    const exports = {...league(), "weeklyResults:YTD": scoredWeeks(17), accounting: {entry: [
        {franchise_id: "0001", amount: "150", description: "Most points weeks 1,2,3,4,5,6,7,8,9,10"},
        {franchise_id: "0002", amount: "60", description: "Most points weeks 11,12,13,14"},
        {franchise_id: "0001", amount: "3.75", description: "All-play (9-4-1)"},
        ...["1st", "2nd", "3rd"].map((place) => ({franchise_id: "0001", amount: "1", description: `${place} Place`}))
    ]}};
    const asked = (result, type) => result.requests.some((request) => request.url.includes(`TYPE=${type}`));
    const done = run({scenario: {exports}, env: LOGIN, now: "2027-01-09T12:00:00Z"});
    assert.equal(done.status, 0, done.stderr);
    assert.deepEqual(payoutEntries(done), []);
    assert.ok(asked(done, "accounting") && !asked(done, "playoffBrackets"));
    const anonymous = run({scenario: {exports}, now: "2027-01-09T12:00:00Z"});
    assert.ok(!asked(anonymous, "accounting") && !anonymous.requests.some((request) => /W=YTD/.test(request.url)));
});

const DRY = {DRY_RUN: "true", DATA_LEAGUE_ID: "48571"};
const ALL_APPLY = {DROP_PENALTIES: "apply", CONTRACT_YEARS: "apply", PAYOUTS: "apply"};

test("a dry run writes nothing, with every chore set to apply and work for each", () => {
    const result = run({
        scenario: {exports: {...withAdds(league()), ...scoredWeeks(9), accounting: {}}, waivers: waiversPage("2 years")},
        env: {...DRY, ...LOGIN, ...ALL_APPLY},
        now: "2026-12-01T12:00:00Z",
        files: {}
    });
    assert.deepEqual(imports(result), []);
    assert.ok(!result.requests.some((request) => request.url.includes("/import")));
    assert.deepEqual(result.output, {changed: "false", publish: "false"});
    assert.ok(!existsSync(join(result.dataDir, "chore-log.md")));
    assert.ok(!existsSync(join(result.dataDir, "data")));
    assert.match(result.stdout, /Dry run: would charge/);
    assert.match(result.stdout, /Dry run: would set/);
    assert.match(result.stdout, /Dry run: would record/);
    assert.match(result.stdout, /Dry run: would take the 2026 franchise salary snapshot/);
    assert.match(result.summary, /^## Daily chores \(dry run\): /);
    assert.match(result.summary, /League 48571, the 2026 season, v2's rules.*writes to MFL weren't tested/);
});

test("without DRY_RUN, a run's settings are ignored and an unlisted league is still refused", () => {
    const refused = run({env: {DRY_RUN: "false", MFL_LEAGUE_ID: "99999", MFL_SETTINGS: '{"wordmark": "X"}'}});
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /League 99999 isn't listed/);
    const real = run({env: {DRY_RUN: "false", MFL_SETTINGS: "not json", DROP_PENALTIES: "apply", ...LOGIN}});
    assert.ok(imports(real).length);
});

test("a dry run may name an unlisted league, and takes its settings", () => {
    const over = league({alphaSalary: 150});
    const plain = run({scenario: {exports: over}, env: {...DRY, MFL_LEAGUE_ID: "99999"}});
    assert.equal(plain.status, 0, plain.stdout);
    const capped = run({scenario: {exports: over}, env: {...DRY, MFL_LEAGUE_ID: "99999", MFL_SETTINGS: '{"salaryCap": 100}'}});
    assert.equal(capped.status, 1, capped.stderr);
    assert.match(capped.stdout, /Over the cap: Alpha/);
    assert.match(capped.summary, /with the settings \{"salaryCap": 100\}/);
});

test("a dry run refuses settings it can't use, and any on a listed league", () => {
    const cases = [
        [{MFL_LEAGUE_ID: "99999", MFL_SETTINGS: "not json"}, /settings line must be an object/],
        [{MFL_LEAGUE_ID: "99999", MFL_SETTINGS: "null"}, /settings line must be an object/],
        [{MFL_LEAGUE_ID: "99999", MFL_SETTINGS: '{"nope": 1}'}, /nope isn't a setting/],
        [{MFL_SETTINGS: '{"wordmark": "X"}'}, /League 48571 is listed/]
    ];
    for (const [env, message] of cases) {
        const result = run({env: {...DRY, ...env}});
        assert.equal(result.status, 1, JSON.stringify(env));
        assert.match(result.stderr, message);
        assert.equal(result.requests.length, 0);
    }
});

test("a dry run's host, version and time are checked before anything is sent", () => {
    const cases = [
        [{MFL_LEAGUE_ID: " 48571"}, /league must be its id/],
        [{MFL_HOST: "https://example.com"}, /host must be on myfantasyleague\.com/],
        [{MFL_HOST: "https://myfantasyleague.com.example.com"}, /host must be on myfantasyleague\.com/],
        [{RULES_VERSION: "../../x"}, /RULES_VERSION must name a version/],
        [{NOW: "soon"}, /NOW must be an ISO time/],
        [{SEASON: "last"}, /SEASON a year/]
    ];
    for (const [env, message] of cases) {
        const result = run({env: {...DRY, ...LOGIN, ...env}});
        assert.equal(result.status, 1, JSON.stringify(env));
        assert.match(result.stderr, message);
        assert.equal(result.requests.length, 0);
    }
});

test("a dry run on a league the login isn't in sends it no session, and says what wasn't checked", () => {
    const result = run({
        scenario: {exports: withAdds(league())},
        env: {...DRY, ...LOGIN, MFL_LEAGUE_ID: "99999"}
    });
    assert.equal(result.status, 0, result.stdout);
    const league99999 = result.requests.filter((request) => request.url.includes("L=99999"));
    assert.ok(league99999.length);
    const afterLogin = result.requests.slice(result.requests.findIndex((request) => request.url.includes("/login")));
    assert.ok(afterLogin.filter((request) => request.url.includes("www44.")).every((request) => request.cookie === null));
    assert.ok(!result.requests.some((request) => /TYPE=(messageBoard|calendar|accounting)/.test(request.url)));
    assert.match(result.summary, /Public data only.*Contract years, payouts and the final cut-down date weren't checked/);
    assert.match(result.summary, /Contract years: not checked for 2 added player\(s\)/);
});

test("a dry run on a league the login is in uses the session", () => {
    const result = run({
        scenario: {myLeagues: ["48571", "99999"], exports: {...withAdds(league()), accounting: {}, weeklyResults: {}}, waivers: waiversPage("2 years")},
        env: {...DRY, ...LOGIN, MFL_LEAGUE_ID: "99999"}
    });
    assert.ok(result.requests.some((request) => request.url.includes("TYPE=messageBoard") && request.cookie));
    assert.doesNotMatch(result.summary, /Public data only/);
});

test("a dry run in a league the login is in but doesn't run fails on what MFL won't show it, like the real job", () => {
    const result = run({
        scenario: {myLeagues: ["99999"], exports: {...league(), ...scoredWeeks(9), accounting: 403}},
        env: {...DRY, ...LOGIN, MFL_LEAGUE_ID: "99999"}
    });
    assert.equal(result.status, 1);
    assert.match(result.summary, /Payouts: /);
    assert.doesNotMatch(result.summary, /Public data only/);
});

test("a dry run on the real league goes by its snapshots; another league's aren't taken for its own", () => {
    const after = "2026-12-01T12:00:00Z";
    const files = {"data/franchise-2025.json": SNAPSHOT_2025, "data/franchise-2026.json": '{"season":2026}\n'};
    const own = run({env: DRY, files, now: after});
    assert.match(own.stdout, /The 2026 franchise snapshot already exists/);
    assert.match(own.stdout, /Dry run: would publish snapshots.*franchise-2026\.json/);
    assert.deepEqual(own.output, {changed: "false", publish: "false"});
    const other = run({env: {...DRY, MFL_LEAGUE_ID: "99999"}, files, now: after});
    assert.doesNotMatch(other.stdout, /already exists/);
    assert.match(other.stdout, /Dry run: would take the 2026 franchise salary snapshot/);
    assert.doesNotMatch(other.stdout, /would publish/);
    assert.ok(!other.requests.some((request) => request.url.includes("github.io")));
});

test("a dry run keeps the real job's limits on how much it would write", () => {
    const players = Array.from({length: 8}, (_, i) => ({id: String(400 + i), name: `Dropped, Player${i}`, position: "WR", team: "BUF"}));
    const exports = league();
    exports.players.player.push(...players);
    exports.transactions.transaction.push(...players.map((player) => ({type: "FREE_AGENT", franchise: "0002", transaction: `|${player.id},`, timestamp: String(DROPPED)})));
    exports.freeAgents.leagueUnit.player.push(...players.map((player) => ({id: player.id, salary: "1", contractYear: "1"})));
    const result = run({scenario: {exports}, env: DRY});
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.summary, /Cap chores: \d+ dropped players owe a cap penalty, more than the/);
    const real = run({scenario: {exports}});
    assert.equal(real.status, 0, real.stdout);
});

// each per-run limit stops a misread export from writing at scale: nothing is sent and the run fails
test("more contract years than a day's limit: none set", () => {
    const exports = league();
    const beta = exports.rosters.franchise[1].player;
    for (let i = 0; i < 16; i++) {
        const id = String(500 + i);
        exports.players.player.push({id, name: `Added, Player${i}`, position: "WR", team: "BUF"});
        beta[i + 1] = {id, salary: "1", contractYear: "0", status: "ROSTER"};
        exports.transactions.transaction.push({type: "FREE_AGENT", franchise: "0002", transaction: `${id},|`, timestamp: String(ADDED)});
    }
    Object.assign(exports, {messageBoard: {thread: []}, messageBoardThread: {post: []}});
    const result = run({scenario: {exports}, env: {...LOGIN, CONTRACT_YEARS: "apply"}});
    assert.equal(result.status, 1);
    assert.ok(result.entries.some((entry) => /^Contract years: 16 added players are waiting for contract years, more than the 15 expected in a day, so none were set\./.test(entry)), result.entries.join("\n"));
    assert.ok(!imports(result).some((data) => data.TYPE === "salaries"));
});

test("more default lengths than a quarter of the rostered players: none set", () => {
    const exports = league();
    exports.rosters.franchise.forEach((team) => team.player.slice(0, 7).forEach((player) => Object.assign(player, {contractYear: "0", salary: "2"})));
    Object.assign(exports, {
        messageBoard: {thread: []},
        calendar: {event: [{type: "CUSTOM", start_time: String(at("2026-09-08T23:00:00Z")), title: "Final cut-down"}]}
    });
    const result = run({scenario: {exports}, env: {...LOGIN, CONTRACT_YEARS: "apply"}, now: "2026-09-11T12:00:00Z"});
    assert.equal(result.status, 1);
    assert.ok(result.entries.some((entry) => /14 of 46 rostered players would get the default 1 year, more than expected, so no lengths were set/.test(entry)), result.entries.join("\n"));
    assert.ok(!imports(result).some((data) => data.TYPE === "salaries"));
});

test("more payouts than a run's limit: none recorded", () => {
    // every regular season week a three-way tie: 42 weekly records once week 15 has kicked off
    const weeklyResults = Array.from({length: 17}, (_, i) => ({week: String(i + 1), matchup: [{franchise: ["0001", "0002", "0003"].map((id) => ({id, score: "100"}))}]}));
    const exports = {...league(), "weeklyResults:YTD": {weeklyResults}, accounting: {entry: []}};
    const result = run({scenario: {exports}, env: {...LOGIN, PAYOUTS: "apply"}, now: "2026-12-19T12:00:00Z"});
    assert.equal(result.status, 1);
    assert.ok(result.entries.some((entry) => /payouts are waiting to be recorded, more than the 30 expected, so none were/.test(entry)), result.entries.join("\n"));
    assert.ok(!imports(result).some((data) => data.TYPE === "accounting"));
});

test("the login's leagues are recognized by their address too", () => {
    const result = run({
        scenario: {myLeagues: [], leagueUrls: ["https://www44.myfantasyleague.com/2026/home/99999"], exports: league()},
        env: {...DRY, ...LOGIN, MFL_LEAGUE_ID: "99999"}
    });
    assert.doesNotMatch(result.summary, /Public data only/);
});

test("a dry run on a league new this season doesn't need a site for last season", () => {
    const result = run({scenario: {seasons: [2026]}, env: {...DRY, MFL_LEAGUE_ID: "99999"}, now: "2026-12-01T12:00:00Z"});
    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /Dry run: would take the 2026 franchise salary snapshot/);
});

test("a dry run fails on a flag, as the real job does", () => {
    const result = run({scenario: {exports: league({alphaSalary: 290})}, env: DRY});
    assert.equal(result.status, 1);
    assert.match(result.stdout, /::error title=Daily chores need attention::/);
    assert.match(result.summary, /Needs attention/);
    assert.deepEqual(result.output, {changed: "false", publish: "false"});
});

test("the team icons' stills are made, committed and published, from wherever the pictures are", async () => {
    const red = await sharp({create: {width: 40, height: 20, channels: 3, background: "#ff0000"}}).png().toBuffer();
    const exports = league();
    exports.league.franchises.franchise[0].icon = "https://www44.myfantasyleague.com/fflnetdynamic2026/48571_franchise_icon0001.png";
    exports.league.franchises.franchise[1].icon = "https://pictures.example/beta.gif";
    const pictures = {
        "https://www44.myfantasyleague.com/fflnetdynamic2026/48571_franchise_icon0001.png": {base64: red.toString("base64"), etag: '"a1"'},
        "https://pictures.example/beta.gif": 404
    };
    const env = {...LOGIN, MFL_USER_AGENT: "registered-name"};
    const first = run({scenario: {exports, pictures}, env});
    assert.equal(first.status, 0, first.stdout);
    assert.ok(first.entries.includes("Updated the team icons of Alpha."), first.entries.join("\n"));
    assert.match(first.stdout, /Couldn't make Beta's icon from https:\/\/pictures\.example\/beta\.gif \(HTTP 404\)/);
    assert.ok(existsSync(join(first.dataDir, "data", "icons", "0001.webp")));
    assert.deepEqual(first.output, {changed: "true", publish: "true"});
    // neither the session nor the name registered with MFL goes with a picture's request
    const asked = first.requests.filter((request) => request.url in pictures);
    assert.equal(asked.length, 2);
    assert.ok(asked.every((request) => request.cookie === null && request.userAgent === "fuadmflsite-icons (github.com/bborchardt/fuadmflsite)"));

    // the next day, with the still published: nothing to do
    const still = readFileSync(join(first.dataDir, "data", "icons", "0001.webp"));
    const next = run({
        scenario: {exports, pictures, published: {"franchise-2025.json": SNAPSHOT_2025, "icons/0001.webp": {base64: still.toString("base64")}}},
        env,
        files: {"data/franchise-2025.json": SNAPSHOT_2025, "data/icons/0001.webp": still, "icon-sources.json": readFileSync(join(first.dataDir, "icon-sources.json"), "utf8")}
    });
    assert.equal(next.requests.find((request) => request.url.endsWith("icon0001.png")).ifNoneMatch, '"a1"');
    assert.ok(!next.entries.some((entry) => /team icons/.test(entry)));
    assert.equal(next.output.publish, "false");
    // a still on league-data the site doesn't have yet is published
    const unpublished = run({scenario: {exports, pictures}, env, files: {"data/franchise-2025.json": SNAPSHOT_2025, "data/icons/0001.webp": still, "icon-sources.json": readFileSync(join(first.dataDir, "icon-sources.json"), "utf8")}});
    assert.equal(unpublished.output.publish, "true");
    // a dry run makes none
    const dry = run({scenario: {exports, pictures}, env: {...env, ...DRY}});
    assert.match(dry.summary, /- Dry run: would update the team icons of Alpha\./);
    assert.ok(!existsSync(join(dry.dataDir, "data", "icons")));
});

test("RFA salaries: after the rollover and before week 1, players gone from 1 year to 0 are set to $0.01", () => {
    // 2027, renewed; Alpha's 100 went from 1 year to 0, Beta's 200 too after a trade from Alpha; 101 is
    // already at $0.01, 102 went from 2 to 1, and 900 is a rookie
    const last = league();
    const exports = league();
    const alpha = exports.rosters.franchise[0].player;
    const beta = exports.rosters.franchise[1].player;
    Object.assign(alpha[0], {contractYear: "0"});
    Object.assign(alpha[1], {contractYear: "0", salary: "0.01"});
    Object.assign(beta[0], {contractYear: "0", salary: "3"});
    last.rosters.franchise[1].player[0].salary = "3";
    last.rosters.franchise[0].player[2].contractYear = "2";
    alpha.push({id: "900", salary: "2", contractYear: "0", status: "ROSTER"});
    exports.players.player.push({id: "900", name: "Rookie, Some", position: "WR", team: "BUF"});
    // last season's 1-year players since: 103 dropped and won back by Beta at the same $1, waiting
    // for his years; 104 re-signed at $6
    const won = alpha.splice(3, 1)[0];
    beta.push({...won, contractYear: "0"});
    exports.transactions.transaction.push({type: "BBID_WAIVER", franchise: "0002", transaction: "103,|1.00|", timestamp: String(at("2027-03-30T12:00:00Z"))});
    Object.assign(alpha[3], {contractYear: "0", salary: "6"});
    const scenario = {seasons: [2026, 2027], exports: {...exports, "rosters@2026": last.rosters, "weeklyResults:YTD": {}}, published: {}};
    const rfaEntries = (result) => result.entries.filter((entry) => /RFA/.test(entry));
    const spring = "2027-04-01T12:00:00Z";

    const dry = run({scenario, now: spring, files: {}});
    assert.deepEqual(rfaEntries(dry), [
        "Dry run: would set RFA A0 Player (Alpha) to $0.01.",
        "Dry run: would set RFA B0 Player (Beta) to $0.01."
    ]);
    const applied = run({scenario, env: {...LOGIN, RFA_SALARIES: "apply"}, now: spring, files: {}});
    assert.deepEqual(rfaEntries(applied), ["Set RFA A0 Player (Alpha) to $0.01.", "Set RFA B0 Player (Beta) to $0.01."]);
    const posted = imports(applied).filter((body) => body.TYPE === "salaries" && /0\.01/.test(body.DATA));
    assert.deepEqual(posted.map((body) => [body.APPEND, body.DATA]), [["1",
        '<salaries><leagueUnit unit="LEAGUE"><player id="100" salary="0.01" contractYear="0"/><player id="200" salary="0.01" contractYear="0"/></leagueUnit></salaries>']]);
    assert.deepEqual(JSON.parse(readFileSync(join(applied.dataDir, "rfa-salaries.json"), "utf8")), {2027: ["100", "200"]});
    // one set before is settled since: 100 kept at the auction for $1, last season's salary too
    const kept = run({scenario, env: {...LOGIN, RFA_SALARIES: "apply"}, now: spring, files: {"rfa-salaries.json": JSON.stringify({2027: ["100"]})}});
    assert.deepEqual(rfaEntries(kept), ["Set RFA B0 Player (Beta) to $0.01."]);
    assert.deepEqual(JSON.parse(readFileSync(join(kept.dataDir, "rfa-salaries.json"), "utf8")), {2027: ["100", "200"]});

    // a league in its first season (or a test league without last season) has no RFAs, and isn't flagged
    const first = run({scenario: {...scenario, seasons: [2027]}, env: {...LOGIN, RFA_SALARIES: "apply"}, now: spring, files: {}});
    assert.deepEqual(rfaEntries(first), []);
    assert.match(first.stdout, /The league has no 2026 site, so it has no RFAs\./);
    assert.ok(!/RFA salaries:/.test(first.summary), first.summary);

    // once week 1 has kicked off, nothing
    const fall = run({scenario, env: {...LOGIN, RFA_SALARIES: "apply"}, now: "2027-09-20T12:00:00Z", files: {}});
    assert.deepEqual(rfaEntries(fall), []);
    assert.match(fall.stdout, /Week 1 has kicked off; RFA salaries are set only before it\./);

    // most of the league at 0 looks like a misread: none set, and a flag
    const misread = structuredClone(scenario);
    misread.exports.rosters.franchise.forEach((team) => team.player.forEach((player) => {
        player.contractYear = "0";
    }));
    const flagged = run({scenario: misread, env: {...LOGIN, RFA_SALARIES: "apply"}, now: spring, files: {}});
    assert.equal(flagged.status, 1);
    assert.match(flagged.summary, /RFA salaries: 4\d of 47 rostered players look like RFAs/);
    assert.ok(!imports(flagged).some((body) => /0\.01/.test(body.DATA || "")));
});

test("offseason lengths: read from the form's posts only, flagged past the cut-down, 1 year from week 1", () => {
    // draft day: Alpha's A0–A2 and Beta's B0 at 0 years with a salary; Alpha posted A0 and A1 with the
    // form, Beta by hand
    const exports = league();
    const [alpha, beta] = exports.rosters.franchise.map((team) => team.player);
    alpha.slice(0, 3).forEach((player) => Object.assign(player, {contractYear: "0", salary: "2"}));
    Object.assign(beta[0], {contractYear: "0", salary: "5"});
    const posted = at("2026-09-01T18:00:00Z");
    const formBody = "Contract lengths, sent from the league site:<br />Player, A0 BUF WR: 3 years<br />Player, A1 BUF WR: 1 year";
    Object.assign(exports, {
        messageBoard: {thread: [{id: "8001", subject: "Rosters loaded, contract lengths due", lastPostTime: String(posted)}, {id: "8002", subject: "Trade talk", lastPostTime: String(posted)}]},
        messageBoardThread: {post: [
            {franchise: "0001", postTime: String(posted), body: formBody},
            {franchise: "0002", postTime: String(posted), body: "B0 - 2 years"}
        ]},
        calendar: {event: [{type: "CUSTOM", start_time: String(at("2026-09-08T23:00:00Z")), title: "Final cut-down"}]}
    });
    const lengthEntries = (result) => result.entries.filter((entry) => /would set|^Set |Contract lengths/.test(entry));
    const draftWeek = "2026-09-02T12:00:00Z";

    const dry = run({scenario: {exports}, env: LOGIN, now: draftWeek});
    assert.deepEqual(lengthEntries(dry), [
        "Contract lengths: Beta posted lengths without the form, which the job doesn't read: \"B0 - 2 years\". Set them by hand, or ask them to use the form.",
        "Dry run: would set A0 Player (Alpha) to 3 years (the form).",
        "Dry run: would set A1 Player (Alpha) to 1 year (the form)."
    ]);
    assert.equal(dry.status, 1);
    // only topics about contracts are read
    assert.deepEqual(dry.requests.filter((request) => /TYPE=messageBoardThread/.test(request.url)).map((request) => new URL(request.url).searchParams.get("THREAD")), ["8001"]);

    const applied = run({scenario: {exports}, env: {...LOGIN, CONTRACT_YEARS: "apply"}, now: draftWeek});
    assert.deepEqual(imports(applied).filter((body) => body.TYPE === "salaries").map((body) => body.DATA), [
        '<salaries><leagueUnit unit="LEAGUE"><player id="100" salary="2" contractYear="3"/><player id="101" salary="2" contractYear="1"/></leagueUnit></salaries>'
    ]);

    // past the cut-down, what's missing is flagged, for the late penalty
    const late = run({scenario: {exports}, env: LOGIN, now: "2026-09-09T12:00:00Z"});
    assert.ok(late.entries.includes("Contract lengths: Alpha has 1 player(s) without a length since the cut-down date: A2 Player. Charge the late penalty by hand (bylaw 12.6)."));
    assert.ok(late.entries.includes("Contract lengths: Beta has 1 player(s) without a length since the cut-down date: B0 Player. Charge the late penalty by hand (bylaw 12.6)."));

    // from week 1's kickoff, 1 year for what's missing
    const kicked = run({scenario: {exports}, env: LOGIN, now: "2026-09-11T12:00:00Z"});
    assert.ok(kicked.entries.includes("Dry run: would set A2 Player (Alpha) to 1 year (none by week 1: the default)."));
    assert.ok(kicked.entries.includes("Dry run: would set B0 Player (Beta) to 1 year (none by week 1: the default)."));
    assert.ok(kicked.entries.includes("Dry run: would set A0 Player (Alpha) to 3 years (the form)."));

    // one added after the cut-down date owes his within the hour, as in season: never late for the form
    const added = structuredClone(exports);
    added.transactions.transaction.push({type: "FREE_AGENT", franchise: "0001", transaction: "102,|", timestamp: String(at("2026-09-09T12:00:00Z"))});
    const after = run({scenario: {exports: added, waivers: waiversPage("")}, env: LOGIN, now: "2026-09-09T18:00:00Z"});
    assert.ok(!after.entries.some((entry) => /late penalty.*A2 Player/.test(entry)), after.entries.join("\n"));
    assert.ok(after.entries.some((entry) => /A2 Player.*default/.test(entry) && !/week 1/.test(entry)), after.entries.join("\n"));
});

test("offseason lengths: an add before week 1 waits for the form, not the hour", () => {
    // Olave and Waddle added in the offseason, nothing posted: no default at the hour
    const exports = {...withAdds(league()), messageBoard: {thread: []}};
    exports.transactions.transaction.forEach((transaction) => {
        transaction.timestamp = String(at("2026-08-20T12:00:00Z"));
    });
    const result = run({scenario: {exports, waivers: waiversPage("")}, env: LOGIN, now: "2026-08-25T12:00:00Z"});
    assert.ok(!result.entries.some((entry) => /Olave|Waddle/.test(entry)), result.entries.join("\n"));
});

// Week 6 (from 15 Oct): Beta starts Tyler Warren (TE, IND, Thursday's game) and B0 Player, and posted
// "If Tyler Warren is out, start Josh Allen" (QB, BUF, Sunday) the day before; nflverse has Warren
// inactive. The league starts 2: QB 0-1, WR 0-2, TE 0-1.
const WEEK6 = WEEK1 + 5 * 7 * 86400;
// `saved`: MFL's result once the week is recalculated; `details`: Lineup Details' rows after Beta's own
function backups({post = "If Tyler Warren is out, start Josh Allen", warrenScore = "0", saved = "13589,200,", details = "", teams = [["IND", "KCC"], ["BUF"]]} = {}) {
    const base = league();
    const roster = structuredClone(base.rosters);
    roster.franchise[1].player.push({id: "17102", salary: "1", contractYear: "1", status: "ROSTER"}, {id: "13589", salary: "1", contractYear: "1", status: "ROSTER"});
    const exports = {
        ...base,
        players: {player: [...base.players.player, {id: "17102", name: "Warren, Tyler", position: "TE", team: "IND"}, {id: "13589", name: "Allen, Josh", position: "QB", team: "BUF"}]},
        league: {...base.league, starters: {count: "2", position: [{name: "QB", limit: "0-1"}, {name: "WR", limit: "0-2"}, {name: "TE", limit: "0-1"}]}},
        messageBoard: {thread: [{id: "8001", subject: "Conditional starters", lastPostTime: String(WEEK6 - 86400)}]},
        "rosters:6": roster,
        "nflSchedule:6": {week: "6", matchup: teams.map((ids, i) => ({kickoff: String(WEEK6 + i * 3 * 86400), team: ids.map((id) => ({id}))}))},
        "playerScores:6": {playerScore: [{id: "17102", score: warrenScore}]},
        "weeklyResults:6": {matchup: [{franchise: [{id: "0002", starters: "17102,200,"}]}]}
    };
    const fixture = (name) => readFileSync(join(root, "tests", "fixtures", "backups", name), "utf8");
    const box = (pos, id, checked) => `<input type="checkbox" name="${pos}0002" value="${id}"${checked ? ' checked="checked"' : ""}>`;
    return {
        exports,
        recalculated: {"weeklyResults:6": {matchup: [{franchise: [{id: "0002", starters: saved}]}]}},
        files: {
            "https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_2026.csv": fixture("roster_weekly.csv"),
            "https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv": fixture("db_playerids.csv")
        },
        pages: {
            "/2026/mb/topic_show.pl?bid=202648571&tid=8001": `<div class='frm pst' id='pid1'><table><tr class="oddtablerow"><td class="poster"><a href='/2026/options?L=48571&amp;F=0002&amp;O=01'>Beta</a></td><td class="message"><span class='htt'>Date</span> Wed Oct 14 9:00:00 a.m. CT 2026</td></tr><tr class="eventablerow"><td class="poster"></td><td class="message">${post}</td></tr></table></div>`,
            "/2026/options?L=48571&O=210&FRANCHISE=0002&W=6": `<table class="report"><tr><th>Date/Time Lineup Submitted</th></tr><tr class="oddtablerow"><td class="week">6</td><td></td><td>Warren, Tyler IND TE, Player, B0 BUF WR</td><td></td><td>Wed Oct 14 9:05:00 a.m. CT 2026</td></tr>${details}</table>`,
            "/2026/lineup?L=48571&WEEK=6&F=0002": `<form action="https://www44.myfantasyleague.com/2026/lineup" method="post"><input type="hidden" name="FRANCHISE" value="0002"><input type="hidden" name="LEAGUE_ID" value="48571"><input type="hidden" name="WEEK" value="6"><input type="hidden" name="FORM" value="1"><input type="hidden" name="lineup_expires" value="1">${box("QB", "13589")}${box("WR", "200", true)}${box("TE", "17102", true)}<textarea name="MESSAGE0002"></textarea><input type="submit" name="SUBMIT" value="Submit Lineup"></form>`,
            "/2026/csetup?L=48571&C=RECALC": `<form action="csetup" method="post"><input type="hidden" name="form_name" value="recalc"><input type="hidden" name="LEAGUE_ID" value="48571"><input type="hidden" name="C" value="RECALC"><input type="hidden" name="input_expires" value="1"><select name="WEEK"><option value="6">Week 6</option></select></form>`
        }
    };
}
// a season the chore has run in, from week 1
const BACKUP_FILES = {"data/franchise-2025.json": SNAPSHOT_2025, "backup-starters.json": "{\"2026\": []}\n"};
const posted = (result, page) => result.requests.filter((request) => request.method === "POST" && new URL(request.url).pathname === `/2026/${page}`)
    .map((request) => [...new URLSearchParams(request.body)]);

test("backup starters: an inactive starter's backup goes in, the week is recalculated and settled, nothing posted", () => {
    const result = run({scenario: backups(), files: BACKUP_FILES, env: {...LOGIN, BACKUP_STARTERS: "apply"}});
    assert.equal(result.status, 0, result.stdout);
    const lineup = posted(result, "lineup");
    assert.equal(lineup.length, 1);
    assert.deepEqual(lineup[0].filter(([name]) => /^(QB|WR|TE)0002$/.test(name)), [["QB0002", "13589"], ["WR0002", "200"]]);
    assert.deepEqual(Object.fromEntries(posted(result, "csetup")[0]), {form_name: "recalc", LEAGUE_ID: "48571", C: "RECALC", input_expires: "1",
        WEEK: "6", SENDMAIL: "No", PREVWEEK: "No", SUBMIT: "Recalculate Standings"});
    // the forms as the commissioner, the session's own cookie with MFL's
    assert.ok(result.requests.filter((request) => request.method === "POST" && /\/(lineup|csetup)$/.test(request.url))
        .every((request) => request.cookie === "MFL_USER_ID=abc+def=; MFL_IS_COMMISH=yes"));
    assert.deepEqual(imports(result).filter((each) => each.TYPE === "messageBoard"), []);
    assert.ok(result.entries.includes("Backup starters: set Beta's week 6 lineup and recalculated the week: Josh Allen started for Tyler Warren, who was inactive."), result.entries.join("\n"));
    // weeks 1-5, over without backups, are settled with it
    assert.deepEqual(JSON.parse(readFileSync(join(result.dataDir, "backup-starters.json"), "utf8")), {2026: [1, 2, 3, 4, 5, 6]});
    assert.equal(result.output.changed, "true");

    // settled: not read again
    const again = run({scenario: backups(), env: {...LOGIN, BACKUP_STARTERS: "apply"}, files: {"data/franchise-2025.json": SNAPSHOT_2025, "backup-starters.json": "{\"2026\": [1, 2, 3, 4, 5, 6]}\n"}});
    assert.equal(again.status, 0, again.stdout);
    assert.ok(!again.requests.some((request) => /O=210|\/lineup|csetup/.test(request.url)));
});

test("backup starters: a run that set the lineup but failed before recalculating is finished by the next", () => {
    const details = `<tr class="eventablerow"><td class="week">6</td><td>(C)</td><td>Allen, Josh BUF QB, Player, B0 BUF WR</td><td></td><td>Tue Oct 20 2:40:00 a.m. CT 2026</td></tr>`;
    const result = run({scenario: backups({details}), files: BACKUP_FILES, env: {...LOGIN, BACKUP_STARTERS: "apply"}});
    assert.equal(result.status, 0, result.stdout);
    assert.deepEqual(posted(result, "lineup"), []);
    assert.equal(posted(result, "csetup").length, 1);
    assert.ok(result.entries.includes("Backup starters: recalculated week 6, as MFL's results didn't have Beta's lineup yet: Josh Allen started for Tyler Warren, who was inactive."), result.entries.join("\n"));
    // the recalculation that doesn't show in MFL's results: no lineup was set this time
    const unrun = run({scenario: backups({details, saved: "17102,200,"}), files: BACKUP_FILES, env: {...LOGIN, BACKUP_STARTERS: "apply"}});
    assert.equal(unrun.status, 1);
    assert.ok(unrun.entries.includes("Backup starters: Beta, week 6: after Recalculate Standings MFL's results still have Tyler Warren, B0 Player, so it may not have run; the next run tries again."), unrun.entries.join("\n"));
    assert.deepEqual(JSON.parse(readFileSync(join(unrun.dataDir, "backup-starters.json"), "utf8")), {2026: [1, 2, 3, 4, 5]});
});

test("backup starters: MFL's saved results, not its answer, say the week was recalculated", () => {
    // an answer with a warning in it, as MFL's result pages can have, when the results show the lineup
    const scenario = backups();
    scenario.forms = {"/2026/csetup": '<h2>Calculating Week 6 Results</h2><span class="warning">Error(s) submitting lineup: the deadline has passed</span>'};
    const result = run({scenario, files: BACKUP_FILES, env: {...LOGIN, BACKUP_STARTERS: "apply"}});
    assert.equal(result.status, 0, result.stdout);
    assert.ok(result.entries.includes("Backup starters: set Beta's week 6 lineup and recalculated the week: Josh Allen started for Tyler Warren, who was inactive."), result.entries.join("\n"));
    assert.deepEqual(JSON.parse(readFileSync(join(result.dataDir, "backup-starters.json"), "utf8")), {2026: [1, 2, 3, 4, 5, 6]});
});

test("backup starters: a request MFL turns away is asked again after a wait, and fails only when turned away each time", () => {
    const details = "/2026/options?L=48571&O=210&FRANCHISE=0002&W=6";
    const apply = {...LOGIN, BACKUP_STARTERS: "apply"};
    const done = "Backup starters: set Beta's week 6 lineup and recalculated the week: Josh Allen started for Tyler Warren, who was inactive.";
    const asked = (result, address) => result.requests.filter((request) => request.url && new URL(request.url).pathname + new URL(request.url).search === address).length;
    // each wait is logged, as the fake doesn't wait it out
    const waits = (result, address) => result.stdout.split("\n").filter((line) => line === `MFL turned ${address} away with its home page; asking again in 15 seconds.`).length;

    // a page, a form's post, the commissioner switch: each turned away once, then answered
    for (const address of [details, "/2026/lineup", "/2026/csetup", "/2026/logout?L=48571&BECOME=0000"]) {
        const once = run({scenario: {...backups(), turnedAway: {[address]: 1}}, files: BACKUP_FILES, env: apply});
        assert.equal(once.status, 0, `${address}: ${once.stdout}`);
        assert.deepEqual([asked(once, address), waits(once, address)], [2, 1], address);
        assert.ok(once.entries.includes(done), `${address}: ${once.entries.join("\n")}`);
    }

    // turned away every time: two waits, then the week waits for the next run
    const always = run({scenario: {...backups(), turnedAway: {[details]: 3}}, files: BACKUP_FILES, env: apply});
    assert.equal(always.status, 1);
    assert.deepEqual([asked(always, details), waits(always, details)], [3, 2]);
    assert.ok(always.entries.includes("Backup starters: week 6 stopped: Couldn't load MFL's Beta's week 6 Lineup Details: MFL turned it away with its home page 3 times"), always.entries.join("\n"));
    assert.deepEqual(posted(always, "lineup"), []);
    assert.deepEqual(JSON.parse(readFileSync(join(always.dataDir, "backup-starters.json"), "utf8")), {2026: [1, 2, 3, 4, 5]});

    // the lineup's post turned away every time: the form fails, and nothing more is posted
    const form = run({scenario: {...backups(), turnedAway: {"/2026/lineup": 3}}, files: BACKUP_FILES, env: apply});
    assert.equal(form.status, 1);
    assert.ok(form.entries.includes("Backup starters: week 6 stopped: MFL's Submit Lineup form failed: MFL turned it away with its home page 3 times"), form.entries.join("\n"));
    assert.deepEqual(posted(form, "csetup"), []);

    // the commissioner switch's own answer pointing at MFL's home page, with its cookie: taken, not waited out
    const home = run({scenario: {...backups(), commishLocation: "http://home.myfantasyleague.com"}, files: BACKUP_FILES, env: apply});
    assert.equal(home.status, 0, home.stdout);
    assert.doesNotMatch(home.stdout, /asking again/);
    assert.ok(home.entries.includes(done), home.entries.join("\n"));

    // a redirect to http isn't followed, as the login would go with it unencrypted
    const plain = backups();
    plain.redirects = {[details]: `http://www44.myfantasyleague.com${details}`};
    const insecure = run({scenario: plain, files: BACKUP_FILES, env: apply});
    assert.equal(insecure.status, 1);
    assert.ok(insecure.entries.includes("Backup starters: week 6 stopped: Couldn't load MFL's Beta's week 6 Lineup Details: MFL sent it on to http://www44.myfantasyleague.com, which would take the login unencrypted"), insecure.entries.join("\n"));
    assert.equal(asked(insecure, details), 1);

    // another redirect is followed, here to the same page by another address
    const scenario = backups();
    scenario.redirects = {[details]: `${details}&moved=1`};
    scenario.pages[`${details}&moved=1`] = scenario.pages[details];
    const moved = run({scenario, files: BACKUP_FILES, env: apply});
    assert.equal(moved.status, 0, moved.stdout);
    assert.equal(asked(moved, `${details}&moved=1`), 1);
    assert.ok(moved.entries.includes(done), moved.entries.join("\n"));
});

test("backup starters: a player MFL's form has no box for is flagged, the rest of the week goes on", () => {
    const scenario = backups();
    scenario.pages["/2026/lineup?L=48571&WEEK=6&F=0002"] = scenario.pages["/2026/lineup?L=48571&WEEK=6&F=0002"].replace(/<input type="checkbox" name="QB0002"[^>]*>/, "");
    const result = run({scenario, files: BACKUP_FILES, env: {...LOGIN, BACKUP_STARTERS: "apply"}});
    assert.equal(result.status, 1);
    assert.ok(result.entries.includes("Backup starters: Beta's week 6 lineup wasn't set, as MFL's form has no box for Josh Allen (on a bye, or no longer on the team); it should be Josh Allen, B0 Player."), result.entries.join("\n"));
    assert.deepEqual([posted(result, "lineup"), posted(result, "csetup"), imports(result).filter((each) => each.TYPE === "messageBoard")], [[], [], []]);
    assert.deepEqual(JSON.parse(readFileSync(join(result.dataDir, "backup-starters.json"), "utf8")), {2026: [1, 2, 3, 4, 5, 6]});
});

test("backup starters: a post naming no week, after a pair's deadline, is flagged", () => {
    const scenario = backups();
    const topic = "/2026/mb/topic_show.pl?bid=202648571&tid=8001";
    // Thursday 15 Oct, after Warren's game: taken as week 6's, and late
    scenario.pages[topic] = scenario.pages[topic].replace("Wed Oct 14 9:00:00 a.m.", "Thu Oct 15 11:00:00 p.m.");
    const result = run({scenario, files: BACKUP_FILES, env: {...LOGIN, BACKUP_STARTERS: "apply"}});
    assert.equal(result.status, 1);
    assert.ok(result.entries.some((entry) => entry.startsWith("Backup starters: Beta, week 6: Josh Allen for Tyler Warren doesn't count, as it came after the pair's deadline; the post of")), result.entries.join("\n"));
    assert.deepEqual(posted(result, "lineup"), []);
});

test("backup starters: what keeps a post from counting, or part of it, is flagged", () => {
    const flags = (post) => {
        const result = run({scenario: backups({post}), files: BACKUP_FILES, env: {...LOGIN, BACKUP_STARTERS: "apply"}});
        assert.equal(result.status, 1, result.stdout);
        return {flags: result.entries.filter((entry) => entry.startsWith("Backup starters: Beta, week 6: ")), lineup: posted(result, "lineup")};
    };
    const label = "the post of Wed Oct 14 9:00:00 a.m. CT 2026";
    // an "if" it can't read: flagged, the rest still counts
    const unreadable = flags("If Tyler Warren is out, start Josh Allen<br>If B0 Player maybe");
    assert.deepEqual(unreadable.flags, [`Backup starters: Beta, week 6: couldn't read "If B0 Player maybe" in ${label}.`]);
    assert.equal(unreadable.lineup.length, 1);
    // two weeks: none of it counts
    const two = flags("Week 6 and week 7: If Tyler Warren is out, start Josh Allen");
    assert.deepEqual(two.flags, [`Backup starters: Beta, week 6: ${label} names weeks 6 and 7.`]);
    assert.deepEqual(two.lineup, []);
    // a week the season doesn't have: taken as the week it was posted
    const bad = flags("Week 25: If Tyler Warren is out, start Josh Allen");
    assert.deepEqual(bad.flags, [`Backup starters: Beta, week 6: ${label} names week 25, which the season doesn't have; it was taken as week 6's.`]);
    assert.equal(bad.lineup.length, 1);
});

test("backup starters: the season's first run starts with this week, earlier ones left as they are", () => {
    const result = run({scenario: backups(), env: {...LOGIN, BACKUP_STARTERS: "apply"}});
    assert.equal(result.status, 0, result.stdout);
    assert.deepEqual([posted(result, "lineup"), posted(result, "csetup")], [[], []]);
    assert.match(result.stdout, /first run this season, so weeks before week 7 are left as they are/);
    assert.deepEqual(JSON.parse(readFileSync(join(result.dataDir, "backup-starters.json"), "utf8")), {2026: [1, 2, 3, 4, 5, 6]});
});

test("backup starters: the season's first run is written down without any post", () => {
    const scenario = backups();
    scenario.exports.messageBoard = {};
    const result = run({scenario, env: {...LOGIN, BACKUP_STARTERS: "apply"}});
    assert.equal(result.status, 0, result.stdout);
    assert.deepEqual(JSON.parse(readFileSync(join(result.dataDir, "backup-starters.json"), "utf8")), {2026: [1, 2, 3, 4, 5, 6]});
});

test("backup starters: a team that submitted nothing all week has the lineup MFL scored", () => {
    const scenario = backups();
    const details = "/2026/options?L=48571&O=210&FRANCHISE=0002&W=6";
    scenario.pages[details] = scenario.pages[details].replace(/<tr class="oddtablerow">[\s\S]*?<\/tr>/, "");
    const result = run({scenario, files: BACKUP_FILES, env: {...LOGIN, BACKUP_STARTERS: "apply"}});
    assert.equal(result.status, 0, result.stdout);
    assert.deepEqual(posted(result, "lineup")[0].filter(([name]) => /^(QB|WR|TE)0002$/.test(name)), [["QB0002", "13589"], ["WR0002", "200"]]);
    assert.ok(!result.requests.some((request) => /TYPE=weeklyResults/.test(request.url) && /W=5\b/.test(request.url)));
});

test("backup starters: weeks over without a post are settled, a thread or not", () => {
    const scenario = backups();
    scenario.exports.messageBoard = {};
    const result = run({scenario, files: {...BACKUP_FILES, "backup-starters.json": "{\"2026\": [1, 2, 3]}\n"}, env: {...LOGIN, BACKUP_STARTERS: "apply"}});
    assert.deepEqual(JSON.parse(readFileSync(join(result.dataDir, "backup-starters.json"), "utf8")), {2026: [1, 2, 3, 4, 5, 6]});
});

test("backup starters: a backup nflverse doesn't list is flagged, not started", () => {
    const scenario = backups();
    const ids = Object.keys(scenario.files)[1];
    scenario.files[ids] = scenario.files[ids].split("\n").filter((row) => !row.startsWith("13589,")).join("\n");
    const result = run({scenario, files: BACKUP_FILES, env: {...LOGIN, BACKUP_STARTERS: "apply"}});
    assert.equal(result.status, 1);
    assert.ok(result.entries.includes("Backup starters: Beta, week 6: Josh Allen, Tyler Warren's backup, isn't in nflverse's week 6 rosters, so he wasn't started."), result.entries.join("\n"));
    assert.deepEqual(posted(result, "lineup"), []);
});

test("backup starters: a week that fails is flagged, and left for the next run", () => {
    const scenario = backups();
    scenario.pages["/2026/options?L=48571&O=210&FRANCHISE=0002&W=6"] = "<p>Something else</p>";
    const result = run({scenario, files: BACKUP_FILES, env: {...LOGIN, BACKUP_STARTERS: "apply"}});
    assert.equal(result.status, 1);
    assert.ok(result.entries.includes("Backup starters: week 6 stopped: MFL's Lineup Details page has no lineup table where expected"), result.entries.join("\n"));
    assert.deepEqual(JSON.parse(readFileSync(join(result.dataDir, "backup-starters.json"), "utf8")), {2026: [1, 2, 3, 4, 5]});
});

test("backup starters: a backup on no game-day roster stays on the bench", () => {
    const scenario = backups();
    const rosters = Object.keys(scenario.files)[0];
    scenario.files[rosters] = scenario.files[rosters].split("\n")
        .map((row) => row.includes("00-0034857") && row.includes(",6,REG,") ? row.replace(",ACT,", ",RES,") : row).join("\n");
    const result = run({scenario, files: BACKUP_FILES, env: {...LOGIN, BACKUP_STARTERS: "apply"}});
    assert.deepEqual([posted(result, "lineup"), posted(result, "csetup")], [[], []]);
});

test("backup starters: a backup inactive too stays on the bench", () => {
    const scenario = backups();
    const rosters = Object.keys(scenario.files)[0];
    scenario.files[rosters] = scenario.files[rosters].split("\n")
        .map((row) => row.includes("00-0034857") && row.includes(",6,REG,") ? row.replace(",ACT,", ",INA,") : row).join("\n");
    const result = run({scenario, files: BACKUP_FILES, env: {...LOGIN, BACKUP_STARTERS: "apply"}});
    assert.deepEqual([posted(result, "lineup"), posted(result, "csetup")], [[], []]);
});

test("backup starters: without BACKUP_STARTERS only logged; a dry run writes nothing, league-data included", () => {
    const logged = run({scenario: backups(), files: BACKUP_FILES, env: LOGIN});
    assert.equal(logged.status, 0, logged.stdout);
    assert.deepEqual(logged.entries.filter((entry) => entry.startsWith("Backup starters")), [
        "Backup starters: would set Beta's week 6 lineup to Josh Allen, B0 Player: Josh Allen started for Tyler Warren, who was inactive."
    ]);
    assert.deepEqual([posted(logged, "lineup"), posted(logged, "csetup")], [[], []]);
    assert.ok(!logged.requests.some((request) => /BECOME=0000/.test(request.url)));
    // left to the commissioner, so it isn't logged (or flagged) again each day
    assert.deepEqual(JSON.parse(readFileSync(join(logged.dataDir, "backup-starters.json"), "utf8")), {2026: [1, 2, 3, 4, 5, 6]});
    // a dry run reads the league's data only when it says the data is that league's
    const dry = run({scenario: backups(), files: BACKUP_FILES, env: {...LOGIN, BACKUP_STARTERS: "apply", DRY_RUN: "true", DATA_LEAGUE_ID: "48571"}});
    assert.ok(dry.stdout.includes("Backup starters: dry run, would set Beta's week 6 lineup to Josh Allen, B0 Player: Josh Allen started for Tyler Warren, who was inactive."), dry.stdout);
    assert.ok(!dry.requests.some((request) => request.method === "POST" && /\/(lineup|csetup|import)$/.test(new URL(request.url).pathname)));
    assert.equal(readFileSync(join(dry.dataDir, "backup-starters.json"), "utf8"), BACKUP_FILES["backup-starters.json"]);
});

test("backup starters: an inactive starter who scored, a name it can't place, a team nflverse lacks", () => {
    const scored = run({scenario: backups({warrenScore: "4.5"}), files: BACKUP_FILES, env: {...LOGIN, BACKUP_STARTERS: "apply"}});
    assert.equal(scored.status, 1);
    assert.ok(scored.entries.includes("Backup starters: Beta, week 6: nflverse lists Tyler Warren as inactive, but he scored 4.5, so he's taken as active."), scored.entries.join("\n"));
    assert.deepEqual([posted(scored, "lineup"), posted(scored, "csetup")], [[], []]);

    const unknown = run({scenario: backups({post: "If Tyler Warren is out, start Lamar Jackson"}), files: BACKUP_FILES, env: {...LOGIN, BACKUP_STARTERS: "apply"}});
    assert.equal(unknown.status, 1);
    assert.ok(unknown.entries.includes("Backup starters: Beta, week 6: couldn't tell who \"Lamar Jackson\" is in the post of Wed Oct 14 9:00:00 a.m. CT 2026."), unknown.entries.join("\n"));

    // SF played, and nflverse has nobody of theirs inactive yet: the week waits, unsettled
    const waiting = run({scenario: backups({teams: [["IND", "KCC"], ["BUF", "SFO"]]}), files: BACKUP_FILES, env: {...LOGIN, BACKUP_STARTERS: "apply"}, now: "2026-10-20T12:00:00Z"});
    assert.equal(waiting.status, 0, waiting.stdout);
    assert.match(waiting.stdout, /nflverse doesn't have week 6's inactive players for SFO yet; the week waits/);
    assert.deepEqual(JSON.parse(readFileSync(join(waiting.dataDir, "backup-starters.json"), "utf8")), {2026: [1, 2, 3, 4, 5]});
    // still missing 4 days after the week's games: flagged
    const stale = run({scenario: backups({teams: [["IND", "KCC"], ["BUF", "SFO"]]}), files: BACKUP_FILES, env: {...LOGIN, BACKUP_STARTERS: "apply"}});
    assert.equal(stale.status, 1);
    assert.ok(stale.entries.includes("Backup starters: nflverse doesn't have week 6's inactive players for SFO yet, 5 days after the week's games; its backups wait."), stale.entries.join("\n"));

    // MFL's results don't show the lineup set: flagged
    const unsaved = run({scenario: backups({saved: "17102,200,"}), files: BACKUP_FILES, env: {...LOGIN, BACKUP_STARTERS: "apply"}});
    assert.equal(unsaved.status, 1);
    // the week left for the next run
    assert.deepEqual(JSON.parse(readFileSync(join(unsaved.dataDir, "backup-starters.json"), "utf8")), {2026: [1, 2, 3, 4, 5]});
    assert.ok(unsaved.entries.includes("Backup starters: Beta, week 6: the lineup was set, but after Recalculate Standings MFL's results still have Tyler Warren, B0 Player, so it may not have run; the next run tries again."), unsaved.entries.join("\n"));
    // results with no starters for the team at all
    const empty = run({scenario: backups({saved: ""}), files: BACKUP_FILES, env: {...LOGIN, BACKUP_STARTERS: "apply"}});
    assert.equal(empty.status, 1);
    assert.ok(empty.entries.includes("Backup starters: Beta, week 6: the lineup was set, but after Recalculate Standings MFL's results still have no starters, so it may not have run; the next run tries again."), empty.entries.join("\n"));
});

// Beta's week 6 Lineup Details: a row per lineup, each [message, time, "(C)" for the commissioner's]
function lineupMessages(scenario, rows) {
    scenario.exports.messageBoard = {};
    scenario.pages["/2026/options?L=48571&O=210&FRANCHISE=0002&W=6"] = `<table class="report"><tr><th>Date/Time Lineup Submitted</th></tr>${rows.map(([message, time, commish = ""]) =>
        `<tr class="oddtablerow"><td class="week">6</td><td>${commish}</td><td>Warren, Tyler IND TE, Player, B0 BUF WR</td><td>${message}</td><td>${time}</td></tr>`).join("")}</table>`;
    return scenario;
}
const WEDNESDAY = "Wed Oct 14 9:05:00 a.m. CT 2026";
const LATE = "Thu Oct 15 11:00:00 p.m. CT 2026";
const ALLEN = "Week 6: If Tyler Warren is out, start Josh Allen.";

test("backup starters: a lineup's message is read as a post is, without a thread", () => {
    const result = run({scenario: lineupMessages(backups(), [[ALLEN, WEDNESDAY]]), files: BACKUP_FILES, env: {...LOGIN, BACKUP_STARTERS: "apply"}});
    assert.equal(result.status, 0, result.stdout);
    assert.deepEqual(posted(result, "lineup")[0].filter(([name]) => /^(QB|WR|TE)0002$/.test(name)), [["QB0002", "13589"], ["WR0002", "200"]]);
    assert.ok(result.entries.includes("Backup starters: set Beta's week 6 lineup and recalculated the week: Josh Allen started for Tyler Warren, who was inactive."), result.entries.join("\n"));
    // every team's lineups were read
    assert.ok(result.requests.some((request) => /O=210&FRANCHISE=0001&W=6/.test(request.url)));
});

test("backup starters: a message carried to a later lineup or restating a locked pair, one that isn't backups, or the commissioner's, changes nothing", () => {
    // a later message restating the locked pair (as v2's restate every pair) is no late request either
    for (const later of [[ALLEN, LATE], [ALLEN.replace(".", ""), LATE], ["Set from my phone", LATE], ["", LATE], ["Week 6: No backups.", WEDNESDAY.replace("9:05", "9:10"), "(C)"], ["Week 5: No backups.", WEDNESDAY.replace("9:05", "9:10")]]) {
        const result = run({scenario: lineupMessages(backups(), [[ALLEN, WEDNESDAY], later]), files: BACKUP_FILES, env: {...LOGIN, BACKUP_STARTERS: "apply"}});
        assert.equal(result.status, 0, `${later}: ${result.stdout}`);
        assert.equal(posted(result, "lineup").length, 1, later.join(" "));
        assert.ok(!result.entries.some((entry) => /doesn't count|couldn't/.test(entry)), result.entries.join("\n"));
    }
    // a message changed after the deadline is late, and as it's the lineup's week, not flagged
    const late = run({scenario: lineupMessages(backups(), [["", WEDNESDAY], [ALLEN, LATE]]), files: BACKUP_FILES, env: {...LOGIN, BACKUP_STARTERS: "apply"}});
    assert.equal(late.status, 0, late.stdout);
    assert.deepEqual(posted(late, "lineup"), []);
    assert.ok(late.entries.includes("Backup starters: Beta, week 6: Josh Allen for Tyler Warren doesn't count, as it came after the pair's deadline."), late.entries.join("\n"));
});

test("backup starters: a message naming a player no longer on the team doesn't apply, and isn't flagged", () => {
    const scenario = lineupMessages(backups(), [["Week 6: If Tyler Warren is out, start Joe Mixon.", WEDNESDAY]]);
    const result = run({scenario, files: BACKUP_FILES, env: {...LOGIN, BACKUP_STARTERS: "apply"}});
    assert.equal(result.status, 0, result.stdout);
    assert.deepEqual(posted(result, "lineup"), []);
    assert.ok(result.entries.includes(`Backup starters: Beta, week 6: "Joe Mixon" in the lineup message of ${WEDNESDAY} isn't on the team, so that request doesn't apply.`), result.entries.join("\n"));
});

test("backup starters: a week without backups is settled without waiting for nflverse", () => {
    const scenario = lineupMessages(backups(), [["", WEDNESDAY]]);
    scenario.files = {};
    const result = run({scenario, files: BACKUP_FILES, env: {...LOGIN, BACKUP_STARTERS: "apply"}});
    assert.equal(result.status, 0, result.stdout);
    assert.ok(!result.requests.some((request) => /nflverse|dynastyprocess/.test(request.url)));
    assert.deepEqual(JSON.parse(readFileSync(join(result.dataDir, "backup-starters.json"), "utf8")), {2026: [1, 2, 3, 4, 5, 6]});
});
