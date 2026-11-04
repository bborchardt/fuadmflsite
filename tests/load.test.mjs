import {test} from "node:test";
import assert from "node:assert/strict";
import {draftResultsXml, matchOwner, matchPlayer, planAuction, planRookies, plainName, readAuction, readRookies, rosterSteps, salariesXml} from "../site/v2/lib/load.js";

const tsv = (rows) => rows.map((row) => row.join("\t")).join("\n");

// the Franchises tab as Excel copies it: a block of five columns a team, owners' first names on top
const AUCTION = tsv([
    ["Ann", "", "$", "Yrs", "", "Bob", "", "$", "Yrs"],
    ["Lamar Jackson", "QB2", "68", "0", "", "Shedeur Sanders", "QB35", "1", "4"],
    ["Tua Tagovailoa", "QB32", "", "0", "", "Mason Rudolph", "", "1", "0"],
    ["", "", "", "", "", "", "", "", ""],
    ["AJ Brown", "WR7", "35", "1", "", "Marvin Harrison Jr.", "WR31", "1", "3"],
    ["cap penalties", "", "", "", "", "cap penalties", "", "", ""],
    ["total", "", "104", "2", "", "total", "", "3", "3"]
]);

const players = new Map([
    {id: "1", name: "Jackson, Lamar", position: "QB", team: "BAL"},
    {id: "2", name: "Tagovailoa, Tua", position: "QB", team: "MIA"},
    {id: "3", name: "Brown, A.J.", position: "WR", team: "PHI"},
    {id: "4", name: "Sanders, Shedeur", position: "QB", team: "CLE"},
    {id: "5", name: "Rudolph, Mason", position: "QB", team: "PIT"},
    {id: "6", name: "Harrison Jr., Marvin", position: "WR", team: "ARI"},
    {id: "7", name: "Brown, Amon-Ra St.", position: "WR", team: "DET"},
    {id: "8", name: "Johnson, Josh", position: "QB", team: "WAS"},
    {id: "9", name: "Johnson, Josh", position: "WR", team: "FA"},
    {id: "10", name: "Knight, Zonovan", position: "RB", team: "ARI"},
    {id: "11", name: "Knight, Kyle", position: "TE", team: "FA"}
].map((player) => [player.id, player]));

test("the auction's tab: a block a team, a player with no $ released, the footer left out", () => {
    const [ann, bob] = readAuction(AUCTION);
    assert.equal(ann.owner, "Ann");
    assert.deepEqual(ann.players.map(({name, position, salary, years}) => [name, position, salary, years]), [
        ["Lamar Jackson", "QB", 68, 0], ["Tua Tagovailoa", "QB", null, 0], ["AJ Brown", "WR", 35, 1]
    ]);
    // no rank: any position
    assert.deepEqual(bob.players.map(({name, position, salary}) => [name, position, salary]), [
        ["Shedeur Sanders", "QB", 1], ["Mason Rudolph", null, 1], ["Marvin Harrison Jr.", "WR", 1]
    ]);
    assert.deepEqual(readAuction("nothing like it"), []);
});

test("names as people write them match MFL's; what doesn't is offered, never guessed", () => {
    assert.equal(plainName("Harrison Jr., Marvin"), plainName("Marvin Harrison Jr."));
    assert.equal(plainName("Brown, A.J."), "aj brown");
    assert.deepEqual(matchPlayer({name: "AJ Brown", position: "WR"}, players), {id: "3"});
    assert.deepEqual(matchPlayer({name: "Marvin Harrison Jr.", position: "WR"}, players), {id: "6"});
    // two of the name: the position tells them apart, or the team's roster does
    assert.deepEqual(matchPlayer({name: "Josh Johnson", position: "WR"}, players), {id: "9"});
    assert.deepEqual(matchPlayer({name: "Josh Johnson", position: null}, players), {choices: ["8", "9"]});
    assert.deepEqual(matchPlayer({name: "Josh Johnson", position: null}, players, ["8"]), {id: "8"});
    // a nickname: the same last name at his position to pick from
    assert.deepEqual(matchPlayer({name: "Bam Knight", position: "RB"}, players), {choices: ["10"]});
    assert.deepEqual(matchPlayer({name: "Nobody Here", position: "QB"}, players), {choices: []});
});

test("owners by first name; none or two of a name is left to pick", () => {
    const franchises = [{id: "0001", owner_name: "Ann Smith"}, {id: "0002", owner_name: "bob jones"}, {id: "0003", owner_name: "Cy Young"}, {id: "0004", owner_name: "Cy Twombly"}, {id: "0005"}];
    assert.equal(matchOwner("Ann", franchises), "0001");
    assert.equal(matchOwner("Bob", franchises), "0002");
    assert.equal(matchOwner("Cy", franchises), null);
    assert.equal(matchOwner("Dee", franchises), null);
});

test("the auction's changes: releases, adds and salaries, a player on two sheets left for the commissioner", () => {
    const rosters = {franchise: [
        {id: "0001", player: [{id: "1", salary: "0.01", contractYear: "0"}, {id: "2", salary: "20", contractYear: "0"}, {id: "3", salary: "35", contractYear: "1"}]},
        {id: "0002", player: [{id: "4", salary: "1", contractYear: "4"}, {id: "11", salary: "1", contractYear: "2"}]},
        {id: "0003", player: {id: "8", salary: "3", contractYear: "1"}}
    ]};
    const teams = [
        // Lamar kept at the auction's $68; Tua released; AJ Brown as he was
        {franchiseId: "0001", players: [{id: "1", salary: 68, years: 0}, {id: "2", salary: null, years: 0}, {id: "3", salary: 35, years: 1}]},
        // Sanders as he was; Rudolph bought; Knight not on the sheet at all: released
        {franchiseId: "0002", players: [{id: "4", salary: 1, years: 4}, {id: "5", salary: 1, years: null}, {id: "6", salary: 1, years: 3}, {id: "9", salary: 2, years: 0}]},
        {franchiseId: "0004", players: [{id: "9", salary: 3, years: 0}]}
    ];
    assert.deepEqual(planAuction({teams, rosters}), {
        release: [{franchiseId: "0001", id: "2", years: 0, salary: 20}, {franchiseId: "0002", id: "11", years: 2, salary: 1}],
        add: [{franchiseId: "0002", id: "5"}, {franchiseId: "0002", id: "6"}],
        salaries: [{id: "1", salary: 68, years: 0}, {id: "5", salary: 1, years: 0}, {id: "6", salary: 1, years: 3}],
        conflicts: [{id: "9", franchiseIds: ["0002", "0004"]}]
    });
});

test("the rookie tab: its Pick, Owner and Player columns in pick order, on the rookie scale", () => {
    const sheet = tsv([
        ["Player", "Bye", "NFL", "Pos", "VL", "V", "VH", "FP", "D", "", "Pick", "Owner", "Player"],
        ["Jeremiyah Love", "ARI/14", "1.3", "RB1", "235", "311", "391", "1", "3", "", "1.1", "Ann", "Josh Johnson"],
        ["Carnell Tate", "TEN/9", "1.4", "WR1", "162", "247", "337", "3", "3", "", "1.2", "Bob", "Lamar Jackson"],
        ["Makai Lemon", "PHI/10", "1.2", "WR2", "106", "168", "234", "5", "6", "", "2.1", "Bob", "AJ Brown"],
        ["Sam Roush", "", "", "", "", "", "", "", "", "", "", "", ""]
    ]);
    assert.deepEqual(readRookies(sheet).map(({owner, name}) => [owner, name]), [["Ann", "Josh Johnson"], ["Bob", "Lamar Jackson"], ["Bob", "AJ Brown"]]);
    const picks = planRookies({picks: [{franchiseId: "0001", id: "9"}, {franchiseId: "0002", id: "1"}, {franchiseId: "0002", id: "3"}], teams: 2, players});
    // WR $10 first overall; QB $6 at the second pick, 20% less: $5; WR at the third: $6
    assert.deepEqual(picks.map(({round, pick, salary}) => [round, pick, salary]), [[1, 1, 10], [1, 2, 5], [2, 1, 6]]);
    assert.equal(draftResultsXml(picks), '<draftResults><draftUnit unit="LEAGUE" round1DraftOrder="0001,0002,">'
        + '<draftPick round="01" pick="01" franchise="0001" player="9"/><draftPick round="01" pick="02" franchise="0002" player="1"/>'
        + '<draftPick round="02" pick="01" franchise="0002" player="3"/></draftUnit></draftResults>');
    assert.equal(salariesXml([{id: "9", salary: 10, years: 0}]), '<salaries><leagueUnit unit="LEAGUE"><player id="9" salary="10" contractYear="0"/></leagueUnit></salaries>');
});

test("the rosters sent: every team's whole roster, unloads before loads so a player can change teams", () => {
    const rosters = {franchise: [{id: "0001", player: [{id: "1"}, {id: "2"}]}, {id: "0002", player: {id: "3"}}]};
    // 2 goes from Ann to Bob; Bob's 3 is unloaded; Ann takes on 4
    const steps = rosterSteps({rosters, release: [{franchiseId: "0001", id: "2"}, {franchiseId: "0002", id: "3"}], add: [{franchiseId: "0002", id: "2"}, {franchiseId: "0001", id: "4"}]});
    assert.deepEqual(steps.map(({franchiseId, ids}) => [franchiseId, ids]), [["0001", ["1"]], ["0002", []], ["0002", ["2"]], ["0001", ["1", "4"]]]);
    assert.deepEqual(steps.map(({unloaded, loaded}) => [unloaded, loaded]), [[["2"], []], [["3"], []], [[], ["2"]], [[], ["4"]]]);
});
