// Home, rebuilt on MFL's home page: My alerts, League alerts, Chat, Message board, Recent moves and
// Coming up, each panel loading on its own (ui/panel.js). MFL's tabs stay on the page underneath,
// shown again for a home page tab that isn't Home.

import {API_BASE, asArray, exportUrl, fetchExport} from "../lib/mfl.js";
import {pendingGroups} from "../lib/bids.js";
import {TRADE_DEADLINE_WEEK, seasonWeeks} from "../lib/rules.js";
import {clean, esc} from "./html.js";
import {drawPanel} from "./panel.js";
import {mflFetch, pageFetch} from "./page-fetch.js";
import {withParam} from "../loader.js";
import {cutDownAt} from "../lib/violations.js";
import {
    boardTopics, calendarDates, clock, comingUp, contractTopic, dayText, homePhase, leagueAlerts,
    lineupProblems, myAlerts, nextBidRun, recentMoves
} from "./home-model.js";
import {draftPicked, kickoffAt} from "./context.js";
import {moduleTopics, readChat, tradeOffers} from "./home-feeds.js";
import {moveRows} from "./move-rows.js";

const CHAT_POLL = 15 * 1000;
// MFL's own chat stops polling after about two hours without posting
const CHAT_IDLE = 2 * 60 * 60 * 1000;
// phones show the newest messages in the page, with no box of their own to trap a swipe, and as many
// more each tap of Older messages
const PHONE_CHAT = 10;
const CHEVRON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>';
const CHECK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"></path></svg>';
const LOCK = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path></svg>';

// a link in MFL's own menu, found by its text, so a page MFL moves still opens
function mflPage(pattern) {
    const link = [...document.querySelectorAll(".myfantasyleague_menu a[href]")].find((a) => pattern.test(clean(a.textContent)));
    return link ? link.href : null;
}

// Each export is fetched once per page, however many panels use it (page-fetch.js); `fresh` reads
// it again, after a post. An optional one resolves to null when it can't be had.
function fetcher({season, leagueId}, {fresh = false} = {}) {
    const host = window.location.origin;
    return (type, params = {}, {base = host, optional = false} = {}) => {
        const leagueParams = base === host ? {L: leagueId, ...params} : params;
        const request = fetchExport(exportUrl(base, season, type, leagueParams), type, {fetchImpl: fresh ? mflFetch : pageFetch, init: {cache: "no-store"}});
        return optional ? request.catch((error) => {
            console.warn(`[fuad] couldn't load ${type}:`, error);
            return null;
        }) : request;
    };
}

// the weeks' first kickoffs, in seconds, cached for a day; a week MFL hasn't scheduled is left out
async function kickoffs(season, weeks) {
    const found = await Promise.all(weeks.map((week) => kickoffAt(season, week).catch(() => null)));
    return new Map(weeks.map((week, i) => [week, found[i]]).filter(([, at]) => at));
}

function layout(root, {loggedIn}) {
    root.innerHTML = `
    <div class="fuad-home-columns">
        <div class="fuad-home-column">
            <section class="fuad-home-alerts" aria-label="My alerts"></section>
            <section class="fuad-home-league" aria-label="League alerts"></section>
            <section class="fuad-home-board" aria-label="Message board"></section>
            <section class="fuad-home-coming" aria-label="Coming up"></section>
        </div>
        <div class="fuad-home-column">
            ${loggedIn ? '<section class="fuad-home-chat" aria-label="Chat"></section>' : ""}
            <section class="fuad-home-recent" aria-label="Recent moves"></section>
        </div>
    </div>`;
    const find = (name) => root.querySelector(`.fuad-home-${name}`);
    return {alerts: find("alerts"), league: find("league"), board: find("board"), chat: find("chat"), recent: find("recent"), coming: find("coming")};
}

function alertRows(alerts) {
    return `<ul class="fuad-rows">${alerts.map((alert) => {
        const inner = `<span class="fuad-mark fuad-tone-${esc(alert.tone)}" aria-hidden="true">${esc(alert.mark)}</span>
            <span class="fuad-row-text"><span class="fuad-row-title">${esc(alert.title)}</span>${alert.detail ? `<span class="fuad-meta">${esc(alert.detail)}</span>` : ""}</span>`;
        return alert.href
            ? `<li><a class="fuad-alert" href="${esc(alert.href)}">${inner}${CHEVRON}</a></li>`
            : `<li><div class="fuad-alert fuad-alert-still">${inner}</div></li>`;
    }).join("")}</ul>`;
}

// the beta's way back, or the offer of one (docs/design.md: previews and the beta)
function betaLine({inBeta, beta}) {
    if (inBeta) {
        return `<p class="fuad-beta-line">You’re using the beta. ${inBeta.feedback ? `<a href="${esc(inBeta.feedback)}">Send feedback</a> · ` : ""}<a href="${esc(withParam(window.location.href, "fuadBeta", "off"))}">Back to the classic site</a></p>`;
    }
    if (beta) {
        return `<p class="fuad-beta-line">A new version of the league site is in beta. <a href="${esc(withParam(window.location.href, "fuadBeta", "on"))}">Try it</a></p>`;
    }
    return "";
}

function drawChat(mount, {context, franchiseId, teams}) {
    const feedUrl = `${window.location.origin}/fflnetdynamic${context.season}/${context.leagueId}_chat.xml`;
    const others = [...teams].filter(([id]) => id !== franchiseId).concat(franchiseId === "0000" ? [] : [["0000", "Commissioner"]]);
    let lastPost = Date.now();
    let timer = null;
    // null until the first draw, so an empty chat still draws its "No messages yet."
    let drawnIds = null;
    let olderButton = null;
    // phones: the oldest message shown once Older messages is tapped, so new ones don't hide it
    let shownFrom = null;
    let shown = [];
    let shownList = null;
    const markOlder = () => {
        const at = shown.findIndex((message) => message.id === shownFrom);
        const start = at >= 0 ? at : Math.max(0, shown.length - PHONE_CHAT);
        [...shownList.children].forEach((node, i) => node.classList.toggle("fuad-chat-older", i < start));
        olderButton.hidden = start === 0;
        return start;
    };
    const load = async () => {
        const response = await mflFetch(feedUrl, {cache: "no-store"});
        if (!response.ok) {
            throw Object.assign(new Error(`the chat feed returned HTTP ${response.status}`), {status: response.status});
        }
        return readChat(await response.text(), {viewer: franchiseId});
    };
    const showMessages = (messages, list) => {
        const ids = messages.map((message) => message.id).join(",");
        // a refresh started before the card was drawn again answers for a list no longer on the page
        if (!list.isConnected || ids === drawnIds) {
            return;
        }
        drawnIds = ids;
        const today = dayText(Date.now() / 1000);
        list.innerHTML = messages.length
            ? messages.map((message) => {
                const mine = message.from === franchiseId;
                const to = !message.to ? "" : message.to === franchiseId ? "to you" : message.to === "0000" ? "to the commissioner" : `to ${teams.get(message.to) || "a team"}`;
                const when = message.at ? (dayText(message.at) === today ? clock(message.at) : `${dayText(message.at)}, ${clock(message.at)}`) : "";
                return `<div class="fuad-chat-message">
                    <div class="fuad-chat-head"><span class="fuad-chat-who"><span class="${mine ? "fuad-chat-mine" : ""}">${esc(teams.get(message.from) || "Commissioner")}</span>${to ? `<span class="fuad-tag">${LOCK}${esc(to)}</span>` : ""}</span><span class="fuad-meta">${esc(when)}</span></div>
                    <div>${esc(message.text)}</div>
                </div>`;
            }).join("")
            : '<p class="fuad-muted fuad-empty">No messages yet.</p>';
        shown = messages;
        shownList = list;
        list.classList.toggle("fuad-chat-list", messages.length > 0);
        list.scrollTop = list.scrollHeight;
        markOlder();
    };
    const render = (messages, body) => {
        drawnIds = null;
        const typed = mount.querySelector("#fuad-chat-input");
        const draft = typed ? {text: typed.value, to: mount.querySelector("#fuad-chat-to").value} : null;
        body.innerHTML = `
        <div class="fuad-chat-scroll"></div>
        <div class="fuad-chat-to"><label for="fuad-chat-to" class="fuad-meta">To</label>
            <select id="fuad-chat-to"><option value="">Everyone</option>${others.map(([id, name]) => `<option value="${esc(id)}">${esc(name)} (private)</option>`).join("")}</select></div>
        <form class="fuad-chat-form">
            <label for="fuad-chat-input" class="fuad-hidden">Message the league</label>
            <input id="fuad-chat-input" placeholder="Message the league" autocomplete="off" maxlength="500">
            <button type="submit" class="fuad-cta">Post</button>
        </form>
        <p class="fuad-result" role="status"></p>`;
        const list = body.querySelector(".fuad-chat-scroll");
        // again if drawPanel rebuilt the heading after a saved copy it couldn't draw
        if (!olderButton || !olderButton.isConnected) {
            olderButton = mount.querySelector(".fuad-chat-older-button");
            olderButton.addEventListener("click", () => {
                const start = markOlder();
                shownFrom = (shown[Math.max(0, start - PHONE_CHAT)] || {}).id || null;
                markOlder();
            });
        }
        const input = body.querySelector("input");
        const to = body.querySelector("select");
        const result = body.querySelector(".fuad-result");
        const placeholder = () => {
            input.placeholder = to.value ? `Message ${teams.get(to.value) || "the commissioner"}` : "Message the league";
        };
        to.addEventListener("change", placeholder);
        if (draft) {
            input.value = draft.text;
            to.value = draft.to;
            placeholder();
        }
        showMessages(messages, list);
        const refresh = () => load().then((fresh) => showMessages(fresh, list)).catch((error) => console.warn("[fuad] couldn't refresh chat:", error));
        body.querySelector("form").addEventListener("submit", async (event) => {
            event.preventDefault();
            const text = input.value.trim();
            if (!text) {
                return;
            }
            const button = body.querySelector("button[type=submit]");
            button.disabled = true;
            result.textContent = "";
            try {
                const url = `${window.location.origin}/${context.season}/chat_save?L=${context.leagueId}&MESSAGE=${encodeURIComponent(text)}&TO_FID=${encodeURIComponent(to.value)}`;
                const response = await fetch(url, {credentials: "same-origin", cache: "no-store"});
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                input.value = "";
                lastPost = Date.now();
                schedule();
                await refresh();
            } catch (error) {
                console.warn("[fuad] couldn't post to chat:", error);
                result.textContent = "Not sent. Try again.";
            } finally {
                button.disabled = false;
            }
        });
        const schedule = () => {
            clearTimeout(timer);
            timer = setTimeout(function poll() {
                if (Date.now() - lastPost > CHAT_IDLE || !document.documentElement.classList.contains("fuad-home-on")) {
                    timer = null;
                    return;
                }
                if (!document.hidden) {
                    refresh();
                }
                timer = setTimeout(poll, CHAT_POLL);
            }, CHAT_POLL);
        };
        schedule();
    };
    drawPanel(mount, {heading: "Chat", actions: '<button type="button" class="fuad-text-button fuad-chat-older-button" hidden>Older messages</button>', what: "chat", key: `fuad.home.chat.${context.season}.${franchiseId}`, rows: 3, load, render});
}

function drawBoard(mount, {context, loggedIn, loginHref, exp, boardHref, threadHref}) {
    // MFL's own page, for its formatting, email replies and Preview; its import drops line breaks
    const addHref = `${window.location.origin}/${context.season}/mb/topic_add.pl?bid=${encodeURIComponent(`${context.season}${context.leagueId}`)}`;
    const actions = `${boardHref ? `<a href="${esc(boardHref)}">All topics</a>` : ""}${loggedIn
        ? `<a class="fuad-chip" href="${esc(addHref)}">New topic</a>`
        : `<a href="${esc(loginHref)}">Log in to post</a>`}`;
    const load = async () => boardTopics(await exp("messageBoard", {COUNT: 20}));
    const render = (topics, body) => {
        body.innerHTML = topics.length
            ? `<ul class="fuad-rows">${topics.map((topic) => `<li><a class="fuad-topic" href="${esc(threadHref(topic.id))}"><span class="fuad-row-title">${esc(topic.title)}</span><span class="fuad-meta">${esc(topic.when)}</span></a></li>`).join("")}</ul>`
            : '<p class="fuad-muted fuad-empty">No topics yet.</p>';
    };
    // logged out the board's export isn't readable, so the topics come from MFL's own module on the
    // page, when the home page has it
    if (!loggedIn) {
        drawPanel(mount, {
            heading: "Message board",
            actions,
            what: "the message board",
            load: () => moduleTopics([...document.querySelectorAll("#message_board_summary td.topic a[href]")]
                .map((a) => ({href: a.href, text: a.textContent}))).slice(0, 5),
            render: (topics, body) => {
                body.innerHTML = topics.length
                    ? `<ul class="fuad-rows">${topics.map((topic) => `<li><a class="fuad-topic" href="${esc(threadHref(topic.id))}"><span class="fuad-row-title">${esc(topic.title)}</span></a></li>`).join("")}</ul>`
                    : "";
            }
        });
        return;
    }
    drawPanel(mount, {heading: "Message board", actions, what: "the message board", key: `fuad.home.board.${context.season}`, load, render});
}

// `league()` resolves to the league model (app.js), with `raw` holding the exports it was built from.
// `readings(league)` resolves to the contract lengths read from the board, or null. Resolves to
// whether League alerts, which hold the beta's way back, were drawn.
export function drawHome({context, franchiseId, league, readings = () => Promise.resolve(null), links, loginHref, inBeta = null, beta = null}) {
    const member = Boolean(franchiseId && franchiseId !== "0000");
    const loggedIn = Boolean(franchiseId);
    const base = `${window.location.origin}/${context.season}`;
    const exp = fetcher(context);
    const teams = new Map(Object.values(window.franchiseDatabase || {}).filter((team) => team.id && team.id !== "0000").map((team) => [team.id, team.name]));
    const boardHref = mflPage(/^message board$/i) || `${base}/options?L=${context.leagueId}&O=28`;
    const threadHref = (id) => `${base}/options?L=${context.leagueId}&O=28&TOPIC_ID=${encodeURIComponent(id)}`;
    const nowSeconds = () => Date.now() / 1000;

    const root = document.createElement("main");
    root.id = "fuad-home";
    const panels = layout(root, {loggedIn});
    const anchor = document.querySelector(".pagebody") || document.body;
    anchor.prepend(root);

    // the calendar needs a login; logged out, Coming up keeps the season's own dates
    const calendar = loggedIn ? exp("calendar", {}, {optional: true}) : Promise.resolve(null);
    const dates = Promise.all([calendar, exp("league", {}, {optional: true}).then(seasonWeeks)]).then(async ([found, season]) => {
        const weeks = new Set([1, TRADE_DEADLINE_WEEK, ...(season ? [season.playoffsStart, season.championship] : [])]);
        asArray(found && found.event).map((event) => Number(event.start_time)).filter((n) => n > 0 && n < 100).forEach((n) => weeks.add(n));
        const times = await kickoffs(context.season, [...weeks]);
        return {calendar: found, kickoffs: times, weeks: season, dates: calendarDates(found, times)};
    });
    const coming = () => dates.then(({calendar: found, dates: list, kickoffs: times, weeks}) => comingUp({dates: list, kickoffs: times, weeks, calendar: found, now: nowSeconds()}));

    if (member) {
        drawPanel(panels.alerts, {
            heading: "My alerts",
            actions: '<span class="fuad-meta fuad-alert-count"></span>',
            what: "my alerts",
            key: `fuad.home.alerts.${context.season}.${franchiseId}`,
            rows: 3,
            load: async () => {
                const built = await league();
                const week = Number(window.liveScoringWeek) || Number(built.week) || 1;
                const [timeline, live, schedule, waivers, trades, board, lengths, upcoming, draft] = await Promise.all([
                    dates,
                    exp("liveScoring", {W: week, DETAILS: 1}, {optional: true}),
                    exp("nflSchedule", {W: week}, {base: API_BASE, optional: true}),
                    exp("pendingWaivers", {}, {optional: true}),
                    exp("pendingTrades", {}, {optional: true}),
                    exp("messageBoard", {COUNT: 20}, {optional: true}),
                    readings(built).catch(() => null),
                    coming(),
                    // only before week 1 does the draft matter
                    dates.then(({kickoffs: times}) => (times.get(1) && nowSeconds() >= times.get(1) ? null : exp("draftResults", {}, {optional: true})))
                ]);
                const now = nowSeconds();
                const phase = homePhase({
                    now,
                    week1: timeline.kickoffs.get(1),
                    seasonOver: built.seasonOver,
                    drafted: draftPicked(draft),
                    cutDown: cutDownAt(timeline.calendar, context.season)
                });
                const topic = contractTopic(board);
                return myAlerts({
                    league: built,
                    franchiseId,
                    phase,
                    links: {...links, contracts: topic ? threadHref(topic.id) : boardHref},
                    lineup: live && schedule ? lineupOf({live, schedule, built, franchiseId, now}) : null,
                    groups: pendingGroups(waivers),
                    bidRun: nextBidRun(timeline.calendar, now),
                    trades: tradeOffers(trades, {franchiseId, players: built.players, teams}),
                    readings: lengths || new Map(),
                    coming: upcoming,
                    cutDown: cutDownAt(timeline.calendar, context.season),
                    now
                });
            },
            render: (alerts, body) => {
                panels.alerts.querySelector(".fuad-alert-count").textContent = alerts.length ? `${alerts.length} to do` : "";
                body.innerHTML = alerts.length
                    ? alertRows(alerts)
                    : `<div class="fuad-all-clear"><span class="fuad-mark fuad-tone-lime" aria-hidden="true">${CHECK}</span><span class="fuad-muted">All clear.</span></div>`;
            }
        });
    } else {
        drawPanel(panels.alerts, {
            heading: "My alerts",
            what: "my alerts",
            load: () => null,
            render: (value, body) => {
                body.innerHTML = loggedIn
                    ? '<p class="fuad-muted fuad-empty">Alerts are for members’ teams.</p>'
                    : `<div class="fuad-login-line"><span class="fuad-muted">Log in to see your alerts</span><a class="fuad-cta" href="${esc(loginHref)}">Log in</a></div>`;
            }
        });
    }

    const leagueShown = drawPanel(panels.league, {
        heading: "League alerts",
        actions: `<a href="${esc(`${base}/options?L=${encodeURIComponent(context.leagueId)}&O=26`)}">Rules</a>`,
        what: "league alerts",
        key: `fuad.home.league.${context.season}.${franchiseId || "guest"}`,
        rows: 2,
        load: async () => leagueAlerts(await league(), member ? franchiseId : null, {now: nowSeconds(), cutDown: cutDownAt((await dates.catch(() => ({}))).calendar, context.season)})
            .map((alert) => ({team: alert.franchise.teamName, franchiseId: alert.franchise.franchiseId, text: alert.text, figure: alert.figure, tone: alert.tone})),
        render: (alerts, body) => {
            body.innerHTML = `${alerts.length
                ? `<ul class="fuad-rows">${alerts.map((alert) => `<li><a class="fuad-league-alert" href="${esc(links.team(alert.franchiseId))}">
                    <span class="fuad-row-text"><span class="fuad-row-title">${esc(alert.team)}</span><span class="fuad-meta">${esc(alert.text)}</span></span>
                    <span class="fuad-figure fuad-text-${esc(alert.tone)}">${esc(alert.figure)}</span></a></li>`).join("")}</ul>`
                : '<p class="fuad-muted fuad-empty">All clear.</p>'}${betaLine({inBeta, beta})}`;
        }
    });

    if (panels.chat) {
        drawChat(panels.chat, {context, franchiseId, teams});
    }
    drawBoard(panels.board, {context, loggedIn, loginHref, exp, boardHref, threadHref});

    const allMoves = mflPage(/^transactions$/i);
    const allBids = mflPage(/^processed waivers$/i) || `${base}/processed_waivers?L=${context.leagueId}`;
    const rows = moveRows({context, players: () => league().then((built) => built.players), teams, teamHref: links.team, withBids: loggedIn});
    rows.listen(panels.recent);
    drawPanel(panels.recent, {
        heading: "Recent moves",
        actions: [allMoves && `<a href="${esc(allMoves)}">All moves</a>`, loggedIn && `<a href="${esc(allBids)}">All bids</a>`].filter(Boolean).join(""),
        what: "recent moves",
        key: `fuad.home.recent.${context.season}`,
        rows: 5,
        load: async () => {
            const built = await league();
            return recentMoves(built.raw.transactions, {players: built.players, franchises: built.franchises});
        },
        render: (moves, body) => {
            body.innerHTML = moves.length ? rows.markup(moves) : '<p class="fuad-muted fuad-empty">No moves yet.</p>';
            rows.fill(body, moves);
        }
    });

    drawPanel(panels.coming, {
        heading: "Coming up",
        what: "coming up",
        key: `fuad.home.dates.${context.season}.${loggedIn ? "member" : "guest"}`,
        // every date, a to-do close by in My alerts too, so a date never depends on My alerts loading
        load: coming,
        render: (list, body) => {
            body.innerHTML = list.length
                ? `<ul class="fuad-rows">${list.map((date) => `<li class="fuad-date"><span class="fuad-row-text"><span class="fuad-row-title">${esc(date.what)}</span>${date.detail ? `<span class="fuad-meta">${esc(date.detail)}</span>` : ""}</span><span class="fuad-meta">${esc(date.when)}</span></li>`).join("")}</ul>`
                : '<p class="fuad-muted fuad-empty">Nothing on the calendar.</p>';
        }
    });

    // drawPanel resolves to null when the load failed with nothing cached
    return {root, shown: leagueShown.then((value) => value !== null, () => false)};
}

// the viewer's starters this week from MFL's live scoring, and the week's NFL kickoffs by team
function lineupOf({live, schedule, built, franchiseId, now}) {
    const entry = asArray(live.matchup).flatMap((matchup) => asArray(matchup.franchise)).concat(asArray(live.franchise))
        .find((franchise) => franchise.id === franchiseId);
    if (!entry) {
        return null;
    }
    const starters = asArray(entry.players && entry.players.player).filter((player) => player.status === "starter")
        .map((player) => built.players.get(player.id)).filter(Boolean);
    const kickoffs = new Map();
    for (const matchup of asArray(schedule.matchup)) {
        for (const team of asArray(matchup.team)) {
            kickoffs.set(team.id, Number(matchup.kickoff));
        }
    }
    return {problems: lineupProblems({starters, kickoffs, now}), starters: starters.length, required: Number((built.raw.league.starters || {}).count) || 0};
}
