import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {bracketRounds, roundsBracket} from "../site/v2/ui/bracket-model.js";
import {bracketMarkup} from "../site/v2/ui/league-view.js";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const PLAYED = [fixture("playoff-bracket-2025-1.json").playoffBracket, fixture("playoff-bracket-2025-2.json").playoffBracket];

// FUAD's 2026 brackets before the regular season is over, as MFL gives them: seeds, and games to come
// by the games they follow
const UNPLAYED = [
    {bracket_id: "1", playoffRound: [
        {week: "15", playoffGame: [{game_id: "1", home: {seed: "3"}, away: {seed: "6"}}, {game_id: "2", home: {seed: "4"}, away: {seed: "5"}}]},
        {week: "16", playoffGame: [{game_id: "3", home: {seed: "2"}, away: {winner_of_game: "1"}}, {game_id: "4", home: {seed: "1"}, away: {winner_of_game: "2"}}]},
        {week: "17", playoffGame: {game_id: "5", home: {winner_of_game: "4"}, away: {winner_of_game: "3"}}}
    ]},
    {bracket_id: "2", playoffRound: {week: "17", playoffGame: {game_id: "1", home: {bracket: "1", loser_of_game: "4"}, away: {bracket: "1", loser_of_game: "3"}}}}
];

const sides = (round) => round.games.map((game) => game.sides.map((side) => [side.seed, side.id || side.from, side.points]));

test("the bracket: each round named, the higher seed on top, a winner's seed carried on, the 3rd place game last", () => {
    const rounds = bracketRounds(PLAYED, {});
    assert.deepEqual(rounds.map((round) => [round.week, round.title]), [[15, "Wild card"], [16, "Semifinals"], [17, "Championship"], [17, "3rd place"]]);
    assert.deepEqual(sides(rounds[0]), [[[3, "0001", 184.8], [6, "0002", 94.1]], [[4, "0009", 151], [5, "0007", 131.2]]]);
    assert.deepEqual(sides(rounds[1])[0], [[2, "0005", 121.6], [3, "0001", 155.3]]);
    assert.deepEqual(rounds[2].games.map((game) => game.winner), ["0004"]);
    assert.ok(rounds.every((round) => round.games.every((game) => game.state === "final")));
});

test("the bracket in the playoffs: a week before the completed one final, the current live, a later one to come", () => {
    const rounds = bracketRounds(PLAYED, {completedWeek: 15, currentWeek: 16});
    assert.deepEqual(rounds.map((round) => round.games[0].state), ["final", "live", "next", "next"]);
    // no winner until a game is final
    assert.deepEqual(rounds[1].games.map((game) => game.winner), [null, null]);
});

test("the bracket before MFL names its teams: the seeds' teams from the picture, later games by where they come from", () => {
    const seeds = new Map([[1, "0004"], [2, "0005"], [3, "0001"], [4, "0009"], [5, "0007"], [6, "0002"]]);
    const rounds = bracketRounds(UNPLAYED, {seeds, completedWeek: 12, currentWeek: 13});
    assert.deepEqual(sides(rounds[0]), [[[3, "0001", null], [6, "0002", null]], [[4, "0009", null], [5, "0007", null]]]);
    assert.deepEqual(sides(rounds[1]), [[[2, "0005", null], [null, "Winner of wild card 1", null]], [[1, "0004", null], [null, "Winner of wild card 2", null]]]);
    assert.deepEqual(sides(rounds[2]), [[[null, "Winner of semifinal 2", null], [null, "Winner of semifinal 1", null]]]);
    assert.deepEqual(sides(rounds[3]), [[[null, "Loser of semifinal 2", null], [null, "Loser of semifinal 1", null]]]);
    // without the picture's seeds, the seed alone
    assert.deepEqual(sides(bracketRounds(UNPLAYED, {})[0])[0], [[3, null, null], [6, null, null]]);
    assert.equal(bracketRounds([{playoffRound: []}], {}), null);
});

// a league whose playoffs are rounds of scores: week 15's four, the top two going on to weeks 16–17
// with seeds 1 and 2
const ROUNDS = [{weeks: 1, headToHead: false, advance: 2}, {weeks: 2, headToHead: false}];
const WEEKS = {playoffsStart: 15, championship: 17};
const SEEDS = new Map([[1, "0002"], [2, "0004"], [3, "0001"], [4, "0009"], [5, "0011"], [6, "0006"]]);
const week = (number, pairs, scores = {}) => ({
    week: String(number),
    matchup: pairs.map((pair) => ({franchise: pair.map((id) => ({id, ...(id in scores ? {score: String(scores[id])} : {})}))}))
});
const results = (...weeks) => ({weeklyResults: weeks});
const W15 = week(15, [["0011", "0009"], ["0006", "0001"]], {"0011": 125.02, "0009": 133.78, "0006": 109.11, "0001": 139.79});
const rows = (round) => round.rows.map((row) => [row.seed, row.id, row.total, row.mark]);

test("rounds of scores: a round ranked on its totals, those with a matchup next marked, the next round not set yet", () => {
    const before = roundsBracket(results(W15), {rounds: ROUNDS, weeks: WEEKS, seeds: SEEDS, completedWeek: 15, currentWeek: 16});
    assert.deepEqual(before.map((round) => [round.title, round.weeks, round.notSet, round.live]), [["Round 1", [15], false, false], ["Final", [16, 17], true, true]]);
    assert.deepEqual(rows(before[0]), [[3, "0001", 139.79, null], [4, "0009", 133.78, null], [5, "0011", 125.02, null], [6, "0006", 109.11, null]]);
    const paired = roundsBracket(results(W15, week(16, [["0001", "0004"], ["0009", "0002"]])), {rounds: ROUNDS, weeks: WEEKS, seeds: SEEDS, completedWeek: 15, currentWeek: 16});
    assert.deepEqual(rows(paired[0]).map((row) => row[3]), ["Advanced", "Advanced", null, null]);
    // the final's totals once a week of it is done; seeds first while none is
    assert.deepEqual(rows(paired[1]), [[1, "0002", null, null], [2, "0004", null, null], [3, "0001", null, null], [4, "0009", null, null]]);
});

test("rounds of scores: the final's weeks added up, ties to the higher seed, its first the champion once it's over", () => {
    const season = results(W15,
        week(16, [["0001", "0004"], ["0009", "0002"]], {"0001": 149.99, "0004": 109.35, "0009": 126.35, "0002": 160.41}),
        week(17, [["0001", "0004"], ["0009", "0002"]], {"0001": 120.42, "0004": 130, "0009": 100, "0002": 110}));
    const midway = roundsBracket(season, {rounds: ROUNDS, weeks: WEEKS, seeds: SEEDS, completedWeek: 16, currentWeek: 17});
    assert.deepEqual(rows(midway[1]), [[1, "0002", 160.41, null], [3, "0001", 149.99, null], [4, "0009", 126.35, null], [2, "0004", 109.35, null]]);
    const over = roundsBracket(season, {rounds: ROUNDS, weeks: WEEKS, seeds: SEEDS, completedWeek: 17, currentWeek: 17});
    assert.deepEqual(rows(over[1]), [[1, "0002", 270.41, "Champion"], [3, "0001", 270.41, null], [2, "0004", 239.35, null], [4, "0009", 226.35, null]]);
    assert.equal(over[1].live, false);
});

test("rounds of scores: a head-to-head round as games, won on its total", () => {
    const rounds = [{weeks: 1, headToHead: true}, {weeks: 2, headToHead: false}];
    const shown = roundsBracket(results(W15), {rounds, weeks: WEEKS, seeds: SEEDS, completedWeek: 15, currentWeek: 16});
    assert.equal(shown[0].ranked, false);
    assert.deepEqual(shown[0].games.map((game) => [game.sides.map((side) => side.id), game.winner, game.state]), [
        [["0009", "0011"], "0009", "final"], [["0001", "0006"], "0001", "final"]
    ]);
});

test("the Playoffs panel: a column a week, the 3rd place game named under the championship and no other game named", () => {
    const html = bracketMarkup({rounds: bracketRounds(PLAYED, {completedWeek: 15, currentWeek: 16})}, {viewer: "0001", names: new Map(), title: "Playoffs", teamHref: (id) => `#${id}`});
    assert.equal(html.match(/class="fuad-bracket-week"/g).length, 3);
    assert.deepEqual([...html.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map((found) => found[1]), ["Week 15 · Wild card", "Week 16 · Semifinals", "Week 17 · Championship"]);
    assert.deepEqual([...html.matchAll(/fuad-bracket-caption">([^<]*)</g)].map((found) => found[1]), ["3rd place"]);
    // the week being played links to Scores
    assert.equal(html.match(/href="#league-scores"/g).length, 1);
});
