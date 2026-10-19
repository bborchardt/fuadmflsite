// On pages other than the home page this does nothing; only the stylesheet applies.

import {API_BASE, asArray, exportUrl, fetchExport} from "../lib/mfl.js";
import {buildLeague, playersFromExport} from "../lib/league.js";
import {pendingAdds, windowClosed} from "../lib/adds.js";
import {franchiseTopSalaries} from "../lib/rules.js";
import {seasonPhase} from "../lib/violations.js";
import {makeSnapshot, snapshotFileName} from "../lib/franchise.js";
import {franchiseView} from "./franchise-view.js";
import {renderContracts} from "./contracts.js";
import {renderCommish} from "./commish.js";
import {renderLinks} from "./links.js";
import {cached, storage} from "./store.js";
import {pageFetch} from "./page-fetch.js";
import {REBUILT, pageOf, sections, storedTabs} from "./nav.js";

const DAY = 24 * 60 * 60 * 1000;

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

function snapshotStatus(view, season) {
    if (view.phase === "final" && view.missing) {
        return `The ${season} trade deadline has passed and no snapshot is published yet. The daily job normally takes it; if it hasn't run, commit the JSON below to the league-data branch as data/${snapshotFileName(season)} and the next morning's daily job publishes it.`;
    }
    if (view.phase === "final") {
        return `The ${season} snapshot is published.`;
    }
    return `The daily job takes the ${season} snapshot after the trade deadline. The button shows what it would contain right now.`;
}

async function loadLeague({season, leagueId}) {
    const host = window.location.origin;
    const league = (type, params) => fetchExport(exportUrl(host, season, type, {L: leagueId, ...params}), type, {fetchImpl: pageFetch, init: {cache: "no-store"}});
    const playersPromise = cached(`fuad.players.${season}`, DAY, async () => {
        const players = await fetchExport(exportUrl(API_BASE, season, "players"), "players");
        return {player: players.player};
    });
    const weeklyResultsPromise = league("weeklyResults");
    // the results week's report, for the injured-starter check; without it that check flags nothing
    const injuriesPromise = weeklyResultsPromise.then((weeklyResults) =>
        fetchExport(exportUrl(API_BASE, season, "injuries", {W: weeklyResults.week || ""}), "injuries", {fetchImpl: pageFetch})).catch(() => null);
    // today's report, for injured reserve eligibility; without it that check is skipped
    const currentInjuriesPromise = fetchExport(exportUrl(API_BASE, season, "injuries"), "injuries", {fetchImpl: pageFetch}).catch(() => null);
    // if the season's phase can't be told, in-season checks are hidden rather than risk false alerts
    const phasePromise = seasonPhase(season, new Date(), {fetchImpl: pageFetch}).catch(() => ({started: false, tankingOver: true, seasonOver: true}));
    const [players, leagueInfo, salaryAdjustments, rosters, transactions, weeklyResults, freeAgents, injuries, currentInjuries, phase] = await Promise.all([
        playersPromise, league("league"), league("salaryAdjustments"), league("rosters"),
        league("transactions"), weeklyResultsPromise, league("freeAgents"), injuriesPromise, currentInjuriesPromise, phasePromise
    ]);
    const built = buildLeague({
        players: playersFromExport(players), league: leagueInfo, salaryAdjustments, rosters,
        transactions, weeklyResults, freeAgents, injuries, currentInjuries
    });
    Object.assign(built, phase);
    const playerNames = new Map(asArray(players.player).map((player) => [player.id, player]));
    built.raw = {transactions, league: leagueInfo, salaryAdjustments, freeAgents};
    built.pendingAdds = pendingAdds({rosters, transactions: asArray(transactions.transaction), players: playerNames});
    built.boardContext = {rosters, playerNames};
    return built;
}

// Only threads with a post since the earliest open add are read, one at a time; the board needs a
// logged-in member. The reader is loaded only here: its regular expressions need Safari 16.4+, and
// a failed load just leaves the notice as it is.
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

// A rebuilt section's requests wait until it's the view (the frame sets `fuad-home-on` or
// `fuad-league-on`), so landing on another home page tab doesn't fetch them
function whenShown(className) {
    const root = document.documentElement;
    return new Promise((resolve) => {
        if (root.classList.contains(className)) {
            resolve();
            return;
        }
        const watch = new MutationObserver(() => {
            if (root.classList.contains(className)) {
                watch.disconnect();
                resolve();
            }
        });
        watch.observe(root, {attributes: true, attributeFilter: ["class"]});
    });
}

// the href of a section, or of one of its views
function viewLinks(context, franchiseId) {
    const base = `${window.location.origin}/${context.season}`;
    const all = sections({base, leagueId: context.leagueId, franchiseId, tabs: storedTabs(storage), rebuilt: REBUILT});
    return (section, name) => {
        const found = all.find((entry) => entry.name === section);
        return name ? found.views.find((entry) => entry.name === name).href : found.href;
    };
}

function loginLink(context) {
    const login = [...document.querySelectorAll(".myfantasyleague_menu a[href], .pageheader a[href]")].find((a) => /^log\s*in$/i.test(a.textContent.trim()));
    return login ? login.href : `${window.location.origin}/${context.season}/login?L=${context.leagueId}`;
}

// v2's Home on the home page, drawn at once with the league still loading. The frame shows it when
// Home is the current view (`fuad-home-on`); MFL's tabs stay underneath for the other home page tabs.
function startHome(context, league, {beta, inBeta}) {
    const franchiseId = window.franchise_id || null;
    const view = viewLinks(context, franchiseId);
    const teams = view("Rosters", "Teams");
    return import("./home.js").then(({drawHome}) => drawHome({
        context,
        franchiseId,
        league,
        readings: (built) => contractReadings(context, built),
        links: {
            lineup: view("Lineup"),
            add: view("Moves", "Add"),
            drop: view("Moves", "Drop"),
            ir: view("Moves", "IR"),
            trades: view("Moves", "Trades"),
            // a team's page under Teams, rebuilt or MFL's
            team: (id) => (teams.includes("#") ? `${teams}/${encodeURIComponent(id)}` : `${teams}&F=${encodeURIComponent(id)}`)
        },
        loginHref: loginLink(context),
        inBeta,
        beta
    }).shown);
}

// `beta` is the offer League Alerts invites the viewer to; null when this is the beta, whose
// `inBeta` ({feedback}) gives League Alerts the way back. `onTrouble` is called when anything fails.
// Resolves to whether League Alerts was drawn.
export async function start({dataBase, beta = null, inBeta = null, onTrouble = () => {}}) {
    const context = pageContext();
    const here = pageOf(window.location);
    // MFL's menu also reaches Submit Lineup as options?O=02
    if (context && (here.path === "lineup" || (here.path === "options" && here.option === "02"))) {
        const franchiseId = window.franchise_id || null;
        await import("./lineup.js").then(({drawLineup}) => drawLineup({
            context, franchiseId, loginHref: loginLink(context), irHref: viewLinks(context, franchiseId)("Moves", "IR")
        })).catch((error) => {
            console.error("[fuad] couldn't draw Lineup:", error);
            onTrouble();
        });
        return false;
    }
    if (context && here.path === "add_drop") {
        await import("./add.js").then(({drawAdd}) => drawAdd({context, franchiseId: window.franchise_id || null, loginHref: loginLink(context)})).catch((error) => {
            console.error("[fuad] couldn't draw Add:", error);
            onTrouble();
        });
        return false;
    }
    // the message board's topic and reply pages: MFL's, restyled
    const boardPage = (window.location.pathname.match(/\/mb\/(topic_show|post_add)\.pl$/) || [])[1];
    if (context && boardPage) {
        await import("./topic.js").then(({restyleReply, restyleTopic}) => (boardPage === "post_add" ? restyleReply() : restyleTopic())).catch((error) => {
            console.error("[fuad] couldn't restyle the message board page:", error);
            onTrouble();
        });
        return false;
    }
    const found = mounts();
    const onHome = document.getElementById("tabcontent0") || found.contracts || found.commish || found.links;
    if (!context || !onHome) {
        return false;
    }
    if (found.links) {
        renderLinks(found.links, context);
    }
    showInMounts(found, "fuad-loading", "Loading league data…");

    // one load shared by every panel; a failed one is tried again by the next Retry
    let loading = null;
    const league = () => {
        if (!loading) {
            loading = loadLeague(context).catch((error) => {
                loading = null;
                throw error;
            });
        }
        return loading;
    };
    const homeShown = document.getElementById("tabcontent0")
        ? whenShown("fuad-home-on").then(() => startHome(context, league, {beta, inBeta})).catch((error) => {
            console.error("[fuad] couldn't draw Home:", error);
            return false;
        })
        : Promise.resolve(false);
    if (document.getElementById("tabcontent0")) {
        whenShown("fuad-rosters-on")
            .then(() => import("./rosters.js"))
            .then(({drawRosters}) => drawRosters({context, franchiseId: window.franchise_id || null, dataBase, league}))
            .catch((error) => {
                console.error("[fuad] couldn't draw Rosters:", error);
                onTrouble();
            });
        whenShown("fuad-league-on")
            .then(() => import("./league.js"))
            .then(({drawLeague}) => drawLeague({context, franchiseId: window.franchise_id || null}))
            .catch((error) => {
                console.error("[fuad] couldn't draw League:", error);
                onTrouble();
            });
    }

    let built;
    try {
        built = await league();
    } catch (error) {
        showInMounts(found, "fuad-error", `${error.message}. Try reloading the page.`);
        onTrouble();
        throw error;
    }
    const render = (what, mount, draw) => {
        try {
            draw();
        } catch (error) {
            console.error("[fuad]", error);
            onTrouble();
            if (mount) {
                mount.innerHTML = `<div class="fuad-error"></div>`;
                mount.firstChild.textContent = `Couldn't show the ${what}: ${error.message}. Try reloading the page.`;
            }
        }
    };

    let view;
    try {
        view = await franchiseView(context.season, built, dataBase);
    } catch (error) {
        view = {topSalaries: franchiseTopSalaries(built.rosteredPlayers), phase: "live", note: `Projected franchise salaries (couldn't check the season calendar: ${error.message}).`};
    }
    if (found.contracts) {
        render("Contracts tab", found.contracts, () =>
            renderContracts(found.contracts, {league: built, season: context.season, franchise: view, storage}));
    }
    if (found.commish) {
        render("Commish tab", found.commish, () => renderCommish(found.commish, {
            ...context,
            league: built,
            // the rookie draft is held offline before week 1, so "previous" stands in for "before the draft"
            beforeDraft: view.phase === "previous",
            snapshotStatus: snapshotStatus(view, context.season),
            snapshotJson: () => JSON.stringify(makeSnapshot(context.season, franchiseTopSalaries(built.rosteredPlayers), {
                takenAt: new Date().toISOString(),
                source: "Commish tab backup"
            }), null, 2)
        }));
    }
    return homeShown;
}
