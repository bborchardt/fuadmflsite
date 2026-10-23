import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {otherBids, readBidRun, reasonText, runPlayers, yearsFor} from "../site/v2/ui/bids-model.js";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("a bid run: each group once, its claims and comment", () => {
    const groups = readBidRun(fixture("processed-waivers.html"));
    // Not 100% A Dick's group shows twice on MFL's page, once per processing step
    assert.equal(groups.filter((group) => group.team === "0008").length, 1);
    const notDick = groups.find((group) => group.team === "0008");
    assert.deepEqual(notDick.claims, [{name: "Marks, Woody", nfl: "HOU", position: "RB", amount: 2}, {name: "Demercado, Emari", nfl: "ARI", position: "RB", amount: 1}]);
    assert.equal(notDick.comment, "5yrs\n1yr");
    assert.equal(notDick.awarded, 1);
    assert.deepEqual(notDick.refused, {"Marks, Woody": "Is Not Available"});
    const kicker = groups.find((group) => group.team === "0006");
    assert.deepEqual([kicker.claims.map((claim) => claim.amount), kicker.comment, kicker.awarded], [[5], "", 0]);
    assert.equal(groups.find((group) => group.team === "0002").awarded, null);
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

test("a claim behind the one its group won was never tried, so it isn't another bid", () => {
    const groups = readBidRun(fixture("processed-waivers-backup.html"));
    const robinson = groups.find((group) => group.claims.length === 2);
    assert.deepEqual(robinson.claims.map((claim) => claim.name), ["Robinson, Demarcus", "Mostert, Raheem"]);
    assert.equal(robinson.awarded, 0);
    // Mostert $1 sat behind Robinson, whom the group won
    assert.deepEqual(otherBids(groups, "Mostert, Raheem", "0009"), []);
    assert.deepEqual(otherBids(groups, "Robinson, Demarcus", robinson.team).map((bid) => bid.amount), [2]);
});

test("a team naming a player in two groups shows its highest tried bid; the winner's own others don't show", () => {
    const groups = [
        {team: "0002", claims: [{name: "Marks, Woody", amount: 2}], comment: "", awarded: null},
        {team: "0002", claims: [{name: "Marks, Woody", amount: 4}], comment: "3 yrs", awarded: null},
        // never tried: the group won Thornton first
        {team: "0003", claims: [{name: "Thornton, Tyquan", amount: 2}, {name: "Marks, Woody", amount: 9}], comment: "", awarded: 0},
        {team: "0006", claims: [{name: "Marks, Woody", amount: 5}], comment: "", awarded: 0},
        {team: "0006", claims: [{name: "Marks, Woody", amount: 3}], comment: "", awarded: null}
    ];
    assert.deepEqual(otherBids(groups, "Marks, Woody", "0006"), [{team: "0002", amount: 4, years: 3}]);
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

test("a run by player: the winner and the other tried bids, players won first", () => {
    const players = runPlayers(readBidRun(fixture("processed-waivers.html")));
    assert.deepEqual(players.map((player) => [player.name, player.won && player.won.team, player.won && player.won.amount]), [
        ["Marks, Woody", "0006", 5], ["Thornton, Tyquan", "0009", 2], ["Demercado, Emari", "0008", 1], ["Shrader, Spencer", "0003", 1], ["Waller, Darren", "0007", 1]
    ]);
    assert.deepEqual(players[0].bids.map((bid) => [bid.team, bid.amount, bid.years, bid.reason]), [
        ["0002", 3, null, ""], ["0008", 2, 5, ""], ["0004", 2, 5, ""], ["0010", 2, 5, ""]
    ]);
    assert.deepEqual([players[4].nfl, players[4].position, players[4].won.years], ["MIA", "TE", 1]);
    // the backup behind a won claim was never tried, so its player isn't in the run
    assert.ok(!runPlayers(readBidRun(fixture("processed-waivers-backup.html"))).some((player) => player.name === "Mostert, Raheem"));
});

test("a player no one got shows each bid with MFL's reason, in a few words", () => {
    const groups = [{team: "0004", claims: [{name: "Rush, Cooper", nfl: "DAL", position: "QB", amount: 1}], comment: "", awarded: null,
        refused: {"Rush, Cooper": "Smith, Jo DAL QB Cannot Be Dropped Because Is Not On Franchise"}}];
    assert.deepEqual(runPlayers(groups), [{name: "Rush, Cooper", nfl: "DAL", position: "QB", won: null, bids: [{team: "0004", amount: 1, years: null, reason: "drop already gone"}]}]);
    assert.equal(reasonText("Is Not Available"), "taken");
    assert.equal(reasonText("Player Is Locked"), "locked");
});
