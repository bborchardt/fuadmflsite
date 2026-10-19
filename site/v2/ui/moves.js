// What Moves' pages share: the team's data as their checks need it, fresh where the cap and roster
// limits depend on it, and posting MFL's own forms and links from the page.

import {API_BASE, asArray, exportUrl, fetchExport} from "../lib/mfl.js";
import {buildLeague, playersFromExport} from "../lib/league.js";
import {pendingGroups} from "../lib/bids.js";
import {cached} from "./store.js";
import {forget, mflFetch, pageFetch} from "./page-fetch.js";
import {seasonFacts} from "./context.js";
import {addPhase, pendingWithComments} from "./add-model.js";

const DAY = 24 * 60 * 60 * 1000;

export async function loadData(context, franchiseId) {
    const {season, leagueId} = context;
    const host = window.location.origin;
    // the checks always use fresh rosters, penalties and pending bids
    const fresh = (type, params = {}) => fetchExport(exportUrl(host, season, type, {L: leagueId, ...params}), type, {fetchImpl: mflFetch, init: {cache: "no-store"}});
    // MFL refuses bursts (HTTP 429), so the fresh exports go one after another; the rest is
    // mostly cached for a day
    const freshInTurn = async () => {
        const found = {};
        for (const type of ["rosters", "salaryAdjustments", "transactions", "freeAgents", "pendingWaivers"]) {
            found[type] = await fresh(type);
        }
        return found;
    };
    const [players, leagueInfo, calendar, facts, {rosters, salaryAdjustments, transactions, freeAgents, pendingWaivers}] = await Promise.all([
        cached(`fuad.players.${season}`, DAY, async () => ({player: (await fetchExport(exportUrl(API_BASE, season, "players"), "players", {fetchImpl: mflFetch})).player})),
        // only the teams' names and the league's settings, which don't change in a day
        cached(`fuad.league.${season}.${leagueId}`, DAY, () => fetchExport(exportUrl(host, season, "league", {L: leagueId}), "league", {fetchImpl: pageFetch})),
        fetchExport(exportUrl(host, season, "calendar", {L: leagueId}), "calendar", {fetchImpl: pageFetch}).catch(() => null),
        seasonFacts(context).catch(() => ({})),
        freshInTurn()
    ]);
    const league = buildLeague({players: playersFromExport(players), league: leagueInfo, salaryAdjustments, rosters, transactions, freeAgents});
    const mflNames = new Map(asArray(players.player).map((player) => [player.id, player.name]));
    const groups = pendingGroups(pendingWaivers);
    return {league, mflNames, groups, pending: pendingWithComments(pendingWaivers, groups), calendar, facts, franchiseId};
}

// what a move changes is forgotten before and after it: a read in flight meanwhile may keep it again
export async function send(url, init) {
    forget();
    const response = await fetch(url, {credentials: "include", ...init}).finally(forget);
    if (!response.ok) {
        throw new Error(`MFL answered HTTP ${response.status}`);
    }
    return response.text();
}

// MFL's reason in its answer to a move it didn't make, if it gave one
export function refusal(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const found = [...doc.querySelectorAll(".pagebody .warning, .pagebody .error, .pagebody [class*=error], .pagebody [class*=warning], .pagebody .reportnavigationheader")]
        .map((node) => node.textContent.replace(/\s+/g, " ").trim())
        .find((line) => line && line.length < 300 && !/^Use projections/i.test(line));
    return found || "MFL didn't make it";
}

// Reads that confirm a move aren't held by MFL's wait (page-fetch.js), as the move itself isn't:
// a move made but not confirmed would show as failed.

// the team's player ids, fresh, to confirm a move
export async function rosterIds(context, franchiseId) {
    const rosters = await fetchExport(exportUrl(window.location.origin, context.season, "rosters", {L: context.leagueId, FRANCHISE: franchiseId}), "rosters", {init: {cache: "no-store"}});
    const team = asArray(rosters.franchise).find((entry) => entry.id === franchiseId);
    return team ? asArray(team.player).map((player) => player.id).sort() : [];
}

// the pending claims, fresh, to confirm a move: the groups and each group's comment
export async function freshPending(context) {
    const pending = await fetchExport(exportUrl(window.location.origin, context.season, "pendingWaivers", {L: context.leagueId}), "pendingWaivers", {init: {cache: "no-store"}});
    const groups = pendingGroups(pending);
    return {groups, comments: new Map(pendingWithComments(pending, groups).map((group) => [group.round, group.comment]))};
}

// Add's phase (add-model.js) from the season's dates. Without them, MFL's own week says whether
// the season has started; a draft that couldn't be checked counts as made.
export function movesPhase(facts, now = Date.now()) {
    return addPhase({
        started: facts.week1 ? now >= facts.week1 : Number(window.liveScoringWeek) > 1,
        over: Boolean(facts.seasonEnd && now >= facts.seasonEnd),
        drafted: facts.draftKnown === false || facts.drafted !== false
    });
}
