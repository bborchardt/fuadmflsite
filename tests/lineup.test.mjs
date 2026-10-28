import {test} from "node:test";
import assert from "node:assert/strict";
import {applyInjuries, lineupStatus, lineupWarnings, readName, tagOf} from "../site/v2/ui/lineup-model.js";

// the league's starter limits, as MFL's page heads each position
const limits = {QB: [1, 2], RB: [1, 3], WR: [2, 5], TE: [1, 3], PK: [1, 1]};
const roster = (counts) => Object.entries(counts).flatMap(([pos, n]) => Array.from({length: n}, (_, i) => ({id: `${pos}${i}`, pos})));
const players = roster({QB: 4, RB: 4, WR: 6, TE: 3, PK: 2});
const status = (ids) => lineupStatus({players, limits, total: 10}, new Set(ids));

test("Save takes only a full lineup within each position's limits", () => {
    const full = status(["QB0", "QB1", "RB0", "RB1", "RB2", "WR0", "WR1", "WR2", "TE0", "PK0"]);
    assert.equal(full.ok, true);
    assert.equal(full.line, "QB 2 · RB 3 · WR 3 · TE 1 · PK 1");

    const short = status(["QB0", "QB1", "QB2", "RB0", "WR0", "WR1", "TE0", "PK0"]);
    assert.equal(short.ok, false);
    assert.equal(short.line, "Pick 2 more · QB 3, start 1–2");
    assert.deepEqual(short.broken, ["QB"]);

    const tooMany = status(["QB0", "RB0", "RB1", "RB2", "RB3", "WR0", "WR1", "WR2", "TE0", "PK0"]);
    assert.equal(tooMany.ok, false);
    assert.equal(tooMany.line, "RB 4, start 1–3");

    assert.equal(status(["QB0", "QB1", "RB0", "RB1", "RB2", "WR0", "WR1", "WR2", "TE0", "PK0", "PK1"]).line, "Over 10 starters");
});

test("a position no one can fill says why, as MFL refuses a lineup short there", () => {
    const team = [
        ...players.filter((player) => player.pos !== "PK"),
        {id: "PK9", pos: "PK", name: "Ka'imi Fairbairn", onBye: true, locked: true}
    ];
    const shortKicker = lineupStatus({players: team, limits, total: 10}, new Set(["QB0", "RB0", "RB1", "RB2", "WR0", "WR1", "WR2", "WR3", "TE0"]));
    assert.equal(shortKicker.ok, false);
    assert.equal(shortKicker.line, "PK: Ka'imi Fairbairn is on a bye");
    assert.deepEqual(shortKicker.stuck, [{pos: "PK", why: "Ka'imi Fairbairn is on a bye"}]);

    // a benched kicker whose game has started can't come in either; with none at all, there's no one
    const started = team.map((player) => (player.pos === "PK" ? {...player, onBye: false} : player));
    assert.equal(lineupStatus({players: started, limits, total: 10}, new Set()).stuck[0].why, "Ka'imi Fairbairn can't start this week");
    assert.equal(lineupStatus({players: team.filter((player) => player.pos !== "PK"), limits, total: 10}, new Set()).line, "PK: no kicker on your roster");

    // a kicker who can still be picked is just "Pick 1 more"
    assert.deepEqual(status(["QB0", "RB0", "RB1", "RB2", "WR0", "WR1", "WR2", "WR3", "TE0"]).stuck, []);
});

test("starters who can't play are warned about, except once their game has started", () => {
    const team = [
        {id: "1", name: "Lamar Jackson", nfl: "BAL", injury: "Out"},
        {id: "2", name: "Jalen Hurts", nfl: "PHI", injury: "IR"},
        {id: "3", name: "Chase Brown", nfl: "CIN", onBye: true, locked: true},
        {id: "4", name: "Ka'imi Fairbairn", nfl: "HOU", injury: "Out", locked: true},
        {id: "5", name: "Chris Olave", nfl: "NOS", injury: "Questionable"},
        {id: "6", name: "Someone", nfl: "FA", injury: ""},
        {id: "7", name: "Benched", nfl: "BAL", injury: "Out"}
    ];
    assert.deepEqual(lineupWarnings(team, new Set(["1", "2", "3", "4", "5", "6"])), [
        {name: "Lamar Jackson", why: "is out."},
        {name: "Jalen Hurts", why: "is on the NFL’s IR."},
        {name: "Chase Brown", why: "is on a bye."},
        {name: "Someone", why: "has no NFL team."}
    ]);
});

test("a row's tag: a bye or a started game first, then the injury", () => {
    assert.deepEqual(tagOf({onBye: true, locked: true}), {text: "Bye", tone: "plain"});
    assert.deepEqual(tagOf({locked: true, injury: "IR"}), {text: "Game started", tone: "plain"});
    assert.deepEqual(tagOf({injury: "Suspended"}), {text: "Suspended", tone: "bad"});
    assert.deepEqual(tagOf({injury: "Doubtful"}), {text: "Doubtful", tone: "caution"});
    assert.equal(tagOf({injury: ""}), null);
});

test("the week's injury report names what MFL's one-letter column can't", () => {
    const team = [{id: "1", code: "I", injury: "IR"}, {id: "2", code: "S", injury: "Suspended"}, {id: "3", code: "Q", injury: "Questionable"}];
    applyInjuries(team, [{id: "1", status: "IR-R"}, {id: "2", status: "Suspended"}]);
    assert.deepEqual(team.map((player) => player.injury), ["IR", "Suspended", "Questionable"]);
});

test("MFL's lineup names read as first name first", () => {
    assert.deepEqual(readName("St. Brown, Amon-Ra DET WR"), {name: "Amon-Ra St. Brown", nfl: "DET", pos: "WR"});
    assert.deepEqual(readName("Fairbairn, Ka'imi HOU PK"), {name: "Ka'imi Fairbairn", nfl: "HOU", pos: "PK"});
});
