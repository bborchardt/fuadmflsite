// Tests for the daily job's cap penalty chore, and the league's view of penalties owed, which
// the Main tab's violations box shares.

import {test} from "node:test";
import assert from "node:assert/strict";
import {buildLeague, playersFromExport} from "../site/v1/lib/league.js";
import {dropDate, needsCharge, pendingPenalties, resetSalaryXml, salaryAdjXml} from "../jobs/drop-penalties.mjs";

// 2026-10-03 16:00 UTC, noon in New York
const DROPPED = Date.UTC(2026, 9, 3, 16) / 1000;

function league({salaryAdjustments, rosters = {franchise: []}} = {}) {
    return buildLeague({
        salaryAdjustments,
        players: playersFromExport({player: [
            {id: "4", name: "Gordon, Ollie", position: "RB", team: "MIA"},
            {id: "5", name: "Mixon, Joe", position: "RB", team: "HOU"},
            {id: "6", name: "Nobody, Plain", position: "WR", team: "FA"},
            {id: "7", name: "Keeper, Alpha", position: "QB", team: "BUF"},
            {id: "8", name: "Keeper, Beta", position: "QB", team: "KC"}
        ]}),
        league: {franchises: {franchise: [{id: "0001", name: "Alpha"}, {id: "0002", name: "Beta"}]}},
        rosters,
        transactions: {transaction: [
            {type: "FREE_AGENT", franchise: "0002", transaction: "|4,", timestamp: String(DROPPED)},
            {type: "WAIVER", franchise: "0001", added: "", dropped: "5,", timestamp: String(DROPPED - 86400)},
            {type: "FREE_AGENT", franchise: "0001", transaction: "|6,", timestamp: String(DROPPED)}
        ]},
        freeAgents: {leagueUnit: {player: [
            {id: "4", salary: "10", contractYear: "2"},
            {id: "5", salary: "1", contractYear: "1"},
            // already reset: nothing owed
            {id: "6", salary: "1", contractYear: "0"}
        ]}}
    });
}

test("drop dates are US Eastern", () => {
    assert.equal(dropDate(DROPPED), "10/03");
    // 02:00 UTC on the 4th is still the 3rd in New York
    assert.equal(dropDate(Date.UTC(2026, 9, 4, 2) / 1000), "10/03");
});

test("one penalty per dropped player, described with the contract and drop date", () => {
    const penalties = pendingPenalties(league());
    assert.deepEqual(penalties.map(({franchiseId, playerId, amount, explanation}) => ({franchiseId, playerId, amount, explanation})), [
        {franchiseId: "0001", playerId: "5", amount: 1, explanation: "Joe Mixon (1yrs@1, 10/02)"},
        {franchiseId: "0002", playerId: "4", amount: 8, explanation: "Ollie Gordon (2yrs@10, 10/03)"}
    ]);
    assert.equal(penalties[1].dropped, DROPPED);
});

test("a penalty counts as charged only for the same franchise, naming the player, at or after the drop", () => {
    const adjustment = (franchise_id, description, timestamp) => ({franchise_id, description, timestamp: String(timestamp), amount: "1"});
    const charged = (...adjustments) => pendingPenalties(league({salaryAdjustments: {salaryAdjustment: adjustments}}))
        .map((penalty) => penalty.charged);
    // [Mixon (Alpha), Gordon (Beta)]
    assert.deepEqual(charged(), [false, false]);
    assert.deepEqual(charged(adjustment("0002", "Ollie Gordon (2yrs@10, 10/03)", DROPPED)), [false, true]);
    // entered by hand in the older format, alongside another player
    assert.deepEqual(charged(adjustment("0001", "Pat Freiermuth (1yr@1), Joe Mixon (1yr@1)", DROPPED)), [true, false]);
    // an earlier drop of the same player, or another team's adjustment
    assert.deepEqual(charged(adjustment("0002", "Ollie Gordon (2yrs@10)", DROPPED - 1)), [false, false]);
    assert.deepEqual(charged(adjustment("0001", "Ollie Gordon (2yrs@10)", DROPPED)), [false, false]);
});

test("cap totals count drop penalties not yet charged", () => {
    const rosters = {franchise: [
        {id: "0001", player: {id: "7", status: "ROSTER", salary: "299", contractYear: "1"}},
        {id: "0002", player: {id: "8", status: "ROSTER", salary: "290", contractYear: "1"}}
    ]};
    const totals = (...adjustments) => [...league({rosters, salaryAdjustments: {salaryAdjustment: adjustments}}).franchises.values()]
        .map((franchise) => [franchise.capTotal, franchise.unchargedPenalty]);
    const adjustment = (franchise_id, amount, description) => ({franchise_id, amount, description, timestamp: String(DROPPED)});
    // Alpha: 299 + Mixon's $1. Beta: 290 + Gordon's $8.
    assert.deepEqual(totals(), [[300, 1], [298, 8]]);
    // a $3 fine pushes Beta to 301
    assert.deepEqual(totals(adjustment("0002", "3", "Late lineup")), [[300, 1], [301, 8]]);
    // Gordon's penalty charged by hand before the reset isn't counted twice: 290 + 8
    assert.deepEqual(totals(adjustment("0002", "8", "Ollie Gordon (2yrs@10)")), [[300, 1], [298, 0]]);
});

test("cap totals are rounded to the cent", () => {
    // $297.80 + $1.10 + $1.10 adds up to 300.00000000000006 in floating point
    const salaries = ["297.8", "1.1", "1.1"];
    const model = buildLeague({
        players: playersFromExport({player: salaries.map((salary, i) => ({id: String(i), name: `Player, ${i}`, position: "WR"}))}),
        league: {franchises: {franchise: {id: "0001", name: "Alpha"}}},
        rosters: {franchise: {id: "0001", player: salaries.map((salary, i) => ({id: String(i), status: "ROSTER", salary, contractYear: "1"}))}}
    });
    assert.equal(model.franchises.get("0001").capTotal, 300);
});

test("a penalty needs charging unless it's $0 or already charged", () => {
    const penalty = {franchiseId: "0002", fullName: "Ollie Gordon", amount: 8, charged: false};
    assert.equal(needsCharge(penalty), true);
    assert.equal(needsCharge({...penalty, charged: true}), false);
    // salary over $1 with no years left: capPenalty(0, 10) is $0
    assert.equal(needsCharge({...penalty, amount: 0}), false);
});

test("import data escapes text and resets to $1 / 0 years", () => {
    const penalty = {franchiseId: "0002", playerId: "4", amount: 8, explanation: `Ja'Marr "J" <Chase> & Co (2yrs@10, 10/03)`};
    assert.equal(salaryAdjXml(penalty),
        `<salary_adjustments><salary_adjustment franchise_id="0002" amount="8" `
        + `explanation="Ja'Marr &quot;J&quot; &lt;Chase&gt; &amp; Co (2yrs@10, 10/03)"/></salary_adjustments>`);
    assert.equal(resetSalaryXml(penalty),
        `<salaries><leagueUnit unit="LEAGUE"><player id="4" salary="1" contractYear="0"/></leagueUnit></salaries>`);
});
