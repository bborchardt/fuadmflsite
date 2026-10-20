import {test} from "node:test";
import assert from "node:assert/strict";
import {bidDrops, checkDrop, dropRows, readRoster} from "../site/v2/ui/drop-model.js";

// MFL's Drop Players page script, as saved from the clone on 17 Oct 2026
const page = `
   pdb_picker[0] = new Player2 ("17072","Harris, Tre","LAC","WR",7,"$1","O","NS","","","1");
   pdb_picker[19] = new Player2 ("16619","Franklin, Troy!","DEN","WR",10,"$1","","NS","","","1");
   pdb_picker[21] = new Player2 ("16167","Achane, De'Von","MIA","RB",6,"$1","I","IR","","","1");`;

test("MFL's roster list comes from the page's script, with its game-started mark", () => {
    const roster = readRoster(page);
    assert.equal(roster.length, 3);
    assert.deepEqual(roster[1], {index: 19, id: "16619", mflName: "Franklin, Troy", name: "Troy Franklin", mark: "!", nfl: "DEN", pos: "WR"});
    assert.equal(roster[2].name, "De'Von Achane");
    assert.equal(roster[0].mark, null);
});

// the clone's team: $293 used, 30 active
const player = (playerId, fullName, salary, years, extra = {}) => ({playerId, fullName, salary, years, capPenalty: years > 0 ? Math.max(Math.ceil(Math.max(1, 0.4 * salary * years)), years) : 0,
    status: "ROSTER", nflPosition: "WR", team: "DET", transactions: [], ...extra});
function teamOf({cap = 293, active = 30, groups = []} = {}) {
    const franchise = {franchiseId: "0001", capTotal: cap, numPlayers: active};
    const players = new Map([
        ["lamar", player("lamar", "Lamar Jackson", 68, 1, {nflPosition: "QB"})],
        ["williams", player("williams", "Antonio Williams", 1, 5)],
        ["olave", player("olave", "Chris Olave", 1, 1)],
        ["franklin", player("franklin", "Troy Franklin", 1, 3)],
        ["achane", player("achane", "De'Von Achane", 1, 2, {status: "INJURED_RESERVE", nflPosition: "RB"})]
    ]);
    players.forEach((entry) => {
        entry.franchise = franchise;
    });
    return {franchise, groups, players};
}

test("a drop's cap used takes his penalty for his salary", () => {
    const team = teamOf();
    // Lamar: $68 off, $28 on
    assert.deepEqual(checkDrop(team, {drop: "lamar", phase: "season"}), {fits: true, why: null, cap: {from: 293, to: 253}});
    // Williams' $5 penalty is more than his $1 salary
    assert.deepEqual(checkDrop(team, {drop: "williams", phase: "season"}).cap, {from: 293, to: 297});
});

test("a drop is blocked when, with the pending bids, it takes cap used past the cap", () => {
    // $299 used: Williams' +$4 makes $303
    assert.equal(checkDrop(teamOf({cap: 299}), {drop: "williams", phase: "season"}).why, "over cap");
    // $295 with a $2 bid pending: $299 + $2 is over
    const bidding = teamOf({cap: 295, groups: [{round: 1, claims: [{add: "x", bid: 2, drop: null}]}]});
    assert.equal(checkDrop(bidding, {drop: "williams", phase: "season"}).why, "over cap");
    assert.equal(checkDrop(bidding, {drop: "olave", phase: "season"}).fits, true);
    // already over the cap, a drop that lowers cap used is fine, one that raises it isn't
    const over = teamOf({cap: 304});
    assert.equal(checkDrop(over, {drop: "lamar", phase: "season"}).fits, true);
    assert.equal(checkDrop(over, {drop: "olave", phase: "season"}).fits, true);
    assert.equal(checkDrop(over, {drop: "williams", phase: "season"}).why, "over cap");
    // the cap holds before the season too
    assert.equal(checkDrop(teamOf({cap: 299}), {drop: "williams", phase: "closed"}).why, "over cap");
});

test("a pending claim dropping the same player counts as no drop after it, so the drop itself isn't what breaks the cap", () => {
    // the claim's $5 bid frees Olave's $1: cap used +$4 if it wins; after the drop it's +$5 with Olave gone
    const team = teamOf({cap: 296, groups: [{round: 1, claims: [{add: "x", bid: 5, drop: "olave"}]}]});
    assert.equal(checkDrop(team, {drop: "olave", phase: "season"}).fits, true);
    assert.deepEqual([...bidDrops(team.groups)], [["olave", 1]]);
});

test("in season, no active drop at 23 active and no drop at all under 23", () => {
    assert.equal(checkDrop(teamOf({active: 24}), {drop: "olave", phase: "season"}).fits, true);
    assert.equal(checkDrop(teamOf({active: 23}), {drop: "olave", phase: "season"}).why, "under roster minimum");
    assert.equal(checkDrop(teamOf({active: 23}), {drop: "achane", phase: "season"}).fits, true);
    assert.equal(checkDrop(teamOf({active: 22}), {drop: "achane", phase: "season"}).why, "under roster minimum");
    // no roster limits before week 1 (2.5)
    assert.equal(checkDrop(teamOf({active: 20}), {drop: "olave", phase: "preseason"}).fits, true);
    assert.equal(checkDrop(teamOf({active: 20}), {drop: "olave", phase: "closed"}).fits, true);
});

test("the rows: by position, a started game's player off, a pending bid's drop noted", () => {
    const team = teamOf({groups: [{round: 2, claims: [{add: "x", bid: 1, drop: "olave"}]}]});
    const groups = dropRows(team, {roster: [{id: "franklin", mark: "!"}, {id: "olave", mark: null}], phase: "season"});
    assert.deepEqual(groups.map((group) => group.pos), ["QB", "RB", "WR"]);
    const wr = groups.find((group) => group.pos === "WR").players;
    const franklin = wr.find((row) => row.player.playerId === "franklin");
    assert.equal(franklin.off, true);
    assert.equal(franklin.why, "Game started");
    const olave = wr.find((row) => row.player.playerId === "olave");
    assert.equal(olave.usedIn, 2);
    assert.equal(olave.capChange, 0);
    assert.equal(groups[0].players[0].capChange, -40);
});
