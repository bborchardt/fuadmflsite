import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {gameStates, readProjections, readRules, readStats, scoreStats, statLine, winProbability} from "../site/v2/ui/live-scoring.js";
import {
    allPlayRecords, pairLines, recordText, playoffPicture, playoffPlaces, positionPoints, powerFacts, readPowerPage, scoreCards, standings, teamSeason,
    weekState, weeklyWinners, winnings, winningsLine
} from "../site/v2/ui/league-model.js";

const raw = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const fixture = (name) => JSON.parse(raw(name));

const settings = fixture("league-settings.json").league;
const names = new Map(settings.franchises.franchise.map((team) => [team.id, team.name]));
const players = new Map(fixture("players-league.json").players.player.map((player) => {
    const [last, first] = player.name.split(",").map((part) => part.trim());
    return [player.id, {name: `${first} ${last}`, sortName: player.name, position: player.position, team: player.team}];
}));
const positions = new Map([...players].map(([id, player]) => [id, player.position]));
const rules = readRules(fixture("rules.json").rules);

test("the league's rules score every starter of week 5 as MFL did", () => {
    const stats = readStats(raw("live-stats-w5.txt"));
    let scored = 0;
    for (const matchup of fixture("weekly-results-w5.json").weeklyResults.matchup) {
        for (const team of matchup.franchise) {
            for (const player of team.player) {
                if (player.score && players.has(player.id)) {
                    assert.equal(scoreStats(stats.players.get(player.id), players.get(player.id).position, rules).toFixed(2), Number(player.score).toFixed(2), player.id);
                    scored++;
                }
            }
        }
    }
    assert.ok(scored > 200);
});

test("stat lines lead with what the position does", () => {
    const stats = readStats(raw("live-stats-w5.txt"));
    assert.equal(statLine(stats.players.get("14783"), "QB"), "21/40, 220 yds, 1 TD; 2 rush yds");
    assert.equal(statLine(stats.players.get("16181"), "RB"), "13 car, 39 yds; 3 rec, 21 yds; 1 fum lost");
    assert.equal(statLine(stats.players.get("12860"), "PK"), "4/4 FG, 2/2 XP");
    assert.equal(statLine(undefined, "WR"), "");
});

test("each NFL game is scheduled, playing (quarter, time left) or over, from the feed's time and team lines", () => {
    const games = gameStates(fixture("nfl-schedule-w6.json").nflSchedule, readStats(raw("live-stats-w6.txt")));
    assert.deepEqual(games.of("HOU"), {state: "playing", quarter: "Q2", secondsLeft: 2700, possession: false});
    assert.deepEqual(games.of("SEA"), {state: "over", secondsLeft: 0});
    assert.equal(games.of("KCC").state, "scheduled");
    assert.equal(games.of("XXX").state, "bye");
    assert.equal(games.any, true);
});

const week6 = () => {
    const stats = readStats(raw("live-stats-w6.txt"));
    return {
        live: fixture("live-scoring-w6.json").liveScoring,
        players,
        stats,
        games: gameStates(fixture("nfl-schedule-w6.json").nflSchedule, stats),
        rules,
        projections: readProjections(raw("live-proj-w6.txt")),
        week: 6
    };
};

test("score cards: the viewer's game first, scores from the feed, starters in position order, projections and win chances", () => {
    const cards = scoreCards({...week6(), viewer: "0001", irOf: (id) => (id === "0001" ? ["16167"] : [])});
    assert.equal(cards.length, 5);
    assert.deepEqual(cards[0].teams.map((team) => team.id), ["0001", "0003"]);
    const [mine, theirs] = cards[0].teams;
    // the same scores the liveScoring export had at that moment
    assert.equal(mine.score.toFixed(1), "1.0");
    assert.equal(theirs.score.toFixed(1), "7.0");
    const order = ["QB", "RB", "WR", "TE", "PK"];
    assert.ok(mine.starters.every((line, i) => !i || order.indexOf(line.position) >= order.indexOf(mine.starters[i - 1].position)));
    assert.equal(mine.starters.length, 10);
    assert.equal(mine.chance + theirs.chance, 100);
    assert.ok(mine.chance >= 1 && mine.chance <= 99);
    assert.ok(mine.projected > mine.score);
    assert.ok(mine.starters.every((line) => typeof line.projected === "number"));
    // playing, to play and minutes left as MFL's export counted them at the same moment
    for (const matchup of week6().live.matchup) {
        for (const team of matchup.franchise) {
            const drawn = cards.flatMap((card) => card.teams).find((side) => side.id === team.id);
            assert.deepEqual([drawn.playing, drawn.toPlay, drawn.minutes], [Number(team.playersCurrentlyPlaying), Number(team.playersYetToPlay), Number(team.gameSecondsRemaining) / 60], team.id);
        }
    }
    // IR last, tagged
    assert.equal(mine.bench[mine.bench.length - 1].id, "16167");
    assert.equal(mine.bench[mine.bench.length - 1].ir, true);
    assert.equal(pairLines(mine.starters, theirs.starters.slice(0, 8)).length, 10);
});

test("the simulation is seeded: the same data gives the same chances", () => {
    const a = scoreCards({...week6(), viewer: "0001"}).map((card) => card.teams.map((team) => team.chance));
    const b = scoreCards({...week6(), viewer: "0001"}).map((card) => card.teams.map((team) => team.chance));
    assert.deepEqual(a, b);
});

test("a week with every game over is final, with no projections", () => {
    const stats = readStats(raw("live-stats-w5.txt"));
    const over = {of: () => ({state: "over", secondsLeft: 0}), any: false};
    const cards = scoreCards({...week6(), stats, games: over, projections: readProjections(raw("live-proj-w6.txt"))});
    assert.equal(cards[0].teams[0].chance, null);
    assert.equal(weekState(cards, over, () => "Sun").text, "Final");
});

test("before kickoff the week shows its first kickoff day", () => {
    const stats = {players: new Map(), teams: new Map(), updated: 0};
    const games = gameStates(fixture("nfl-schedule-w6.json").nflSchedule, stats);
    const cards = scoreCards({...week6(), stats, games});
    assert.equal(weekState(cards, games, () => "Thu").text, "Thu kickoff");
    assert.ok(cards[0].teams.every((team) => team.chance !== null && !team.started));
});

test("all-play over the regular season matches MFL's while the season is on", () => {
    const records = allPlayRecords(fixture("weekly-results-ytd.json").allWeeklyResults, 14);
    for (const team of fixture("league-standings.json").leagueStandings.franchise) {
        assert.equal(recordText(records.get(team.id)), recordText({w: +team.all_play_wlt.split("-")[0], l: +team.all_play_wlt.split("-")[1], t: +team.all_play_wlt.split("-")[2]}), team.id);
    }
});

test("standings by division in MFL's order, games back of the leader", () => {
    const divisions = standings(fixture("league-standings.json").leagueStandings, settings, names);
    assert.deepEqual(divisions.map((division) => division.name), ["West", "East"]);
    const west = divisions[0].rows;
    assert.equal(west[0].gamesBack, "—");
    const back = (row) => (row.gamesBack === "—" ? 0 : Number(row.gamesBack));
    assert.ok(west.every((row, i) => !i || back(row) >= back(west[i - 1])));
    assert.equal(divisions.reduce((sum, division) => sum + division.rows.length, 0), 10);
});

test("the playoff picture: division winners 1–2 with byes, then the best all-play records", () => {
    const divisions = standings(fixture("league-standings.json").leagueStandings, settings, names);
    const {seeds, hunt} = playoffPicture(divisions);
    assert.equal(seeds.length, 6);
    assert.deepEqual(seeds.slice(0, 2).map((seed) => seed.why), divisions.map((division) => `${division.name} winner`).sort((a, b) =>
        seeds.findIndex((seed) => seed.why === a) - seeds.findIndex((seed) => seed.why === b)));
    assert.ok(seeds.slice(0, 2).every((seed) => seed.bye));
    const wildPct = seeds.slice(2).map((seed) => seed.team.allPlay.w / (seed.team.allPlay.w + seed.team.allPlay.l + seed.team.allPlay.t));
    assert.ok(wildPct.every((value, i) => !i || value <= wildPct[i - 1]));
    assert.equal(hunt.length, 4);
    assert.match(hunt[0].back, /back$|^tied/);
});

test("all-play ties go to the standings order, and a tie with seed 6 says so", () => {
    const team = (id, division, allPlay) => ({id, h2hwlt: "1-1-0", all_play_wlt: allPlay, divwlt: "", pf: "1"});
    const league = {divisions: {division: [{id: "00", name: "West"}, {id: "01", name: "East"}]}, franchises: {franchise: [
        ...["A", "B", "C", "D"].map((id) => ({id, division: "00"})), ...["E", "F", "G", "H"].map((id) => ({id, division: "01"}))
    ]}};
    const rows = [team("A", "00", "9-0-0"), team("E", "01", "1-8-0"), team("B", "00", "5-4-0"), team("C", "00", "5-4-0"),
        team("F", "01", "6-3-0"), team("G", "01", "5-4-0"), team("D", "00", "5-4-0"), team("H", "01", "2-7-0")];
    const {seeds, hunt} = playoffPicture(standings({franchise: rows}, league, new Map()));
    assert.deepEqual(seeds.map((seed) => seed.team.id), ["A", "E", "F", "B", "C", "G"]);
    assert.deepEqual(hunt.map((entry) => [entry.team.id, entry.back]), [["D", "tied · out on standings"], ["H", "3 back"]]);
});

test("MFL's Power Rank page: every team, by id, with the figures the tap shows", () => {
    const teams = readPowerPage(raw("power-page.html"));
    assert.equal(teams.length, 10);
    assert.deepEqual({id: teams[0].id, name: teams[0].name, power: teams[0].power, allPlay: teams[0].allPlay}, {id: "0004", name: "Smooth City Styles!", power: 35.31, allPlay: "41-4"});
    assert.equal(powerFacts(teams[0]).length, 10);
    assert.equal(readPowerPage("<html><body>Login</body></html>"), null);
});

test("starter points by position add up to each team's points for", () => {
    const sums = positionPoints(fixture("weekly-results-ytd.json").allWeeklyResults, positions, names);
    const standing = new Map(fixture("league-standings.json").leagueStandings.franchise.map((team) => [team.id, Number(team.pf)]));
    assert.equal(sums.length, 10);
    for (const team of sums) {
        assert.ok(Math.abs(team.total - standing.get(team.id)) <= 3, `${team.id} ${team.total} ${standing.get(team.id)}`);
    }
    assert.ok(sums.every((team, i) => !i || team.total <= sums[i - 1].total));
});

test("weekly winners and payouts as 2025's accounting recorded them", () => {
    const ytd = fixture("weekly-results-ytd-2025.json").allWeeklyResults;
    const won = new Map();
    for (const {week, teams} of weeklyWinners(ytd, 14)) {
        teams.forEach((id) => won.set(id, [...(won.get(id) || []), week]));
    }
    assert.deepEqual(won.get("0004"), [1, 4, 5, 9, 13]);
    assert.deepEqual(won.get("0009"), [10, 12, 14]);
    // MFL's standings count all-play through the playoffs (0004: 128-25); the bylaws pay weeks 1–14
    const rows = standings(fixture("league-standings-2025.json").leagueStandings, settings, names, allPlayRecords(ytd, 14)).flatMap((division) => division.rows);
    assert.equal(recordText(rows.find((row) => row.id === "0004").allPlay), "102-24");
    const places = playoffPlaces([fixture("playoff-bracket-2025-1.json").playoffBracket, fixture("playoff-bracket-2025-2.json").playoffBracket]);
    assert.deepEqual(places, ["0004", "0001", "0005"]);
    const result = winnings({accounting: fixture("accounting-2025.json").accounting, weeklyResults: ytd, standingRows: rows, lastRegularWeek: 14, places, names});
    const byId = new Map(result.rows.map((row) => [row.id, row]));
    // the commissioner paid all-play as recorded
    assert.equal(byId.get("0004").allPlay, 58.5);
    assert.equal(byId.get("0001").allPlay, 30);
    assert.equal(byId.get("0005").allPlay, 44.25);
    assert.equal(result.weeklyTotal, 210);
    assert.deepEqual(result.potEntries, [{description: "Entry fees", amount: 1000}]);
    assert.equal(result.rows[0].id, "0004");
    assert.match(winningsLine(byId.get("0004")), /^Weeks 1, 4, 5, 9, 13 \$75\.00 · .* all-play \$58\.50 · 1st \$/);
});

test("this season's pot is the league-wide entries, prizes unnamed until the playoffs are played", () => {
    const rows = standings(fixture("league-standings.json").leagueStandings, settings, names).flatMap((division) => division.rows);
    const result = winnings({accounting: fixture("accounting.json").accounting, weeklyResults: fixture("weekly-results-ytd.json").allWeeklyResults, standingRows: rows, lastRegularWeek: 14, names});
    assert.equal(result.pot.toFixed(2), "846.58");
    assert.equal(result.potEntries.length, 3);
    assert.ok(result.prizes.every((prize) => prize.team === null));
    assert.equal(result.forPlayoffs, Math.round((846.58 - 210 - result.allPlayPaid) * 100) / 100);
    assert.equal(Math.round(result.prizes.reduce((sum, prize) => sum + prize.amount, 0)), Math.round(result.forPlayoffs));
});

test("a team's season: results, then opponents", () => {
    const season = teamSeason(fixture("schedule.json").schedule, "0001");
    assert.equal(season[0].week, 1);
    assert.equal(season[0].result, "W 159.1–146.2");
    assert.equal(season.find((week) => week.week === 6).result, "");
    assert.equal(season.length, 14);
});

test("the feed's stray carriage returns don't reach the values", () => {
    const stats = readStats("12860|DIF 7\r|EA 1\r|EP 1\r\nHOU|QUARTER \r|REMAINING 15:00\r\nDATE|1792332659|Sun\r\n");
    assert.deepEqual(stats.players.get("12860"), {DIF: "7", EA: "1", EP: "1"});
    assert.equal(stats.teams.get("HOU").QUARTER, "");
    assert.equal(stats.updated, 1792332659);
});
