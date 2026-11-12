// On pages other than the home page this does nothing; only the stylesheet applies.

import {API_BASE, asArray, exportUrl, fetchExport, weekKickoff} from "../lib/mfl.js";
import {buildLeague, draftedIds, markContracts, playersFromExport} from "../lib/league.js";
import {pendingAdds, windowClosed} from "../lib/adds.js";
import {cutDownAt, seasonPhase} from "../lib/violations.js";
import {postReadings, teamPlayers} from "../lib/contract-years.js";
import {seasonWeeks} from "../lib/rules.js";
import {leagueIdIn} from "../lib/settings.js";
import {dropUnusedKeys} from "./store.js";
import {useTeamPictures} from "./team-pictures.js";
import {playerList} from "./player-list.js";
import {mflFetch, pageFetch} from "./page-fetch.js";
import {REBUILT, pageOf, routeFor, sections, teamLinks} from "./nav.js";

export function pageContext(location = window.location) {
    const season = (location.pathname.match(/^\/(\d{4})\//) || [])[1] || (window.year && String(window.year));
    const leagueId = leagueIdIn(location, window.league_id);
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

async function loadLeague({season, leagueId}) {
    const host = window.location.origin;
    const league = (type, params) => fetchExport(exportUrl(host, season, type, {L: leagueId, ...params}), type, {fetchImpl: pageFetch, init: {cache: "no-store"}});
    // fresh: Home's alerts, and the Load and Lengths forms, which write to MFL, match names in it
    const playersPromise = playerList(season, {fresh: true});
    // only the injured-starter check needs the results, so without them (a new site has none) that
    // check flags nothing and the rest still loads
    const weeklyResultsPromise = league("weeklyResults").catch(() => null);
    // the results week's report, for the injured-starter check; without it that check flags nothing
    const injuriesPromise = weeklyResultsPromise.then((weeklyResults) => (weeklyResults
        ? fetchExport(exportUrl(API_BASE, season, "injuries", {W: weeklyResults.week || ""}), "injuries", {fetchImpl: pageFetch})
        : null)).catch(() => null);
    // today's report, for injured reserve eligibility; without it that check is skipped
    const currentInjuriesPromise = fetchExport(exportUrl(API_BASE, season, "injuries"), "injuries", {fetchImpl: pageFetch}).catch(() => null);
    // if the season's phase can't be told, in-season checks are hidden rather than risk false alerts
    const leaguePromise = league("league");
    // week 1's schedule needs no weeks, so it's asked for while the league export loads
    weekKickoff(season, 1, {fetchImpl: pageFetch}).catch(() => null);
    const phasePromise = leaguePromise.then((info) => seasonPhase(season, new Date(), {fetchImpl: pageFetch}, seasonWeeks(info)))
        .catch(() => ({started: false, tankingOver: true, seasonOver: true}));
    // this season's rookies, whose cut costs nothing while their length is due, until the cut-down
    // date (lib/league.js lengthDuePenalty); only before week 1
    const lengthDuePromise = phasePromise.then((phase) => (phase.started ? {} : Promise.all([
        league("draftResults"), league("calendar").catch(() => null)
    ]).then(([draftResults, calendar]) => ({rookies: draftedIds(draftResults), freeUntil: cutDownAt(calendar, season)})))).catch(() => ({}));
    const [players, leagueInfo, salaryAdjustments, rosters, transactions, weeklyResults, freeAgents, injuries, currentInjuries, phase, lengthDue] = await Promise.all([
        playersPromise, leaguePromise, league("salaryAdjustments"), league("rosters"),
        league("transactions"), weeklyResultsPromise, league("freeAgents"), injuriesPromise, currentInjuriesPromise, phasePromise, lengthDuePromise
    ]);
    const built = buildLeague({
        players: playersFromExport(players), league: leagueInfo, salaryAdjustments, rosters,
        transactions, weeklyResults, freeAgents, injuries, currentInjuries, lengthDue
    });
    Object.assign(built, phase);
    markContracts(built, lengthDue);
    const playerNames = new Map(asArray(players.player).map((player) => [player.id, player]));
    built.raw = {transactions, league: leagueInfo, salaryAdjustments, freeAgents};
    built.pendingAdds = pendingAdds({rosters, transactions: asArray(transactions.transaction), players: playerNames});
    built.boardContext = {rosters, playerNames};
    return built;
}

// Only threads with a post since the earliest open add are read, one at a time; the board needs a
// logged-in member.
async function contractReadings({season, leagueId}, league) {
    const open = league.pendingAdds.filter((add) => add.type !== "BBID_WAIVER" && !windowClosed(add, Date.now() / 1000));
    if (!open.length) {
        return null;
    }
    const board = (type, params) => fetchExport(exportUrl(window.location.origin, season, type, {L: leagueId, ...params}), type, {fetchImpl: mflFetch, init: {cache: "no-store"}});
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
    const all = sections({base, leagueId: context.leagueId, franchiseId, rebuilt: REBUILT});
    return (section, name) => {
        const found = all.find((entry) => entry.name === section);
        return name ? found.views.find((entry) => entry.name === name).href : found.href;
    };
}

function teamLink(view) {
    return teamLinks(view("Rosters", "Teams"));
}

// v2's Home on the home page, drawn at once with the league still loading. The frame shows it when
// Home is the current view (`fuad-home-on`); MFL's tabs stay underneath for the other home page tabs.
function startHome(context, league, {beta, inBeta, drawn}) {
    const franchiseId = window.franchise_id || null;
    const view = viewLinks(context, franchiseId);
    return import("./home.js").then(({drawHome}) => drawn(drawHome({
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
            team: teamLink(view)
        },
        inBeta,
        beta
    }).shown));
}

// `beta` is the offer League Alerts invites the viewer to; null when this is the beta, whose
// `inBeta` ({feedback}) gives League Alerts the way back. `onTrouble` is called when anything fails.
// `onDrawn` is called once the page's own view has first drawn (its placeholders at least), so the
// cover can come off without MFL's page showing first. Resolves to whether League Alerts was drawn.
export async function start({dataBase, beta = null, inBeta = null, onTrouble = () => {}, onDrawn = () => {}}) {
    dropUnusedKeys();
    useTeamPictures({dataBase});
    const context = pageContext();
    // each view draws its placeholders before its first wait, so they're in the page once it returns
    const drawn = (value) => {
        onDrawn();
        return value;
    };
    const here = pageOf(window.location);
    const franchiseId = window.franchise_id || null;
    const route = context && routeFor(here, franchiseId);
    if (route) {
        const on = route.on && franchiseId !== "0000" ? route.on : null;
        if (on) {
            document.documentElement.classList.add(on);
        }
        try {
            const view = viewLinks(context, franchiseId);
            // a screen draws its placeholders before its first wait, so the cover comes off at once
            const result = route.draw(await route.load(), {context, franchiseId, view, teamHref: teamLink(view), page: here, location: window.location});
            if (result === false && on) {
                document.documentElement.classList.remove(on);
            }
            if (route.on) {
                onDrawn();
            }
            await result;
        } catch (error) {
            if (on) {
                document.documentElement.classList.remove(on);
            }
            console.error(`[fuad] couldn't draw ${route.name}:`, error);
            onTrouble();
        }
        return false;
    }
    // the home page, known by its address: with only the Main tab, MFL draws its modules with no tabs
    if (!context || here.path !== "home") {
        return false;
    }
    // MFL's chat module, hidden under v2, reads the chat every few seconds for two hours; Home draws its
    // own. Its timer calls this by name, so the next tick stops it.
    const mflReadMessages = window.readMessages;
    let chatStopped = false;
    window.readMessages = () => {
        chatStopped = true;
    };

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
    const homeShown = whenShown("fuad-home-on").then(() => startHome(context, league, {beta, inBeta, drawn})).catch((error) => {
        console.error("[fuad] couldn't draw Home:", error);
        // MFL's chat may be what's left, so it reads again; restarted only if it was stopped, as a
        // timer still pending would start a second one
        if (typeof mflReadMessages === "function") {
            window.readMessages = mflReadMessages;
            if (chatStopped) {
                mflReadMessages(true);
            }
        }
        onDrawn();
        return false;
    });
    whenShown("fuad-rosters-on")
        .then(() => import("./rosters.js"))
        .then(({drawRosters}) => drawn(drawRosters({context, franchiseId: window.franchise_id || null, dataBase, league})))
        .catch((error) => {
            console.error("[fuad] couldn't draw Rosters:", error);
            onTrouble();
            onDrawn();
        });
    whenShown("fuad-league-on")
        .then(() => import("./league.js"))
        .then(({drawLeague}) => drawn(drawLeague({context, franchiseId: window.franchise_id || null, teamHref: teamLink(viewLinks(context, window.franchise_id || null))})))
        .catch((error) => {
            console.error("[fuad] couldn't draw League:", error);
            onTrouble();
            onDrawn();
        });
    // the frame draws a login page itself
    whenShown("fuad-login-page-on").then(onDrawn);
    return homeShown;
}
