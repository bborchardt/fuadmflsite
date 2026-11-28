// What the league chores read first and share: the league's exports, built by the version's lib.

import {pendingPenalties} from "./drop-penalties.mjs";

export async function leagueState(ctx) {
    const {lib, loggedIn, now, season, host, leagueId, needsAttention, skipped, fetchFrom, exportOptions} = ctx;
    const {API_BASE, asArray} = lib.mfl;
    const {buildLeague, draftedIds, playersFromExport} = lib.league;
    const {ROSTER_MAX, SALARY_CAP} = lib.rules;
    const {cutDownAt, seasonPhase} = lib.violations;
    const {TIME_ZONE} = lib.zone;
    const [players, league, salaryAdjustments, rosters, transactions, freeAgents, weeklyResults, calendar] = await Promise.all([
        fetchFrom(API_BASE, "players"),
        fetchFrom(host, "league", {L: leagueId}),
        fetchFrom(host, "salaryAdjustments", {L: leagueId}),
        fetchFrom(host, "rosters", {L: leagueId}),
        fetchFrom(host, "transactions", {L: leagueId}),
        fetchFrom(host, "freeAgents", {L: leagueId}),
        // only the anti-tanking check needs the week's results; without them it flags nothing
        fetchFrom(host, "weeklyResults", {L: leagueId}).catch((error) => {
            skipped(error, `Couldn't load the league's weekly results (${error.message}); the anti-tanking check is skipped.`);
            return {};
        }),
        // the final cut-down date, when the roster limits start before week 1; without it, from week 1
        // (MFL shows the calendar only to a member)
        loggedIn ? fetchFrom(host, "calendar", {L: leagueId}).catch((error) => {
            skipped(error, `Couldn't load the league's calendar (${error.message}); the roster limits start with week 1.`);
            return null;
        }) : null
    ]);
    const cutDown = cutDownAt(calendar, season);
    // today's NFL injury report, for injured reserve eligibility; without it that check is skipped
    const currentInjuries = await fetchFrom(API_BASE, "injuries").catch((error) => {
        skipped(error, `Couldn't load today's NFL injury report (${error.message}); the injured reserve check is skipped.`);
        return null;
    });
    // the results week's report, for the anti-tanking check; without it that check flags nothing
    const injuries = await fetchFrom(API_BASE, "injuries", {W: weeklyResults.week || ""}).catch((error) => {
        skipped(error, `Couldn't load the week ${weeklyResults.week || "(unknown)"} NFL injury report (${error.message}); the anti-tanking check is skipped.`);
        return null;
    });
    // buildLeague fills in the players it's given, so each build takes its own
    let playerMap;
    const build = (rookies) => {
        playerMap = playersFromExport(players);
        return buildLeague({players: playerMap, league, salaryAdjustments, rosters, transactions, freeAgents, weeklyResults, injuries, currentInjuries,
            lengthDue: {rookies, freeUntil: cutDown}});
    };
    let built = build();
    // a drop whose length was due is free for this season's rookie before the cut-down date
    // (lib/league.js lengthDuePenalty), and a team over the cap only by its unsigned rookies isn't held
    // (overOnlyByRookies): the draft is read only when there's such a drop or such a team, and without
    // it they're held for the commissioner
    let lengthDueUnknown = null;
    const values = [...built.franchises.values()];
    if (values.some((franchise) => franchise.pendingDroppedPlayers.some((player) => player.years === 0))
        || values.some((franchise) => franchise.capTotal > SALARY_CAP && franchise.signedPlayers.some((player) => player.salary >= 1))) {
        try {
            built = build(draftedIds(await fetchFrom(host, "draftResults", {L: leagueId})));
        } catch (error) {
            lengthDueUnknown = `this season's draft couldn't be read: ${error.message}`;
        }
    }
    // if the season's phase can't be told, skip the league rules rather than flag the offseason
    try {
        // v2's lib reads the playoff and championship weeks from the league export (v1's has them fixed)
        if ("weeks" in built && !built.weeks) {
            throw new Error("the league export gives no last regular season week or end week");
        }
        Object.assign(built, await seasonPhase(season, now, exportOptions, built.weeks));
    } catch (error) {
        needsAttention(`Couldn't tell where the ${season} season is (${error.message}); the League Alerts checks were skipped, and teams over ${ROSTER_MAX} are held.`);
        built.seasonOver = null;
    }
    return {
        players: playerMap,
        built,
        league,
        cutDown,
        penalties: pendingPenalties(built, TIME_ZONE),
        lengthDueUnknown,
        transactions: asArray(transactions.transaction),
        rosters,
        // players as MFL names them ("Last, First"), which the waivers page uses too
        playerNames: new Map(asArray(players.player).map((player) => [player.id, player]))
    };
}
