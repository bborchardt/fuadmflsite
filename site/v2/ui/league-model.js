// League's numbers, from MFL's exports and pages: standings and the playoff picture, power rankings
// and starter points by position, the weekly and all-play winnings and the playoff prizes, and the
// score cards. No drawing here, so each can be checked against saved exports.

import {asArray} from "../lib/mfl.js";
import {text} from "./player-page.js";
import {scoreStats, statLine, winProbability} from "./live-scoring.js";

export const PLAYOFF_TEAMS = 6;
export const WEEKLY_PRIZE = 15;
export const ALL_PLAY_RATE = 0.75;
export const PRIZE_SHARES = [0.55, 0.30, 0.15];
// a season's entry fees before the commissioner records them: $100 a team, 10 teams
export const ENTRY_FEE = 100;
export const TEAMS = 10;
export const POSITION_ORDER = ["QB", "RB", "WR", "TE", "PK"];

const record = (wlt) => {
    const [w, l, t] = String(wlt || "0-0-0").split("-").map(Number);
    return {w: w || 0, l: l || 0, t: t || 0};
};
const pct = ({w, l, t}) => (w + l + t ? (w + t / 2) / (w + l + t) : 0);
// "2.0", "0.5": games back of a record
const gamesBack = (leader, team) => ((leader.w - team.w) + (team.l - leader.l)) / 2;
// "24-11-1", "32-4": a tie shows only when there is one
export const recordText = ({w, l, t}) => `${w}-${l}${t ? `-${t}` : ""}`;
const points = (value) => (Number(value) || 0).toFixed(1);

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
        pf: Number(team.pf) || 0,
        pa: Number(team.pa) || 0,
        avgPf: Number(team.avgpf) || 0,
        avgPa: Number(team.avgpa) || 0,
        streak: team.strk || ""
    }));
    return divisions.map((division) => {
        const rows = teams.filter((team) => team.division === division.id);
        return {
            ...division,
            rows: rows.map((team, i) => ({...team, rank: i + 1, gamesBack: i ? gamesBack(rows[0].h2h, team.h2h).toFixed(1) : "—"}))
        };
    }).filter((division) => division.rows.length);
}

// Each team's all-play record over the regular season's weeks with results: every week, a win
// against each team it outscored (bylaws 1.3 and 1.7)
export function allPlayRecords(weeklyResults, lastRegularWeek) {
    const records = new Map();
    for (const week of weeksOf(weeklyResults).filter((entry) => Number(entry.week) <= lastRegularWeek)) {
        const scores = asArray(week.matchup).flatMap((matchup) => asArray(matchup.franchise))
            .filter((team) => team.score !== undefined && team.score !== "")
            .map((team) => ({id: team.id, score: Number(team.score)}));
        for (const team of scores) {
            const sum = records.get(team.id) || {w: 0, l: 0, t: 0};
            for (const other of scores) {
                if (other !== team) {
                    sum[team.score > other.score ? "w" : team.score < other.score ? "l" : "t"]++;
                }
            }
            records.set(team.id, sum);
        }
    }
    return records;
}

// Bylaws 1.1–1.3: the division winners are seeds 1–2; the other four are the best all-play
// records, ties broken by the standings order. "In the hunt" is the rest, all-play games back of
// the last seed.
export function playoffPicture(divisions) {
    const all = divisions.flatMap((division) => division.rows.map((team) => ({...team, divisionName: division.name})));
    const byStandings = (a, b) => a.order - b.order;
    const winners = divisions.map((division) => division.rows[0]).filter(Boolean)
        .map((team) => all.find((row) => row.id === team.id)).sort(byStandings);
    const rest = all.filter((team) => !winners.includes(team))
        .sort((a, b) => pct(b.allPlay) - pct(a.allPlay) || byStandings(a, b));
    const wildcards = rest.slice(0, PLAYOFF_TEAMS - winners.length);
    const seeds = [
        ...winners.map((team) => ({team, why: `${team.divisionName} winner`, bye: true})),
        ...wildcards.map((team) => ({team, why: `${recordText(team.allPlay)} all-play`, bye: false}))
    ].map((seed, i) => ({...seed, seed: i + 1}));
    const last = wildcards[wildcards.length - 1];
    const hunt = rest.slice(wildcards.length).map((team) => {
        const back = last ? gamesBack(last.allPlay, team.allPlay) : 0;
        return {team, record: recordText(team.allPlay), back: back > 0 ? `${back} back` : "tied · out on standings"};
    });
    return {seeds, hunt};
}

// MFL's Power Rank page (`options?O=101`), whose report has no export: null if its table isn't there
export function readPowerPage(html) {
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

const weeksOf = (weeklyResults) => asArray(weeklyResults && (weeklyResults.weeklyResults || weeklyResults));

// Starter points by position, the season so far: each week's starters (`weeklyResults` for YTD)
// summed by the player's position, in team order of the total
export function positionPoints(weeklyResults, positions, names) {
    const totals = new Map();
    for (const week of weeksOf(weeklyResults)) {
        for (const matchup of asArray(week.matchup)) {
            for (const team of asArray(matchup.franchise)) {
                const sums = totals.get(team.id) || Object.fromEntries(POSITION_ORDER.map((position) => [position, 0]));
                for (const player of asArray(team.player)) {
                    const position = positions.get(player.id);
                    if (player.status === "starter" && position in sums) {
                        sums[position] += Number(player.score) || 0;
                    }
                }
                totals.set(team.id, sums);
            }
        }
    }
    return [...totals].map(([id, sums]) => ({
        id,
        name: names.get(id) || id,
        parts: POSITION_ORDER.map((position) => ({position, points: Math.round(sums[position])})),
        total: Math.round(POSITION_ORDER.reduce((sum, position) => sum + sums[position], 0))
    })).sort((a, b) => b.total - a.total);
}

// Each regular season week's high scorers: {week, teams}. Only weeks MFL has results for.
export function weeklyWinners(weeklyResults, lastRegularWeek) {
    return weeksOf(weeklyResults)
        .filter((week) => Number(week.week) <= lastRegularWeek)
        .map((week) => {
            const scores = asArray(week.matchup).flatMap((matchup) => asArray(matchup.franchise))
                .filter((team) => team.score !== undefined && team.score !== "")
                .map((team) => ({id: team.id, score: Number(team.score)}));
            const top = Math.max(...scores.map((team) => team.score));
            return {week: Number(week.week), teams: scores.length && top > 0 ? scores.filter((team) => team.score === top).map((team) => team.id) : []};
        })
        .filter((week) => week.teams.length);
}

export const money = (value) => `${value < 0 ? "−" : ""}$${Math.abs(value).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

// The places once the playoffs are played: 1st and 2nd from the championship's last game, 3rd from
// the 3rd place game. `brackets` are the `playoffBracket` exports; a tie goes to the higher seed
// (bylaw 1.5), which MFL marks as the home side.
export function playoffPlaces(brackets) {
    const lastGame = (bracket) => {
        const rounds = asArray(bracket && bracket.playoffRound);
        return rounds.length ? asArray(rounds[rounds.length - 1].playoffGame)[0] : null;
    };
    const decided = (game) => {
        if (!game || !game.home || !game.away || game.home.points === undefined || game.away.points === undefined) {
            return null;
        }
        const homeWins = Number(game.home.points) >= Number(game.away.points);
        return homeWins ? [game.home.franchise_id, game.away.franchise_id] : [game.away.franchise_id, game.home.franchise_id];
    };
    const final = decided(lastGame(brackets[0]));
    const third = decided(lastGame(brackets[1]));
    return final && third ? [final[0], final[1], third[0]] : null;
}

// Bylaws 1.6–1.8. The pot is the league-wide (0000) entries in MFL's accounting, or the entry fees
// before they're recorded; the weekly prizes (every regular season week, known up front) and the
// all-play payouts so far come out of it, and what's left is split 55/30/15. `places` names the
// prize winners once the playoffs are over.
export function winnings({accounting, weeklyResults, standingRows, lastRegularWeek, places = null, names}) {
    const entries = asArray(accounting && accounting.entry).filter((entry) => entry.franchise_id === "0000")
        .map((entry) => ({description: entry.description, amount: Number(entry.amount) || 0}));
    const potEntries = entries.length ? entries : [{description: "Entry fees", amount: ENTRY_FEE * TEAMS}];
    const pot = potEntries.reduce((sum, entry) => sum + entry.amount, 0);
    const weekly = new Map();
    for (const {week, teams} of weeklyWinners(weeklyResults, lastRegularWeek)) {
        for (const id of teams) {
            const won = weekly.get(id) || {weeks: [], amount: 0};
            won.weeks.push(week);
            won.amount += WEEKLY_PRIZE / teams.length;
            weekly.set(id, won);
        }
    }
    const teams = standingRows.map((team) => {
        const won = weekly.get(team.id) || {weeks: [], amount: 0};
        const allPlay = Math.max(0, team.allPlay.w - team.allPlay.l) * ALL_PLAY_RATE;
        return {id: team.id, name: names.get(team.id) || team.name, record: recordText(team.allPlay), net: team.allPlay.w - team.allPlay.l, weeks: won.weeks, weekly: won.amount, allPlay};
    });
    const weeklyTotal = lastRegularWeek * WEEKLY_PRIZE;
    const allPlayPaid = teams.reduce((sum, team) => sum + team.allPlay, 0);
    const forPlayoffs = Math.round((pot - weeklyTotal - allPlayPaid) * 100) / 100;
    const prizes = PRIZE_SHARES.map((share, i) => ({
        place: ["1st", "2nd", "3rd"][i],
        share,
        amount: Math.round(forPlayoffs * share * 100) / 100,
        team: places ? places[i] : null
    }));
    const prizeOf = (id) => prizes.find((prize) => prize.team === id) || null;
    const rows = teams.map((team) => {
        const prize = prizeOf(team.id);
        return {...team, prize, total: team.weekly + team.allPlay + (prize ? prize.amount : 0)};
    }).sort((a, b) => b.total - a.total || b.net - a.net);
    return {potEntries, pot, weeklyTotal, allPlayPaid, forPlayoffs, prizes, rows};
}

// "Week 3 $15.00 · 17-19 all-play · 2nd $139.51": a team's winnings in one grey line
export function winningsLine(row) {
    const parts = [];
    if (row.weeks.length) {
        parts.push(`Week${row.weeks.length > 1 ? "s" : ""} ${row.weeks.join(", ")} ${money(row.weekly)}`);
    }
    parts.push(`${row.record} all-play${row.allPlay ? ` ${money(row.allPlay)}` : ""}`);
    if (row.prize) {
        parts.push(`${row.prize.place} ${money(row.prize.amount)}`);
    }
    return parts.join(" · ");
}

// A team's season from the `schedule` export: [{week, opponent, result}], results as "W 159.1–146.2"
export function teamSeason(schedule, teamId) {
    return asArray(schedule && schedule.weeklySchedule).flatMap((week) => {
        for (const matchup of asArray(week.matchup)) {
            const sides = asArray(matchup.franchise);
            const mine = sides.find((side) => side.id === teamId);
            if (mine) {
                const other = sides.find((side) => side !== mine) || {};
                const played = mine.score !== undefined && other.score !== undefined && /^[WLT]$/.test(mine.result || "");
                return [{week: Number(week.week), opponent: other.id, result: played ? `${mine.result} ${points(mine.score)}–${points(other.score)}` : ""}];
            }
        }
        return [];
    });
}

// ---- Scores ----

const byPosition = (a, b) => POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position) || a.sortName.localeCompare(b.sortName);

const minutes = (seconds) => Math.round(seconds / 60);

// one player's line on a card: where his game stands and what he's done
function playerLine(entry, {players, stats, games, rules, ir = false}) {
    const player = players.get(entry.id) || {};
    const position = player.position || "";
    const game = games.of(player.team);
    const own = stats.players.get(entry.id);
    const scored = game.state === "playing" || game.state === "over";
    return {
        id: entry.id,
        name: player.name || entry.id,
        sortName: player.sortName || "",
        position,
        team: player.team,
        points: scored ? scoreStats(own, position, rules) : null,
        game,
        stats: own,
        line: statLine(own, position),
        ir
    };
}

// "Final", "Playing · Q3", "Sun 3:25 p.m.", "Bye": the game state on a player's grey line
export function gameText(game, kickoffText) {
    if (game.state === "over") {
        return "Final";
    }
    if (game.state === "playing") {
        return `Playing · ${game.quarter}`;
    }
    if (game.state === "scheduled" && game.kickoff) {
        return kickoffText(game.kickoff);
    }
    return "Bye";
}

// Each matchup of a week from `liveScoring` (who starts) and the stats feed (points, game states),
// the viewer's first. Scores come from the feed with the league's rules, the way MFL's live page
// keeps them current; `projections` (the projected stats feed) adds each side's projection and win
// chance while anything is left to play. `rosters` adds the viewer's week's IR players to benches.
export function scoreCards({live, players, stats, games, rules, projections = null, week, viewer = null, irOf = () => []}) {
    const cards = asArray(live && live.matchup).map((matchup) => {
        const sides = asArray(matchup.franchise).slice().sort((a, b) => Number(a.isHome) - Number(b.isHome));
        const built = sides.map((side) => {
            const lineup = asArray(side.players && side.players.player).map((entry) => ({...playerLine(entry, {players, stats, games, rules}), starter: entry.status === "starter"}));
            const starters = lineup.filter((line) => line.starter).sort(byPosition);
            const bench = lineup.filter((line) => !line.starter)
                .concat(irOf(side.id).filter((id) => !lineup.some((line) => line.id === id)).map((id) => ({...playerLine({id}, {players, stats, games, rules, ir: true}), starter: false})))
                .sort((a, b) => Number(a.ir) - Number(b.ir) || (b.points || 0) - (a.points || 0) || byPosition(a, b));
            const secondsLeft = starters.reduce((sum, line) => sum + (["playing"].includes(line.game.state) ? line.game.secondsLeft
                : line.game.state === "scheduled" ? 3600 : 0), 0);
            return {
                id: side.id,
                home: side.isHome === "1",
                score: starters.reduce((sum, line) => sum + (line.points || 0), 0),
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
        if (projections && built.length === 2 && built.some((side) => !side.done)) {
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
// with the lineup changed only for points.
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
        const starters = pool.filter((line) => ids.has(line.id)).map((line) => ({...line, tag: line.starter ? "" : "in"})).sort(byPosition);
        const bench = team.starters.filter((line) => !ids.has(line.id)).map((line) => ({...line, tag: "started"}))
            .concat(team.bench.filter((line) => !ids.has(line.id)).map((line) => ({...line, tag: ""})));
        return {...team, actual: team.score, score: starters.reduce((sum, line) => sum + (line.points || 0), 0), starters, bench};
    })};
}

// the starters side by side, paired by order (flex spots let the two sides' shapes differ)
export function pairLines(a, b) {
    return Array.from({length: Math.max(a.length, b.length)}, (_, i) => [a[i] || null, b[i] || null]);
}

// the week's state under the picker: "Live", "Final" or the next kickoff's day
export function weekState(cards, games, kickoffDay) {
    const lines = cards.flatMap((card) => card.teams.flatMap((team) => team.starters));
    if (games.any) {
        return {text: "Live", live: true};
    }
    if (lines.length && lines.every((line) => line.game.state !== "scheduled")) {
        return {text: "Final", live: false};
    }
    const next = lines.filter((line) => line.game.state === "scheduled" && line.game.kickoff).map((line) => line.game.kickoff);
    return {text: next.length ? `${kickoffDay(Math.min(...next))} kickoff` : "", live: false};
}
