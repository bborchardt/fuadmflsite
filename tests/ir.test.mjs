import {test} from "node:test";
import assert from "node:assert/strict";
import {checkIR, dropChoices, injuryReport, irBlockText, irFields, irGroups, movesText, savedMoves} from "../site/v2/ui/ir-model.js";

// the clone's team: $293 used, 30 active
const player = (playerId, fullName, salary, years, extra = {}) => ({playerId, fullName, salary, years, capPenalty: years > 0 ? Math.max(Math.ceil(Math.max(1, 0.4 * salary * years)), years) : 0,
    status: "ROSTER", nflPosition: "WR", team: "DET", transactions: [], ...extra});
function teamOf({cap = 293, active = 30, groups = []} = {}) {
    const franchise = {franchiseId: "0001", capTotal: cap, numPlayers: active};
    const players = new Map([
        ["hurts", player("hurts", "Jalen Hurts", 65, 1, {nflPosition: "QB"})],
        ["coleman", player("coleman", "Jonah Coleman", 1, 5, {nflPosition: "RB"})],
        ["williams", player("williams", "Antonio Williams", 1, 5)],
        ["olave", player("olave", "Chris Olave", 1, 1)],
        ["rodgers", player("rodgers", "Aaron Rodgers", 4, 1, {nflPosition: "QB"})],
        ["achane", player("achane", "De'Von Achane", 1, 2, {status: "INJURED_RESERVE", nflPosition: "RB"})],
        ["mcmillan", player("mcmillan", "Jalen McMillan", 1, 3, {status: "INJURED_RESERVE"})]
    ]);
    players.forEach((entry) => {
        entry.franchise = franchise;
    });
    return {franchise, groups, players};
}

// MFL's IR page as readIRPage reads it: Hurts can go, Coleman's game has started, Olave locked too
const page = {
    active: [
        {id: "hurts", move: true, drop: true, locked: false, tag: "IR"},
        {id: "coleman", move: false, drop: false, locked: true, tag: "IR"},
        {id: "williams", move: false, drop: true, locked: false, tag: ""},
        {id: "olave", move: false, drop: false, locked: true, tag: ""},
        {id: "rodgers", move: false, drop: true, locked: false, tag: "Out"}
    ],
    reserve: [
        {id: "achane", move: true, drop: true, locked: false, tag: "IR"},
        {id: "mcmillan", move: true, drop: true, locked: false, tag: "IR"}
    ]
};

// a realistic report: 50 entries or more
const reportOf = (entries) => injuryReport({injury: entries.concat(Array.from({length: 60}, (_, index) => ({id: `x${index}`, status: "Questionable"})))});

test("a thin injury report isn't trusted", () => {
    assert.equal(injuryReport({injury: [{id: "achane", status: "IR"}]}), null);
    assert.equal(injuryReport(null), null);
    assert.equal(reportOf([]).size, 60);
});

test("the groups: who MFL lets go on IR, a started game's player off, and who must come off", () => {
    const report = reportOf([
        {id: "hurts", status: "IR", details: "Calf", exp_return: "Nov 22, 2026"},
        {id: "coleman", status: "IR", details: "Ankle", exp_return: "Oct 25, 2026"},
        {id: "achane", status: "IR-R", details: "Knee - ACL", exp_return: "Feb 15, 2027"},
        {id: "mcmillan", status: "Questionable", details: "Knee", exp_return: "Oct 25, 2026"}
    ]);
    const {canGo, onIR} = irGroups({players: teamOf().players}, page, report);
    assert.deepEqual(canGo.map((row) => [row.player.playerId, row.off, row.why, row.status, row.back]), [
        ["hurts", false, "", "NFL IR · Calf", "Nov 22"],
        ["coleman", true, "Game started", "NFL IR · Ankle", "Oct 25"]
    ]);
    assert.deepEqual(onIR.map((row) => [row.player.playerId, row.must, row.status, row.back]), [
        ["achane", false, "NFL IR-R · Knee - ACL", "Feb 15"],
        ["mcmillan", true, "No longer on the NFL’s IR", ""]
    ]);
    // without a report to trust, no one must come off, and MFL's own mark stands in
    const blind = irGroups({players: teamOf().players}, page, null);
    assert.equal(blind.onIR.some((row) => row.must), false);
    assert.equal(blind.onIR[0].status, "IR");
});

test("moves to IR and activations change the active count, not cap used", () => {
    const team = teamOf();
    assert.deepEqual(checkIR(team, {toIR: ["hurts"], limits: true}), {active: {from: 30, to: 29}, cap: {from: 293, to: 293}, bids: null, bidsCap: null, why: null, needsDrop: false});
    // a swap stays at 30
    assert.equal(checkIR(team, {toIR: ["hurts"], activate: ["achane"], limits: true}).why, null);
    // to 23 or under is allowed: 9.2 is about waiving
    assert.equal(checkIR(teamOf({active: 23}), {toIR: ["hurts"], limits: true}).why, null);
});

test("activating to 31 needs a drop; the drop's penalty must keep the cap", () => {
    const team = teamOf();
    const without = checkIR(team, {activate: ["achane"], limits: true});
    assert.equal(without.why, "over roster limit");
    assert.equal(without.needsDrop, true);
    assert.equal(irBlockText(without), "you’d have 31 active. Pick a drop, or move another player to IR.");
    const dropped = checkIR(team, {activate: ["achane"], drop: "rodgers", limits: true});
    // Rodgers: $4 off, $2 on
    assert.deepEqual([dropped.why, dropped.active.to, dropped.cap.to, dropped.needsDrop], [null, 30, 291, true]);
    // two activations at 30 need two drops, and a save takes one
    const two = checkIR(team, {activate: ["achane", "mcmillan"], limits: true});
    assert.equal(irBlockText(two), "you’d have 32 active. Activate one at a time, or move another player to IR.");
    const one = checkIR(team, {activate: ["achane", "mcmillan"], drop: "rodgers", limits: true});
    assert.equal(irBlockText({...one, drop: "rodgers"}), "you’d have 31 active. Activate one at a time, or move another player to IR.");
    // at $298, Williams' +$4 breaks the cap
    const tight = checkIR(teamOf({cap: 298}), {activate: ["achane"], drop: "williams", limits: true});
    assert.equal(tight.why, "over cap");
    assert.equal(irBlockText(tight), "that drop’s penalty puts you at $302 of $300.");
    // before the cut-down date no roster limit, but the cap holds
    assert.equal(checkIR(team, {activate: ["achane"], limits: false}).needsDrop, false);
    assert.equal(checkIR(teamOf({cap: 298}), {activate: ["achane"], drop: "williams", limits: false}).why, "over cap");
});

test("pending bids count: a no-drop claim makes 30 active the limit for an activation", () => {
    const groups = [{round: 1, claims: [{add: "x", bid: 2, drop: null}]}];
    const team = teamOf({active: 29, groups});
    const check = checkIR(team, {activate: ["achane"], limits: true});
    assert.equal(check.why, "over roster limit");
    assert.equal(irBlockText(check), "with your pending bids, you could have 31 active. Pick a drop, or remove a claim in Add first.");
    assert.equal(checkIR(team, {activate: ["achane"], drop: "olave", limits: true}).why, null);
    // bids already over aren't made worse by a swap, so it isn't blocked
    const over = teamOf({active: 30, groups});
    assert.equal(checkIR(over, {toIR: ["hurts"], activate: ["achane"], limits: true}).why, null);
    // a claim dropping a player moved to IR frees no active spot
    const swap = teamOf({active: 30, groups: [{round: 1, claims: [{add: "x", bid: 1, drop: "hurts"}]}]});
    assert.equal(checkIR(swap, {limits: true}).why, null);
    assert.equal(checkIR(swap, {toIR: ["hurts"], activate: ["achane"], limits: true}).why, "over roster limit");
    // dropping the player a claim drops too makes it a no-drop claim: at 30 that's 31
    const sharing = teamOf({active: 30, groups: [{round: 1, claims: [{add: "x", bid: 3, drop: "olave"}]}]});
    assert.equal(checkIR(sharing, {activate: ["achane"], drop: "olave", limits: true}).why, "over roster limit");
    // activating a player a claim drops keeps the projection level, but 31 active now is still over
    const dropsHim = teamOf({active: 30, groups: [{round: 1, claims: [{add: "x", bid: 1, drop: "achane"}]}]});
    const now = checkIR(dropsHim, {activate: ["achane"], limits: true});
    assert.equal(now.why, "over roster limit");
    assert.equal(irBlockText(now), "you’d have 31 active. Pick a drop, or move another player to IR.");
    // and with the bids, the cap: $296 and a $3 bid; Olave's $0 is fine, Williams' +$4 isn't
    const bidding = teamOf({cap: 296, active: 29, groups: [{round: 1, claims: [{add: "x", bid: 3, drop: "olave"}]}]});
    assert.equal(checkIR(bidding, {activate: ["achane"], drop: "olave", limits: true}).why, null);
    const capped = checkIR(bidding, {activate: ["achane"], drop: "williams", limits: true});
    assert.equal(capped.why, "over cap");
    assert.match(irBlockText(capped), /^with your pending bids, that drop’s penalty could take you to \$303 of \$300/);
});

test("the drops: active players not moving to IR, lowest penalty first, off when locked or over the cap", () => {
    const choices = dropChoices(teamOf({cap: 298}), page, {toIR: ["hurts"], activate: ["achane", "mcmillan"], limits: true});
    assert.deepEqual(choices.map((choice) => [choice.player.playerId, choice.penalty, choice.capChange, choice.why]), [
        ["olave", 1, 0, "Game started"],
        ["rodgers", 2, -2, ""],
        ["williams", 5, 4, "over cap"],
        ["coleman", 5, 4, "Game started"]
    ]);
});

test("the form posts only the member's moves", () => {
    const form = {elements: {LEAGUE_ID: {value: "50965"}}};
    assert.equal(irFields(form, {franchiseId: "0001", toIR: ["hurts"], activate: ["achane", "mcmillan"], drop: "olave"}).toString(),
        "LEAGUE_ID=50965&FRANCHISE_ID=0001&deactivate0001=hurts&activate0001=achane&activate0001=mcmillan&drop0001=olave");
    assert.equal(irFields(form, {franchiseId: "0001", toIR: [], activate: ["achane"], drop: null}).toString(), "LEAGUE_ID=50965&FRANCHISE_ID=0001&activate0001=achane");
});

test("the roster read back says which moves MFL made", () => {
    const roster = new Map([["hurts", "INJURED_RESERVE"], ["achane", "ROSTER"], ["olave", "ROSTER"]]);
    const {done, missed} = savedMoves(roster, {toIR: ["hurts"], activate: ["achane"], drop: "olave"});
    const names = {hurts: "Jalen Hurts", achane: "De'Von Achane", olave: "Chris Olave"};
    assert.equal(movesText(done, (id) => names[id]), "Jalen Hurts to IR, De'Von Achane activated");
    assert.equal(movesText(missed, (id) => names[id]), "Chris Olave dropped");
    assert.equal(movesText(missed.concat(done), (id) => names[id], {undone: true}), "dropping Chris Olave, moving Jalen Hurts to IR, activating De'Von Achane");
    assert.equal(savedMoves(new Map([["achane", "INJURED_RESERVE"]]), {toIR: [], activate: ["achane"], drop: null}).done.length, 0);
});
