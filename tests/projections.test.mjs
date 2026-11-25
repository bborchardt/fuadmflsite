// One projection per player (ui/projections.js, docs/design.md: Projections): Lineup's simulation is
// Scores', the lists' average stat line is within a point of it, and a player ruled out projects 0.

import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const sample = (name) => readFileSync(new URL(`../tools/verify/screens/${name}`, import.meta.url), "utf8");
const {averageProjection, readProjections, readRules, simulatedProjections, winProbability} = await import("../site/v2/ui/live-scoring.js");
const {withoutRuledOut} = await import("../site/v2/ui/projections.js");

const feedText = sample("live_proj_06.txt");
const rules = readRules(JSON.parse(sample("rules.json")).rules);
const positions = new Map(feedText.split("\n").map((line) => line.split(",")).map((fields) => [fields[0], fields[1]]));
const ids = (position, count) => [...positions].filter(([, at]) => at === position).slice(0, count).map(([id]) => ({playerId: id, position}));
const starters = [...ids("QB", 2), ...ids("RB", 3), ...ids("WR", 3), ...ids("TE", 1), ...ids("PK", 1)];

test("starters simulated together get the figures Scores shows them, a random value carrying from one to the next", () => {
    const projections = readProjections(feedText);
    const games = {of: () => ({state: "scheduled"})};
    const perPlayer = new Map();
    winProbability({away: {starters: starters.map((player) => ({...player, team: "-", points: 0, stats: {}})), done: false, perPlayer}, home: {starters: [], done: false}},
        {games, projections, rules, week: 6});
    const together = simulatedProjections({starters}, {projections, rules, week: 6});
    for (const {playerId} of starters) {
        assert.equal(together.get(playerId), perPlayer.get(playerId), playerId);
    }
    // a bench player alone isn't moved by the starters' draws
    const [bench] = ids("WR", 4).slice(3);
    assert.equal(simulatedProjections({starters, others: [bench]}, {projections, rules, week: 6}).get(bench.playerId),
        simulatedProjections({others: [bench]}, {projections, rules, week: 6}).get(bench.playerId));
});

test("a player's average stat line is within a point of his simulation, kickers' lengths included", () => {
    const projections = readProjections(feedText);
    const players = [...positions].filter(([, at]) => ["QB", "RB", "WR", "TE", "PK"].includes(at)).map(([id, position]) => ({playerId: id, position}));
    const simulated = simulatedProjections({others: players}, {projections, rules, week: 6});
    const gaps = players.map(({playerId, position}) => Math.abs(simulated.get(playerId) - averageProjection(projections.get(playerId), position, rules)));
    gaps.sort((a, b) => a - b);
    assert.ok(gaps[gaps.length - 1] < 1.5, `largest ${gaps[gaps.length - 1]}`);
    assert.ok(gaps[Math.floor(gaps.length / 2)] < 0.3, `median ${gaps[Math.floor(gaps.length / 2)]}`);
    const kicker = ids("PK", 1)[0];
    assert.ok(averageProjection(projections.get(kicker.playerId), "PK", rules) > 3, "a kicker's field goals count");
});

test("a player out, suspended or on any IR projects 0; one questionable or doubtful keeps his", () => {
    const projections = readProjections(feedText);
    const [out, ir, held, doubtful, questionable] = ids("WR", 5).map((player) => player.playerId);
    withoutRuledOut(projections, {injury: [
        {id: out, status: "Out"}, {id: ir, status: "IR-R"}, {id: held, status: "Suspended"}, {id: doubtful, status: "Doubtful"}, {id: questionable, status: "Questionable"}
    ]});
    const points = (id) => simulatedProjections({others: [{playerId: id, position: "WR"}]}, {projections, rules, week: 6}).get(id);
    assert.equal(points(out), 0);
    assert.equal(points(ir), 0);
    assert.equal(points(held), 0);
    assert.equal(averageProjection(projections.get(ir), "WR", rules), 0);
    assert.ok(points(doubtful) > 0 && points(questionable) > 0);
    // without the report, no one is ruled out
    assert.equal(withoutRuledOut(projections, null), projections);
});
