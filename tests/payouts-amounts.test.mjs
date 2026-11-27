// A league whose payouts are dollar amounts (settings.payouts allPlayTop, placeAmounts, divisionWinner),
// as the friend's league is, on FUAD's 2025 season: what the daily job records, and what it
// recognises as paid in the names that league's commissioner and MFL use.

import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import settings from "../site/v2/lib/settings.js";
import {allPlayPrizes, allPlayRecords, divisionWinners, missingPayouts, unpaidPlaces} from "../site/v2/lib/payouts.js";
import {placesWithoutSeeds} from "../site/v2/lib/rounds.js";
import {standings, winnings, winningsLine} from "../site/v2/ui/league-model.js";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const ytd = fixture("weekly-results-ytd-2025.json").allWeeklyResults;
const divisions = divisionWinners(fixture("league-standings.json").leagueStandings, fixture("league-settings.json").league);
const PLACES = ["0004", "0005", "0001", "0009", "0002", "0007"];
const season = {weeklyResults: ytd, lastRegularWeek: 14, endWeek: 17, places: PLACES, divisions};
const brief = (records) => records.map((record) => `${record.franchise} ${record.amount} ${record.description}`);
const entry = (franchise, description, amount = 0) => ({franchise_id: franchise, description, amount: String(amount)});

// the friend's payouts, for the time of a test
function asFriends(run) {
    const before = {payouts: settings.payouts, tiesBy: settings.playoffs.allPlayTiesBy};
    settings.payouts = {weeklyHighScore: 20, allPlayTop: [150, 100, 50], placeAmounts: [250, 200, 150, 100, 60, 60], divisionWinner: 100};
    settings.playoffs.allPlayTiesBy = "points";
    try {
        run();
    } finally {
        settings.payouts = before.payouts;
        settings.playoffs.allPlayTiesBy = before.tiesBy;
    }
}

test("dollar payouts: the all-play prizes, each division's winner and the places, with no pot", () => asFriends(() => {
    const {records, problem} = missingPayouts({...season, accounting: {entry: []}, finalWeek: 17});
    assert.equal(problem, null);
    assert.deepEqual(brief(records).filter((line) => !/Week/.test(line)), [
        "0004 150 1st Place All Play", "0005 100 2nd Place All Play", "0001 50 3rd Place All Play",
        "0004 100 Division Champ", "0005 100 Division Champ",
        "0004 250 1st Place", "0005 200 2nd Place", "0001 150 3rd Place", "0009 100 4th Place", "0002 60 5th Place", "0007 60 6th Place"
    ]);
    assert.ok(brief(records).includes("0004 20 Most Points Week 1"));
}));

test("dollar payouts: MFL's own weekly credit and the commissioner's names count as paid", () => asFriends(() => {
    const weeks = Array.from({length: 14}, (_, i) => i + 1);
    const credited = weeks.map((week) => entry("0004", `Credit for week ${week} high score of 150.00`, 20));
    const hand = [
        entry("0004", "1st Place All Play", 150), entry("0005", "2nd Place All Play", 100), entry("0001", "3rd Place All Play", 50),
        entry("0004", "Division Champ", 100), entry("0005", "Division Champ", 100),
        ...["1st", "2nd", "3rd", "4th", "5th", "6th"].map((place, i) => entry(PLACES[i], `${place} Place Playoffs`, 60))
    ];
    assert.deepEqual(missingPayouts({...season, accounting: {entry: [...credited, ...hand]}, finalWeek: 17}), {records: [], problem: null});
    // "2nd Place All Play" isn't the 2nd place's prize
    assert.deepEqual(unpaidPlaces({entry: [entry("0005", "2nd Place All Play", 100)]}), [1, 2, 3, 4, 5, 6]);
}));

test("dollar payouts: a division tied at the top is left for the commissioner, unless one of its teams is paid", () => asFriends(() => {
    const tied = divisions.map((division, i) => (i ? division : {...division, tied: true}));
    const {records, problem} = missingPayouts({...season, divisions: tied, accounting: {entry: []}, finalWeek: 14});
    assert.deepEqual(brief(records).filter((line) => /Division/.test(line)), ["0005 100 Division Champ"]);
    assert.equal(problem, "West's winner is decided by a tiebreak, so its $100 is left for the commissioner");
    const paid = missingPayouts({...season, divisions: tied, accounting: {entry: [entry("0007", "Division Champ", 100)]}, finalWeek: 14});
    assert.equal(paid.problem, null);
}));

test("all-play prizes: ties by points, then the overall record, or by the standings; a tie left splits the prizes", () => {
    const record = (w, l, points, h2h = [7, 7]) => ({w, l, t: 0, points, h2h: {w: h2h[0], l: h2h[1], t: 0}});
    const records = new Map([
        ["A", record(100, 54, 1800)], ["B", record(100, 54, 1900)], ["C", record(90, 64, 1700, [8, 6])], ["D", record(90, 64, 1700, [6, 8])], ["E", record(10, 144, 900)]
    ]);
    assert.deepEqual([...allPlayPrizes(records, {prizes: [150, 100, 50], tiesBy: "points"})], [["B", {place: 1, amount: 150}], ["A", {place: 2, amount: 100}], ["C", {place: 3, amount: 50}]]);
    assert.deepEqual([...allPlayPrizes(records, {prizes: [150, 100, 50], tiesBy: "standings", standingsOrder: ["E", "A", "D", "C", "B"]})].map(([id]) => id), ["A", "B", "D"]);
    // level on all of it: 2nd and 3rd's $150 split
    const level = new Map([["A", record(100, 54, 1800)], ["B", record(90, 64, 1700)], ["C", record(90, 64, 1700)]]);
    assert.deepEqual([...allPlayPrizes(level, {prizes: [150, 100, 50], tiesBy: "points"})], [["A", {place: 1, amount: 150}], ["B", {place: 2, amount: 75}], ["C", {place: 2, amount: 75}]]);
    assert.equal(allPlayPrizes(new Map([["A", {...record(1, 1, 1), w: NaN}]]), {prizes: [1]}), null);
});

test("the overall record from the weekly results' matchups", () => {
    const records = allPlayRecords(ytd, 14);
    assert.deepEqual(records.get("0004").h2h, {w: 12, l: 2, t: 0});
});

test("a rounds league's places for the job: a tie that decides a place is left for the commissioner", () => {
    const rounds = [{weeks: 1, headToHead: false, advance: 2}, {weeks: 2, headToHead: false}];
    const weeks = {playoffsStart: 15, championship: 17};
    const week = (number, pairs, scores) => ({week: String(number), matchup: pairs.map((pair) => ({franchise: pair.map((id) => ({id, score: String(scores[id])}))}))});
    const results = (w17) => ({weeklyResults: [
        week(15, [["E", "F"], ["C", "D"]], {E: 120, F: 110, C: 130, D: 100}),
        week(16, [["A", "B"], ["C", "E"]], {A: 150, B: 140, C: 130, E: 120}),
        week(17, [["A", "B"], ["C", "E"]], {A: 120, B: 110, C: 100, E: 90, ...w17})
    ]});
    assert.deepEqual(placesWithoutSeeds(results({}), {rounds, weeks}), {places: ["A", "B", "C", "E", "F", "D"], problem: null});
    // B level with A on 270
    assert.deepEqual(placesWithoutSeeds(results({B: 130}), {rounds, weeks}).places, null);
    assert.match(placesWithoutSeeds(results({B: 130}), {rounds, weeks}).problem, /^a tie between playoff teams decides a place/);
    assert.deepEqual(placesWithoutSeeds(results({}), {rounds, weeks, completedWeek: 16}), {places: null, problem: null});
});

test("Winners with dollar payouts: the all-play place, the division prize, the places' amounts, no pot", () => asFriends(() => {
    const league = fixture("league-settings.json").league;
    const names = new Map(league.franchises.franchise.map((team) => [team.id, team.name]));
    const divisionsShown = standings(fixture("league-standings-2025.json").leagueStandings, league, names, allPlayRecords(ytd, 14));
    const rows = divisionsShown.flatMap((division) => division.rows);
    const result = winnings({
        accounting: {entry: []}, weeklyResults: ytd, standingRows: rows, lastRegularWeek: 14, places: PLACES, names,
        divisionWinners: divisionsShown.map((division) => division.rows[0].id)
    });
    assert.equal(result.hasPot, false);
    assert.deepEqual(result.prizes.map((prize) => [prize.place, prize.share, prize.amount, prize.team]), [
        ["1st", null, 250, "0004"], ["2nd", null, 200, "0005"], ["3rd", null, 150, "0001"], ["4th", null, 100, "0009"], ["5th", null, 60, "0002"], ["6th", null, 60, "0007"]
    ]);
    const top = result.rows.find((row) => row.id === "0004");
    assert.deepEqual([top.allPlayPlace, top.allPlay, top.division], ["1st", 150, 100]);
    assert.match(winningsLine(top), /^Weeks 1, 4, 5, 9, 13 \$100\.00 · 102-24 all-play 1st \$150\.00 · Division \$100\.00 · 1st \$250\.00$/);
    assert.equal(top.total, 600);
}));
