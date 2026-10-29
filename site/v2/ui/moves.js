// What Moves' pages share: the team's data as their checks need it, fresh where the cap and roster
// limits depend on it, posting MFL's own forms and links from the page, and the lines a move leaves.

import {API_BASE, asArray, exportUrl, fetchExport} from "../lib/mfl.js";
import {buildLeague, draftedIds, markContracts, playersFromExport} from "../lib/league.js";
import {pendingGroups} from "../lib/bids.js";
import {SALARY_CAP, lineupPositions} from "../lib/rules.js";
import {esc} from "./html.js";
import {cached} from "./store.js";
import {forget, mflFetch, pageFetch, waitLeft} from "./page-fetch.js";
import {seasonFacts} from "./context.js";
import {addPhase, pendingWithComments} from "./add-model.js";
import {cutDownAt} from "../lib/violations.js";

const DAY = 24 * 60 * 60 * 1000;

// `more` names further exports a page's checks need fresh (Trades: `pendingTrades`), in `fresh`
export async function loadData(context, franchiseId, {more = []} = {}) {
    const {season, leagueId} = context;
    const host = window.location.origin;
    // the checks always use fresh rosters, penalties and pending bids
    const fresh = (type, params = {}) => fetchExport(exportUrl(host, season, type, {L: leagueId, ...params}), type, {fetchImpl: mflFetch, init: {cache: "no-store"}});
    // MFL refuses bursts (HTTP 429), so the fresh exports go one after another; the rest is
    // mostly cached for a day
    const freshInTurn = async () => {
        const found = {};
        for (const type of ["rosters", "salaryAdjustments", "transactions", "freeAgents", "pendingWaivers", ...more]) {
            found[type] = await fresh(type);
        }
        return found;
    };
    const [players, leagueInfo, calendar, facts, found] = await Promise.all([
        cached(`fuad.players.${season}`, DAY, async () => ({player: (await fetchExport(exportUrl(API_BASE, season, "players"), "players", {fetchImpl: mflFetch})).player})),
        // only the teams' names and the league's settings, which don't change in a day
        cached(`fuad.league.${season}.${leagueId}`, DAY, () => fetchExport(exportUrl(host, season, "league", {L: leagueId}), "league", {fetchImpl: pageFetch})),
        fetchExport(exportUrl(host, season, "calendar", {L: leagueId}), "calendar", {fetchImpl: pageFetch}).catch(() => null),
        seasonFacts(context).catch(() => ({})),
        freshInTurn()
    ]);
    const {rosters, salaryAdjustments, transactions, freeAgents, pendingWaivers} = found;
    // this season's rookies, whose cut costs nothing while their length is due; only before week 1
    const draftResults = facts.week1 && Date.now() >= facts.week1 ? null
        : await fetchExport(exportUrl(host, season, "draftResults", {L: leagueId}), "draftResults", {fetchImpl: pageFetch}).catch(() => null);
    const league = markContracts(buildLeague({players: playersFromExport(players), league: leagueInfo, salaryAdjustments, rosters, transactions, freeAgents}), draftedIds(draftResults));
    const mflNames = new Map(asArray(players.player).map((player) => [player.id, player.name]));
    const groups = pendingGroups(pendingWaivers);
    // MFL's limit on conditional bid groups
    const maxGroups = Number(leagueInfo.maxWaiverRounds) || 1;
    return {season, league, mflNames, groups, maxGroups, positions: lineupPositions(leagueInfo), pending: pendingWithComments(pendingWaivers, groups), calendar, facts, franchiseId, fresh: found};
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

// A move MFL didn't make; `reason` is MFL's, when it gave one (refusal)
// reads of the roster to confirm a move, while it doesn't show it yet, since the rosters export can
// lag a move (seen live: a move to IR made, the export read just after still had him active); how
// many, and how far apart (MFL asks for about a second between requests)
export const READS = 3;
export const READ_GAP = 1500;

export class Refused extends Error {
    constructor(reason) {
        super(reason || "MFL gave no reason");
        this.reason = reason || null;
    }
}

// The line for a move that didn't happen: "Couldn't drop Jackson: <MFL's reason>." or, with no
// reason, "Couldn't drop Jackson. Reload the page and try again." `changed`: MFL changed something
// anyway, and the page reloads to show it.
export function failedLine(what, error, {changed = false} = {}) {
    const reason = error && error.reason ? String(error.reason).replace(/\.$/, "") : null;
    const tail = changed ? " This is how MFL has it now." : reason ? "" : " Reload the page and try again.";
    return `Couldn’t ${what}${reason ? `: ${reason}` : ""}.${tail}`;
}

// MFL's reason in its answer to a move it didn't make, if it gave one, else null
export function refusal(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const found = [...doc.querySelectorAll(".pagebody .warning, .pagebody .error, .pagebody [class*=error], .pagebody [class*=warning], .pagebody .reportnavigationheader")]
        .map((node) => node.textContent.replace(/\s+/g, " ").trim())
        .find((line) => line && line.length < 300 && !/^Use projections/i.test(line));
    return found || null;
}

// Reads that confirm a move aren't held by MFL's wait (page-fetch.js), as the move itself isn't:
// a move made but not confirmed would show as failed.

// the team's players and their status (`ROSTER`, `INJURED_RESERVE`), fresh, to confirm a move; null
// when the team isn't in the answer
export async function rosterStatuses(context, franchiseId) {
    const rosters = await fetchExport(exportUrl(window.location.origin, context.season, "rosters", {L: context.leagueId, FRANCHISE: franchiseId}), "rosters", {init: {cache: "no-store"}});
    const team = asArray(rosters.franchise).find((entry) => entry.id === franchiseId);
    return team ? new Map(asArray(team.player).map((player) => [player.id, player.status])) : null;
}

// the team's player ids, fresh, to confirm a move
export const rosterIds = async (context, franchiseId) => [...((await rosterStatuses(context, franchiseId)) || new Map()).keys()].sort();

// the pending claims, fresh, to confirm a move: the groups and each group's comment
export async function freshPending(context) {
    const pending = await fetchExport(exportUrl(window.location.origin, context.season, "pendingWaivers", {L: context.leagueId}), "pendingWaivers", {init: {cache: "no-store"}});
    const groups = pendingGroups(pending);
    return {groups, comments: new Map(pendingWithComments(pending, groups).map((group) => [group.round, group.comment]))};
}

// the member's pending trades, fresh, to confirm a move
export const freshTrades = (context) => fetchExport(exportUrl(window.location.origin, context.season, "pendingTrades", {L: context.leagueId}), "pendingTrades", {init: {cache: "no-store"}});

// The roster limits hold from the final cut-down date (2.5); without one on the calendar, from week 1
export function limitsApply({facts, calendar, season}, now = Date.now()) {
    const phase = movesPhase(facts, now);
    const cut = cutDownAt(calendar, season);
    return phase === "season" || (phase === "preseason" && Boolean(cut) && now / 1000 >= cut);
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

// ---- what Moves' screens show ----

export const WIDE = "(min-width: 48.01em)";
export const CHECK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"></path></svg>';
// cap used over the cap, or within $10 of it
export const capTone = (amount) => (amount > SALARY_CAP ? "fuad-bad" : amount > SALARY_CAP - 10 ? "fuad-caution" : "");

// What a move leaves for after MFL's page reloads (`key` is the screen's): read once, {} when none
export function takeFlash(key) {
    try {
        const flash = JSON.parse(window.sessionStorage.getItem(key) || "null");
        window.sessionStorage.removeItem(key);
        return flash || {};
    } catch (error) {
        return {};
    }
}

export function leaveFlash(key, flash) {
    try {
        window.sessionStorage.setItem(key, JSON.stringify(flash));
    } catch (error) {
        // storage is blocked: the reload just shows the page as MFL has it
    }
}

export const doneLine = (text) => `<p class="fuad-move-status" role="status">${CHECK}<span>${esc(text)}</span></p>`;
export const alertLine = (text) => `<p class="fuad-move-alert" role="alert">${esc(text)}</p>`;

// The data a screen's checks need couldn't load (`failed` is "busy" while MFL asks us to wait):
// Retry, off until the wait is over, or MFL's own page
export function failedBox(what, failed) {
    const busy = failed === "busy";
    return `<div class="fuad-move-alert fuad-move-failed" role="alert"><span>Couldn’t check ${what}.${busy ? " MFL asked us to wait. Retry in a few seconds." : ""}</span><span class="fuad-move-failed-buttons"><button type="button" class="fuad-move-retry" data-act="retry"${busy && waitLeft() ? " disabled" : ""}>Retry</button><button type="button" class="fuad-move-retry" data-act="mfl">MFL’s page</button></span></div>`;
}
