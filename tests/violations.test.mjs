import {test} from "node:test";
import assert from "node:assert/strict";
import {ruleViolations as items} from "../site/v1/lib/violations.js";

const ruleViolations = (league, options) => items(league, options).map((item) => item.text);

const franchise = (teamName, capTotal, numPlayers, lineup = [], unchargedPenalty = 0) =>
    ({teamName, capTotal, unchargedPenalty, numPlayers, lineup});
const injured = {fullName: "Hurt Player", injured: true};
const healthy = {fullName: "Fine Player", injured: false};
const league = (week, ...franchises) => ({week, injuryReportKnown: true, franchises: new Map(franchises.map((f, i) => [String(i), f]))});

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

test("roster limits of 23 to 30, checked from week 1's kickoff through the championship in week 17", () => {
    // the preseason, after the league is renewed: only the cap
    assert.deepEqual(ruleViolations({...league("1", franchise("Crowded", 250, 34)), started: false}), []);
    assert.deepEqual(ruleViolations(league("17", franchise("Crowded", 250, 31), franchise("Thin", 250, 22))), [
        "Crowded is over the roster limit with 31 players!",
        "Thin is under the roster limit with 22 players!"
    ]);
    assert.deepEqual(ruleViolations(league("17", franchise("Full", 250, 30), franchise("Minimum", 250, 23))), []);
    assert.deepEqual(ruleViolations(league("18", franchise("Crowded", 250, 31), franchise("Thin", 250, 22))), []);
});

test("injured or suspended starters (anti-tanking): regular season lineups, until the playoffs start", () => {
    assert.deepEqual(ruleViolations(league("14", franchise("Risky", 250, 25, [injured, healthy]))),
        ["Risky started injured/suspended player Hurt Player in week 14!"]);
    assert.deepEqual(ruleViolations(league("15", franchise("Risky", 250, 25, [injured]))), []);
    // week 14's lineup once week 15 has kicked off
    assert.deepEqual(ruleViolations({...league("14", franchise("Risky", 250, 25, [injured])), tankingOver: true}), []);
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
    // after the championship, and before week 1 (whatever week MFL reports), IR isn't checked
    assert.deepEqual(ruleViolations(league("18", withIR(28, [onIR("Recovered", null)]))), []);
    assert.deepEqual(ruleViolations(league("", withIR(28, [onIR("Recovered", null)]))), []);
    assert.deepEqual(ruleViolations({...league("1", withIR(28, [onIR("Recovered", null)])), started: false}), []);
});

test("an add in its posting window shows when its contract length is due, as a notice", () => {
    const T = Date.UTC(2026, 9, 4, 2, 42) / 1000;
    const added = {playerId: "1", name: "Keenum, Case", franchiseId: "0003", type: "FREE_AGENT", added: T - 600};
    const teams = {week: "5", franchises: new Map([["0003", {...franchise("Cool Runnings", 250, 25), franchiseId: "0003"}]])};
    assert.deepEqual(items(teams, {pendingAdds: [added], now: T}), [{kind: "contract", franchiseId: "0003", warning: false,
        text: "Cool Runnings added Case Keenum: post his contract length on the message board by 10:32 PM CT, like \"Keenum: 3 years\", or it will be 1 year."}]);
    // what the board says so far: a length read, or one that couldn't be, as a warning
    const reading = (state, years) => new Map([["1", years ? {state, years} : {state}]]);
    assert.deepEqual(items(teams, {pendingAdds: [added], readings: reading("read", 2), now: T}), [{kind: "contract", franchiseId: "0003", warning: false,
        text: "Cool Runnings added Case Keenum: read 2 years from the message board. To change it, edit your latest post or post again by 10:32 PM CT."}]);
    assert.match(items(teams, {pendingAdds: [added], readings: reading("read", 1), now: T})[0].text, /read 1 year from/);
    assert.deepEqual(items(teams, {pendingAdds: [added], readings: reading("problem"), now: T}), [{kind: "contract", franchiseId: "0003", warning: true,
        text: "Cool Runnings added Case Keenum: couldn't read his contract length from the message board. Edit your latest post or post again by 10:32 PM CT, like \"Keenum: 3 years\"."}]);
    // once the hour is up, or for a blind bid (its length is in the bid comment), nothing shows
    assert.deepEqual(items(teams, {pendingAdds: [added], now: T + 3000}), []);
    assert.deepEqual(items(teams, {pendingAdds: [{...added, type: "BBID_WAIVER"}], now: T}), []);
});

test("once the championship week is over (MFL still says week 17), only the cap is checked", () => {
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
        // today's report: a realistic one, without him
        currentInjuries: {injury: Array.from({length: 60}, (_, i) => ({id: String(100 + i), status: "Out"}))}
    });
    assert.deepEqual(items(model).filter((item) => item.kind === "ir").map((item) => item.text),
        ["Alpha has Healthy Back on injured reserve, but the NFL doesn't list him on IR: move him to the active roster!"]);
});

test("without today's injury report, or with a thin one, the IR check is skipped rather than flagging everyone", async () => {
    const {buildLeague, playersFromExport} = await import("../site/v1/lib/league.js");
    const build = (currentInjuries) => buildLeague({
        players: playersFromExport({player: [{id: "1", name: "Hurt, Still", position: "RB"}]}),
        league: {franchises: {franchise: {id: "0001", name: "Alpha"}}},
        rosters: {franchise: {id: "0001", player: {id: "1", status: "INJURED_RESERVE", salary: "1", contractYear: "1"}}},
        weeklyResults: {week: "5"},
        currentInjuries
    });
    for (const report of [null, {injury: [{id: "1", status: "IR"}]}]) {
        assert.deepEqual(items(build(report)).filter((item) => item.kind.startsWith("ir")), []);
    }
});

test("season phases come from MFL's NFL schedule: playoffs' first kickoff, and the end of week 17", async () => {
    const {seasonPhase} = await import("../site/v1/lib/violations.js");
    const at = (iso) => String(Date.parse(iso) / 1000);
    const schedule = {
        15: [at("2026-12-17T01:15:00Z"), at("2026-12-20T18:00:00Z")],
        17: [at("2026-12-31T21:30:00Z"), at("2027-01-05T01:15:00Z")],
        1: [at("2026-09-11T00:20:00Z")]
    };
    const fetchImpl = async (url) => {
        const week = new URL(url).searchParams.get("W");
        return {ok: true, json: async () => ({nflSchedule: {matchup: (schedule[week] || []).map((kickoff) => ({kickoff}))}})};
    };
    const phase = (iso) => seasonPhase(2026, new Date(iso), {fetchImpl});
    assert.deepEqual(await phase("2026-09-01T12:00:00Z"), {started: false, tankingOver: false, seasonOver: false});
    assert.deepEqual(await phase("2026-12-16T12:00:00Z"), {started: true, tankingOver: false, seasonOver: false});
    assert.deepEqual(await phase("2026-12-17T01:15:00Z"), {started: true, tankingOver: true, seasonOver: false});
    // week 17's last game kicks off at 01:15; it's taken to be over four hours later
    assert.deepEqual(await phase("2027-01-05T05:14:00Z"), {started: true, tankingOver: true, seasonOver: false});
    assert.deepEqual(await phase("2027-01-05T05:15:00Z"), {started: true, tankingOver: true, seasonOver: true});
    // a schedule MFL hasn't published counts as not yet
    const unpublished = async () => ({ok: false, status: 404});
    assert.deepEqual(await seasonPhase(2027, new Date("2027-03-01T00:00:00Z"), {fetchImpl: unpublished}), {started: false, tankingOver: false, seasonOver: false});
});
