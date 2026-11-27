import {test} from "node:test";
import assert from "node:assert/strict";
import {roundPlaces} from "../site/v2/lib/rounds.js";
import {resolveSettings} from "../site/v2/lib/settings.js";
import data from "../site/v2/lib/settings-data.js";

// A league whose playoffs are weeks 15–17: seeds 3–6 in week 15, its top two scores going on to
// weeks 16 and 17 added up, with seeds 1 and 2 (0002, 0004). Weeks 15 and 16 are 2025's scores in
// such a league, the commissioner pairing the round's teams in MFL; week 17 is made up.
const WEEKS = {playoffsStart: 15, championship: 17};
const ROUNDS = [{weeks: 1, headToHead: false}, {weeks: 2, headToHead: false}];
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

test("rounds of scores: no places when the setting doesn't fit MFL's season or matchups", () => {
    assert.match(places(season(), {rounds: [{weeks: 1, headToHead: false}, {weeks: 1, headToHead: false}]}).note,
        /^The playoff rounds' weeks add up to 2, but MFL's playoffs are 3 weeks \(15–17\)\.$/);
    // week 15 head-to-head: 0009 and 0001 won their pairs, and went on
    assert.deepEqual(places(season(), {rounds: [{weeks: 1, headToHead: true}, {weeks: 2, headToHead: false}]}).places, ["0002", "0001", "0004", "0009", "0011", "0006"]);
    // 0006 lost its pair to 0001, yet is in the final
    assert.deepEqual(places(season({w16: [["0001", "0004"], ["0006", "0002"]]}), {rounds: [{weeks: 1, headToHead: true}, {weeks: 2, headToHead: false}]}),
        {places: null, note: "Week 16's matchups don't have week 15's head-to-head winners going on."});
    // a head-to-head last round of two pairs can't say who's champion
    assert.deepEqual(places(season(), {rounds: [{weeks: 1, headToHead: false}, {weeks: 2, headToHead: true}]}),
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

test("the rounds setting takes only weeks and headToHead", () => {
    const line = (rounds) => resolveSettings(data, "1", {playoffs: {rounds}});
    assert.deepEqual(line(ROUNDS).settings.playoffs.rounds, ROUNDS);
    assert.deepEqual(line(ROUNDS).league.problems, []);
    for (const bad of [[{weeks: 1, advance: 2, headToHead: false}], [{weeks: 0, headToHead: false}], [{weeks: 1}], [{weeks: 1.5, headToHead: true}]]) {
        assert.deepEqual(line(bad).league.problems, ["playoffs.rounds isn't a list of the right values"], JSON.stringify(bad));
        assert.deepEqual(line(bad).settings.playoffs.rounds, []);
    }
});
