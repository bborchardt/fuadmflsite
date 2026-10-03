// Tests for the league logic shared by the page and the daily job.
// Run with: node --test tests/

import {test} from "node:test";
import assert from "node:assert/strict";
import {capPenalty, netCapSpace, rookieSalary, franchiseTopSalaries, franchiseSalary, positionOrder} from "../site/v1/lib/rules.js";
import {asArray, displayName, firstKickoff} from "../site/v1/lib/mfl.js";
import {franchisePhase, makeSnapshot, readSnapshot} from "../site/v1/lib/franchise.js";
import {buildLeague, playersFromExport} from "../site/v1/lib/league.js";

test("cap penalty is 40% of salary per year, at least $1 and at least $1 a year", () => {
    assert.equal(capPenalty(2, 10), 8);
    assert.equal(capPenalty(1, 5), 2);
    assert.equal(capPenalty(1, 1), 1);
    assert.equal(capPenalty(5, 1), 5);
    assert.equal(capPenalty(0, 50), 0);
    assert.equal(capPenalty("3", "20"), 24);
});

test("net cap space is salary less penalty, nothing for an expiring contract", () => {
    assert.equal(netCapSpace(2, 10), 2);
    assert.equal(netCapSpace(0, 10), 0);
});

test("rookie salaries decay 20% a pick from the baseline, never under $1", () => {
    assert.deepEqual([1, 2, 3, 15].map((pick) => rookieSalary(10, pick)), [10, 8, 6, 1]);
    assert.deepEqual([1, 2, 3].map((pick) => rookieSalary(6, pick)), [6, 5, 4]);
    assert.equal(rookieSalary(1, 1), 1);
});

test("franchise top salaries: five per position by salary, ties in arrival order, unknown positions ignored", () => {
    const player = (fullName, nflPosition, salary) => ({fullName, nflPosition, salary});
    const top = franchiseTopSalaries([
        player("A", "QB", 10), player("B", "QB", 50), player("C", "QB", 30), player("D", "QB", 30),
        player("E", "QB", 5), player("F", "QB", 1), player("G", "PK", 2), player("H", "Def", 99)
    ]);
    assert.deepEqual(top.QB.map((p) => p.fullName), ["B", "C", "D", "A", "E"]);
    assert.deepEqual(top.PK, [{fullName: "G", salary: 2}]);
    assert.equal(top.Def, undefined);
    assert.equal(franchiseSalary(top.QB), 25);
    assert.equal(franchiseSalary(top.PK), 0);
    assert.equal(franchiseSalary(undefined), 0);
    assert.ok(positionOrder("Def") > positionOrder("PK"));
});

test("MFL helpers", () => {
    assert.deepEqual(asArray(undefined), []);
    assert.deepEqual(asArray({id: 1}), [{id: 1}]);
    assert.deepEqual(asArray([1, 2]), [1, 2]);
    assert.equal(displayName("Jackson, Lamar"), "Lamar Jackson");
    assert.equal(displayName("Bills, Buffalo"), "Buffalo Bills");
    assert.equal(displayName("Cher"), "Cher");
    const kickoff = firstKickoff({matchup: [{kickoff: "1795654800"}, {kickoff: "1795651200"}]});
    assert.equal(kickoff.toISOString(), new Date(1795651200 * 1000).toISOString());
    assert.equal(firstKickoff({}), null);
});

test("franchise phase: previous before week 1, live until the deadline, final after", () => {
    const start = new Date("2026-09-10T00:20:00Z");
    const deadline = new Date("2026-11-26T01:00:00Z");
    assert.equal(franchisePhase(new Date("2026-08-01T00:00:00Z"), start, deadline), "previous");
    assert.equal(franchisePhase(new Date("2026-10-03T00:00:00Z"), start, deadline), "live");
    assert.equal(franchisePhase(deadline, start, deadline), "final");
    assert.equal(franchisePhase(new Date("2026-10-03T00:00:00Z"), null, null), "live");
});

test("snapshots round-trip and reject the wrong season", () => {
    const snapshot = makeSnapshot(2026, {QB: [{fullName: "A", salary: 1}]}, {takenAt: "x", source: "test"});
    assert.deepEqual(readSnapshot(JSON.parse(JSON.stringify(snapshot)), 2026), {QB: [{fullName: "A", salary: 1}]});
    assert.throws(() => readSnapshot(snapshot, 2025));
    assert.throws(() => readSnapshot(null, 2026));
});

test("league model: salaries, cap, roster counts, pending penalties and injured starters", () => {
    const players = playersFromExport({player: [
        {id: "1", name: "One, Player", position: "QB", team: "AAA"},
        {id: "2", name: "Two, Player", position: "RB", team: "BBB"},
        {id: "3", name: "Three, Player", position: "WR", team: "CCC"},
        {id: "4", name: "Four, Player", position: "TE", team: "DDD"}
    ]});
    const league = buildLeague({
        players,
        league: {franchises: {franchise: [{id: "0001", name: "Alpha"}, {id: "0002", name: "Beta"}]}},
        salaryAdjustments: {salaryAdjustment: {franchise_id: "0001", amount: "4", description: "x"}},
        rosters: {franchise: [
            {id: "0001", player: [
                {id: "1", status: "ROSTER", salary: "200", contractYear: "2"},
                {id: "2", status: "INJURED_RESERVE", salary: "100", contractYear: "0"}
            ]},
            {id: "0002", player: {id: "3", status: "ROSTER", salary: "0.50", contractYear: "1"}}
        ]},
        transactions: {transaction: [
            {type: "FREE_AGENT", franchise: "0002", transaction: "|4,", timestamp: "200"},
            {type: "BBID_WAIVER", franchise: "0002", transaction: "4,|5|0000", timestamp: "100"}
        ]},
        weeklyResults: {week: "3", matchup: {franchise: [
            {id: "0001", player: [{id: "1", status: "starter"}, {id: "2", status: "nonstarter"}]},
            {id: "0002", player: {id: "3", status: "starter"}}
        ]}},
        freeAgents: {leagueUnit: {player: {id: "4", salary: "10", contractYear: "2"}}},
        injuries: {injury: [{id: "1", status: "IR-R"}, {id: "3", status: "Questionable"}]}
    });
    const alpha = league.franchises.get("0001");
    const beta = league.franchises.get("0002");
    assert.equal(alpha.salary, 304);
    assert.equal(alpha.numPlayers, 1);
    assert.deepEqual(alpha.signedPlayers.map((p) => p.fullName), ["Player Two"]);
    assert.equal(beta.salary, 0);
    assert.deepEqual(alpha.lineup.map((p) => p.fullName), ["Player One"]);
    assert.equal(players.get("1").injured, true);
    assert.equal(players.get("3").injured, false);
    assert.deepEqual(beta.pendingDroppedPlayers.map((p) => p.fullName), ["Player Four"]);
    assert.equal(beta.pendingPenalty, 8);
    assert.equal(beta.penaltyReason, "Player Four (2yrs@10)");
    assert.equal(league.week, "3");
    assert.equal(league.rosteredPlayers.length, 3);
});
