import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {otherBids, readBidRun, yearsFor} from "../site/v2/ui/bids-model.js";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("a bid run: each group once, its claims and comment", () => {
    const groups = readBidRun(fixture("processed-waivers.html"));
    // Not 100% A Dick's group shows twice on MFL's page, once per processing step
    assert.equal(groups.filter((group) => group.team === "0008").length, 1);
    assert.deepEqual(groups.find((group) => group.team === "0008"), {
        team: "0008", claims: [{name: "Marks, Woody", amount: 2}, {name: "Demercado, Emari", amount: 1}], comment: "5yrs\n1yr"
    });
    assert.deepEqual(groups.find((group) => group.team === "0006"), {team: "0006", claims: [{name: "Marks, Woody", amount: 5}], comment: ""});
});

test("a page without the waiver table reads as nothing", () => {
    assert.equal(readBidRun("<html><body>Login</body></html>"), null);
});

test("the other teams' bids on a won player, highest first, with the years their comments give", () => {
    const groups = readBidRun(fixture("processed-waivers.html"));
    assert.deepEqual(otherBids(groups, "Marks, Woody", "0006"), [
        {team: "0002", amount: 3, years: null},
        {team: "0008", amount: 2, years: 5},
        {team: "0004", amount: 2, years: 5},
        {team: "0010", amount: 2, years: 5}
    ]);
    assert.deepEqual(otherBids(groups, "Shrader, Spencer", "0003"), []);
    // v2 names players "Woody Marks"
    assert.equal(otherBids(groups, "Woody Marks", "0006").length, 4);
});

test("a comment's years go to the claim they're for", () => {
    const two = {claims: [{name: "Marks, Woody"}, {name: "Demercado, Emari"}], comment: "5yrs\n1yr"};
    assert.equal(yearsFor(two, 0), 5);
    assert.equal(yearsFor(two, 1), 1);
    const named = {claims: [{name: "Marks, Woody"}, {name: "Demercado, Emari"}], comment: "Demercado 2 years"};
    assert.equal(yearsFor(named, 1), 2);
    assert.equal(yearsFor(named, 0), null);
    assert.equal(yearsFor({claims: [{name: "Marks, Woody"}], comment: "5 years."}, 0), 5);
    assert.equal(yearsFor({claims: [{name: "Marks, Woody"}], comment: ""}, 0), null);
});
