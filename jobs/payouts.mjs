// The payouts chore.

import {teamNameIn} from "./chore-context.mjs";

// a season's weekly prizes and all-play payouts, with room for a backfill: more means something's wrong
const MAX_PAYOUTS_PER_RUN = 30;

// A week's scores are final once the next week has kicked off, when the NFL's stat corrections are
// usually out. Payouts already in the accounting, by hand or by an earlier run, aren't added again.
// `backupsOpenFrom`: the first week whose backup starters are still to go in (backup-starters.mjs),
// which waits.
export async function run(ctx, {built}, backupsOpenFrom) {
    const {lib, loggedIn, dryRun, now, season, host, leagueId, log, choreLog, needsAttention, wouldPrefix, fetchFrom, exportOptions, mflImport} = ctx;
    const {asArray, weekKickoff} = lib.mfl;
    const {ALL_PLAY_TOP, DIVISION_PRIZE, divisionWinners, latestScoredWeek, missingPayouts, placeBrackets, playoffPlaces, unpaidPlaces} = lib.payouts;
    const {placesWithoutSeeds} = lib.rounds;
    const {default: settings} = lib.settings;
    const applyPayouts = ctx.apply.payouts;
    if (!loggedIn) {
        log("Reading MFL's accounting needs the commissioner login; no payouts recorded.");
        return;
    }
    if (!built.weeks) {
        throw new Error("the league export gives no last regular season week or end week, so no payouts were recorded");
    }
    const lastRegular = built.weeks.playoffsStart - 1;
    const endWeek = built.weeks.championship;
    const weeklyResults = await fetchFrom(host, "weeklyResults", {L: leagueId, W: "YTD"});
    const latest = latestScoredWeek(weeklyResults);
    if (!latest) {
        log("No week has scores yet; no payouts to record.");
        return;
    }
    const next = await weekKickoff(season, latest + 1, exportOptions);
    const scored = next && now >= next ? latest : latest - 1;
    const finalWeek = Math.min(scored, backupsOpenFrom - 1);
    if (finalWeek < scored) {
        log(`Payouts: week ${backupsOpenFrom} waits for its backup starters.`);
    }
    if (finalWeek < 1) {
        log("No week's scores are final yet; no payouts to record.");
        return;
    }
    const accounting = await fetchFrom(host, "accounting", {L: leagueId});
    let places = null;
    let placesProblem = null;
    const rounds = settings.playoffs.rounds;
    if (finalWeek >= endWeek && unpaidPlaces(accounting).length) {
        if (rounds.length) {
            // a league whose playoffs are rounds of scores (lib/rounds.js)
            ({places, problem: placesProblem} = placesWithoutSeeds(weeklyResults, {rounds, weeks: built.weeks, completedWeek: finalWeek}));
        } else {
            const list = asArray((await fetchFrom(host, "playoffBrackets", {L: leagueId})).playoffBracket);
            const brackets = [];
            for (const bracket of placeBrackets(list)) {
                brackets.push(bracket ? await fetchFrom(host, "playoffBracket", {L: leagueId, BRACKET_ID: bracket.id}) : null);
            }
            places = playoffPlaces(brackets);
        }
    }
    // the standings, for each division's winner and all-play ties by the standings, once the regular
    // season is over
    let divisions = [];
    let standingsOrder = [];
    const byStandings = ALL_PLAY_TOP.length && settings.playoffs.allPlayTiesBy === "standings";
    if (finalWeek >= lastRegular && (DIVISION_PRIZE > 0 || byStandings)) {
        const [standing, league] = await Promise.all([fetchFrom(host, "leagueStandings", {L: leagueId}), fetchFrom(host, "league", {L: leagueId})]);
        divisions = divisionWinners(standing, league);
        standingsOrder = asArray(standing.franchise).map((team) => team.id);
    }
    const {records, problem} = missingPayouts({accounting, weeklyResults, lastRegularWeek: lastRegular, endWeek, finalWeek, places, placesProblem, divisions, standingsOrder});
    if (problem) {
        needsAttention(`Payouts: the places can't be recorded: ${problem}. Left for the commissioner.`);
    }
    if (!records.length) {
        log("No payouts to record.");
        return;
    }
    const teamName = (id) => teamNameIn(built, id);
    const describe = (record) => `"${record.description}" $${record.amount.toFixed(2)} to ${teamName(record.franchise)}`;
    if ((applyPayouts || dryRun) && records.length > MAX_PAYOUTS_PER_RUN) {
        throw new Error(`${records.length} payouts are waiting to be recorded, more than the ${MAX_PAYOUTS_PER_RUN} expected, so none were. `
            + "Check MFL's accounting and enter them by hand.");
    }
    if (!applyPayouts) {
        records.forEach((record) => choreLog(`${wouldPrefix("PAYOUTS")} record ${describe(record)}.`));
        return;
    }
    for (const record of records) {
        await mflImport("accounting", null, {FRANCHISE: record.franchise, AMOUNT: String(record.amount), DESCRIPTION: record.description});
        choreLog(`Recorded ${describe(record)}.`);
    }
}
