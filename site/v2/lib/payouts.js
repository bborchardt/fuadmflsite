// The league's payouts (settings.payouts; FUAD's bylaws 1.6–1.8), shared by League › Winners and the
// daily job, which records them in MFL's accounting. The places are shares of what's left of the pot
// (`places`) or dollars (`placeAmounts`); all-play pays per game over .500 (`allPlayPerGameOver500`) or
// its best records (`allPlayTop`); `divisionWinner` pays each division's winner.

import settings from "./settings.js";
import {asArray, numberOf} from "./mfl.js";

export const WEEKLY_PRIZE = settings.payouts.weeklyHighScore;
// a league has one of each pair (lib/settings.js EITHER)
export const ALL_PLAY_RATE = settings.payouts.allPlayPerGameOver500 || 0;
export const ALL_PLAY_TOP = settings.payouts.allPlayTop || [];
export const PRIZE_SHARES = settings.payouts.places || null;
export const PLACE_AMOUNTS = settings.payouts.placeAmounts || null;
export const PLACE_COUNT = (PLACE_AMOUNTS || PRIZE_SHARES).length;
export const DIVISION_PRIZE = settings.payouts.divisionWinner || 0;
// the same, as the settings are when asked (tests change them)
const now = () => {
    const {weeklyHighScore, allPlayPerGameOver500 = 0, allPlayTop = [], places = null, placeAmounts = null, divisionWinner = 0} = settings.payouts;
    return {weekly: weeklyHighScore, rate: allPlayPerGameOver500, top: allPlayTop, shares: places, amounts: placeAmounts, count: (placeAmounts || places).length, division: divisionWinner};
};

// to the cent, as MFL keeps salaries ($0.01 for a player whose contract has run out)
export const cents = (amount) => Math.round(amount * 100) / 100;
// "24-11-1", "32-4": a tie shows only when there is one; "—" for one not known (a score MFL left out)
export const recordText = ({w, l, t}) => ([w, l, t].every(Number.isFinite) ? `${w}-${l}${t ? `-${t}` : ""}` : "—");
// "1st", "2nd", "3rd", "4th"…
export const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;

export const weeksOf = (weeklyResults) => asArray(weeklyResults && (weeklyResults.weeklyResults || weeklyResults));

const scoresOf = (week) => asArray(week.matchup).flatMap((matchup) => asArray(matchup.franchise))
    .filter((team) => team.score !== undefined && team.score !== "")
    .map((team) => ({id: team.id, score: team.score === null ? NaN : Number(team.score)}));
// a score not known (NaN) leaves the week's results unknown for every team in it
const unknownIn = (scores) => scores.some((team) => Number.isNaN(team.score));

// The newest week with any score, or 0
export const latestScoredWeek = (weeklyResults) => Math.max(0, ...weeksOf(weeklyResults).filter((week) => scoresOf(week).length).map((week) => Number(week.week)));

// Each team's all-play record over the regular season's weeks with results: every week, a win
// against each team it outscored (bylaws 1.3 and 1.7); `points`, its regular season's total; `h2h`,
// its record in its matchups
export function allPlayRecords(weeklyResults, lastRegularWeek) {
    const records = new Map();
    for (const week of weeksOf(weeklyResults).filter((entry) => Number(entry.week) <= lastRegularWeek)) {
        const scores = scoresOf(week);
        const unknown = unknownIn(scores);
        const opponent = new Map(asArray(week.matchup).map((matchup) => asArray(matchup.franchise)).filter((pair) => pair.length === 2)
            .flatMap(([a, b]) => [[a.id, b.id], [b.id, a.id]]));
        const scoreOf = new Map(scores.map((team) => [team.id, team.score]));
        for (const team of scores) {
            const sum = records.get(team.id) || {w: 0, l: 0, t: 0, points: 0, h2h: {w: 0, l: 0, t: 0}};
            if (unknown) {
                Object.assign(sum, {w: NaN, l: NaN, t: NaN, points: NaN, h2h: {w: NaN, l: NaN, t: NaN}});
            }
            if (opponent.has(team.id) && scoreOf.has(opponent.get(team.id))) {
                const other = scoreOf.get(opponent.get(team.id));
                sum.h2h[team.score > other ? "w" : team.score < other ? "l" : "t"]++;
            }
            sum.points = Math.round((sum.points + team.score) * 100) / 100;
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

// Each regular season week's high scorers: {week, teams}. Only weeks MFL has results for; `teams`
// null for a week with a score not known.
export function weeklyWinners(weeklyResults, lastRegularWeek) {
    return weeksOf(weeklyResults)
        .filter((week) => Number(week.week) <= lastRegularWeek)
        .map((week) => {
            const scores = scoresOf(week);
            if (unknownIn(scores)) {
                return {week: Number(week.week), teams: null};
            }
            const top = Math.max(...scores.map((team) => team.score));
            return {week: Number(week.week), teams: scores.length && top > 0 ? scores.filter((team) => team.score === top).map((team) => team.id) : []};
        })
        .filter((week) => !week.teams || week.teams.length);
}

export const allPlayPayout = (record) => Math.max(0, record.w - record.l) * now().rate;

const winPct = ({w, l, t}) => (w + l + t ? (w + t / 2) / (w + l + t) : 0);

// The all-play prizes (`prizes`, settings.payouts.allPlayTop): id → {place, amount}. Best all-play
// winning percentage first; ties as the seeds' (settings.playoffs.allPlayTiesBy): by total points,
// then the overall record, or by the standings (`standingsOrder`, ids best first). Teams still level
// split the prizes they cover. Null while a record isn't known (a score MFL left out).
export function allPlayPrizes(records, {prizes = now().top, tiesBy = settings.playoffs.allPlayTiesBy, standingsOrder = []} = {}) {
    const teams = [...records].map(([id, record]) => ({id, ...record}));
    if (!prizes.length) {
        return new Map();
    }
    if (teams.some((team) => ![team.w, team.l, team.t].every(Number.isFinite))) {
        return null;
    }
    const placeIn = (id) => (standingsOrder.includes(id) ? standingsOrder.indexOf(id) : Infinity);
    const compare = (a, b) => winPct(b) - winPct(a) || (tiesBy === "points"
        ? b.points - a.points || winPct(b.h2h) - winPct(a.h2h)
        : placeIn(a.id) - placeIn(b.id) || 0);
    teams.sort(compare);
    const won = new Map();
    for (let i = 0; i < teams.length && i < prizes.length;) {
        let end = i + 1;
        while (end < teams.length && compare(teams[i], teams[end]) === 0) {
            end++;
        }
        const covered = prizes.slice(i, end);
        const amount = cents(covered.reduce((sum, prize) => sum + prize, 0) / (end - i));
        teams.slice(i, end).forEach((team) => won.set(team.id, {place: i + 1, amount}));
        i = end;
    }
    return won;
}

// Each division's winner: the first of its teams in MFL's standings order (`leagueStandings`), by the
// `league` export's divisions. [{id, division: its name, teams: its ids, tied}]: `tied` when another
// team in it has the same head-to-head record, so a tiebreak decided it, which MFL's standings may
// break with points or all-play it keeps counting through the playoffs.
export function divisionWinners(leagueStandings, league) {
    const divisionOf = new Map(asArray(league && league.franchises && league.franchises.franchise).map((team) => [team.id, team.division]));
    const names = new Map(asArray(league && league.divisions && league.divisions.division).map((division) => [division.id, division.name]));
    const standing = asArray(leagueStandings && leagueStandings.franchise);
    const pctOf = (team) => (team.h2hpct !== undefined ? Number(team.h2hpct) : NaN);
    const seen = new Set();
    return standing.flatMap((team) => {
        const division = divisionOf.get(team.id);
        if (!division || seen.has(division)) {
            return [];
        }
        seen.add(division);
        const others = standing.filter((other) => other !== team && divisionOf.get(other.id) === division);
        const tied = !Number.isFinite(pctOf(team)) || others.some((other) => !(pctOf(other) < pctOf(team)));
        return [{id: team.id, division: names.get(division) || division, teams: [team.id, ...others.map((other) => other.id)], tied}];
    });
}

// The pot: the accounting's league-wide (0000) entries, null until the commissioner records them
export function potOf(accounting) {
    const entries = asArray(accounting && accounting.entry).filter((entry) => entry.franchise_id === "0000")
        .map((entry) => ({description: entry.description, amount: numberOf(entry.amount)}));
    return {entries, pot: entries.length ? entries.reduce((sum, entry) => sum + entry.amount, 0) : null};
}

// What the places split: the pot less every regular season week's prize (known up front) and the
// all-play payouts
export const forPlayoffs = (pot, lastRegularWeek, allPlayPaid) => (pot === null ? null : cents(pot - lastRegularWeek * now().weekly - allPlayPaid));
// a place's prize: its dollars (placeAmounts), or its share of what the places split (`pool`, null
// until there's a pot)
export const prizeAmount = (pool, place) => {
    const {amounts, shares} = now();
    return amounts ? amounts[place] : pool === null ? null : cents(pool * shares[place]);
};

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
        const unplayed = (side) => side.points === undefined || side.points === null;
        if (!game || !game.home || !game.away || unplayed(game.home) || unplayed(game.away)) {
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

// The accounting's entries whose description matches `pattern`: [{entry, match}]
const described = (accounting, pattern) => asArray(accounting && accounting.entry)
    .map((entry) => ({entry, match: pattern.exec(entry.description || "")})).filter(({match}) => match);
// a playoff place's entry: "1st Place" (FUAD's), "1st Place Playoffs"; not "2nd Place All Play"
const PLACE_ENTRY = /^(\d+)(?:st|nd|rd|th) place(?!\s*all[- ]?play)\b/i;
const ALL_PLAY_PLACE_ENTRY = /^(\d+)(?:st|nd|rd|th) place all[- ]?play\b/i;
const DIVISION_ENTRY = /^division (?:champ|winner)/i;

// The places (1, 2, 3…) the accounting has no "1st Place"… entry for, under any team
export function unpaidPlaces(accounting) {
    const paid = new Set(described(accounting, PLACE_ENTRY).map(({match}) => Number(match[1])));
    return Array.from({length: now().count}, (_, i) => i + 1).filter((place) => !paid.has(place));
}

// The accounting records the payouts still need, through the last week whose scores are final: each
// regular season week's high score; once the regular season's last week is final, the all-play
// payouts and each division's winner (`divisions`, from divisionWinners; `standingsOrder` the
// standings' ids, best first, for all-play ties by the standings); and the places once the
// championship's is (`places`, best first; `placesProblem` why there are none). A payout already in the accounting under any team, by hand,
// by MFL or by an earlier run, isn't added again: "Most Points Week 3", "Most points weeks 1,4"
// (FUAD's 2025), MFL's own "Credit for week 3 high score of 140.83", "All-play (82-44)", "1st Place All
// Play", "Division Champ", "1st Place" or "1st Place Playoffs". A week or all-play place tied between
// teams, unless an entry naming no team covers it, is paid once it has an entry for each; short of
// that, the winners without one are added, as a run can stop between them. `problem` says why a
// payout that's due can't be recorded. Records: [{franchise, amount, description}].
export function missingPayouts({accounting, weeklyResults, lastRegularWeek, endWeek, finalWeek, places, placesProblem = null, divisions = [], standingsOrder = []}) {
    const weekEntries = described(accounting, /^most points weeks?\s+([\d,\s]+)/i).flatMap(({entry, match}) =>
        match[1].split(/[,\s]+/).filter(Boolean).map((week, index, weeks) => ({week: Number(week), franchise: weeks.length > 1 ? null : entry.franchise_id})))
        .concat(described(accounting, /^credit for week (\d+) high score/i).map(({entry, match}) => ({week: Number(match[1]), franchise: entry.franchise_id})));
    const pay = now();
    const records = [];
    const problems = [];
    // a prize shared by `teams`, paid once each has an entry (or any has, for one alone)
    const unpaid = (teams, paid) => {
        const has = (id) => paid.some((entry) => entry.franchise === id);
        const done = paid.some((entry) => entry.franchise === null) || (teams.length === 1 ? paid.length > 0 : teams.every(has));
        return done ? [] : teams.filter((id) => !has(id));
    };
    if (pay.weekly > 0) {
        for (const {week, teams} of weeklyWinners(weeklyResults, Math.min(lastRegularWeek, finalWeek))) {
            unpaid(teams, weekEntries.filter((entry) => entry.week === week))
                .forEach((id) => records.push({franchise: id, amount: cents(pay.weekly / teams.length), description: `Most Points Week ${week}`}));
        }
    }
    const result = () => ({records, problem: problems.join("; ") || null});
    if (finalWeek < lastRegularWeek) {
        return result();
    }
    const allPlay = allPlayRecords(weeklyResults, lastRegularWeek);
    let allPlayPaid = 0;
    if (pay.rate > 0) {
        const paidAllPlay = new Set(described(accounting, /^all-play\s*\(/i).map(({entry}) => entry.franchise_id));
        for (const [id, record] of allPlay) {
            const amount = cents(allPlayPayout(record));
            allPlayPaid += allPlayPayout(record);
            if (amount > 0 && !paidAllPlay.has(id)) {
                records.push({franchise: id, amount, description: `All-play (${recordText(record)})`});
            }
        }
    }
    if (pay.top.length) {
        const prizes = allPlayPrizes(allPlay, {standingsOrder});
        if (!prizes) {
            problems.push("the all-play prizes wait for a score MFL left out");
        } else {
            const placed = described(accounting, ALL_PLAY_PLACE_ENTRY).map(({entry, match}) => ({place: Number(match[1]), franchise: entry.franchise_id}));
            const byPlace = new Map();
            prizes.forEach((prize, id) => byPlace.set(prize.place, (byPlace.get(prize.place) || []).concat([id])));
            for (const [place, teams] of byPlace) {
                const amount = prizes.get(teams[0]).amount;
                allPlayPaid += amount * teams.length;
                unpaid(teams, placed.filter((entry) => entry.place === place))
                    .forEach((id) => records.push({franchise: id, amount, description: `${ordinal(place)} Place All Play`}));
            }
        }
    }
    if (pay.division > 0) {
        const paid = new Set(described(accounting, DIVISION_ENTRY).map(({entry}) => entry.franchise_id));
        for (const division of divisions) {
            if (division.teams.some((id) => paid.has(id))) {
                continue;
            }
            if (division.tied) {
                problems.push(`${division.division}'s winner is decided by a tiebreak, so its $${pay.division} is left for the commissioner`);
            } else {
                records.push({franchise: division.id, amount: pay.division, description: "Division Champ"});
            }
        }
    }
    const due = unpaidPlaces(accounting);
    if (finalWeek < endWeek || !due.length) {
        return result();
    }
    if (!places) {
        problems.push(placesProblem || (settings.playoffs.rounds.length ? "the playoff rounds don't name them yet" : "MFL's playoff brackets don't name them"));
        return result();
    }
    const pool = forPlayoffs(potOf(accounting).pot, lastRegularWeek, allPlayPaid);
    if (!pay.amounts && pool === null) {
        problems.push("the accounting has no league-wide entries, so there's no pot to split");
        return result();
    }
    for (const place of due) {
        if (places[place - 1]) {
            records.push({franchise: places[place - 1], amount: prizeAmount(pool, place - 1), description: `${ordinal(place)} Place`});
        }
    }
    return result();
}
