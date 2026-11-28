// Each chore of the daily job on its own (jobs/<chore>.mjs), given a context as daily.mjs makes it
// (tests/fixtures/chore-context.mjs): what it logs, flags and sends to MFL, and what it hands the
// chores after it. tests/daily.test.mjs runs them together, as the job does.

import {after, test} from "node:test";
import assert from "node:assert/strict";
import {mkdirSync, writeFileSync, readFileSync} from "node:fs";
import {join} from "node:path";
import {cleanUp, testContext} from "./fixtures/chore-context.mjs";
import {runLog} from "../jobs/run-log.mjs";
import * as dropPenalties from "../jobs/drop-penalties.mjs";
import * as contractYears from "../jobs/contract-years.mjs";
import * as contractLengths from "../jobs/contract-lengths.mjs";
import * as rfaSalaries from "../jobs/rfa-salaries.mjs";
import * as backupStarters from "../jobs/backup-starters.mjs";
import * as payouts from "../jobs/payouts.mjs";
import * as franchiseSnapshot from "../jobs/franchise-snapshot.mjs";

after(cleanUp);

const at = (iso) => String(Date.parse(iso) / 1000);
const penalty = (franchiseId, teamName, fullName, amount) => ({franchiseId, teamName, playerId: `p${franchiseId}`, fullName, amount, charged: false,
    lengthDue: false, salary: 10, addedThisSeason: false, dropped: 0, explanation: `${fullName} (2yrs@10, 10/23)`});

test("drop penalties: only logged while the switch isn't apply; charged, then the contract cleared, when it is; a held team's left", async () => {
    const state = {penalties: [penalty("0001", "Alpha", "Ollie Gordon", 8), penalty("0002", "Beta", "Joe Mixon", 1)], lengthDueUnknown: null};
    const held = new Set(["0002"]);
    const logged = testContext();
    await dropPenalties.run(logged.ctx, state, held);
    assert.deepEqual(logged.run.entries, ["DROP_PENALTIES isn't \"apply\": would charge $8 to Alpha for Ollie Gordon (2yrs@10, 10/23), then clear the player's contract."]);
    assert.equal(logged.requests.length, 0);

    const applied = testContext({config: {apply: {dropPenalties: true}}});
    await dropPenalties.run(applied.ctx, state, held);
    assert.deepEqual(applied.imports().map((fields) => [fields.TYPE, fields.APPEND]), [["salaryAdj", undefined], ["salaries", "1"]]);
    assert.match(applied.imports()[0].DATA, /franchise_id="0001" amount="8"/);
    assert.deepEqual(applied.run.entries, ["Charged $8 to Alpha for Ollie Gordon (2yrs@10, 10/23), and cleared the player's contract."]);
});

test("drop penalties: more than a day's worth charges none, and a dry run says so too", async () => {
    const many = Array.from({length: dropPenalties.MAX_PENALTIES_PER_RUN + 1}, (_, i) => penalty(`000${i}`, "Alpha", `Player ${i}`, 1));
    for (const config of [{apply: {dropPenalties: true}}, {dryRun: true}]) {
        const {ctx, requests} = testContext({config});
        await assert.rejects(dropPenalties.run(ctx, {penalties: many, lengthDueUnknown: null}, new Set()), /more than the 6 expected in a day, so none were charged/);
        assert.equal(requests.length, 0);
    }
});

// Beta added Olave a day before the run, his hour to post a length long closed
const added = {
    built: {started: true, franchises: new Map()},
    rosters: {franchise: [{id: "0002", player: [{id: "300", salary: "1", contractYear: "0", status: "ROSTER"}]}]},
    transactions: [{type: "FREE_AGENT", franchise: "0002", transaction: "300,|", timestamp: at("2026-10-23T12:00:00Z")}],
    playerNames: new Map([["300", {id: "300", name: "Olave, Chris", position: "WR"}]]),
    cutDown: null
};

test("contract years: an add on a held team is left for the commissioner; a dry run not logged in says it didn't look", async () => {
    const held = testContext();
    await contractYears.run(held.ctx, added, new Set(["0002"]));
    assert.equal(held.run.entries.length, 1);
    assert.match(held.run.entries[0], /^Contract years: .*Olave.* held, since the team is over the cap or the roster limit\./);
    assert.equal(held.requests.length, 0);

    const unread = testContext({config: {loggedIn: false, dryRun: true}});
    await contractYears.run(unread.ctx, added, new Set());
    assert.deepEqual(unread.run.entries, ["Contract years: not checked for 1 added player(s), as the run isn't logged in."]);
    // a real run can't leave it at that
    const real = testContext({config: {loggedIn: false}});
    await assert.rejects(contractYears.run(real.ctx, added, new Set()), /1 added player\(s\) are waiting for contract years, but reading the bids and the message board needs the commissioner login/);
});

test("contract lengths and RFA salaries wait for the season's start to be known, and RFAs end with week 1", async () => {
    const lengths = testContext();
    await contractLengths.run(lengths.ctx, {built: {}, rosters: {}, playerNames: new Map(), cutDown: null}, new Set(), new Set());
    assert.deepEqual(lengths.printed, ["The season's start isn't known; offseason contract lengths skipped."]);
    const rfas = testContext();
    assert.deepEqual(await rfaSalaries.run(rfas.ctx, {built: {started: true}}), []);
    assert.deepEqual(rfas.printed, ["Week 1 has kicked off; RFA salaries are set only before it."]);
    assert.equal(lengths.requests.length + rfas.requests.length, 0);
});

test("RFA salaries: a league with no site last season has none; what the chore set before isn't set again", async () => {
    const none = testContext({exports: {rosters: 404}});
    assert.deepEqual(await rfaSalaries.run(none.ctx, {built: {started: false}, rosters: {}, transactions: [], playerNames: new Map()}), []);
    assert.deepEqual(none.printed, ["The league has no 2025 site, so it has no RFAs."]);

    const lastSeason = {franchise: [{id: "0001", player: [{id: "7", salary: "5", contractYear: "1", status: "ROSTER"}]}]};
    const now = {franchise: [{id: "0001", player: [{id: "7", salary: "5", contractYear: "0"}, {id: "8", salary: "3", contractYear: "2"}, {id: "9", salary: "4", contractYear: "1"}]}]};
    const state = {built: {started: false, franchises: new Map([["0001", {teamName: "Alpha"}]])}, rosters: now, transactions: [], playerNames: new Map([["7", {name: "Kelce, Travis"}]])};
    const first = testContext({exports: {rosters: lastSeason}, config: {apply: {rfaSalaries: true}}});
    assert.deepEqual(await rfaSalaries.run(first.ctx, state), ["7"]);
    assert.deepEqual(first.run.entries, ["Set RFA Travis Kelce (Alpha) to $0.01."]);
    assert.deepEqual(JSON.parse(readFileSync(join(first.ctx.dataDir, "rfa-salaries.json"), "utf8")), {2026: ["7"]});
    // the drop penalties chore reads the same record
    assert.deepEqual([...rfaSalaries.rfasSet(first.ctx)], ["7"]);
    assert.deepEqual(await rfaSalaries.run(first.ctx, state), []);
});

test("backup starters: off, or not logged in, the chore reads nothing and payouts don't wait", async () => {
    for (const config of [{backupsOff: true}, {loggedIn: false}]) {
        const {ctx, requests} = testContext({config});
        assert.deepEqual(await backupStarters.run(ctx, {league: {}, playerNames: new Map(), built: {}}), {changed: false, openFrom: Infinity});
        assert.equal(requests.length, 0);
    }
});

test("backup starters: before MFL has the season's schedule, nothing is settled or written", async () => {
    const {ctx, printed} = testContext({exports: {nflSchedule: {}}, config: {apply: {backups: true}}});
    assert.deepEqual(await backupStarters.run(ctx, {league: {}, playerNames: new Map(), built: {}}), {changed: false, openFrom: Infinity});
    assert.deepEqual(printed, ["Backup starters: MFL has no NFL schedule for the season yet."]);
});

test("backup starters' first open week, for payouts when the chore didn't finish, is the first not yet settled", () => {
    const {ctx} = testContext();
    assert.equal(backupStarters.firstOpenBackupWeek(ctx), Infinity, "before the chore's first run");
    writeFileSync(join(ctx.dataDir, "backup-starters.json"), JSON.stringify({2025: [1, 2, 3], 2026: [1, 2, 4]}));
    assert.equal(backupStarters.firstOpenBackupWeek(ctx), 3);
    // another league's dry run has no record of this one's
    assert.equal(backupStarters.firstOpenBackupWeek({...ctx, dataIsThisLeagues: false}), Infinity);
});

test("payouts: a week whose backups are still to go in waits, and the weeks before it are recorded", async () => {
    const scored = (week) => ({week: String(week), matchup: {franchise: [{id: "0001", score: "120"}, {id: "0002", score: "100"}]}});
    const {ctx, printed, run} = testContext({exports: {
        "weeklyResults:YTD": [scored(1), scored(2), scored(3)],
        // week 4 has kicked off, so week 3's scores are final
        "nflSchedule:4": {matchup: [{kickoff: at("2026-10-01T17:00:00Z")}]},
        accounting: {}
    }});
    const built = {weeks: {playoffsStart: 15, championship: 17}, franchises: new Map([["0001", {teamName: "Alpha"}], ["0002", {teamName: "Beta"}]])};
    await payouts.run(ctx, {built}, 2);
    assert.ok(printed.includes("Payouts: week 2 waits for its backup starters."), printed.join("\n"));
    assert.ok(run.entries.length > 0, printed.join("\n"));
    assert.deepEqual(run.entries.filter((entry) => !/^PAYOUTS isn't "apply": would record ".*Week 1\b/i.test(entry)), []);
});

test("the franchise snapshot isn't taken again once it's on league-data", async () => {
    const {ctx, printed, requests} = testContext();
    mkdirSync(join(ctx.dataDir, "data"), {recursive: true});
    writeFileSync(join(ctx.dataDir, "data", "franchise-2026.json"), "{}\n");
    assert.equal(await franchiseSnapshot.run(ctx, 2026), false);
    assert.deepEqual(printed, ["The 2026 franchise snapshot already exists."]);
    assert.equal(requests.length, 0);
});

test("the context's reads: last season's rosters asked once, none when the league had no site; a past week's rosters noted for saving", async () => {
    const {ctx, requests} = testContext({exports: {rosters: 404}, config: {savePages: true, savedPagesDir: "/unused", dataLeagueId: "99999", dryRun: true}});
    assert.equal(await ctx.lastSeasonRosters(), null);
    assert.equal(await ctx.lastSeasonRosters(), null);
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /\/2025\/export\?TYPE=rosters/);
    await ctx.fetchFrom(ctx.host, "rosters", {L: "48571", W: 3}, "rosters", 2026, ctx.lib.shapes.WEEK_ROSTERS).catch(() => {});
    assert.equal([...ctx.exportsRead.values()].find((read) => read.rules).rules, "WEEK_ROSTERS");
    // a dry run never writes to MFL
    await assert.rejects(ctx.mflImport("salaries", "<x/>"), /A dry run reached MFL's salaries import/);
    assert.equal(requests.filter((request) => request.method === "POST").length, 0);
});

test("the run log: a flag fails the run and is in the chore log; the chore log beats monthly when nothing happens", () => {
    let failed = 0;
    const printed = [];
    const run = runLog({onAttention: () => failed++, print: (line) => printed.push(line)});
    run.log("only logged");
    run.needsAttention("50% of\nthe teams");
    assert.equal(failed, 1);
    assert.deepEqual(run.entries, ["50% of\nthe teams"]);
    run.explainFailure();
    assert.equal(printed.at(-1), "::error title=Daily chores need attention::Failing the run so it gets noticed: 1 item needs the commissioner.%0A- 50%25 of%0Athe teams");

    const {ctx} = testContext();
    const quiet = runLog({print: () => {}});
    const file = join(ctx.dataDir, "chore-log.md");
    writeFileSync(file, "# Chore log\n\n- 2026-10-14 12:00 UTC: Took the snapshot.\n");
    assert.equal(quiet.updateChoreLog(ctx.dataDir, new Date("2026-10-24T12:00:00Z")), false);
    assert.equal(quiet.updateChoreLog(ctx.dataDir, new Date("2026-11-24T12:00:00Z")), true);
    assert.match(readFileSync(file, "utf8"), /- 2026-11-24 12:00 UTC: Heartbeat\. Nothing to do; the daily job is running\.\n$/);
});
