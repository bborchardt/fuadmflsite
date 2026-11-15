// lib/shapes.js: every saved export passes, and taking out any field a rule names fails it, so a field
// MFL renames or drops stops the job's writes from that export (docs/design.md: Outside change).

import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {asArray} from "../site/v2/lib/mfl.js";
import {SHAPES, WEEK_ROSTERS, checkShape, shapeProblem} from "../site/v2/lib/shapes.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = join(root, "tests", "fixtures");

// each saved export, by its section (the real league's, and the clone's that screens.py draws v2
// from); and stand-ins, as tests/daily.test.mjs has them, for those no export is saved of
const samples = new Map();
for (const dir of [fixtures, join(root, "tools", "verify", "screens")]) {
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
        const body = JSON.parse(readFileSync(join(dir, file), "utf8"));
        for (const [section, value] of Object.entries(body)) {
            if (section in SHAPES) {
                samples.set(section, [...(samples.get(section) || []), {from: file, body: value}]);
            }
        }
    }
}
const STAND_INS = {
    messageBoardThread: {post: [{id: "1", franchise: "0002", postTime: "1793000000", body: "Olave: 3 years"}]},
    injuries: {injury: [{id: "13604", status: "Questionable", details: "Hamstring"}]},
    playoffBrackets: {playoffBracket: [{id: "1", name: "Championship"}]},
    // as docs/mfl.md has them
    pendingWaivers: {blindBidWaiverRequest: {round: "1", addsDrops: "13753_1_16619,13308_1_16152", comments: "1 yearbr/2 years", timestamp: "1793000000"}},
    pendingTrades: {pendingTrade: [{trade_id: "9", offeringteam: "0003", offeredto: "0001", will_give_up: "13604,", will_receive: "14800,FP_0001_2027_1,",
        expires: "1793600000", comments: "Deal?", timestamp: "1793000000"}]}
};
for (const [section, body] of Object.entries(STAND_INS)) {
    samples.set(section, [...(samples.get(section) || []), {from: "a stand-in", body}]);
}

// the items at `path` in `body`
const itemsAt = (body, path) => path.reduce((items, key) => items.flatMap((item) => asArray(item[key])), [body]);

test("every export the job checks has a saved sample or a stand-in", () => {
    assert.deepEqual(Object.keys(SHAPES).filter((section) => !samples.has(section)), []);
});

test("every saved export passes", () => {
    for (const [section, list] of samples) {
        for (const {from, body} of list) {
            assert.equal(shapeProblem(section, body), null, `${section} from ${from}`);
        }
    }
});

test("an export with nothing in its lists passes, as MFL leaves an empty list out", () => {
    for (const section of Object.keys(SHAPES)) {
        assert.equal(shapeProblem(section, {}), null, section);
    }
});

test("each field a rule names, taken out or made unreadable, fails the export", () => {
    for (const [section, rules] of Object.entries(SHAPES)) {
        for (const rule of rules) {
            const fields = [...new Set([...(rule.need || []), ...(rule.have || []), ...(rule.numbers || [])])];
            for (const field of fields) {
                // the first sample with an item the rule applies to that has the field
                const found = samples.get(section).map(({body}) => {
                    const copy = structuredClone(body);
                    const item = itemsAt(copy, rule.path).find((entry) => (!rule.only || rule.only(entry)) && field in entry);
                    return item && {copy, item};
                }).find(Boolean);
                assert.ok(found, `no ${section} sample has ${rule.path.join(".")}.${field}`);
                if ((rule.need || []).includes(field) || (rule.have || []).includes(field)) {
                    delete found.item[field];
                    assert.match(shapeProblem(section, found.copy) || "", new RegExp(`has no ${field}$`), `${section} without ${field}`);
                }
                if ((rule.numbers || []).includes(field)) {
                    const copy = structuredClone(found.copy);
                    const item = itemsAt(copy, rule.path).find((entry) => !rule.only || rule.only(entry));
                    item[field] = "N/A";
                    assert.match(shapeProblem(section, copy) || "", new RegExp(`'s ${field} isn't a number \\("N/A"\\)$`), `${section}'s ${field} unreadable`);
                }
            }
        }
    }
});

test("the problem names the item, so the commissioner can find it on MFL", () => {
    const rosters = {franchise: [{id: "0001", player: [{id: "13604", status: "ROSTER", salary: "5", contractYear: "2"}]},
        {id: "0002", player: [{id: "14800", status: "ROSTER", salary: "5", contractYears: "2"}]}]};
    assert.equal(shapeProblem("rosters", rosters), "franchise 0002 player 14800 has no contractYear");
    assert.equal(shapeProblem("accounting", {entry: {franchise_id: "0003", amount: "20.00"}}), "entry 1 has no description");
    assert.equal(shapeProblem("salaryAdjustments", {salaryAdjustment: ["8"]}), "salaryAdjustment 1 isn't an item");
});

test("a team named only by some kinds of move is needed only for those", () => {
    const moves = (transaction) => ({transaction: [{type: "LOCK_ALL_PLAYERS", franchise: "", transaction: "", timestamp: "1793000000"}, transaction]});
    assert.equal(shapeProblem("transactions", moves({type: "BBID_AUTO_PROCESS_WAIVERS", franchise: "", timestamp: "1793000000"})), null);
    assert.equal(shapeProblem("transactions", moves({type: "FREE_AGENT", franchise: "", transaction: "|4,", timestamp: "1793000000"})), "transaction 2 has no franchise");
    assert.equal(shapeProblem("transactions", moves({type: "TRADE", franchise: "0001", timestamp: "1793000000"})), "transaction 2 has no franchise2");
});

test("a playoff side not yet decided needs no team", () => {
    const bracket = {playoffRound: {week: "17", playoffGame: {game_id: "5", home: {winner_of_game: "3"}, away: {winner_of_game: "4"}}}};
    assert.equal(shapeProblem("playoffBracket", bracket), null);
    bracket.playoffRound.playoffGame.home.points = "120.5";
    assert.equal(shapeProblem("playoffBracket", bracket), "playoffRound 1 playoffGame 1 home 1 has no franchise_id");
});

test("checkShape gives the section back, or throws an error marked as MFL's change", () => {
    const body = {entry: [{franchise_id: "0003", amount: "20.00", description: "1st Place"}]};
    assert.equal(checkShape("accounting", body), body);
    assert.equal(checkShape("leagueStandings", {nothing: "checked"}).nothing, "checked");
    assert.throws(() => checkShape("accounting", {entry: [{franchise_id: "0003", amount: "twenty", description: "1st Place"}]}),
        (error) => error.changed === true && error.message === `Couldn't load accounting: MFL's export has changed: entry 1's amount isn't a number ("twenty")`);
});

test("every export the job reads has rules here", () => {
    const job = readFileSync(join(root, "jobs", "daily.mjs"), "utf8");
    const read = [...job.matchAll(/fetchFrom\([^,]+,\s*"(\w+)"(?:,\s*\{[^}]*\},\s*"(\w+)")?/g)].map((found) => found[2] || found[1]);
    assert.ok(read.length > 20, `only ${read.length} reads found`);
    assert.deepEqual([...new Set(read)].filter((section) => !(section in SHAPES)), []);
});

test("a description the commissioner left blank passes; one MFL stopped giving doesn't", () => {
    assert.equal(shapeProblem("salaryAdjustments", {salaryAdjustment: {franchise_id: "0002", amount: "8", description: "", timestamp: "1793000000"}}), null);
    assert.equal(shapeProblem("salaryAdjustments", {salaryAdjustment: {franchise_id: "0002", amount: "8", timestamp: "1793000000"}}), "salaryAdjustment 1 has no description");
});

test("a past week's rosters need only who was on each team", () => {
    const rosters = {franchise: {id: "0001", player: [{id: "13604", status: "ROSTER"}]}};
    assert.equal(shapeProblem("rosters", rosters, WEEK_ROSTERS), null);
    assert.equal(shapeProblem("rosters", rosters), "franchise 0001 player 13604 has no salary");
    assert.equal(shapeProblem("rosters", {franchise: {id: "0001", player: [{playerId: "13604"}]}}, WEEK_ROSTERS), "franchise 0001 player 1 has no id");
});
