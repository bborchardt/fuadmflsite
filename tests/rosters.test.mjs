import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildLeague, playersFromExport} from "../site/v2/lib/league.js";
import {SALARY_CAP} from "../site/v2/lib/rules.js";
import {playoffPicture, standings} from "../site/v2/ui/league-model.js";
import {
    byeWeeks, draftBoard, draftOrder, drafted, filterPlayers, penaltiesOf, pickNumbers, picksOf, picksSummary, playerPool,
    playoffFinish, pointsById, scaleRange, scaleText, sortPlayers, teamSheets
} from "../site/v2/ui/rosters-model.js";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

const settings = fixture("league-settings.json").league;
const names = new Map(settings.franchises.franchise.map((team) => [team.id, team.name]));
const playersExport = fixture("players-league.json").players;
const league = buildLeague({
    players: playersFromExport(playersExport), league: settings, salaryAdjustments: fixture("salary-adjustments.json").salaryAdjustments,
    rosters: fixture("rosters.json").rosters, freeAgents: fixture("free-agents.json").freeAgents
});
const context = {
    salaryAdjustments: fixture("salary-adjustments.json").salaryAdjustments,
    futureDraftPicks: fixture("future-draft-picks.json").futureDraftPicks,
    byes: byeWeeks(fixture("nfl-bye-weeks.json").nflByeWeeks),
    points: pointsById(fixture("player-scores-ytd.json").playerScores),
    season: 2026,
    names
};

test("team sheets: least cap used first, salaries plus penalties make cap used", () => {
    const sheets = teamSheets(league, context);
    assert.equal(sheets.length, 10);
    assert.ok(sheets.every((sheet, i) => !i || sheet.capUsed >= sheets[i - 1].capUsed));
    for (const sheet of sheets) {
        assert.equal(Math.round((sheet.salaries + sheet.penaltyTotal) * 100), Math.round(sheet.capUsed * 100), sheet.id);
        assert.equal(sheet.seasons.length, 5);
        assert.equal(sheet.seasons[0].used, sheet.capUsed);
        assert.ok(sheet.seasons.every((season, i) => !i || season.used <= sheet.seasons[i - 1].used + 0.001));
        assert.equal(sheet.seasons[0].tight, SALARY_CAP - sheet.capUsed < 10);
    }
    const mine = sheets.find((sheet) => sheet.id === "0001");
    assert.deepEqual(mine.groups.map((group) => group.position), ["QB", "RB", "WR", "TE", "PK"]);
    assert.equal(mine.groups.reduce((sum, group) => sum + group.players.length, 0), mine.active + mine.ir);
    assert.ok(mine.groups.every((group) => group.players.every((player, i) => !i || player.salary <= group.players[i - 1].salary)));
});

test("penalties read MFL's adjustment notes, two players in one included", () => {
    const team = league.franchises.get("0004");
    const penalties = penaltiesOf(team, context.salaryAdjustments);
    assert.deepEqual(penalties.map((penalty) => [penalty.who, penalty.terms, penalty.amount]), [
        ["Brandon Aiyuk", "2 yrs left at $1", 2],
        ["Pat Freiermuth, Joe Mixon", "1 yr left at $1 each", 2],
        ["Chigoziem Okonkwo", "1 yr left at $1", 1]
    ]);
    assert.match(penalties[0].when, /^Mon Sep 7$/);
});

test("draft picks: each round's own pick, picks from others, and own picks traded away", () => {
    const picks = picksOf("0001", context.futureDraftPicks, {names, nextYear: 2027, numbers: new Map([["0001", 8]])});
    assert.deepEqual(picks.map((year) => year.year), [2027, 2028]);
    assert.equal(picks[0].rows[0].number, "1.08");
    assert.equal(picks[1].rows[0].number, "");
    const all = context.futureDraftPicks.franchise.flatMap((team) => team.futureDraftPick.map((pick) => ({...pick, holder: team.id})));
    const away = all.find((pick) => pick.holder !== pick.originalPickFor);
    if (away) {
        const original = picksOf(away.originalPickFor, context.futureDraftPicks, {names, nextYear: 2027});
        assert.ok(original.flatMap((year) => year.rows).some((row) => row.traded && row.note === `Traded to ${names.get(away.holder)}`));
        const holder = picksOf(away.holder, context.futureDraftPicks, {names, nextYear: 2027});
        assert.ok(holder.flatMap((year) => year.rows).some((row) => row.note === `from ${names.get(away.originalPickFor)}`));
    }
    assert.match(picksSummary("0001", context.futureDraftPicks, 2027), /^\d+/);
});

test("the player pool: rostered players and free agents on an NFL team, filtered by the chips together", () => {
    const pool = playerPool(league, {freeAgents: fixture("free-agents.json").freeAgents, points: context.points, projections: new Map(), byes: context.byes, names, offseason: false});
    const free = pool.filter((player) => player.fa);
    assert.ok(free.length > 100);
    assert.ok(free.every((player) => player.nfl && player.nfl !== "FA" && player.salary === null));
    assert.equal(pool.filter((player) => !player.fa).length, league.rosteredPlayers.length);
    const mineQb = filterPlayers(pool, {positions: ["QB"], owners: ["Mine"], viewer: "0001"});
    assert.ok(mineQb.length > 0 && mineQb.every((player) => player.position === "QB" && player.owner === "0001"));
    const oneYear = filterPlayers(pool, {years: ["1"], owners: ["Other teams"], viewer: "0001"});
    assert.ok(oneYear.every((player) => player.years === 1 && player.owner !== "0001"));
    assert.deepEqual(filterPlayers(pool, {text: "lamar"}).map((player) => player.name), ["Lamar Jackson"]);
    const byPoints = sortPlayers(pool, "points");
    assert.ok(byPoints[0].points >= byPoints[1].points);
    const byName = sortPlayers(pool, "name");
    assert.ok(byName[0].name.localeCompare(byName[1].name) <= 0);
});

test("in the offseason a player without years left is a restricted free agent", () => {
    const pool = playerPool(league, {freeAgents: null, points: new Map(), projections: new Map(), byes: new Map(), names, offseason: true});
    const rfas = pool.filter((player) => player.rfa);
    assert.ok(rfas.every((player) => player.salary === null && player.years === null));
    assert.deepEqual(filterPlayers(pool, {years: ["FA"]}).map((player) => player.id).sort(), rfas.map((player) => player.id).sort());
});

test("the rookie scale by overall pick", () => {
    assert.equal(scaleText(1), "QB $6 · RB $10 · WR $10 · TE $4 · PK $1");
    assert.equal(scaleRange(1), "$1–10");
    assert.equal(scaleText(15), "$1 at every position");
});

test("next year's order: the four out of the playoffs worst first, then the seeds unnumbered", () => {
    const divisions = standings(fixture("league-standings.json").leagueStandings, settings, names);
    const picture = playoffPicture(divisions);
    const order = draftOrder(picture, {names, nextYear: 2027, futureDraftPicks: context.futureDraftPicks});
    assert.equal(order.length, 10);
    assert.deepEqual(order.slice(0, 4).map((row) => row.pick), [1, 2, 3, 4]);
    const standingsOrder = fixture("league-standings.json").leagueStandings.franchise.map((team) => team.id);
    const out = order.slice(0, 4).map((row) => standingsOrder.indexOf(row.id));
    assert.ok(out.every((place, i) => !i || place < out[i - 1]));
    assert.ok(order.slice(4).every((row) => row.pick === null));
    assert.equal(order[4].why, "Seed 6");
    assert.equal(pickNumbers(order).size, 4);
});

test("2025's playoffs: first-round losers by seed, the 3rd place game, the final", () => {
    const finish = playoffFinish([fixture("playoff-bracket-2025-1.json").playoffBracket, fixture("playoff-bracket-2025-2.json").playoffBracket]);
    // seed 6 (0002) and seed 5 (0007) lost in round 1; 0009 lost the 3rd place game to 0005; 0001 lost the final to 0004
    assert.deepEqual(finish, ["0002", "0007", "0009", "0005", "0001", "0004"]);
});

test("this site's draft: rounds of picks with the player and his salary today", () => {
    const players = playersFromExport(playersExport);
    const salaries = new Map(league.rosteredPlayers.map((player) => [player.playerId, player.salary]));
    const board = draftBoard(fixture("draft-results.json").draftResults, {names, players, salaries});
    assert.ok(board.length >= 1);
    assert.equal(board[0].picks[0].number, "1.01");
    assert.equal(board[0].picks[0].overall, 1);
    assert.ok(drafted(board));
    const released = board.flatMap((round) => round.picks).filter((pick) => pick.player && pick.salary === null);
    assert.ok(released.every((pick) => !salaries.has(pick.player.id)));
});

test("a traded draft slot names its original owner by today's name, and not when it came back", () => {
    const players = playersFromExport(playersExport);
    const board = draftBoard(fixture("draft-results.json").draftResults, {names, players, salaries: new Map()});
    const pick = (number) => board.flatMap((round) => round.picks).find((entry) => entry.number === number);
    // slot 6 is 0007's (untraded in rounds 2 and 3); MFL's comment still has the team's old name
    assert.equal(pick("1.06").from, names.get("0007"));
    assert.equal(pick("1.10").from, "Smooth City Styles!");
    assert.equal(pick("2.06").from, "");
    assert.equal(pick("3.06").from, "");
    // a pick traded away and back is the holder's own
    const all = board.flatMap((round) => round.picks);
    assert.ok(all.every((entry) => entry.from !== entry.teamName));
    assert.ok(all.every((entry) => !/â/.test(entry.from)));
});

test("a cut already charged isn't listed again as owed", () => {
    const team = {franchiseId: "0001", pendingDroppedPlayers: [
        {fullName: "Charged Player", years: 2, salary: 10, capPenalty: 8, penaltyCharged: true},
        {fullName: "Owed Player", years: 1, salary: 2, capPenalty: 1, penaltyCharged: false}
    ]};
    assert.deepEqual(penaltiesOf(team, {salaryAdjustment: []}).map((penalty) => penalty.who), ["Owed Player"]);
});

test("the playoff finish waits for its last week to be done", () => {
    const brackets = [fixture("playoff-bracket-2025-1.json").playoffBracket, fixture("playoff-bracket-2025-2.json").playoffBracket];
    assert.equal(playoffFinish(brackets, {completedWeek: 16}), null);
    assert.equal(playoffFinish(brackets, {completedWeek: 17}).length, 6);
});
