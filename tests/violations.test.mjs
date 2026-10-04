// Tests for the roster and salary cap violations box on the Main tab.
// The expected messages and week cut-offs are the ones the pre-v1 code produced
// (legacy/fuadCommish.hbs), so members see the same warnings.

import {test} from "node:test";
import assert from "node:assert/strict";
import {ruleViolations as items} from "../site/v1/lib/violations.js";

const ruleViolations = (league, options) => items(league, options).map((item) => item.text);

const franchise = (teamName, capTotal, numPlayers, lineup = [], unchargedPenalty = 0) =>
    ({teamName, capTotal, unchargedPenalty, numPlayers, lineup});
const injured = {fullName: "Hurt Player", injured: true};
const healthy = {fullName: "Fine Player", injured: false};
const league = (week, ...franchises) => ({week, franchises: new Map(franchises.map((f, i) => [String(i), f]))});

test("over the salary cap, at any week", () => {
    for (const week of ["3", "17"]) {
        assert.deepEqual(ruleViolations(league(week, franchise("Big Spenders", 300.5, 25))),
            ["Big Spenders is over the salary cap with a total salary of 300.5!"]);
    }
    assert.deepEqual(ruleViolations(league("3", franchise("Right At It", 300, 25))), []);
});

test("drop penalties not yet charged count toward the cap, and the warning says so", () => {
    assert.deepEqual(ruleViolations(league("3", franchise("Bid And Drop", 304, 25, [], 8))),
        ["Bid And Drop is over the salary cap with a total salary of 304, counting $8 in drop penalties not yet charged!"]);
});

test("roster limits of 23 to 30, checked through the championship in week 17", () => {
    assert.deepEqual(ruleViolations(league("17", franchise("Crowded", 250, 31), franchise("Thin", 250, 22))), [
        "Crowded is over the roster limit with 31 players!",
        "Thin is under the roster limit with 22 players!"
    ]);
    assert.deepEqual(ruleViolations(league("17", franchise("Full", 250, 30), franchise("Minimum", 250, 23))), []);
    assert.deepEqual(ruleViolations(league("18", franchise("Crowded", 250, 31), franchise("Thin", 250, 22))), []);
});

test("injured or suspended starters (anti-tanking), checked through the championship in week 17", () => {
    assert.deepEqual(ruleViolations(league("17", franchise("Risky", 250, 25, [injured, healthy]))),
        ["Risky started injured/suspended player Hurt Player in week 17!"]);
    assert.deepEqual(ruleViolations(league("18", franchise("Risky", 250, 25, [injured]))), []);
});

test("before any results (no week yet) every check applies", () => {
    assert.deepEqual(ruleViolations(league("", franchise("Everything Wrong", 301, 31, [injured]))), [
        "Everything Wrong is over the salary cap with a total salary of 301!",
        "Everything Wrong is over the roster limit with 31 players!",
        "Everything Wrong started injured/suspended player Hurt Player in week !"
    ]);
});

const onIR = (fullName, injuryStatus) => ({fullName, injuryStatus});

test("a player on injured reserve the NFL doesn't list on IR must come back, during the season", () => {
    const withIR = (numPlayers, irPlayers) => ({...franchise("Stash", 250, numPlayers), irPlayers});
    assert.deepEqual(ruleViolations(league("8", withIR(28, [onIR("Still Hurt", "IR"), onIR("Short Stint", "IR-R"), onIR("Recovered", null), onIR("Doubtful Guy", "Out")]))), [
        "Stash has Recovered on injured reserve, but the NFL doesn't list him on IR: move him to the active roster!",
        "Stash has Doubtful Guy on injured reserve, but the NFL doesn't list him on IR: move him to the active roster!"
    ]);
    // moving him back would break the roster limit
    assert.deepEqual(ruleViolations(league("17", withIR(30, [onIR("Recovered", null)]))), [
        "Stash has Recovered on injured reserve, but the NFL doesn't list him on IR: move him to the active roster!",
        "Moving him back would put Stash at 31 players, over the roster limit!"
    ]);
    // after the championship, and in the offseason before week 1, IR isn't checked
    assert.deepEqual(ruleViolations(league("18", withIR(28, [onIR("Recovered", null)]))), []);
    assert.deepEqual(ruleViolations(league("", withIR(28, [onIR("Recovered", null)]))), []);
});

test("an add in its posting window shows when its contract length is due, as a notice", () => {
    const T = Date.UTC(2026, 9, 4, 2, 42) / 1000;
    const added = {playerId: "1", name: "Keenum, Case", franchiseId: "0003", type: "FREE_AGENT", added: T - 600};
    const teams = {week: "5", franchises: new Map([["0003", {...franchise("Cool Runnings", 250, 25), franchiseId: "0003"}]])};
    assert.deepEqual(items(teams, {pendingAdds: [added], now: T}), [{kind: "contract", franchiseId: "0003", warning: false,
        text: "Cool Runnings added Case Keenum: post his contract length on the message board by 10:32 PM CT, or it will be 1 year."}]);
    // once the hour is up, or for a blind bid (its length is in the bid comment), nothing shows
    assert.deepEqual(items(teams, {pendingAdds: [added], now: T + 3000}), []);
    assert.deepEqual(items(teams, {pendingAdds: [{...added, type: "BBID_WAIVER"}], now: T}), []);
});

test("once the season is over (MFL still says week 17), only the cap is checked", () => {
    const over = {...league("17", franchise("Offseason", 301, 34, [injured])), seasonOver: true};
    over.franchises.get("0").irPlayers = [onIR("Recovered", null)];
    assert.deepEqual(ruleViolations(over), ["Offseason is over the salary cap with a total salary of 301!"]);
});

test("warnings follow franchise order", () => {
    assert.deepEqual(ruleViolations(league("3", franchise("First", 301, 25), franchise("Second", 302, 25))), [
        "First is over the salary cap with a total salary of 301!",
        "Second is over the salary cap with a total salary of 302!"
    ]);
});

test("injured reserve eligibility reads today's injury report, not the results week's", async () => {
    const {buildLeague, playersFromExport} = await import("../site/v1/lib/league.js");
    const model = buildLeague({
        players: playersFromExport({player: [{id: "1", name: "Back, Healthy", position: "RB"}]}),
        league: {franchises: {franchise: {id: "0001", name: "Alpha"}}},
        rosters: {franchise: {id: "0001", player: {id: "1", status: "INJURED_RESERVE", salary: "1", contractYear: "1"}}},
        weeklyResults: {week: "5"},
        // last week's report had him on IR; today's doesn't
        injuries: {injury: {id: "1", status: "IR"}},
        currentInjuries: {injury: []}
    });
    assert.deepEqual(items(model).filter((item) => item.kind === "ir").map((item) => item.text),
        ["Alpha has Healthy Back on injured reserve, but the NFL doesn't list him on IR: move him to the active roster!"]);
});
