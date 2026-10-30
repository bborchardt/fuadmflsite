// The league's payouts (settings.payouts, bylaws 1.6–1.8), shared by League › Winners and the daily
// job, which records them in MFL's accounting.

import settings from "./settings.js";
import {asArray} from "./mfl.js";

export const WEEKLY_PRIZE = settings.payouts.weeklyHighScore;
export const ALL_PLAY_RATE = settings.payouts.allPlayPerGameOver500;
export const PRIZE_SHARES = settings.payouts.places;

const cents = (amount) => Math.round(amount * 100) / 100;
// "24-11-1", "32-4": a tie shows only when there is one
export const recordText = ({w, l, t}) => `${w}-${l}${t ? `-${t}` : ""}`;
// "1st", "2nd", "3rd", "4th"…
export const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;

export const weeksOf = (weeklyResults) => asArray(weeklyResults && (weeklyResults.weeklyResults || weeklyResults));

const scoresOf = (week) => asArray(week.matchup).flatMap((matchup) => asArray(matchup.franchise))
    .filter((team) => team.score !== undefined && team.score !== "")
    .map((team) => ({id: team.id, score: Number(team.score)}));

// The newest week with any score, or 0
export const latestScoredWeek = (weeklyResults) => Math.max(0, ...weeksOf(weeklyResults).filter((week) => scoresOf(week).length).map((week) => Number(week.week)));

// Each team's all-play record over the regular season's weeks with results: every week, a win
// against each team it outscored (bylaws 1.3 and 1.7)
export function allPlayRecords(weeklyResults, lastRegularWeek) {
    const records = new Map();
    for (const week of weeksOf(weeklyResults).filter((entry) => Number(entry.week) <= lastRegularWeek)) {
        const scores = scoresOf(week);
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

// Each regular season week's high scorers: {week, teams}. Only weeks MFL has results for.
export function weeklyWinners(weeklyResults, lastRegularWeek) {
    return weeksOf(weeklyResults)
        .filter((week) => Number(week.week) <= lastRegularWeek)
        .map((week) => {
            const scores = scoresOf(week);
            const top = Math.max(...scores.map((team) => team.score));
            return {week: Number(week.week), teams: scores.length && top > 0 ? scores.filter((team) => team.score === top).map((team) => team.id) : []};
        })
        .filter((week) => week.teams.length);
}

export const allPlayPayout = (record) => Math.max(0, record.w - record.l) * ALL_PLAY_RATE;

// The pot: the accounting's league-wide (0000) entries, null until the commissioner records them
export function potOf(accounting) {
    const entries = asArray(accounting && accounting.entry).filter((entry) => entry.franchise_id === "0000")
        .map((entry) => ({description: entry.description, amount: Number(entry.amount) || 0}));
    return {entries, pot: entries.length ? entries.reduce((sum, entry) => sum + entry.amount, 0) : null};
}

// What the places split: the pot less every regular season week's prize (known up front) and the
// all-play payouts
export const forPlayoffs = (pot, lastRegularWeek, allPlayPaid) => (pot === null ? null : cents(pot - lastRegularWeek * WEEKLY_PRIZE - allPlayPaid));
export const prizeAmount = (pool, place) => (pool === null ? null : cents(pool * PRIZE_SHARES[place]));

// The brackets that decide the places, from MFL's `playoffBrackets` list: the championship's, and
// the 3rd place game's if the league has one
export const bracketCount = () => (settings.playoffs.thirdPlaceGame ? 2 : 1);
export function placeBrackets(list) {
    const champion = list.find((bracket) => /champion/i.test(bracket.bracketWinnerTitle || "")) || list[0];
    const third = list.find((bracket) => /3rd/i.test(`${bracket.bracketWinnerTitle} ${bracket.name}`)) || list[1];
    return settings.playoffs.thirdPlaceGame ? [champion, third] : [champion];
}

// The places once the playoffs are played: 1st and 2nd from the championship's last game, 3rd from
// the 3rd place game if the league has one. `brackets` are the `playoffBracket` exports; a tie goes
// to the higher seed (bylaw 1.5), which MFL marks as the home side.
export function playoffPlaces(brackets, {thirdPlaceGame = settings.playoffs.thirdPlaceGame} = {}) {
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
    if (!thirdPlaceGame) {
        return final;
    }
    const third = decided(lastGame(brackets[1]));
    return final && third ? [final[0], final[1], third[0]] : null;
}

// The accounting records the payouts still need, through the last week whose scores are final: each
// regular season week's high score, the all-play payouts once the regular season's last week is
// final, and the places once the championship's is (`places`, from playoffPlaces). A payout already in
// the accounting under any team, by hand or by an earlier run, isn't added again: "Most Points Week
// 3", "Most points weeks 1,4" (2025's), "All-play (82-44)", "1st Place". `problem` says why places
// that are due can't be recorded. Records: [{franchise, amount, description}].
export function missingPayouts({accounting, weeklyResults, lastRegularWeek, endWeek, finalWeek, places}) {
    const entries = asArray(accounting && accounting.entry);
    const described = (pattern) => entries.map((entry) => ({entry, match: pattern.exec(entry.description || "")})).filter(({match}) => match);
    const paidWeeks = new Set(described(/^most points weeks?\s+([\d,\s]+)/i).flatMap(({match}) => match[1].split(/[,\s]+/).filter(Boolean).map(Number)));
    const paidAllPlay = new Set(described(/^all-play\b/i).map(({entry}) => entry.franchise_id));
    const paidPlaces = new Set(described(/^(\d+)(?:st|nd|rd|th) place\b/i).map(({match}) => Number(match[1])));
    const records = [];
    for (const {week, teams} of weeklyWinners(weeklyResults, Math.min(lastRegularWeek, finalWeek))) {
        if (!paidWeeks.has(week)) {
            teams.forEach((id) => records.push({franchise: id, amount: cents(WEEKLY_PRIZE / teams.length), description: `Most Points Week ${week}`}));
        }
    }
    if (finalWeek < lastRegularWeek) {
        return {records, problem: null};
    }
    const allPlay = allPlayRecords(weeklyResults, lastRegularWeek);
    for (const [id, record] of allPlay) {
        const amount = cents(allPlayPayout(record));
        if (amount > 0 && !paidAllPlay.has(id)) {
            records.push({franchise: id, amount, description: `All-play (${recordText(record)})`});
        }
    }
    const due = PRIZE_SHARES.map((share, i) => i + 1).filter((place) => !paidPlaces.has(place));
    if (finalWeek < endWeek || !due.length) {
        return {records, problem: null};
    }
    if (!places) {
        return {records, problem: "MFL's playoff brackets don't name them"};
    }
    const pool = forPlayoffs(potOf(accounting).pot, lastRegularWeek, [...allPlay.values()].reduce((sum, record) => sum + allPlayPayout(record), 0));
    if (pool === null) {
        return {records, problem: "the accounting has no league-wide entries, so there's no pot to split"};
    }
    for (const place of due) {
        records.push({franchise: places[place - 1], amount: prizeAmount(pool, place - 1), description: `${ordinal(place)} Place`});
    }
    return {records, problem: null};
}
