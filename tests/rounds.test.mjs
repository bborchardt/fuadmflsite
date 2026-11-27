import {test} from "node:test";
import assert from "node:assert/strict";
import {roundPlaces} from "../site/v2/lib/rounds.js";
import {resolveSettings} from "../site/v2/lib/settings.js";
import data from "../site/v2/lib/settings-data.js";
import settings from "../site/v2/lib/settings.js";
import {roundCard} from "../site/v2/ui/league-model.js";
import {SIMULATIONS, advanceChances} from "../site/v2/ui/live-scoring.js";

// A league whose playoffs are weeks 15–17: seeds 3–6 in week 15, its top two scores going on to
// weeks 16 and 17 added up, with seeds 1 and 2 (0002, 0004). Weeks 15 and 16 are 2025's scores in
// such a league, the commissioner pairing the round's teams in MFL; week 17 is made up.
const WEEKS = {playoffsStart: 15, championship: 17};
const ROUNDS = [{weeks: 1, headToHead: false, advance: 2}, {weeks: 2, headToHead: false}];
const SEEDS = new Map([["0002", 1], ["0004", 2], ["0001", 3], ["0009", 4], ["0011", 5], ["0006", 6]]);
const OTHERS = ["0003", "0005", "0007", "0008", "0010", "0012"];

function week(number, pairs, scores) {
    const paired = pairs.flat();
    return {
        week: String(number),
        matchup: pairs.map((pair) => ({franchise: pair.map((id) => ({id, score: String(scores[id])}))})),
        franchise: [...OTHERS, ...SEEDS.keys()].filter((id) => !paired.includes(id)).map((id) => ({id, score: String(scores[id] || 100)}))
    };
}
const season = ({w16 = [["0001", "0004"], ["0009", "0002"]], w17 = {}} = {}) => ({weeklyResults: [
    week(15, [["0011", "0009"], ["0006", "0001"]], {"0011": 125.02, "0009": 133.78, "0006": 109.11, "0001": 139.79, "0002": 116.39, "0004": 121.15}),
    week(16, w16, {"0001": 149.99, "0004": 109.35, "0009": 126.35, "0002": 160.41, "0006": 136.69, "0011": 107.12}),
    week(17, w16, {"0001": 120, "0004": 130, "0009": 100, "0002": 110, "0006": 90, "0011": 95, ...w17})
]});
const places = (results, options = {}) => roundPlaces(results, {rounds: ROUNDS, weeks: WEEKS, seeds: SEEDS, ...options});

test("rounds of scores: the final's two weeks added up, then the first round's others by their score", () => {
    // 0002 270.41, 0001 269.99, 0004 239.35, 0009 226.35; then 0011's 125.02 and 0006's 109.11 in week 15
    assert.deepEqual(places(season()), {places: ["0002", "0001", "0004", "0009", "0011", "0006"], note: null});
    // nothing until the last week is done
    assert.deepEqual(places(season(), {completedWeek: 16}), {places: null, note: null});
});

test("rounds of scores: a tie goes to the higher seed", () => {
    // 0001 at 270.41 too
    const tied = season({w17: {"0001": 120.42}});
    assert.deepEqual(places(tied).places.slice(0, 2), ["0002", "0001"]);
    assert.deepEqual(places(tied, {seeds: new Map([...SEEDS, ["0001", 0]])}).places.slice(0, 2), ["0001", "0002"]);
});

test("rounds of scores: the matchups say who went on, with a note when it wasn't the top scores", () => {
    // 0006 (109.11) in the final in place of 0009 (133.78)
    const result = places(season({w16: [["0001", "0004"], ["0006", "0002"]]}));
    assert.deepEqual(result.places.slice(4), ["0009", "0011"]);
    assert.ok(result.places.slice(0, 4).includes("0006"));
    assert.equal(result.note, "Week 16's matchups don't have week 15's top 2 scores going on; the matchups stand.");
});

test("rounds of scores: a round's advance that the matchups don't bear out gets a note, the matchups standing", () => {
    const result = places(season(), {rounds: [{weeks: 1, headToHead: false, advance: 3}, {weeks: 2, headToHead: false}]});
    assert.deepEqual(result.places, ["0002", "0001", "0004", "0009", "0011", "0006"]);
    assert.equal(result.note, "Week 16's matchups have 2 of week 15's teams going on, but the round's setting says 3; the matchups stand.");
});

test("rounds of scores: no places when the setting doesn't fit MFL's season or matchups", () => {
    assert.match(places(season(), {rounds: [{weeks: 1, headToHead: false, advance: 2}, {weeks: 1, headToHead: false}]}).note,
        /^The playoff rounds' weeks add up to 2, but MFL's playoffs are 3 weeks \(15–17\)\.$/);
    // week 15 head-to-head: 0009 and 0001 won their pairs, and went on
    assert.deepEqual(places(season(), {rounds: [{weeks: 1, headToHead: true}, {weeks: 2, headToHead: false}]}).places, ["0002", "0001", "0004", "0009", "0011", "0006"]);
    // 0006 lost its pair to 0001, yet is in the final
    assert.deepEqual(places(season({w16: [["0001", "0004"], ["0006", "0002"]]}), {rounds: [{weeks: 1, headToHead: true}, {weeks: 2, headToHead: false}]}),
        {places: null, note: "Week 16's matchups don't have week 15's head-to-head winners going on."});
    // a head-to-head last round of two pairs can't say who's champion
    assert.deepEqual(places(season(), {rounds: [{weeks: 1, headToHead: false, advance: 2}, {weeks: 2, headToHead: true}]}),
        {places: null, note: "The last round is head-to-head with 2 matchups: only a two-team final is."});
    // the commissioner hasn't paired the final's teams
    const unpaired = season();
    unpaired.weeklyResults[1].matchup = [];
    assert.deepEqual(places(unpaired), {places: null, note: "Week 16 has no matchups in MFL, which say who's in each playoff round."});
    // a week's score MFL left out (ui/checked.js lenient) isn't a result
    const unknown = season();
    unknown.weeklyResults[2].matchup[0].franchise[0].score = null;
    assert.deepEqual(places(unknown), {places: null, note: null});
});

test("the rounds setting: weeks and headToHead, and advance on a ranked round before the last", () => {
    const line = (rounds) => resolveSettings(data, "1", {playoffs: {rounds}});
    assert.deepEqual(line(ROUNDS).settings.playoffs.rounds, ROUNDS);
    assert.deepEqual(line(ROUNDS).league.problems, []);
    assert.deepEqual(line([{weeks: 1, headToHead: true}, {weeks: 2, headToHead: false}]).league.problems, []);
    for (const bad of [
        [{weeks: 1, headToHead: false}, {weeks: 2, headToHead: false}],
        [{weeks: 1, headToHead: false, advance: 2}, {weeks: 2, headToHead: false, advance: 1}],
        [{weeks: 1, headToHead: true, advance: 2}, {weeks: 2, headToHead: false}],
        [{weeks: 1, headToHead: false, advance: 0}, {weeks: 2, headToHead: false}],
        [{weeks: 1, headToHead: false, advance: 2, extra: 1}, {weeks: 2, headToHead: false}],
        [{weeks: 0, headToHead: false}], [{weeks: 1}], [{weeks: 1.5, headToHead: true}]
    ]) {
        assert.deepEqual(line(bad).league.problems, ["playoffs.rounds isn't a list of the right values"], JSON.stringify(bad));
        assert.deepEqual(line(bad).settings.playoffs.rounds, []);
    }
});

// a side on Scores' cards (league-model.js scoreCards): `totals` its simulated finals
const side = (id, score, {done = false, totals = null, projected = null, playing = 0, toPlay = 0} = {}) =>
    ({id, score, done, started: true, playing, toPlay, projected, totals});
const flat = (value) => new Array(SIMULATIONS).fill(value);
const withRounds = (run) => {
    const before = settings.playoffs.rounds;
    settings.playoffs.rounds = ROUNDS;
    try {
        run();
    } finally {
        settings.playoffs.rounds = before;
    }
};

test("Scores' round card: week 15's four by score, the cutoff after two, each one's chance to advance", () => withRounds(() => {
    const cards = [
        {teams: [side("0011", 125.02, {totals: flat(125.02)}), side("0009", 120, {totals: flat(133.78), projected: 133.78, playing: 1})]},
        {teams: [side("0006", 109.11, {totals: flat(109.11)}), side("0001", 139.79, {done: true})]}
    ];
    const card = roundCard(cards, {week: 15, weeks: WEEKS, ytd: season(), seeds: SEEDS});
    assert.deepEqual([card.number, card.last, card.advance, card.chanceOf], [1, false, 2, "advance"]);
    assert.deepEqual(card.rows.map((row) => [row.id, row.total, row.chance]), [
        ["0001", 139.79, 99], ["0011", 125.02, 1], ["0009", 120, 99], ["0006", 109.11, 1]
    ]);
    assert.equal(card.rows[2].projected, 133.78);
}));

test("Scores' round card: the final's weeks added up, a chance of 1st only in its last week", () => withRounds(() => {
    const ytd = season();
    const final = (scores, totals) => [
        {teams: [side("0001", scores[0], {totals: totals && flat(totals[0])}), side("0004", scores[1], {totals: totals && flat(totals[1])})]},
        {teams: [side("0009", scores[2], {totals: totals && flat(totals[2])}), side("0002", scores[3], {totals: totals && flat(totals[3])})]}
    ];
    // week 16: its own scores, and no chance, week 17 being still to come
    const first = roundCard(final([149.99, 109.35, 126.35, 160.41], [150, 110, 130, 160]), {week: 16, weeks: WEEKS, ytd, seeds: SEEDS});
    assert.deepEqual(first.rows.map((row) => [row.id, row.before, row.total, row.chance]), [
        ["0002", 0, 160.41, null], ["0001", 0, 149.99, null], ["0009", 0, 126.35, null], ["0004", 0, 109.35, null]
    ]);
    // week 17, live: week 16's from the results; 0001 at 120.42 ties 0002's 270.41, the higher seed first
    const last = roundCard(final([120.42, 130, 100, 110], [125, 130, 100, 110]), {week: 17, weeks: WEEKS, ytd, seeds: SEEDS});
    assert.deepEqual([last.last, last.advance, last.chanceOf], [true, null, "1st"]);
    assert.deepEqual(last.rows.map((row) => [row.id, row.before, row.total, row.chance]), [
        ["0002", 160.41, 270.41, 1], ["0001", 149.99, 270.41, 99], ["0004", 109.35, 239.35, 1], ["0009", 126.35, 226.35, 1]
    ]);
}));

test("Scores' round card: none outside a ranked round, or when a round's team has no card", () => withRounds(() => {
    const cards = [{teams: [side("0011", 1), side("0009", 2)]}, {teams: [side("0006", 3), side("0001", 4)]}];
    assert.equal(roundCard(cards, {week: 14, weeks: WEEKS, ytd: season(), seeds: SEEDS}), null);
    assert.equal(roundCard(cards.slice(0, 1), {week: 17, weeks: WEEKS, ytd: season(), seeds: SEEDS}), null);
    settings.playoffs.rounds = [{weeks: 1, headToHead: true}, {weeks: 2, headToHead: false}];
    assert.equal(roundCard(cards, {week: 15, weeks: WEEKS, ytd: season(), seeds: SEEDS}), null);
}));

test("chances to advance: each simulated finish counted, a tie to the team listed first", () => {
    // B beats A in half the simulations; C never makes the top 2
    const alternating = Array.from({length: SIMULATIONS}, (_, i) => (i % 2 ? 100 : 50));
    const teams = [{before: 0, totals: flat(80)}, {before: 20, totals: alternating}, {before: 0, totals: flat(10)}];
    assert.deepEqual(advanceChances(teams, 1, {live: false}), [50, 50, 0]);
    assert.deepEqual(advanceChances(teams, 2), [99, 99, 1]);
    // level in every simulation: the first listed (the higher seed) wins
    assert.deepEqual(advanceChances([{before: 0, totals: flat(5)}, {before: 0, totals: flat(5)}], 1, {live: false}), [100, 0]);
    assert.equal(advanceChances([{before: 0, totals: null}], 1), null);
});
