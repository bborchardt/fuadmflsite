// Standings' Playoffs panel: the playoffs as they stand, from MFL's brackets (`playoffBracket`
// exports) or, in a league whose playoffs are rounds of scores (settings.playoffs.rounds), from the
// weekly results (lib/rounds.js).

import {asArray} from "../lib/mfl.js";
import {matchupsIn, pairedIn, weekScores} from "../lib/rounds.js";

// a round's name from where it is: the last the championship, the one before the semifinals, and
// one before that the wild card when the next round has seeds waiting (byes), else quarterfinals
function roundTitle(rounds, index) {
    const fromEnd = rounds.length - 1 - index;
    if (fromEnd === 0) {
        return "Championship";
    }
    if (fromEnd === 1) {
        return "Semifinals";
    }
    const byes = asArray(rounds[index + 1].playoffGame).some((game) => ["home", "away"].some((name) => game[name] && game[name].seed && !game[name].winner_of_game));
    return byes ? "Wild card" : fromEnd === 2 ? "Quarterfinals" : `Round ${index + 1}`;
}

const played = (side) => side && side.points !== undefined && side.points !== null && side.points !== "";

// The championship bracket's rounds and the 3rd place game, each {week, title, games}; a game is
// {sides: [{id, seed, points, from}], winner: its id or null, state}. `brackets`: the championship's
// export and, if the league has one, the 3rd place game's (lib/payouts.js placeBrackets). A side
// MFL hasn't named a team for yet takes the seed's from `seeds` (seed → team), else says where it
// comes from ("Winner of semifinal 1"). A week up to `completedWeek` is final, `currentWeek` (the
// week being played) live, and a later one to come. A tie goes to the home side, the higher seed (bylaw 1.5).
// Null when the championship has no rounds.
export function bracketRounds(brackets, {seeds = new Map(), completedWeek = Infinity, currentWeek = Infinity}) {
    const rounds = asArray(brackets[0] && brackets[0].playoffRound);
    if (!rounds.length) {
        return null;
    }
    // game id → its round's name and place in it, for "Winner of …"
    const named = new Map();
    rounds.forEach((round, index) => {
        const title = roundTitle(rounds, index);
        const games = asArray(round.playoffGame);
        // one game of the semifinals is a semifinal
        const one = title.toLowerCase().replace(/s$/, "");
        games.forEach((game, i) => named.set(String(game.game_id), games.length > 1 ? `${one} ${i + 1}` : one));
    });
    // a team's seed wherever the bracket gives it, for a later game's side that has only its team
    const seedOfTeam = new Map([...seeds].map(([seed, id]) => [id, seed]));
    rounds.flatMap((round) => asArray(round.playoffGame)).flatMap((game) => [game.home, game.away])
        .filter((side) => side && side.seed && side.franchise_id).forEach((side) => seedOfTeam.set(side.franchise_id, Number(side.seed)));
    const sideOf = (side) => {
        const given = side && side.seed ? Number(side.seed) : null;
        const id = (side && side.franchise_id) || (given && seeds.get(given)) || null;
        const seed = given || (id && seedOfTeam.get(id)) || null;
        const from = side && (side.winner_of_game || side.loser_of_game);
        return {
            id,
            seed,
            points: played(side) ? Number(side.points) : null,
            from: !id && from ? `${side.winner_of_game ? "Winner" : "Loser"} of ${named.get(String(from)) || `game ${from}`}` : null
        };
    };
    const gameOf = (week) => (game) => {
        const sides = [game.away, game.home].map(sideOf);
        const state = week <= completedWeek ? "final" : week === currentWeek ? "live" : "next";
        const [away, home] = sides;
        const winner = state === "final" && away.id && home.id && away.points !== null && home.points !== null
            ? (away.points > home.points ? away.id : home.id) : null;
        // the higher seed on top, as MFL lists the home side second
        return {sides: [home, away], winner, state};
    };
    const shown = rounds.map((round, index) => {
        const week = Number(round.week);
        return {week, title: roundTitle(rounds, index), games: asArray(round.playoffGame).map(gameOf(week))};
    });
    const third = asArray(brackets[1] && brackets[1].playoffRound);
    if (third.length) {
        const round = third[third.length - 1];
        const week = Number(round.week);
        shown.push({week, title: "3rd place", games: asArray(round.playoffGame).map(gameOf(week))});
    }
    return shown;
}

// The rounds of a league whose playoffs are rounds of scores, each {weeks, title, ranked, notSet,
// rows, games}: a row {id, seed, total, mark}, ranked by the round's total over the weeks played
// (`completedWeek`), ties to the higher seed; a head-to-head round also has its `games`, as
// bracketRounds', won on the round's total. `mark`: "Advanced" for a team with a matchup in the
// next round, or once the last round is over "Champion" for its first. A round whose first week MFL
// has no matchups for yet is `notSet`. `currentWeek` the week being played, so a round in it is live.
export function roundsBracket(weeklyResults, {rounds, weeks, seeds = new Map(), completedWeek = Infinity, currentWeek = Infinity}) {
    if (!weeks || !rounds.length) {
        return null;
    }
    const seedOf = new Map([...seeds].map(([seed, id]) => [id, seed]));
    let first = weeks.playoffsStart;
    const spans = rounds.map((round) => {
        const span = Array.from({length: round.weeks}, (_, i) => first + i);
        first += round.weeks;
        return span;
    });
    return rounds.map((round, index) => {
        const span = spans[index];
        const last = index === rounds.length - 1;
        const title = last ? "Final" : `Round ${index + 1}`;
        const teams = pairedIn(weeklyResults, span[0]);
        const done = span[span.length - 1] <= completedWeek;
        const live = span.includes(currentWeek) && !done;
        if (!teams.length) {
            return {weeks: span, title, notSet: true, live, rows: []};
        }
        const scores = span.filter((week) => week <= completedWeek).map((week) => weekScores(weeklyResults, week));
        const next = last ? [] : pairedIn(weeklyResults, spans[index + 1][0]);
        const cents = (value) => Math.round(value * 100) / 100;
        const rank = (id) => (seedOf.has(id) ? seedOf.get(id) : Infinity);
        const rows = teams.map((id) => ({
            id,
            seed: seedOf.has(id) ? seedOf.get(id) : null,
            total: scores.length ? cents(scores.reduce((sum, week) => sum + (week.has(id) ? week.get(id) : NaN), 0)) : null
        })).sort((a, b) => (Number.isFinite(b.total) ? b.total : -Infinity) - (Number.isFinite(a.total) ? a.total : -Infinity) || rank(a.id) - rank(b.id));
        rows.forEach((row, i) => {
            row.mark = next.includes(row.id) ? "Advanced" : last && done && i === 0 && Number.isFinite(row.total) ? "Champion" : null;
        });
        const byId = new Map(rows.map((row) => [row.id, row]));
        const games = round.headToHead ? matchupsIn(weeklyResults, span[0]).map((pair) => {
            const sides = pair.map((id) => ({id, seed: byId.get(id).seed, points: byId.get(id).total, from: null}))
                .sort((a, b) => rank(a.id) - rank(b.id));
            const winner = done && sides.every((side) => Number.isFinite(side.points)) ? rows.find((row) => pair.includes(row.id)).id : null;
            return {sides, winner, state: live ? "live" : done ? "final" : "next"};
        }) : null;
        return {weeks: span, title, ranked: !round.headToHead, notSet: false, live, done, rows, games};
    });
}
