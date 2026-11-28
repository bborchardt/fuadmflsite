// What Moves' pages share: the team's data as their checks need it, fresh where the cap and roster
// limits depend on it, posting MFL's own forms and links from the page, and the lines a move leaves.

import {asArray, exportUrl, fetchExport, httpStatus} from "../lib/mfl.js";
import {buildLeague, draftedIds, markContracts, playersFromExport} from "../lib/league.js";
import {pendingGroups} from "../lib/bids.js";
import {SALARY_CAP, lineupPositions} from "../lib/rules.js";
import {esc} from "./html.js";
import {CAP_TIGHT} from "./format.js";
import {cached} from "./store.js";
import {allAtOnce, forget, mflConfirm, mflFetch, mflSend, pageFetch} from "./page-fetch.js";
import {seasonFacts, seasonStarted} from "./context.js";
import {playerList} from "./player-list.js";
import {addPhase, pendingWithComments} from "./moves-model.js";
import {cutDownAt} from "../lib/violations.js";
import {strict, unlessChanged} from "./checked.js";

const DAY = 24 * 60 * 60 * 1000;

// `more` names further exports a page's checks need fresh (Trades: `pendingTrades`), in `fresh`
export async function loadData(context, franchiseId, {more = []} = {}) {
    const {season, leagueId} = context;
    const host = window.location.origin;
    // the checks always use fresh rosters, penalties and pending bids
    const fresh = (type, params = {}) => fetchExport(exportUrl(host, season, type, {L: leagueId, ...params}), type, {fetchImpl: mflFetch, init: {cache: "no-store"}, check: strict});
    // asked at once, not in turn, whose round trips kept Moves on placeholders (a second on a phone):
    // MFL refuses about 25 in a few seconds, not a page's 11–14 at once (docs/mfl.md). The rest is
    // mostly cached for a day.
    const freshAtOnce = async () => {
        const types = ["rosters", "salaryAdjustments", "transactions", "freeAgents", "pendingWaivers", ...more];
        const answers = await allAtOnce(types.map((type) => fresh(type)));
        return Object.fromEntries(types.map((type, index) => [type, answers[index]]));
    };
    const [players, leagueInfo, calendar, facts, found] = await Promise.all([
        playerList(season, {fresh: true}),
        // only the teams' names and the league's settings, which don't change in a day
        cached(`fuad.leagueSettings.${season}.${leagueId}`, DAY, async () => withoutOwners(await fetchExport(exportUrl(host, season, "league", {L: leagueId}), "league", {fetchImpl: pageFetch, check: strict}))),
        fetchExport(exportUrl(host, season, "calendar", {L: leagueId}), "calendar", {fetchImpl: pageFetch, check: strict}).catch(unlessChanged(null)),
        seasonFacts(context).catch(() => ({})),
        freshAtOnce()
    ]);
    const {rosters, salaryAdjustments, transactions, freeAgents, pendingWaivers} = found;
    // this season's rookies, whose cut costs nothing while their length is due, until the cut-down
    // date (lib/league.js lengthDuePenalty); only before week 1
    const draftResults = seasonStarted(facts) ? null
        : await fetchExport(exportUrl(host, season, "draftResults", {L: leagueId}), "draftResults", {fetchImpl: pageFetch, check: strict}).catch(unlessChanged(null));
    const lengthDue = {rookies: draftedIds(draftResults), freeUntil: cutDownAt(calendar, season)};
    const league = markContracts(buildLeague({players: playersFromExport(players), league: leagueInfo, salaryAdjustments, rosters, transactions, freeAgents, lengthDue}), lengthDue);
    const mflNames = new Map(asArray(players.player).map((player) => [player.id, player.name]));
    const groups = pendingGroups(pendingWaivers);
    // MFL's limit on conditional bid groups
    const maxGroups = Number(leagueInfo.maxWaiverRounds) || 1;
    return {season, league, mflNames, groups, maxGroups, positions: lineupPositions(leagueInfo), pending: pendingWithComments(pendingWaivers, groups), calendar, facts, franchiseId, fresh: found};
}

// A member's league export names each owner, with their email: kept under a key any viewer of the
// device reads, it mustn't carry them (rosters-view.js fillOwners)
export function withoutOwners(league) {
    const teams = league && league.franchises && league.franchises.franchise;
    if (!teams) {
        return league;
    }
    const strip = (team) => Object.fromEntries(Object.entries(team || {}).filter(([field]) => !["owner_name", "email", "lastVisit"].includes(field)));
    return {...league, franchises: {...league.franchises, franchise: Array.isArray(teams) ? teams.map(strip) : strip(teams)}};
}

// Every move sent to MFL goes through mflSend, so its 429 holds reads too. This resolves to MFL's
// answer unread, failing on an error status, so a caller can read the body itself and tell "not
// sent" from "sent, not confirmed". What a move changes is forgotten before and after it: a read in
// flight meanwhile may keep it again.
export async function sendForAnswer(url, init) {
    forget();
    const response = await mflSend(url, {credentials: "include", ...init}).finally(forget);
    if (!response.ok) {
        throw new Error(`MFL answered ${httpStatus(response)}`);
    }
    return response;
}

// a move, to the text of MFL's answer
export const send = async (url, init) => (await sendForAnswer(url, init)).text();

// Reads of the roster to confirm a move, while it doesn't show it yet, since the rosters export can
// lag a move (seen live: a move to IR made, the export read just after still had him active); how
// many, and how far apart (MFL asks for about a second between requests)
export const READS = 3;
export const READ_GAP = 1500;

// A move MFL didn't make; `reason` is MFL's, when it gave one (refusal)
export class Refused extends Error {
    constructor(reason) {
        super(reason || "MFL gave no reason");
        this.reason = reason || null;
    }
}

// A move whose answer failed may still have been made, so what MFL holds after it decides: MFL's
// answer, or the error it failed with
export async function sendMove(url, init) {
    try {
        return {answer: await send(url, init()), error: null};
    } catch (error) {
        return {answer: "", error};
    }
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// What MFL holds after a move (`read`), read again while it doesn't show the move (`shows`): the
// last read that worked, as a later one failing says nothing of the move; null when none did. MFL's
// refusal (HTTP 429) ends it, as it has asked to be left alone a while (page-fetch.js).
export async function readBack(read, shows, {wait = pause} = {}) {
    let found = null;
    for (let tries = 0; tries < READS; tries += 1) {
        if (tries) {
            await wait(READ_GAP);
        }
        let refused = false;
        found = (await read().catch((error) => {
            refused = Boolean(error) && error.status === 429;
            return null;
        })) || found;
        if (refused || (found && shows(found))) {
            break;
        }
    }
    return found;
}

// Whether a move was made, from sendMove's `sent` and readBack's `found`: "made", "unread" (no
// telling: MFL's answer to a move it made can be its own page, whose header warnings aren't a
// refusal), or the error to show, the one the answer failed with or MFL's refusal
export function moveOutcome(sent, found, shows) {
    if (!found) {
        return "unread";
    }
    return shows(found) ? "made" : sent.error || new Refused(refusal(sent.answer));
}

// The line for a move that didn't happen: "Couldn't drop Jackson: <MFL's reason>." or, with no
// reason, "Couldn't drop Jackson. Reload the page and try again." `changed`: MFL changed something
// anyway, and the page reloads to show it, which the member is asked to review.
export function failedLine(what, error, {changed = false} = {}) {
    const reason = error && error.reason ? String(error.reason).replace(/\.$/, "") : null;
    const tail = changed ? " Some changes may have gone through; review below." : reason ? "" : " Reload the page and try again.";
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

// Reads that confirm a move, or finish one under way, go through mflConfirm (page-fetch.js): not held
// by MFL's wait, as the move itself isn't, since a move made but not confirmed would show as failed,
// and one half made shouldn't stop there. An action's first read, before anything is sent, is held.

// the team's players and their status (`ROSTER`, `INJURED_RESERVE`), fresh, to confirm a move; null
// when the team isn't in the answer
export async function rosterStatuses(context, franchiseId) {
    const rosters = await fetchExport(exportUrl(window.location.origin, context.season, "rosters", {L: context.leagueId, FRANCHISE: franchiseId}), "rosters", {fetchImpl: mflConfirm, init: {cache: "no-store"}, check: strict});
    const team = asArray(rosters.franchise).find((entry) => entry.id === franchiseId);
    return team ? new Map(asArray(team.player).map((player) => [player.id, player.status])) : null;
}

// the team's player ids, fresh, to confirm a move
export const rosterIds = async (context, franchiseId) => [...((await rosterStatuses(context, franchiseId)) || new Map()).keys()].sort();

// the pending claims, fresh, to confirm a move: the groups and each group's comment
export async function freshPending(context) {
    const pending = await fetchExport(exportUrl(window.location.origin, context.season, "pendingWaivers", {L: context.leagueId}), "pendingWaivers", {fetchImpl: mflConfirm, init: {cache: "no-store"}, check: strict});
    const groups = pendingGroups(pending);
    return {groups, comments: new Map(pendingWithComments(pending, groups).map((group) => [group.round, group.comment]))};
}

// the league's trades made since `since` (seconds), fresh, to tell an offer accepted from one withdrawn
export function freshTradesMade(context, since) {
    const days = Math.max(1, Math.ceil((Date.now() / 1000 - since) / (24 * 60 * 60)) + 1);
    const url = exportUrl(window.location.origin, context.season, "transactions", {L: context.leagueId, TRANS_TYPE: "TRADE", DAYS: days});
    return fetchExport(url, "transactions", {fetchImpl: mflConfirm, init: {cache: "no-store"}, check: strict});
}

// the member's pending trades, fresh, to confirm a move
export const freshTrades = (context) => fetchExport(exportUrl(window.location.origin, context.season, "pendingTrades", {L: context.leagueId}), "pendingTrades", {fetchImpl: mflConfirm, init: {cache: "no-store"}, check: strict});

// The roster limits hold from the final cut-down date (2.5); without one on the calendar, from week 1
export function limitsApply({facts, calendar, season}, now = Date.now()) {
    const phase = movesPhase(facts, now);
    const cut = cutDownAt(calendar, season);
    return phase === "season" || (phase === "preseason" && Boolean(cut) && now / 1000 >= cut);
}

// Add's phase (moves-model.js) from the season's dates (context.js seasonStarted); a draft that
// couldn't be checked counts as made.
export function movesPhase(facts, now = Date.now()) {
    return addPhase({
        started: seasonStarted(facts, now),
        over: Boolean(facts.seasonEnd && now >= facts.seasonEnd),
        drafted: facts.draftKnown === false || facts.drafted !== false
    });
}

// ---- what Moves' screens show ----

export const WIDE = "(min-width: 48.01em)";
export const CHECK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"></path></svg>';
// cap used over the cap, or within CAP_TIGHT of it
export const capTone = (amount) => (amount > SALARY_CAP ? "fuad-bad" : amount > SALARY_CAP - CAP_TIGHT ? "fuad-caution" : "");

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

// When a screen's checks can't load, the member is given MFL's own page, which doesn't check the
// league's rules, with a line saying so above it and a reload, which tries v2's again
export const FALLBACK_TEXT = "Error loading cap and roster data. Rule checks are disabled; please ensure this transaction follows league rules.";
export function mflFallback(body, standAside) {
    standAside();
    // fuad.css fits MFL's page to a phone under it: the table that lays out Add's and Drop's pickers
    // side by side is stacked, which isn't always inside its form
    document.documentElement.classList.add("fuad-fallback-on");
    for (const picker of document.querySelectorAll("#withmenus .pickerbox")) {
        let layout = null;
        for (let at = picker.parentElement; at && at.id !== "withmenus"; at = at.parentElement) {
            layout = at.tagName === "TABLE" ? at : layout;
        }
        if (layout) {
            layout.classList.add("fuad-fallback-stack");
            // its tables without a list (Add's "To Add", "To Drop" and its button) are stacked too
            for (const inner of layout.querySelectorAll(":scope > tbody > tr > td > table")) {
                inner.classList.toggle("fuad-fallback-stack", !inner.querySelector(".pickerbox"));
            }
        }
        // a row of controls in the list's table (Add's filters) is as wide as the list, which scrolls
        // sideways: its controls go just below the table instead, in the same form
        const table = picker.parentElement && picker.parentElement.closest("table");
        for (const row of table ? table.querySelectorAll(":scope > tbody > tr") : []) {
            const cell = row.children.length === 1 ? row.children[0] : null;
            if (cell && !cell.querySelector(".pickerbox") && cell.querySelector("input, select, button")) {
                const controls = document.createElement("div");
                controls.className = "fuad-fallback-controls";
                controls.append(...cell.childNodes);
                table.after(controls);
            }
        }
    }
    if (!body || document.getElementById("fuad-fallback")) {
        return;
    }
    const line = document.createElement("div");
    line.id = "fuad-fallback";
    line.setAttribute("role", "alert");
    line.innerHTML = `<span>${FALLBACK_TEXT}</span><button type="button">Reload Page</button>`;
    line.querySelector("button").addEventListener("click", () => window.location.reload());
    body.prepend(line);
}

// A screen's load failed, MFL's wait (HTTP 429) included: a move is never held up by v2, so it falls
// back to MFL's page, logged as an error so the header's devices form counts it, and a failure that
// happens is a design issue to fix (docs/design.md: Outside change)
export function loadFailed(screen, error, body, standAside) {
    console.error(`[fuad] ${screen} couldn't load, so MFL's page was shown:`, error);
    mflFallback(body, standAside);
}
