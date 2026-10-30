// The payouts the daily job records in MFL's accounting, checked against what the commissioner
// recorded by hand for 2025.

import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {latestScoredWeek, missingPayouts, playoffPlaces} from "../site/v2/lib/payouts.js";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const ytd = fixture("weekly-results-ytd-2025.json").allWeeklyResults;
const handEntries = fixture("accounting-2025.json").accounting.entry;
const places = playoffPlaces([fixture("playoff-bracket-2025-1.json").playoffBracket, fixture("playoff-bracket-2025-2.json").playoffBracket]);
const season = {weeklyResults: ytd, lastRegularWeek: 14, endWeek: 17, places};
const only = (pattern) => ({entry: handEntries.filter((entry) => pattern.test(entry.description))});
const brief = (records) => records.map((record) => `${record.franchise} ${record.amount} ${record.description}`);

test("2025, as the commissioner recorded it, needs nothing more", () => {
    assert.deepEqual(missingPayouts({...season, accounting: {entry: handEntries}, finalWeek: 17}), {records: [], problem: null});
});

test("2025's weekly prizes, one record a week, as far as the final weeks go", () => {
    const {records, problem} = missingPayouts({...season, accounting: {entry: []}, finalWeek: 5});
    assert.equal(problem, null);
    assert.deepEqual(brief(records), ["0004 15 Most Points Week 1", "0010 15 Most Points Week 2", "0001 15 Most Points Week 3", "0004 15 Most Points Week 4", "0004 15 Most Points Week 5"]);
    // the hand entries list weeks together ("Most points weeks 1,4,5,9,13"): each counts
    assert.deepEqual(missingPayouts({...season, accounting: only(/^Most points/), finalWeek: 13}).records, []);
});

test("2025's all-play payouts once week 14 is final, as the commissioner recorded them", () => {
    const accounting = only(/^Most points/);
    assert.deepEqual(missingPayouts({...season, accounting, finalWeek: 13}).records, []);
    const {records} = missingPayouts({...season, accounting, finalWeek: 16});
    const recorded = handEntries.filter((entry) => /^All-play/.test(entry.description)).map((entry) => `${entry.franchise_id} ${Number(entry.amount)} ${entry.description}`);
    assert.deepEqual(brief(records).sort(), recorded.sort());
});

test("2025's places from what's left of the pot once week 17 is final", () => {
    // 2025's accounting has no league-wide entries; one that leaves the $465.02 the places split
    const pot = {franchise_id: "0000", amount: String(465.02 + 14 * 15 + 161.25), description: "Entry Fees"};
    const accounting = {entry: [...handEntries.filter((entry) => !/Place/.test(entry.description)), pot]};
    assert.deepEqual(brief(missingPayouts({...season, accounting, finalWeek: 17}).records), ["0004 255.76 1st Place", "0001 139.51 2nd Place", "0005 69.75 3rd Place"]);
    // before the championship is final, nothing
    assert.deepEqual(missingPayouts({...season, accounting, finalWeek: 16}).records, []);
    // a place recorded by hand isn't recorded again
    const second = {...accounting, entry: [...accounting.entry, {franchise_id: "0001", amount: "139.51", description: "2nd Place (Edit Amt)"}]};
    assert.deepEqual(brief(missingPayouts({...season, accounting: second, finalWeek: 17}).records), ["0004 255.76 1st Place", "0005 69.75 3rd Place"]);
});

test("places that are due but can't be worked out say why, and nothing is guessed", () => {
    const accounting = {entry: handEntries.filter((entry) => !/Place/.test(entry.description))};
    assert.deepEqual(missingPayouts({...season, accounting, finalWeek: 17}), {records: [], problem: "the accounting has no league-wide entries, so there's no pot to split"});
    assert.deepEqual(missingPayouts({...season, accounting, finalWeek: 17, places: null}), {records: [], problem: "MFL's playoff brackets don't name them"});
});

test("a tie for the week's high score splits the prize", () => {
    const week = (scores) => ({week: "1", matchup: [{franchise: scores.map(([id, score]) => ({id, score: String(score)}))}]});
    const {records} = missingPayouts({weeklyResults: {weeklyResults: [week([["0001", 120], ["0002", 120], ["0003", 90]])]}, accounting: {}, lastRegularWeek: 14, endWeek: 17, finalWeek: 1, places: null});
    assert.deepEqual(brief(records), ["0001 7.5 Most Points Week 1", "0002 7.5 Most Points Week 1"]);
});

test("the newest week with scores, not the scheduled ones still empty", () => {
    assert.equal(latestScoredWeek(fixture("weekly-results-ytd.json").allWeeklyResults), 5);
    assert.equal(latestScoredWeek({}), 0);
});
