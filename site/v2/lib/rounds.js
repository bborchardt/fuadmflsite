// Playoffs decided from the weekly scores, for a league whose playoffs aren't MFL brackets
// (settings.playoffs.rounds): each round is some weeks, its teams those the commissioner gave a
// matchup in its first week. A head-to-head round's pairings are won on the round's total; any other
// round ranks its teams by their totals, its pairings only saying who's in. Who goes on is whoever
// has a matchup in the next round. In site/, so no lookbehind (old iPhones).

import {asArray} from "./mfl.js";
import {weeksOf} from "./payouts.js";

// a week's scores, every team's (`franchise` lists those without a matchup), and who has a matchup
function weekOf(week) {
    const paired = asArray(week.matchup).map((matchup) => asArray(matchup.franchise).map((team) => team.id));
    const scores = new Map();
    asArray(week.matchup).flatMap((matchup) => asArray(matchup.franchise)).concat(asArray(week.franchise))
        .filter((team) => team.score !== undefined && team.score !== "")
        .forEach((team) => scores.set(team.id, team.score === null ? NaN : Number(team.score)));
    return {paired, scores};
}

// {places, note}: `places` the playoff teams best first, null until the last round's weeks are done
// (`completedWeek`) or when the matchups don't fit the rounds, which `note` then says; `note` also
// says when a ranked round's teams going on weren't its top scorers, the matchups being followed.
// `seeds`: team → seed, for ties (the higher seed wins them). `weeks`: rules.js seasonWeeks.
export function roundPlaces(weeklyResults, {rounds, weeks, seeds = new Map(), completedWeek = Infinity}) {
    const none = (note = null) => ({places: null, note});
    if (!weeks || !rounds.length) {
        return none();
    }
    const total = rounds.reduce((sum, round) => sum + round.weeks, 0);
    const playoffWeeks = weeks.championship - weeks.playoffsStart + 1;
    if (total !== playoffWeeks) {
        return none(`The playoff rounds' weeks add up to ${total}, but MFL's playoffs are ${playoffWeeks} weeks (${weeks.playoffsStart}–${weeks.championship}).`);
    }
    if (completedWeek < weeks.championship) {
        return none();
    }
    const byWeek = new Map(weeksOf(weeklyResults).map((week) => [Number(week.week), weekOf(week)]));
    const seedOf = (id) => (seeds.has(id) ? seeds.get(id) : Infinity);
    let first = weeks.playoffsStart;
    const played = [];
    for (const round of rounds) {
        const span = Array.from({length: round.weeks}, (_, i) => first + i);
        first += round.weeks;
        const opening = byWeek.get(span[0]);
        if (!opening || !opening.paired.length) {
            return none(`Week ${span[0]} has no matchups in MFL, which say who's in each playoff round.`);
        }
        const teams = opening.paired.flat();
        // to the cent, so a tie isn't lost to floating point (149.99 + 120.42 against 160.41 + 110)
        const totals = new Map(teams.map((id) => [id, Math.round(span.reduce((sum, week) => {
            const scores = (byWeek.get(week) || {scores: new Map()}).scores;
            return sum + (scores.has(id) ? scores.get(id) : NaN);
        }, 0) * 100) / 100]));
        if (teams.some((id) => !Number.isFinite(totals.get(id)))) {
            return none();
        }
        // ties to the higher seed, then MFL's order
        const better = (a, b) => totals.get(b) - totals.get(a) || seedOf(a) - seedOf(b);
        played.push({round, span, teams, totals, better, pairs: opening.paired});
    }
    const seen = new Set();
    for (let i = 0; i < played.length; i++) {
        const {round, span, teams, better, pairs} = played[i];
        const next = played[i + 1];
        const back = teams.find((id) => seen.has(id) && !(i && played[i - 1].teams.includes(id)));
        if (back) {
            return none(`A team out of the playoffs has a matchup again in week ${span[0]}.`);
        }
        teams.forEach((id) => seen.add(id));
        if (round.headToHead && pairs.some((pair) => pair.length !== 2)) {
            return none(`Week ${span[0]}'s matchups aren't all pairs, as a head-to-head round's are.`);
        }
        if (!next) {
            if (round.headToHead && pairs.length !== 1) {
                return none(`The last round is head-to-head with ${pairs.length} matchups: only a two-team final is.`);
            }
            continue;
        }
        if (round.headToHead) {
            const on = teams.filter((id) => next.teams.includes(id));
            const winners = pairs.map((pair) => pair.slice().sort(better)[0]);
            if (winners.length !== on.length || winners.some((id) => !on.includes(id))) {
                return none(`Week ${next.span[0]}'s matchups don't have week ${span[0]}'s head-to-head winners going on.`);
            }
        }
    }
    const last = played[played.length - 1];
    const ranked = (entry) => entry.teams.slice().sort(entry.better);
    const out = played.slice(0, -1).reverse().flatMap((entry, i, earlier) => {
        const next = i ? earlier[i - 1] : last;
        return ranked(entry).filter((id) => !next.teams.includes(id));
    });
    const notes = played.slice(0, -1).flatMap((entry, i) => {
        const next = played[i + 1];
        const on = entry.teams.filter((id) => next.teams.includes(id));
        if (entry.round.headToHead) {
            return [];
        }
        if (on.length !== entry.round.advance) {
            return [`Week ${next.span[0]}'s matchups have ${on.length} of week ${entry.span[0]}'s teams going on, but the round's setting says ${entry.round.advance}; the matchups stand.`];
        }
        const top = ranked(entry).slice(0, on.length);
        return top.every((id) => on.includes(id)) ? []
            : [`Week ${next.span[0]}'s matchups don't have week ${entry.span[0]}'s top ${on.length} scores going on; the matchups stand.`];
    });
    return {places: [...ranked(last), ...out], note: notes.join(" ") || null};
}

// The round `week` is in: {round, index, weeks: its weeks, last: whether it's the last round}, or null
// for a week before the playoffs or past the rounds
export function roundOf(week, {rounds, weeks}) {
    if (!weeks) {
        return null;
    }
    let first = weeks.playoffsStart;
    for (let index = 0; index < rounds.length; index++) {
        const span = Array.from({length: rounds[index].weeks}, (_, i) => first + i);
        if (span.includes(week)) {
            return {round: rounds[index], index, weeks: span, last: index === rounds.length - 1};
        }
        first += rounds[index].weeks;
    }
    return null;
}

// each team's score in `week` of a weeklyResults export, with or without a matchup: id → points
export function weekScores(weeklyResults, week) {
    const found = weeksOf(weeklyResults).find((entry) => Number(entry.week) === week);
    return found ? weekOf(found).scores : new Map();
}

// the teams with a matchup in `week`
export function pairedIn(weeklyResults, week) {
    const found = weeksOf(weeklyResults).find((entry) => Number(entry.week) === week);
    return found ? weekOf(found).paired.flat() : [];
}
