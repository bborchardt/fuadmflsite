// A display panel's read of an export MFL has changed (ui/checked.js lenient): an item missing a field
// shows "—", as does anything worked out from it; a list with no item whole, or an item that doesn't
// say which it is, fails as "Couldn't load" (docs/design.md: Outside change).

import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fetchExport} from "../site/v2/lib/mfl.js";
import {lenient} from "../site/v2/ui/checked.js";
import {markMissing} from "../site/v2/lib/shapes.js";
import {figure} from "../site/v2/ui/format.js";
import {NO_STATS, gameStates, readProjections, readRules, readStats} from "../site/v2/ui/live-scoring.js";
import {allPlayRecords, gameText, ledger, scoreCards, teamSeason, playoffPicture, playoffPlaces, positionPoints, recordText, standings, weeklyWinners, winnings, winningsLine} from "../site/v2/ui/league-model.js";
import {cardsMarkup, positionsMarkup, standingsMarkup, winnersMarkup} from "../site/v2/ui/league-view.js";

const raw = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const fixture = (name) => JSON.parse(raw(name));
const settings = fixture("league-settings.json").league;
const names = new Map(settings.franchises.franchise.map((team) => [team.id, team.name]));
const positions = new Map(fixture("players-league.json").players.player.map((player) => [player.id, player.position]));

// `body` as fetchExport gives it to a display panel, and what was logged as an error
async function read(section, body) {
    const logged = [];
    const original = console.error;
    console.error = (...args) => logged.push(args.join(" "));
    try {
        const answer = async () => new Response(JSON.stringify({[section]: body}), {status: 200});
        const value = await fetchExport(`https://x/2026/export?TYPE=${section}`, section, {fetchImpl: answer, check: lenient}).catch((error) => error);
        return {value, logged};
    } finally {
        console.error = original;
    }
}

test("an item missing a field has it as null, and the first is logged once a page with what's missing", async () => {
    const body = fixture("league-standings.json").leagueStandings;
    delete body.franchise[2].pf;
    body.franchise[5].h2hwlt = "";
    const {value, logged} = await read("leagueStandings", body);
    assert.equal(value.franchise[2].pf, null);
    assert.equal(value.franchise[5].h2hwlt, null);
    assert.equal(value.franchise[0].pf, body.franchise[0].pf);
    assert.deepEqual(logged, [`[fuad] MFL's leagueStandings export has changed: franchise ${body.franchise[2].id} has no pf`]);
    // once a page
    assert.deepEqual((await read("leagueStandings", body)).logged, []);
});

test("an export with no item whole, or an item that doesn't say which it is, fails as a change", async () => {
    const none = fixture("accounting.json").accounting;
    none.entry.forEach((entry) => delete entry.amount);
    const {value} = await read("accounting", none);
    assert.equal(value.changed, true);
    assert.match(value.message, /entry .* has no amount/);
    const keyless = fixture("weekly-results-ytd.json").allWeeklyResults;
    delete keyless.weeklyResults[0].matchup[0].franchise[0].player[0].id;
    assert.equal((await read("allWeeklyResults", keyless)).value.changed, true);
});

test("a whole export passes as it came", async () => {
    const body = fixture("league-standings.json").leagueStandings;
    assert.deepEqual((await read("leagueStandings", fixture("league-standings.json").leagueStandings)).value, body);
});

test("Standings: a team's figure MFL left out shows —, the rest as they are", async () => {
    const body = fixture("league-standings.json").leagueStandings;
    const team = body.franchise[3].id;
    delete body.franchise[3].pf;
    body.franchise[3].h2hwlt = "";
    const {value} = await read("leagueStandings", body);
    const rows = standings(value, settings, names).flatMap((division) => division.rows);
    const row = rows.find((each) => each.id === team);
    assert.ok(Number.isNaN(row.pf));
    assert.equal(figure(row.pf, 1), "—");
    assert.equal(rows.filter((each) => each.id !== team).every((each) => Number.isFinite(each.pf)), true);
    const html = standingsMarkup(standings(value, settings, names), {viewer: null, final: "", teamHref: () => "#"});
    assert.doesNotMatch(html, /NaN|undefined|null/);
    // no record, no games back of it, and no seeds that go by it
    assert.equal(recordText(row.h2h), "—");
    assert.equal(playoffPicture(standings(value, settings, names)), null);
});

test("a score that won't read leaves that week's all-play and high score unknown for every team, and so the payouts", async () => {
    const ytd = fixture("weekly-results-ytd.json").allWeeklyResults;
    ytd.weeklyResults[1].matchup[0].franchise[0].score = "x";
    assert.match(markMissing("allWeeklyResults", structuredClone(ytd)).problem, /franchise \d{4}'s score isn't a number \("x"\)$/);
    const {value} = await read("allWeeklyResults", ytd);
    assert.equal(value.weeklyResults[1].matchup[0].franchise[0].score, null);
    const records = allPlayRecords(value, 14);
    assert.ok([...records.values()].every((record) => recordText(record) === "—"));
    assert.equal(weeklyWinners(value, 14).find((week) => week.week === Number(value.weeklyResults[1].week)).teams, null);

    const rows = standings(fixture("league-standings.json").leagueStandings, settings, names, records).flatMap((division) => division.rows);
    const result = winnings({accounting: fixture("accounting.json").accounting, weeklyResults: value, standingRows: rows, lastRegularWeek: 14, names});
    assert.ok(result.rows.every((row) => Number.isNaN(row.total) && Number.isNaN(row.weekly)));
    assert.ok(Number.isNaN(result.forPlayoffs));
    assert.ok(result.prizes.every((prize) => Number.isNaN(prize.amount)));
    // the pot itself is known
    assert.equal(result.pot.toFixed(2), "846.58");
    assert.match(winningsLine(result.rows[0]), / · All-play —$/);
    assert.match(winningsLine(result.rows.find((row) => !row.weeks.length)), /^Weekly — · All-play —$/);
    const html = winnersMarkup(result, {viewer: null, final: "", teamHref: () => "#"});
    assert.doesNotMatch(html, /NaN|undefined|null|\$0\.00/);
    assert.equal(ledger(NaN), "—");
});

// MFL leaves out a score for a game not yet played, so only one that won't read is a change
test("Power's points by position: a starter's score that won't read leaves his team's position and total unknown, drawn last", async () => {
    const ytd = fixture("weekly-results-ytd.json").allWeeklyResults;
    const team = ytd.weeklyResults[0].matchup[0].franchise[0];
    const starter = team.player.find((player) => player.status === "starter" && positions.has(player.id));
    starter.score = "12.3.4";
    const {value} = await read("allWeeklyResults", ytd);
    const rows = positionPoints(value, positions, names, ["QB", "RB", "WR", "TE", "PK"]);
    const last = rows[rows.length - 1];
    assert.equal(last.id, team.id);
    assert.ok(Number.isNaN(last.total));
    assert.ok(Number.isNaN(last.parts.find((part) => part.position === positions.get(starter.id)).points));
    assert.ok(rows.slice(0, -1).every((row) => Number.isFinite(row.total)));
    const html = positionsMarkup(rows, {viewer: null, teamHref: () => "#"});
    assert.doesNotMatch(html, /NaN|undefined/);
});

test("a playoff game whose points MFL left out isn't decided", () => {
    const brackets = [fixture("playoff-bracket-2025-1.json").playoffBracket, fixture("playoff-bracket-2025-2.json").playoffBracket];
    const rounds = brackets[0].playoffRound;
    const game = [].concat([].concat(rounds)[[].concat(rounds).length - 1].playoffGame)[0];
    game.home.points = null;
    assert.equal(playoffPlaces(brackets), null);
});

// ---- Scores ----

const players = new Map(fixture("players-league.json").players.player.map((player) => [player.id, {name: player.name, sortName: player.name, position: player.position, team: player.team}]));
const rules = readRules(fixture("rules.json").rules);

// week 6's cards from `live` (liveScoring, as a display panel reads it), with the stats feed or without
function cards(live, {stats = readStats(raw("live-stats-w6.txt")), schedule = fixture("nfl-schedule-w6.json").nflSchedule} = {}) {
    const games = gameStates(schedule, stats || NO_STATS);
    return scoreCards({live, players, stats, games, rules, projections: stats ? readProjections(raw("live-proj-w6.txt")) : null, week: 6, viewer: "0001"});
}
const sideOf = (built, id) => built.flatMap((card) => card.teams).find((team) => team.id === id);
const draws = (built) => cardsMarkup(built, {names, viewer: "0001", open: new Set(built.map((card, i) => i)), bench: new Set(), preview: false, best: false});

test("Scores: a player MFL didn't say starts or sits leaves his side's score not known, and the card no leader or win chance", async () => {
    const live = fixture("live-scoring-w6.json").liveScoring;
    const side = live.matchup[0].franchise[0];
    side.players.player[0].status = "";
    const {value} = await read("liveScoring", live);
    const built = cards(value);
    const team = sideOf(built, side.id);
    assert.ok(Number.isNaN(team.score));
    const card = built.find((each) => each.teams.includes(team));
    assert.ok(card.teams.every((each) => each.chance === null));
    assert.ok(built.filter((each) => each !== card).every((each) => each.teams.every((other) => Number.isFinite(other.score))));
    assert.doesNotMatch(draws(built), /NaN|undefined/);
    // neither side marked as trailing
    assert.doesNotMatch(draws([card]), /fuad-trailing/);
});

test("Scores without the stats feed: a player's points that won't read are —, and so is his side's score; seconds left that won't read aren't Final", async () => {
    const live = fixture("live-scoring-w6.json").liveScoring;
    const side = live.matchup[1].franchise[1];
    const starter = side.players.player.find((player) => player.status === "starter" && Number(player.gameSecondsRemaining) < 3600);
    starter.score = "1.2.3";
    const other = side.players.player.find((player) => player !== starter && player.status === "starter" && Number(player.gameSecondsRemaining) >= 3600 && players.has(player.id));
    other.gameSecondsRemaining = "soon";
    const {value} = await read("liveScoring", live);
    const built = cards(value, {stats: null});
    const team = sideOf(built, side.id);
    assert.ok(Number.isNaN(team.score));
    assert.ok(Number.isNaN(team.starters.find((line) => line.id === starter.id).points));
    assert.notEqual(team.starters.find((line) => line.id === other.id).game.state, "over");
    assert.doesNotMatch(draws(built), /NaN|undefined/);
});

test("Scores: a kickoff MFL left out is —, or the game as the stats feed has it", async () => {
    const schedule = fixture("nfl-schedule-w6.json").nflSchedule;
    schedule.matchup.forEach((game) => delete game.kickoff);
    schedule.matchup[0].kickoff = "1791900000";
    const {value} = await read("nflSchedule", schedule);
    const stats = readStats(raw("live-stats-w6.txt"));
    const games = gameStates(value, stats);
    const teams = value.matchup.flatMap((game) => game.team.map((team) => team.id));
    const played = teams.filter((id) => stats.teams.has(id));
    const unplayed = teams.filter((id) => !stats.teams.has(id) && value.matchup.some((game) => game.kickoff === null && game.team.some((team) => team.id === id)));
    assert.ok(played.every((id) => games.of(id).state !== "scheduled" || Number.isFinite(games.of(id).kickoff)));
    assert.ok(unplayed.length);
    assert.ok(unplayed.every((id) => gameText(games.of(id), () => "Sun") === "—"));
});

test("Your season: a result whose score won't read shows only W, L or T", async () => {
    const schedule = fixture("schedule.json").schedule;
    schedule.weeklySchedule[0].matchup[0].franchise[0].score = "W";
    const {value} = await read("schedule", schedule);
    const season = teamSeason(value, schedule.weeklySchedule[0].matchup[0].franchise[0].id);
    assert.match(season[0].result, /^[WLT]$/);
    assert.match(season[1].result, /^[WLT] \d+\.\d–\d+\.\d$/);
});
