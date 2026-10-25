// On pages other than the home page this does nothing; only the stylesheet applies.

import {API_BASE, asArray, exportUrl, fetchExport} from "../lib/mfl.js";
import {buildLeague, draftedIds, markContracts, playersFromExport} from "../lib/league.js";
import {pendingAdds, windowClosed} from "../lib/adds.js";
import {seasonPhase} from "../lib/violations.js";
import {cached, storage} from "./store.js";
import {mflFetch, pageFetch} from "./page-fetch.js";
import {REBUILT, pageOf, sections, storedTabs, teamLinks} from "./nav.js";

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

async function loadLeague({season, leagueId}) {
    const host = window.location.origin;
    const league = (type, params) => fetchExport(exportUrl(host, season, type, {L: leagueId, ...params}), type, {fetchImpl: pageFetch, init: {cache: "no-store"}});
    const playersPromise = cached(`fuad.players.${season}`, DAY, async () => {
        const players = await fetchExport(exportUrl(API_BASE, season, "players"), "players", {fetchImpl: mflFetch});
        return {player: players.player};
    });
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
    const phasePromise = seasonPhase(season, new Date(), {fetchImpl: pageFetch}).catch(() => ({started: false, tankingOver: true, seasonOver: true}));
    // this season's rookies, whose cut costs nothing while their length is due; only before week 1
    const draftPromise = phasePromise.then((phase) => (phase.started ? null : league("draftResults"))).catch(() => null);
    const [players, leagueInfo, salaryAdjustments, rosters, transactions, weeklyResults, freeAgents, injuries, currentInjuries, phase, draftResults] = await Promise.all([
        playersPromise, league("league"), league("salaryAdjustments"), league("rosters"),
        league("transactions"), weeklyResultsPromise, league("freeAgents"), injuriesPromise, currentInjuriesPromise, phasePromise, draftPromise
    ]);
    const built = buildLeague({
        players: playersFromExport(players), league: leagueInfo, salaryAdjustments, rosters,
        transactions, weeklyResults, freeAgents, injuries, currentInjuries
    });
    Object.assign(built, phase);
    markContracts(built, draftedIds(draftResults));
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
    const board = (type, params) => fetchExport(exportUrl(window.location.origin, season, type, {L: leagueId, ...params}), type, {fetchImpl: mflFetch, init: {cache: "no-store"}});
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

function teamLink(view) {
    return teamLinks(view("Rosters", "Teams"));
}

function loginLink(context) {
    const login = [...document.querySelectorAll(".myfantasyleague_menu a[href], .pageheader a[href]")].find((a) => /^log\s*in$/i.test(a.textContent.trim()));
    return login ? login.href : `${window.location.origin}/${context.season}/login?L=${context.leagueId}`;
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
        loginHref: loginLink(context),
        inBeta,
        beta
    }).shown));
}

// `beta` is the offer League Alerts invites the viewer to; null when this is the beta, whose
// `inBeta` ({feedback}) gives League Alerts the way back. `onTrouble` is called when anything fails.
// `onDrawn` is called once the page's own view has first drawn (its placeholders at least), so the
// cover can come off without MFL's page showing first. Resolves to whether League Alerts was drawn.
export async function start({dataBase, beta = null, inBeta = null, onTrouble = () => {}, onDrawn = () => {}}) {
    const context = pageContext();
    // each view draws its placeholders before its first wait, so they're in the page once it returns
    const drawn = (value) => {
        onDrawn();
        return value;
    };
    const here = pageOf(window.location);
    // MFL's menu also reaches Submit Lineup as options?O=02
    // Lineup, Add, Drop, IR, Trades, All moves and All bids draw over MFL's page: it's hidden from the
    // start, so it doesn't show while their
    // code loads (the commissioner's view stays MFL's)
    const over = (className) => {
        if (window.franchise_id !== "0000") {
            document.documentElement.classList.add(className);
        }
        return (error) => {
            document.documentElement.classList.remove(className);
            throw error;
        };
    };
    if (context && (here.path === "lineup" || (here.path === "options" && here.option === "02"))) {
        const franchiseId = window.franchise_id || null;
        const shown = over("fuad-lineup-on");
        await import("./lineup.js").then(({drawLineup}) => drawn(drawLineup({
            context, franchiseId, loginHref: loginLink(context), irHref: viewLinks(context, franchiseId)("Moves", "IR")
        }))).catch(shown).catch((error) => {
            console.error("[fuad] couldn't draw Lineup:", error);
            onTrouble();
        });
        return false;
    }
    if (context && here.path === "add_drop") {
        const shown = over("fuad-add-on");
        await import("./add.js").then(({drawAdd}) => drawn(drawAdd({context, franchiseId: window.franchise_id || null, loginHref: loginLink(context)}))).catch(shown).catch((error) => {
            console.error("[fuad] couldn't draw Add:", error);
            onTrouble();
        });
        return false;
    }
    if (context && here.path === "options" && here.option === "257") {
        const shown = over("fuad-drop-on");
        await import("./drop.js").then(({drawDrop}) => drawn(drawDrop({context, franchiseId: window.franchise_id || null, loginHref: loginLink(context)}))).catch(shown).catch((error) => {
            console.error("[fuad] couldn't draw Drop:", error);
            onTrouble();
        });
        return false;
    }
    if (context && here.path === "options" && here.option === "18") {
        const franchiseId = window.franchise_id || null;
        const shown = over("fuad-ir-on");
        await import("./ir.js").then(({drawIR}) => drawn(drawIR({
            context, franchiseId, loginHref: loginLink(context), dropHref: viewLinks(context, franchiseId)("Moves", "Drop")
        }))).catch(shown).catch((error) => {
            console.error("[fuad] couldn't draw IR:", error);
            onTrouble();
        });
        return false;
    }
    // Trades and its proposal page (`O=05&FRANCHISE=<mine>,<theirs>`)
    if (context && here.path === "options" && here.option === "05") {
        const franchiseId = window.franchise_id || null;
        const shown = over("fuad-trades-on");
        await import("./trades.js").then(({drawTrades}) => drawn(drawTrades({
            context, franchiseId, loginHref: loginLink(context), addHref: viewLinks(context, franchiseId)("Moves", "Add"), teamHref: teamLink(viewLinks(context, franchiseId))
        }))).catch(shown).catch((error) => {
            console.error("[fuad] couldn't draw Trades:", error);
            onTrouble();
        });
        return false;
    }
    // Home's All moves and All bids: MFL's Transactions and Processed Waivers pages
    if (context && here.path === "options" && here.option === "03") {
        const shown = over("fuad-all-moves-on");
        await import("./all-moves.js").then(({drawAllMoves}) => drawn(drawAllMoves({context, franchiseId: window.franchise_id || null, teamHref: teamLink(viewLinks(context, window.franchise_id || null))}))).catch(shown).catch((error) => {
            console.error("[fuad] couldn't draw All moves:", error);
            onTrouble();
        });
        return false;
    }
    if (context && (here.path === "processed_waivers" || (here.path === "options" && here.option === "76"))) {
        const shown = over("fuad-all-bids-on");
        await import("./all-moves.js").then(({drawAllBids}) => {
            // a page v2 can't read (logged out, or changed) stays MFL's
            if (!drawAllBids({context, franchiseId: window.franchise_id || null, teamHref: teamLink(viewLinks(context, window.franchise_id || null))})) {
                document.documentElement.classList.remove("fuad-all-bids-on");
            }
            onDrawn();
        }).catch(shown).catch((error) => {
            console.error("[fuad] couldn't draw All bids:", error);
            onTrouble();
        });
        return false;
    }
    // League Rules and League Settings: one Rules page over either (the commissioner's view stays MFL's)
    if (context && here.path === "options" && (here.option === "09" || here.option === "26") && window.franchise_id !== "0000") {
        const shown = over("fuad-rules-on");
        await import("./rules.js").then(({drawRules}) => {
            // a page v2 can't read (changed) stays MFL's
            if (!drawRules({context, option: here.option})) {
                document.documentElement.classList.remove("fuad-rules-on");
            }
            onDrawn();
        }).catch(shown).catch((error) => {
            console.error("[fuad] couldn't draw Rules:", error);
            onTrouble();
        });
        return false;
    }
    // the message board's pages: MFL's, restyled
    const boardPage = (window.location.pathname.match(/\/mb\/(\w+)\.pl$/) || [])[1];
    if (context && boardPage) {
        const boardHref = `${window.location.origin}/${context.season}/options?L=${context.leagueId}&O=28`;
        await import("./topic.js").then((board) => {
            const restyle = {board_show: board.restyleBoard, topic_show: board.restyleTopic, post_add: board.restyleReply, topic_add: board.restyleReply, post_edit: board.restyleReply, message_show: board.restyleMessage}[boardPage];
            return restyle ? restyle() : board.restyleSidePage(boardPage, boardHref);
        }).catch((error) => {
            console.error("[fuad] couldn't restyle the message board page:", error);
            onTrouble();
        });
        return false;
    }
    if (!context || !document.getElementById("tabcontent0")) {
        return false;
    }

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
    return homeShown;
}
