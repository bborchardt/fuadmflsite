// League's numbers, from MFL's exports and pages: standings and the playoff picture, power rankings
// and starter points by position, the weekly and all-play winnings and the playoff prizes, and the
// score cards. No drawing here, so each can be checked against saved exports.

import {asArray, mflProgram, numberOf} from "../lib/mfl.js";
import {figure} from "./format.js";
import {text} from "./player-page.js";
import {GAME_SECONDS, SIMULATIONS, advanceChances, scoreStats, statLine, winProbability} from "./live-scoring.js";
import {
    PRIZE_SHARES, WEEKLY_PRIZE, allPlayPayout, forPlayoffs, ordinal, potOf, prizeAmount, recordText, weeklyWinners, weeksOf
} from "../lib/payouts.js";
import settings from "../lib/settings.js";
import {lineupPositions, seasonWeeks} from "../lib/rules.js";
import {pairedIn, roundOf, roundPlaces, weekScores} from "../lib/rounds.js";

export {
    WEEKLY_PRIZE, allPlayRecords, bracketCount, placeBrackets, playoffPlaces, recordText, weeklyWinners
} from "../lib/payouts.js";

export const PLAYOFF_TEAMS = settings.playoffs.teams;

// a record MFL left out (null: ui/checked.js lenient) isn't known
const record = (wlt) => {
    if (wlt === null) {
        return {w: NaN, l: NaN, t: NaN};
    }
    const [w, l, t] = String(wlt || "0-0-0").split("-").map(Number);
    return {w: w || 0, l: l || 0, t: t || 0};
};
const pct = ({w, l, t}) => (w + l + t ? (w + t / 2) / (w + l + t) : 0);
// "2.0", "0.5": games back of a record
const gamesBack = (leader, team) => ((leader.w - team.w) + (team.l - leader.l)) / 2;

// the `league` export's divisions and each team's: {divisions: [{id, name}], of: Map(team → division id)}
export function divisionsOf(league) {
    const divisions = asArray(league && league.divisions && league.divisions.division).map((division) => ({id: division.id, name: division.name}));
    const of = new Map(asArray(league && league.franchises && league.franchises.franchise).map((team) => [team.id, team.division]));
    return {divisions, of};
}

// `leagueStandings` lists the teams in MFL's standings order (the league's `standingsSort`). Its
// all-play record keeps counting through the playoffs, so `allPlay` (allPlayRecords) replaces it.
export function standings(leagueStandings, league, names, allPlay = null) {
    const {divisions, of} = divisionsOf(league);
    const teams = asArray(leagueStandings && leagueStandings.franchise).map((team, order) => ({
        id: team.id,
        name: names.get(team.id) || team.id,
        order,
        h2h: record(team.h2hwlt),
        allPlay: (allPlay && allPlay.get(team.id)) || record(team.all_play_wlt),
        division: of.get(team.id),
        divisionRecord: team.divwlt || "",
        pct: team.h2hpct || "",
        pf: numberOf(team.pf),
        pa: numberOf(team.pa),
        avgPf: numberOf(team.avgpf),
        avgPa: numberOf(team.avgpa),
        streak: team.strk || ""
    }));
    return divisions.map((division) => {
        const rows = teams.filter((team) => team.division === division.id);
        return {
            ...division,
            rows: rows.map((team, i) => ({...team, rank: i + 1, gamesBack: i ? figure(gamesBack(rows[0].h2h, team.h2h), 1) : "—"}))
        };
    }).filter((division) => division.rows.length);
}

// The playoff seeds (settings.playoffs): the division winners and the best other records. With
// `winnersFirst` the winners are the first seeds, in standings order; without, every seed goes by
// record. A record is all-play or the standings' (`wildcardsBy`); all-play ties go by the standings
// order, or by total points and then the overall record (`allPlayTiesBy`), and any tie left by the
// standings.
// The top seeds have byes. "In the hunt" is the rest, games back of the last team in by the same
// record. Null when a record it goes by isn't known (a score MFL left out).
export function playoffPicture(divisions, {
    winnersFirst = settings.playoffs.divisionWinnersSeededFirst, wildcardsBy = settings.playoffs.wildcardsBy, tiesBy = settings.playoffs.allPlayTiesBy
} = {}) {
    const all = divisions.flatMap((division) => division.rows.map((team) => ({...team, divisionName: division.name})));
    const byStandings = (a, b) => a.order - b.order;
    const allPlay = wildcardsBy === "allPlay";
    const recordOf = (team) => (allPlay ? team.allPlay : team.h2h);
    if (!all.every((team) => [team.h2h, recordOf(team)].every((each) => [each.w, each.l, each.t].every(Number.isFinite)))) {
        return null;
    }
    // the regular season's points (allPlayRecords), as MFL's keep counting through the playoffs
    const points = (team) => (Number.isFinite(team.allPlay.points) ? team.allPlay.points : team.pf || 0);
    const byPoints = (a, b) => (tiesBy === "points" ? points(b) - points(a) || pct(b.h2h) - pct(a.h2h) : 0);
    const byRecord = (a, b) => (allPlay ? pct(b.allPlay) - pct(a.allPlay) || byPoints(a, b) : 0) || byStandings(a, b);
    const winners = divisions.map((division) => division.rows[0]).filter(Boolean)
        .map((team) => all.find((row) => row.id === team.id)).sort(winnersFirst ? byStandings : byRecord);
    const rest = all.filter((team) => !winners.includes(team)).sort(byRecord);
    const wildcards = rest.slice(0, PLAYOFF_TEAMS - winners.length);
    const label = (team) => (winners.includes(team) ? `${team.divisionName} winner` : `${recordText(recordOf(team))}${allPlay ? " all-play" : ""}`);
    const order = winnersFirst ? [...winners, ...wildcards] : [...winners, ...wildcards].sort(byRecord);
    const seeds = order.map((team, i) => ({team, why: label(team), seed: i + 1, bye: i < settings.playoffs.byes}));
    const last = wildcards[wildcards.length - 1];
    const tiedOut = allPlay && tiesBy === "points" ? "tied · out on points" : "tied · out on standings";
    const hunt = rest.slice(wildcards.length).map((team) => {
        const back = last ? gamesBack(recordOf(last), recordOf(team)) : 0;
        return {team, record: recordText(recordOf(team)), back: back > 0 ? `${back} back` : tiedOut};
    });
    return {seeds, hunt};
}

// Whether the playoffs are rounds of weekly scores (settings.playoffs.rounds) rather than MFL brackets
export const byRounds = () => settings.playoffs.rounds.length > 0;

// The places from the rounds (lib/rounds.js roundPlaces), ties going to the higher seed of the
// playoff picture: {places, note}. `ytd` the season's weekly results, `league` its league export.
export function placesByRounds(ytd, league, divisions, completedWeek) {
    const picture = playoffPicture(divisions);
    const seeds = new Map((picture ? picture.seeds : []).map((seed) => [seed.team.id, seed.seed]));
    return roundPlaces(ytd, {rounds: settings.playoffs.rounds, weeks: seasonWeeks(league), seeds, completedWeek});
}

// A ranked playoff round's week in Scores (settings.playoffs.rounds, lib/rounds.js): the round's teams
// ranked on their totals so far, its earlier weeks (`ytd`, the weekly results) and this week's cards
// added up, ties to the higher seed. In the round's last week, while games are on, each team's chance
// of being in the top `advance` (of 1st, in the last round), from the cards' simulations; earlier, a
// week still to come isn't simulated, so none. Null for any other week, or a round whose teams
// aren't all on this week's cards. `seeds`: team → seed.
export function roundCard(cards, {week, weeks, ytd, seeds = new Map()}) {
    const where = roundOf(week, {rounds: settings.playoffs.rounds, weeks});
    if (!where || where.round.headToHead) {
        return null;
    }
    const sides = new Map(cards.flatMap((card) => card.teams).map((team) => [team.id, team]));
    const teams = where.weeks[0] === week ? [...sides.keys()] : pairedIn(ytd, where.weeks[0]);
    if (!teams.length || teams.some((id) => !sides.has(id))) {
        return null;
    }
    const earlier = where.weeks.filter((each) => each < week).map((each) => weekScores(ytd, each));
    const seedOf = (id) => (seeds.has(id) ? seeds.get(id) : Infinity);
    const cents = (value) => Math.round(value * 100) / 100;
    const rows = teams.map((id) => {
        const side = sides.get(id);
        const before = cents(earlier.reduce((sum, scores) => sum + (scores.has(id) ? scores.get(id) : NaN), 0));
        return {
            id, before, week: side.score, total: cents(before + side.score),
            projected: side.projected === null ? null : before + side.projected,
            playing: side.playing, toPlay: side.toPlay, done: side.done, started: side.started,
            // a side done has its final; one with no simulation (no projections) has none
            totals: side.totals || (side.done && Number.isFinite(side.score) ? new Array(SIMULATIONS).fill(side.score) : null)
        };
    }).sort((a, b) => seedOf(a.id) - seedOf(b.id));
    const top = where.last ? 1 : where.round.advance;
    const live = rows.some((row) => !row.done);
    const chances = live && week === where.weeks[where.weeks.length - 1] && rows.every((row) => Number.isFinite(row.before))
        ? advanceChances(rows, top) : null;
    const ranked = rows.map((row, i) => ({...row, chance: chances ? chances[i] : null, totals: undefined}))
        .sort((a, b) => (Number.isFinite(b.total) ? b.total : -Infinity) - (Number.isFinite(a.total) ? a.total : -Infinity) || seedOf(a.id) - seedOf(b.id));
    return {
        number: where.index + 1, last: where.last, advance: where.last ? null : where.round.advance,
        weeks: where.weeks, rows: ranked, chanceOf: where.last ? "1st" : "advance"
    };
}

// MFL's Power Rank page (`options?O=101`), whose report has no export: null on any other page (the
// home page's Power Rankings module has the same table) or if its table isn't there
export function readPowerPage(html) {
    if (mflProgram(html) !== "options_101") {
        return null;
    }
    const rows = String(html).match(/<tr[^>]*>\s*<td class="franchisename">[\s\S]*?<\/tr>/g);
    if (!rows || !/class="power_rank"/.test(html)) {
        return null;
    }
    const teams = rows.map((row) => {
        const cell = (name) => {
            const found = row.match(new RegExp(`<td class="${name}[^"]*"[^>]*>([\\s\\S]*?)</td>`));
            return found ? text(found[1]) : "";
        };
        const id = (row.match(/franchise_(\d{4})/) || [])[1];
        return {
            id,
            name: cell("franchisename"),
            record: cell("h2hwlt"),
            pf: cell("total_points"),
            possible: cell("total_potential_points"),
            efficiency: cell("efficiency"),
            bench: cell("bench_points"),
            high: cell("maxpf"),
            low: cell("minpf"),
            couldaWon: cell("coulda_won"),
            wouldaLost: cell("woulda_lost"),
            power: Number(cell("power_rank")) || 0,
            alternate: cell("alt_power_rank"),
            allPlay: recordText(record(`${cell("all_play_w")}-${cell("all_play_l")}-${cell("all_play_t")}`))
        };
    }).filter((team) => team.id);
    return teams.length ? teams : null;
}

// What MFL's Power Rank page lists for a team, as the phone's tap shows it
export const powerFacts = (team) => [
    ["Points for", team.pf], ["Points possible", team.possible], ["Efficiency", team.efficiency],
    ["Bench points", team.bench], ["High score", team.high], ["Low score", team.low],
    ["All-play", team.allPlay], ["Coulda won", team.couldaWon], ["Woulda lost", team.wouldaLost],
    ["Alternate rank", team.alternate]
];


// Starter points by position, the season so far: each week's starters (`weeklyResults` for YTD)
// summed by the player's position, in team order of the total, a team with one not known (NaN: a
// score, or whether he started, MFL left out) last; `order` the league's positions (lib/rules.js
// lineupPositions)
export function positionPoints(weeklyResults, positions, names, order) {
    const totals = new Map();
    for (const week of weeksOf(weeklyResults)) {
        for (const matchup of asArray(week.matchup)) {
            for (const team of asArray(matchup.franchise)) {
                const sums = totals.get(team.id) || Object.fromEntries(order.map((position) => [position, 0]));
                for (const player of asArray(team.player)) {
                    const position = positions.get(player.id);
                    if ((player.status === "starter" || player.status === null) && position in sums) {
                        sums[position] += player.status === null ? NaN : numberOf(player.score);
                    }
                }
                totals.set(team.id, sums);
            }
        }
    }
    return [...totals].map(([id, sums]) => ({
        id,
        name: names.get(id) || id,
        parts: order.map((position) => ({position, points: Math.round(sums[position])})),
        total: Math.round(order.reduce((sum, position) => sum + sums[position], 0))
    })).sort((a, b) => Number(Number.isFinite(b.total)) - Number(Number.isFinite(a.total)) || b.total - a.total);
}

// Winners' ledger: always to the cent, thousands separated ("$1,234.50", "−$15.00"); "—" not known
export const ledger = (value) => (typeof value !== "number" || !Number.isFinite(value) ? "—"
    : `${value < 0 ? "−" : ""}$${Math.abs(value).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`);

// The payouts (settings.payouts). The pot is the league-wide (0000) entries in MFL's accounting; the
// weekly prizes (every regular season week, known up front) and the all-play payouts so far come out
// of it, and what's left is split by the places' shares. Until the commissioner records the pot it's
// null, and so are the playoffs' amounts. `places` names the prize winners once the playoffs are over.
// A week whose high score isn't known leaves every team's weekly winnings unknown (NaN), as a record
// not known does its all-play payout, and so the totals and what the places split.
export function winnings({accounting, weeklyResults, standingRows, lastRegularWeek, places = null, placesNote = null, names}) {
    const {entries, pot} = potOf(accounting);
    const weekly = new Map();
    let weeklyKnown = true;
    for (const {week, teams} of weeklyWinners(weeklyResults, lastRegularWeek)) {
        if (!teams) {
            weeklyKnown = false;
            continue;
        }
        for (const id of teams) {
            const won = weekly.get(id) || {weeks: [], amount: 0};
            won.weeks.push(week);
            won.amount += WEEKLY_PRIZE / teams.length;
            weekly.set(id, won);
        }
    }
    const teams = standingRows.map((team) => {
        const won = weekly.get(team.id) || {weeks: [], amount: 0};
        const allPlay = allPlayPayout(team.allPlay);
        return {id: team.id, name: names.get(team.id) || team.name, record: recordText(team.allPlay), net: team.allPlay.w - team.allPlay.l, weeks: won.weeks, weekly: weeklyKnown ? won.amount : NaN, allPlay};
    });
    const weeklyTotal = lastRegularWeek * WEEKLY_PRIZE;
    const allPlayPaid = teams.reduce((sum, team) => sum + team.allPlay, 0);
    const pool = forPlayoffs(pot, lastRegularWeek, allPlayPaid);
    const prizes = PRIZE_SHARES.map((share, i) => ({
        place: ordinal(i + 1),
        share,
        amount: prizeAmount(pool, i),
        team: places ? places[i] : null
    }));
    const prizeOf = (id) => prizes.find((prize) => prize.team === id) || null;
    const rows = teams.map((team) => {
        const prize = prizeOf(team.id);
        return {...team, prize, total: team.weekly + team.allPlay + (prize && prize.amount ? prize.amount : 0)};
    }).sort((a, b) => Number(Number.isFinite(b.total)) - Number(Number.isFinite(a.total)) || b.total - a.total || b.net - a.net);
    return {potEntries: entries, pot, weeklyTotal, weeklyPrize: WEEKLY_PRIZE, allPlayPaid, forPlayoffs: pool, prizes, rows, placesNote};
}

// "Week 3 $15.00 · 17-19 all-play · 2nd $139.51": a team's winnings in one grey line
export function winningsLine(row) {
    const parts = [];
    if (row.weeks.length) {
        parts.push(`Week${row.weeks.length > 1 ? "s" : ""} ${row.weeks.join(", ")} ${ledger(row.weekly)}`);
    } else if (Number.isNaN(row.weekly)) {
        parts.push("Weekly —");
    }
    // a record not known (a score MFL left out) leaves its payout unknown too
    parts.push(row.record === "—" ? "All-play —" : `${row.record} all-play${row.allPlay ? ` ${ledger(row.allPlay)}` : ""}`);
    if (row.prize) {
        parts.push(row.prize.amount === null ? row.prize.place : `${row.prize.place} ${ledger(row.prize.amount)}`);
    }
    return parts.join(" · ");
}

// A team's season from the `schedule` export: [{week, opponent, result}], results as "W 159.1–146.2",
// or "W" alone when a score isn't known (MFL's left out)
export function teamSeason(schedule, teamId) {
    return asArray(schedule && schedule.weeklySchedule).flatMap((week) => {
        for (const matchup of asArray(week.matchup)) {
            const sides = asArray(matchup.franchise);
            const mine = sides.find((side) => side.id === teamId);
            if (mine) {
                const other = sides.find((side) => side !== mine) || {};
                const played = mine.score !== undefined && other.score !== undefined && /^[WLT]$/.test(mine.result || "");
                const scores = [numberOf(mine.score), numberOf(other.score)];
                const result = !played ? "" : scores.every(Number.isFinite) ? `${mine.result} ${figure(scores[0], 1)}–${figure(scores[1], 1)}` : mine.result;
                return [{week: Number(week.week), opponent: other.id, result}];
            }
        }
        return [];
    });
}

// ---- Scores ----

// lines by the league's positions (lib/rules.js lineupPositions), any other last, then by name
const byPosition = (order) => {
    const rank = (position) => (order.includes(position) ? order.indexOf(position) : order.length);
    return (a, b) => rank(a.position) - rank(b.position) || a.sortName.localeCompare(b.sortName);
};

const minutes = (seconds) => Math.round(seconds / 60);
// lines' points: none yet (null) counts 0, one not known (NaN) leaves the sum not known
const sumPoints = (lines) => lines.reduce((sum, line) => sum + (line.points === null || line.points === undefined ? 0 : line.points), 0);

// Without the stats feed (null: one v2 couldn't read), a game stands as liveScoring's seconds left say
// (3600 not started, 0 over), with no quarter; without them (MFL's left out: null), as scheduled
function gameFromSeconds(scheduled, entry) {
    const left = Number(entry.gameSecondsRemaining);
    if (scheduled.state === "bye" || entry.gameSecondsRemaining === undefined || entry.gameSecondsRemaining === null || !Number.isFinite(left)) {
        return scheduled;
    }
    if (left <= 0) {
        return {state: "over", secondsLeft: 0};
    }
    return left >= GAME_SECONDS ? scheduled : {state: "playing", quarter: null, secondsLeft: left, possession: false};
}

// one player's line on a card: where his game stands and what he's done; without the stats feed, his
// points as liveScoring has them
function playerLine(entry, {players, stats, games, rules, ir = false}) {
    const player = players.get(entry.id) || {};
    const position = player.position || "";
    const game = stats ? games.of(player.team) : gameFromSeconds(games.of(player.team), entry);
    const own = stats ? stats.players.get(entry.id) : undefined;
    const scored = game.state === "playing" || game.state === "over";
    return {
        id: entry.id,
        name: player.name || entry.id,
        sortName: player.sortName || "",
        position,
        team: player.team,
        points: !scored ? null : stats ? scoreStats(own, position, rules) : numberOf(entry.score),
        game,
        stats: own,
        line: statLine(own, position),
        ir
    };
}

// "Final", "Playing · Q3", "Sun 3:25 p.m.", "Bye": the game state on a player's grey line; "—" for a
// kickoff not known
export function gameText(game, kickoffText) {
    if (game.state === "scheduled" && Number.isNaN(game.kickoff)) {
        return "—";
    }
    if (game.state === "over") {
        return "Final";
    }
    if (game.state === "playing") {
        return game.quarter ? `Playing · ${game.quarter}` : "Playing";
    }
    if (game.state === "scheduled" && game.kickoff) {
        return kickoffText(game.kickoff);
    }
    return "Bye";
}

// Each matchup of a week from `liveScoring` (who starts) and the stats feed (points, game states),
// the viewer's first; `stats` null when the feed couldn't be read: liveScoring's points and seconds
// left, and no win chance. Scores come from the feed with the league's rules, the way MFL's live page
// keeps them current; `projections` (the projected stats feed) adds each side's projection and win
// chance while anything is left to play. `rosters` adds the viewer's week's IR players to benches.
// A side with a player's points not known (NaN), or a player MFL didn't say starts or sits, has its
// score not known, and the card no win chance.
export function scoreCards({live, players, stats, games, rules, projections = null, week, viewer = null, irOf = () => [], order = lineupPositions(null)}) {
    const sorted = byPosition(order);
    const cards = asArray(live && live.matchup).map((matchup) => {
        const sides = asArray(matchup.franchise).slice().sort((a, b) => Number(a.isHome) - Number(b.isHome));
        const built = sides.map((side) => {
            // a bench player the rosters have on IR is one, should MFL list him there (Best leaves him out)
            const entries = asArray(side.players && side.players.player);
            const lineup = entries.map((entry) => ({
                ...playerLine(entry, {players, stats, games, rules, ir: entry.status !== "starter" && irOf(side.id).includes(entry.id)}),
                starter: entry.status === "starter"
            }));
            const starters = lineup.filter((line) => line.starter).sort(sorted);
            const bench = lineup.filter((line) => !line.starter)
                .concat(irOf(side.id).filter((id) => !lineup.some((line) => line.id === id)).map((id) => ({...playerLine({id}, {players, stats, games, rules, ir: true}), starter: false})))
                .sort((a, b) => Number(a.ir) - Number(b.ir) || (b.points || 0) - (a.points || 0) || sorted(a, b));
            const secondsLeft = starters.reduce((sum, line) => sum + (["playing"].includes(line.game.state) ? line.game.secondsLeft
                : line.game.state === "scheduled" ? 3600 : 0), 0);
            return {
                id: side.id,
                home: side.isHome === "1",
                score: entries.some((entry) => entry.status === null) ? NaN : sumPoints(starters),
                playing: starters.filter((line) => line.game.state === "playing").length,
                toPlay: starters.filter((line) => line.game.state === "scheduled").length,
                minutes: minutes(secondsLeft),
                done: secondsLeft === 0,
                started: starters.some((line) => line.game.state === "playing" || line.game.state === "over"),
                starters,
                bench
            };
        });
        let chances = null;
        if (stats && projections && built.length === 2 && built.some((side) => !side.done) && built.every((side) => Number.isFinite(side.score))) {
            const perPlayer = new Map();
            const side = (team) => ({
                done: team.done,
                total: team.score,
                starters: team.starters.map((line) => ({playerId: line.id, position: line.position, team: line.team, points: line.points || 0, stats: line.stats})),
                perPlayer
            });
            const result = winProbability({away: side(built[0]), home: side(built[1])}, {games, projections, rules, week});
            chances = [result.away, result.home];
            for (const team of built) {
                for (const line of team.starters) {
                    line.projected = perPlayer.has(line.id) ? perPlayer.get(line.id) : null;
                }
            }
        }
        built.forEach((team, i) => {
            team.projected = chances ? chances[i].projected : null;
            // the simulated finals, for a ranked playoff round's chances (roundCard)
            team.totals = chances ? chances[i].totals : null;
            team.chance = chances ? chances[i].chance : null;
        });
        return {teams: built, mine: built.some((team) => team.id === viewer)};
    });
    return cards.sort((a, b) => Number(b.mine) - Number(a.mine));
}

// The league's lineup rules from MFL's `league` export: {count, limits: {QB: [1, 2], …}}
export function starterLimits(league) {
    const starters = league && league.starters;
    const limits = {};
    asArray(starters && starters.position).forEach((position) => {
        const [min, max] = String(position.limit || "").split("-").map(Number);
        limits[position.name] = [min || 0, Number.isFinite(max) ? max : min || 0];
    });
    return {count: Number(starters && starters.count) || 0, limits};
}

// MFL's best lineup, as its live scoring page works it out (`get_best_lineup`): the roster ranked by
// points so far (no NFL team or a bye last), each position's minimum filled first, then up to its
// maximum, `count` in all, less any minimum the roster can't fill. The ids of the lineup. Ties go to
// the lines marked `starter`, where MFL goes by name and ranks no points yet below 0: the same score,
// with the lineup changed only for points. So, unlike MFL's, a starter below 0 gives way to a player
// yet to play, whose none so far is more.
export function bestLineup(lines, {count, limits}) {
    // no points yet counts as none, so a bench player on 0 doesn't replace a starter yet to play
    const last = (line) => [!line.team || /^FA/.test(line.team) ? 1 : 0, line.game && line.game.state === "bye" ? 1 : 0];
    const ranked = lines.slice().sort((a, b) => {
        const [x, y] = [last(a), last(b)];
        for (let i = 0; i < x.length; i++) {
            if (x[i] !== y[i]) {
                return x[i] - y[i];
            }
        }
        return (b.points || 0) - (a.points || 0) || Number(Boolean(b.starter)) - Number(Boolean(a.starter)) || String(a.name).localeCompare(String(b.name));
    });
    const held = {};
    lines.forEach((line) => {
        held[line.position] = (held[line.position] || 0) + 1;
    });
    const room = count - Object.entries(limits).reduce((short, [position, [min]]) => short + Math.max(0, min - (held[position] || 0)), 0);
    const got = {};
    const chosen = new Set();
    for (const stage of [0, 1]) {
        for (const line of ranked) {
            const [min, max] = limits[line.position] || [0, 0];
            if (!chosen.has(line.id) && chosen.size < room && (got[line.position] || 0) < (stage === 0 ? min : max)) {
                chosen.add(line.id);
                got[line.position] = (got[line.position] || 0) + 1;
            }
        }
    }
    return chosen;
}

// A score card with each side's best lineup in place of the one it started: the best score, `actual`
// the score it got; players off the bench tagged "in", starters left out tagged "started" on the bench.
// Players on IR can't start.
export function bestCard(card, limits) {
    return {...card, teams: card.teams.map((team) => {
        const pool = team.starters.concat(team.bench.filter((line) => !line.ir));
        const ids = bestLineup(pool, limits);
        const starters = pool.filter((line) => ids.has(line.id)).map((line) => ({...line, tag: line.starter ? "" : "in"})).sort(byPosition(Object.keys(limits.limits)));
        const bench = team.starters.filter((line) => !ids.has(line.id)).map((line) => ({...line, tag: "started"}))
            .concat(team.bench.filter((line) => !ids.has(line.id)).map((line) => ({...line, tag: ""})));
        return {
            ...team, actual: team.score, score: Number.isNaN(team.score) ? NaN : sumPoints(starters), starters, bench,
            // a bench player's game can be the only one played (Thursday night)
            started: starters.some((line) => line.game.state === "playing" || line.game.state === "over")
        };
    })};
}

// the starters side by side, paired by order (flex spots let the two sides' shapes differ)
export function pairLines(a, b) {
    return Array.from({length: Math.max(a.length, b.length)}, (_, i) => [a[i] || null, b[i] || null]);
}

// the week's state under the picker: "Live", "Final" or the next kickoff's day
export function weekState(cards, games, kickoffDay) {
    const lines = cards.flatMap((card) => card.teams.flatMap((team) => team.starters));
    if (games.any || lines.some((line) => line.game.state === "playing")) {
        return {text: "Live", live: true};
    }
    if (lines.length && lines.every((line) => line.game.state !== "scheduled")) {
        return {text: "Final", live: false};
    }
    const next = lines.filter((line) => line.game.state === "scheduled" && line.game.kickoff).map((line) => line.game.kickoff);
    return {text: next.length ? `${kickoffDay(Math.min(...next))} kickoff` : "", live: false};
}
