// Loads the league's data on the home page and renders the league's own features.
// On other league pages it does nothing; only the stylesheet applies there.

import {API_BASE, asArray, exportUrl, fetchExport, weekKickoff} from "../lib/mfl.js";
import {buildLeague, playersFromExport} from "../lib/league.js";
import {pendingAdds, windowClosed} from "../lib/adds.js";
import {PREVIOUS_FRANCHISE_UNTIL_WEEK, TRADE_DEADLINE_WEEK, franchiseTopSalaries} from "../lib/rules.js";
import {seasonPhase} from "../lib/violations.js";
import {franchisePhase, makeSnapshot, readSnapshot, snapshotFileName} from "../lib/franchise.js";
import {renderViolations} from "./violations.js";
import {renderContracts} from "./contracts.js";
import {renderCommish} from "./commish.js";
import {renderLinks} from "./links.js";

const DAY = 24 * 60 * 60 * 1000;

/** localStorage that never throws (private windows and blocked storage just don't remember). */
const storage = {
    get(key) {
        try {
            return window.localStorage.getItem(key);
        } catch (error) {
            return null;
        }
    },
    set(key, value) {
        try {
            window.localStorage.setItem(key, value);
        } catch (error) {
            // nothing to do: the setting just isn't remembered
        }
    }
};

/** Cache JSON in localStorage for up to `maxAge` ms. */
async function cached(key, maxAge, load) {
    try {
        const saved = JSON.parse(storage.get(key));
        if (saved && Date.now() - saved.storedAt < maxAge) {
            return saved.value;
        }
    } catch (error) {
        // a corrupt entry is reloaded below
    }
    const value = await load();
    storage.set(key, JSON.stringify({storedAt: Date.now(), value}));
    return value;
}

/** Season, league and host for this page, or null if it isn't a league page. */
export function pageContext(location = window.location) {
    const season = (location.pathname.match(/^\/(\d{4})\//) || [])[1] || (window.year && String(window.year));
    const leagueId = (location.pathname.match(/\/home\/(\d+)/) || [])[1]
        || new URLSearchParams(location.search).get("L")
        || window.league_id;
    if (!season || !leagueId) {
        return null;
    }
    return {
        season: Number(season),
        leagueId: String(leagueId),
        homeUrl: `${location.origin}/${season}`,
        isCommish: window.franchise_id === "0000"
    };
}

function mounts() {
    return {
        contracts: document.getElementById("fuad-contracts"),
        commish: document.getElementById("commishdiv"),
        links: document.getElementById("fuadlinksdiv")
    };
}

function showInMounts(found, className, message) {
    for (const mount of [found.contracts, found.commish]) {
        if (mount) {
            mount.innerHTML = `<div class="${className}"></div>`;
            mount.firstChild.textContent = message;
        }
    }
}

/** Kickoff times for the start of the season and the trade deadline; null until MFL publishes the schedule (cached a day). */
async function kickoffs(season) {
    const times = await cached(`fuad.kickoffs.${season}`, DAY, async () => {
        const [start, deadline] = await Promise.all([PREVIOUS_FRANCHISE_UNTIL_WEEK, TRADE_DEADLINE_WEEK].map((week) =>
            weekKickoff(season, week)));
        return {start: start && start.getTime(), deadline: deadline && deadline.getTime()};
    });
    return {start: times.start && new Date(times.start), deadline: times.deadline && new Date(times.deadline)};
}

/** A season's snapshot file, or null if there isn't one yet. */
async function loadSnapshot(season, dataBase) {
    const response = await fetch(new URL(snapshotFileName(season), dataBase), {cache: "no-cache"});
    if (response.status === 404) {
        return null;
    }
    if (!response.ok) {
        throw new Error(`the ${season} franchise snapshot returned HTTP ${response.status}`);
    }
    return readSnapshot(await response.json(), season);
}

const deadlineText = (date) => date
    ? date.toLocaleString("en-US", {weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago", timeZoneName: "short"})
    : "the trade deadline";

/** Which franchise salaries to show this season right now, and how to describe them. */
async function franchiseView(season, league, dataBase) {
    const live = franchiseTopSalaries(league.rosteredPlayers);
    const times = await kickoffs(season);
    const phase = franchisePhase(new Date(), times.start, times.deadline);
    if (phase === "previous") {
        const previous = await loadSnapshot(season - 1, dataBase);
        if (previous) {
            return {topSalaries: previous, phase, note: `Franchise salaries for ${season}, set at the ${season - 1} trade deadline.`};
        }
        return {topSalaries: live, phase, missing: true, note: `Projected franchise salaries. No snapshot from the ${season - 1} trade deadline was found.`};
    }
    if (phase === "final") {
        const final = await loadSnapshot(season, dataBase);
        if (final) {
            return {topSalaries: final, phase, note: `Franchise salaries for ${season + 1}, set at the ${season} trade deadline.`};
        }
        return {topSalaries: live, phase, missing: true, note: `Provisional franchise salaries for ${season + 1}: the ${season} trade deadline snapshot hasn't been taken yet.`};
    }
    return {topSalaries: live, phase, note: `Projected franchise salaries for ${season + 1}, live until the trade deadline (${deadlineText(times.deadline)}).`};
}

function snapshotStatus(view, season) {
    if (view.phase === "final" && view.missing) {
        return `The ${season} trade deadline has passed and no snapshot is published yet. The daily job normally takes it; if it hasn't run, commit the JSON below to the league-data branch as data/${snapshotFileName(season)} and the next morning's daily job publishes it.`;
    }
    if (view.phase === "final") {
        return `The ${season} snapshot is published.`;
    }
    return `The daily job takes the ${season} snapshot after the trade deadline. The button shows what it would contain right now.`;
}

/** Load everything the home page needs. Requests run in parallel; injuries wait for the week. */
async function loadLeague({season, leagueId}) {
    const host = window.location.origin;
    const league = (type, params) => fetchExport(exportUrl(host, season, type, {L: leagueId, ...params}), type, {init: {cache: "no-store"}});
    const playersPromise = cached(`fuad.players.${season}`, DAY, async () => {
        const players = await fetchExport(exportUrl(API_BASE, season, "players"), "players");
        return {player: players.player};
    });
    const weeklyResultsPromise = league("weeklyResults");
    // the results week's report, for the injured-starter check; without it that check flags nothing
    const injuriesPromise = weeklyResultsPromise.then((weeklyResults) =>
        fetchExport(exportUrl(API_BASE, season, "injuries", {W: weeklyResults.week || ""}), "injuries")).catch(() => null);
    // today's report, for injured reserve eligibility; without it that check is skipped
    const currentInjuriesPromise = fetchExport(exportUrl(API_BASE, season, "injuries"), "injuries").catch(() => null);
    // where the season is, for when the in-season checks run; if it can't be told, they're
    // hidden for this load rather than risk showing members false alerts
    const phasePromise = seasonPhase(season, new Date()).catch(() => ({started: false, tankingOver: true, seasonOver: true}));
    const [players, leagueInfo, salaryAdjustments, rosters, transactions, weeklyResults, freeAgents, injuries, currentInjuries, phase] = await Promise.all([
        playersPromise, league("league"), league("salaryAdjustments"), league("rosters"),
        league("transactions"), weeklyResultsPromise, league("freeAgents"), injuriesPromise, currentInjuriesPromise, phasePromise
    ]);
    const built = buildLeague({
        players: playersFromExport(players), league: leagueInfo, salaryAdjustments, rosters,
        transactions, weeklyResults, freeAgents, injuries, currentInjuries
    });
    Object.assign(built, phase);
    // adds waiting for a contract length, for the violations box
    const playerNames = new Map(asArray(players.player).map((player) => [player.id, player]));
    built.pendingAdds = pendingAdds({rosters, transactions: asArray(transactions.transaction), players: playerNames});
    // for reading contract lengths from the message board
    built.boardContext = {rosters, playerNames};
    return built;
}

/**
 * What the message board says so far about free agent and waiver adds still in their hour, so
 * League Alerts can show the owner what was read; null when no add's hour is open. Only threads
 * with a post since the earliest such add are read, one at a time. The board needs a logged-in
 * member. The reader is loaded only here: its regular expressions need Safari 16.4 or later, and
 * on an older browser a failed load just leaves the notice as it is rather than the whole page.
 */
async function contractReadings({season, leagueId}, league) {
    const open = league.pendingAdds.filter((add) => add.type !== "BBID_WAIVER" && !windowClosed(add, Date.now() / 1000));
    if (!open.length) {
        return null;
    }
    const board = (type, params) => fetchExport(exportUrl(window.location.origin, season, type, {L: leagueId, ...params}), type, {init: {cache: "no-store"}});
    const {postReadings, teamPlayers} = await import("../lib/contract-years.js");
    const earliest = Math.min(...open.map((add) => add.added));
    const threads = asArray((await board("messageBoard", {COUNT: 100})).thread).filter((thread) => Number(thread.lastPostTime) >= earliest);
    const posts = [];
    for (const thread of threads) {
        posts.push(...asArray((await board("messageBoardThread", {THREAD: thread.id})).post));
    }
    const {rosters, playerNames} = league.boardContext;
    return postReadings({adds: open, pending: league.pendingAdds, posts, teams: teamPlayers({rosters, players: playerNames})});
}

/**
 * Draw the league's features on this page. `beta` is the version the header offers this viewer
 * (loader.js's betaOffer), which League Alerts invites them to try; null when this is the beta.
 */
export async function start({dataBase, beta = null}) {
    const context = pageContext();
    const found = mounts();
    const onHome = document.getElementById("tabcontent0") || found.contracts || found.commish || found.links;
    if (!context || !onHome) {
        return;
    }
    if (found.links) {
        renderLinks(found.links, context);
    }
    showInMounts(found, "fuad-loading", "Loading league data…");

    let league;
    try {
        league = await loadLeague(context);
    } catch (error) {
        showInMounts(found, "fuad-error", `${error.message}. Try reloading the page.`);
        throw error;
    }
    const render = (what, mount, draw) => {
        try {
            draw();
        } catch (error) {
            console.error("[fuad]", error);
            if (mount) {
                mount.innerHTML = `<div class="fuad-error"></div>`;
                mount.firstChild.textContent = `Couldn't show the ${what}: ${error.message}. Try reloading the page.`;
            }
        }
    };
    let alertsShown = false;
    render("violations", null, () => {
        alertsShown = renderViolations(league, undefined, beta);
    });
    if (alertsShown) {
        // redraw with what the board says, without holding up the rest; if it can't be read,
        // the notice just keeps its deadline
        contractReadings(context, league)
            .then((readings) => readings && render("violations", null, () => renderViolations(league, readings, beta)))
            .catch((error) => console.warn("[fuad] couldn't read the message board for contract lengths:", error));
    }

    let view;
    try {
        view = await franchiseView(context.season, league, dataBase);
    } catch (error) {
        view = {topSalaries: franchiseTopSalaries(league.rosteredPlayers), phase: "live", note: `Projected franchise salaries (couldn't check the season calendar: ${error.message}).`};
    }
    if (found.contracts) {
        render("Contracts tab", found.contracts, () =>
            renderContracts(found.contracts, {league, season: context.season, franchise: view, storage}));
    }
    if (found.commish) {
        render("Commish tab", found.commish, () => renderCommish(found.commish, {
            ...context,
            league,
            // the rookie draft is held offline before week 1, so "previous" stands in for "before the draft"
            beforeDraft: view.phase === "previous",
            snapshotStatus: snapshotStatus(view, context.season),
            snapshotJson: () => JSON.stringify(makeSnapshot(context.season, franchiseTopSalaries(league.rosteredPlayers), {
                takenAt: new Date().toISOString(),
                source: "Commish tab backup"
            }), null, 2)
        }));
    }
}
