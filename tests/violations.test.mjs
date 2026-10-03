// Tests for the roster and salary cap violations box on the Main tab.
// The expected messages and week cut-offs are the ones the pre-v1 code produced
// (legacy/fuadCommish.hbs), so members see the same warnings.

import {test} from "node:test";
import assert from "node:assert/strict";
import {ruleViolations} from "../site/v1/ui/violations.js";

const franchise = (teamName, salary, numPlayers, lineup = []) => ({teamName, salary, numPlayers, lineup});
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

test("roster limits of 23 to 30, checked through week 15", () => {
    assert.deepEqual(ruleViolations(league("15", franchise("Crowded", 250, 31), franchise("Thin", 250, 22))), [
        "Crowded is over the roster limit with 31 players!",
        "Thin is under the roster limit with 22 players!"
    ]);
    assert.deepEqual(ruleViolations(league("15", franchise("Full", 250, 30), franchise("Minimum", 250, 23))), []);
    assert.deepEqual(ruleViolations(league("16", franchise("Crowded", 250, 31), franchise("Thin", 250, 22))), []);
});

test("injured or suspended starters, checked through week 14", () => {
    assert.deepEqual(ruleViolations(league("14", franchise("Risky", 250, 25, [injured, healthy]))),
        ["Risky started injured/suspended player Hurt Player in week 14!"]);
    assert.deepEqual(ruleViolations(league("15", franchise("Risky", 250, 25, [injured]))), []);
});

test("before any results (no week yet) every check applies", () => {
    assert.deepEqual(ruleViolations(league("", franchise("Everything Wrong", 301, 31, [injured]))), [
        "Everything Wrong is over the salary cap with a total salary of 301!",
        "Everything Wrong is over the roster limit with 31 players!",
        "Everything Wrong started injured/suspended player Hurt Player in week !"
    ]);
});

test("warnings follow franchise order", () => {
    assert.deepEqual(ruleViolations(league("3", franchise("First", 301, 25), franchise("Second", 302, 25))), [
        "First is over the salary cap with a total salary of 301!",
        "Second is over the salary cap with a total salary of 302!"
    ]);
});
