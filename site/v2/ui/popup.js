// v2's player popup, in place of MFL's (`launch_player_modal`), which is desktop markup that doesn't
// fit a phone: the player, his contract, news, this season by week, his bio. Information only,
// except opened from Rosters (`window.fuadOpenPlayer`), where it offers the move that fits: Drop
// and IR for the member's own, Propose a trade for another team's, Add for a free agent.

import {API_BASE, asArray, exportUrl, fetchExport} from "../lib/mfl.js";
import {buildLeague, playersFromExport} from "../lib/league.js";
import {capPenalty} from "../lib/rules.js";
import {NFL_TEAMS, holderOf, readArticle, readPlayerPage} from "./player-page.js";
import {openDialog} from "./dialog.js";
import {drawPanel} from "./panel.js";
import {cached} from "./store.js";
import {mflFetch, pageFetch} from "./page-fetch.js";
import {esc} from "./html.js";
import {setWatched, watchList, watchState} from "./watch.js";

const DAY = 24 * 60 * 60 * 1000;
const CAP_AGE = 2 * 60 * 1000;

const STAR = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.7l5.9-.9z"></path></svg>';
const CLOSE_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>';

const money = (amount) => `$${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
const yearsText = (years) => `${years} yr${years === 1 ? "" : "s"}`;
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;

// Out, IR and suspended read as over a limit; doubtful and questionable as caution
function injuryTone(status) {
    return /^(out|ir|suspended|pup|nfi)/i.test(status) ? "bad" : "caution";
}

// "Beck, Carson ARI QB" from MFL's link, until the page arrives
function nameFromLink(label) {
    const match = String(label || "").trim().match(/^([^,]+),\s*(.+?)\s+[A-Z]{2,3}\s+[A-Z]{1,3}\b/);
    return match ? `${match[2]} ${match[1]}` : "";
}

async function page(url) {
    const response = await mflFetch(url, {credentials: "include"});
    if (!response.ok) {
        throw Object.assign(new Error(`HTTP ${response.status}`), {status: response.status});
    }
    return response.text();
}

// the page's own league load, when it has one (page-fetch.js)
function leagueExport({season, leagueId}, type) {
    return fetchExport(exportUrl(window.location.origin, season, type, {L: leagueId}), type, {fetchImpl: pageFetch, init: {cache: "no-store"}});
}

// player id → the team holding him (holderOf), or null when the rosters can't be had
function holders(context) {
    return leagueExport(context, "rosters")
        .then((rosters) => new Map(asArray(rosters.franchise).flatMap((team) => asArray(team.player).map((player) => [player.id, team.id]))))
        .catch((error) => {
            console.warn("[fuad] couldn't load the rosters for the popup:", error);
            return null;
        });
}

// the viewer's cap used, for "Cut now"; kept a couple of minutes, since it's only shown, not checked
function capUsed(context, franchiseId) {
    const {season} = context;
    const league = (type) => leagueExport(context, type);
    return cached(`fuad.capUsed.${season}.${franchiseId}`, CAP_AGE, async () => {
        const [players, leagueInfo, rosters, salaryAdjustments, transactions, freeAgents] = await Promise.all([
            cached(`fuad.players.${season}`, DAY, async () => ({player: (await fetchExport(exportUrl(API_BASE, season, "players"), "players", {fetchImpl: mflFetch})).player})),
            league("league"), league("rosters"), league("salaryAdjustments"), league("transactions"), league("freeAgents")
        ]);
        const built = buildLeague({players: playersFromExport(players), league: leagueInfo, rosters, salaryAdjustments, transactions, freeAgents});
        const franchise = built.franchises.get(franchiseId);
        return franchise ? franchise.capTotal : null;
    });
}

function tile(label, value) {
    return `<div class="fuad-tile"><span class="fuad-label">${esc(label)}</span><span class="fuad-tile-value">${esc(value)}</span></div>`;
}

function weeksSection(player, season, currentWeek) {
    const shown = player.rows.filter((row) => row.points !== null || row.week <= currentWeek);
    if (!shown.length) {
        return "";
    }
    const played = shown.filter((row) => row.points !== null);
    const total = player.total !== null ? player.total : played.reduce((sum, row) => sum + row.points, 0);
    const max = Math.max(1, ...played.map((row) => row.points));
    const summary = played.length ? `${total.toFixed(1)} pts · ${(total / played.length).toFixed(1)} avg` : "";
    return `
    <section class="fuad-popup-weeks" aria-labelledby="fuad-popup-weeks">
        <h3 id="fuad-popup-weeks" class="fuad-label fuad-popup-subhead"><span>${esc(season)} by week</span><span class="fuad-popup-sum">${esc(summary)}</span></h3>
        ${shown.map((row) => `
        <div class="fuad-week">
            <span class="fuad-muted">Wk ${row.week}</span>
            <span>${row.bye ? "Bye" : esc(row.opponent)}</span>
            ${row.points !== null
                ? `<span class="fuad-bar" aria-hidden="true"><span style="width: ${Math.round(Math.max(0, row.points) / max * 100)}%"></span></span><span class="fuad-week-pts">${row.points.toFixed(1)}</span>`
                : `<span class="${row.mark && injuryTone(row.mark) === "bad" ? "fuad-bad" : "fuad-muted"}">${esc(row.bye ? "" : row.mark || "")}</span><span class="fuad-week-pts fuad-faint">${row.bye || row.mark ? "" : "—"}</span>`}
        </div>`).join("")}
    </section>`;
}

function bioSection(player) {
    const {bio} = player;
    const rows = [
        ["Age", bio.age ? `${bio.age}${bio.born ? ` · born ${bio.born}` : ""}` : bio.born],
        ["Size", bio.size],
        ["College", bio.college],
        ["Drafted", [bio.drafted && bio.drafted.year, bio.drafted && bio.drafted.pick, bio.experience && `${ordinal(Number(bio.experience))} season`].filter(Boolean).join(" · ")]
    ].filter(([, value]) => value);
    return rows.length ? `
    <section aria-labelledby="fuad-popup-bio">
        <h3 id="fuad-popup-bio" class="fuad-label fuad-popup-subhead">Bio</h3>
        <dl class="fuad-bio">${rows.map(([label, value]) => `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join("")}</dl>
    </section>` : "";
}

function newsSection(player, links) {
    if (!player.news.length) {
        return "";
    }
    return `
    <section aria-labelledby="fuad-popup-news">
        <h3 id="fuad-popup-news" class="fuad-label fuad-popup-subhead">News</h3>
        ${player.news.map((item, index) => `
        <div class="fuad-news">
            <button type="button" class="fuad-news-toggle" aria-expanded="false" aria-controls="fuad-news-${index}" data-article="${esc(item.id)}">
                <span><span class="fuad-news-headline">${esc(item.headline)}</span><span class="fuad-meta">${esc(item.published)} ago</span></span>
                <span class="fuad-meta" aria-hidden="true">Read</span>
            </button>
            <div class="fuad-news-body" id="fuad-news-${index}" hidden></div>
        </div>`).join("")}
        <a class="fuad-more" href="${esc(links.moreNews)}">More news</a>
    </section>`;
}

// `actions` holds the Moves links: {drop(playerId), ir(playerId), add(playerId), trade(teamId, playerId)}
function actionButtons(player, {mine, ownerId, actions, franchiseId}) {
    if (!actions || !franchiseId || franchiseId === "0000") {
        return "";
    }
    const links = mine
        ? [["Drop", actions.drop && actions.drop(player.id)], ...(player.injury && /^IR/i.test(player.injury.status) ? [["IR", actions.ir && actions.ir(player.id)]] : [])]
        : ownerId ? [["Propose a trade", actions.trade && actions.trade(ownerId, player.id)]]
        : [["Add", actions.add && actions.add(player.id)]];
    const shown = links.filter(([, href]) => href);
    return shown.length ? `<div class="fuad-popup-actions">${shown.map(([label, href]) => `<a class="fuad-button fuad-button-outline" href="${esc(href)}">${esc(label)}</a>`).join("")}</div>` : "";
}

function drawPlayer(body, player, {context, franchiseId, teamNames, currentWeek, actions = null}) {
    const ownerId = holderOf(player, player.holders, teamNames);
    const ownerName = ownerId ? teamNames.get(ownerId) || "" : "";
    const mine = Boolean(franchiseId && ownerId === franchiseId);
    const links = {moreNews: `${window.location.origin}/${context.season}/news_articles?L=${context.leagueId}&PLAYERS=${player.id}&DAYS=7`};
    const injured = player.injury
        ? `<p class="fuad-popup-injury"><span class="fuad-tag fuad-tag-${injuryTone(player.injury.status)}">${esc(player.injury.status)}${player.injury.detail ? ` · ${esc(player.injury.detail)}` : ""}</span>${player.expectedReturn ? `<span class="fuad-meta">Expected back ${esc(player.expectedReturn.replace(/,\s*\d{4}$/, ""))}</span>` : ""}</p>`
        : "";
    const contract = ownerName ? [
        tile("Owner", mine ? "Yours" : ownerName),
        tile("Salary", player.salary === null ? "—" : money(player.salary)),
        tile("Years", player.years === null ? "—" : yearsText(player.years))
    ] : [tile("Owner", "Free agent"), tile("Salary", "—"), tile("Years", "—")];
    body.innerHTML = `
    ${injured}
    <section class="fuad-tiles" aria-label="Contract">${contract.join("")}${tile("Bye", player.bye ? `Week ${player.bye}` : "—")}</section>
    ${mine && player.salary !== null && player.years ? `<p class="fuad-cut" aria-live="polite">Cut now: <strong>${money(capPenalty(player.years, player.salary))} penalty</strong><span class="fuad-cut-cap"></span></p>` : ""}
    ${actionButtons(player, {mine, ownerId, actions, franchiseId})}
    <div class="fuad-popup-cols">
        <div class="fuad-popup-col">${newsSection(player, links)}${bioSection(player)}</div>
        <div class="fuad-popup-col">${weeksSection(player, context.season, currentWeek)}</div>
    </div>`;

    const cut = body.querySelector(".fuad-cut-cap");
    if (cut) {
        capUsed(context, franchiseId).then((used) => {
            if (used === null) {
                return;
            }
            const after = Math.round((used - player.salary + capPenalty(player.years, player.salary)) * 100) / 100;
            const tone = after < used ? "fuad-good" : after > used ? "fuad-bad" : "";
            cut.innerHTML = ` · cap used ${money(used)} → <strong class="${tone}">${money(after)}</strong>`;
        }).catch((error) => console.warn("[fuad] couldn't load cap used for the popup:", error));
    }

    body.querySelectorAll(".fuad-news-toggle").forEach((button, index) => {
        const panel = body.querySelector(`#${button.getAttribute("aria-controls")}`);
        let loaded = false;
        const toggle = (open) => {
            button.setAttribute("aria-expanded", String(open));
            button.lastElementChild.textContent = open ? "Hide" : "Read";
            panel.hidden = !open;
            if (open && !loaded) {
                loaded = true;
                drawPanel(panel, {
                    what: "this article",
                    rows: 3,
                    load: async () => {
                        const article = readArticle(await page(`${window.location.origin}/${context.season}/view_news_article?L=${context.leagueId}&ID=${encodeURIComponent(button.dataset.article)}`));
                        if (!article) {
                            throw new Error("the article page wasn't readable");
                        }
                        return article;
                    },
                    render: (article, mount) => {
                        mount.innerHTML = `
                        <span class="fuad-meta">${esc([article.source, article.published].filter(Boolean).join(" · "))}</span>
                        <p>${esc(article.update)}</p>
                        ${article.analysis ? `<span class="fuad-label">Analysis</span><p>${esc(article.analysis)}</p>` : ""}`;
                    }
                });
            }
        };
        button.addEventListener("click", () => toggle(button.getAttribute("aria-expanded") !== "true"));
        // the newest open at first
        if (index === 0) {
            toggle(true);
        }
    });
}

export function installPopup({context, franchiseId}) {
    const member = Boolean(franchiseId && franchiseId !== "0000");
    const mflModal = window.launch_player_modal;
    const teamNames = new Map(Object.values(window.franchiseDatabase || {}).map((team) => [team.id, team.name]));
    const players = new Map();

    const layer = document.createElement("div");
    layer.className = "fuad-layer fuad-popup-layer";
    layer.hidden = true;
    document.body.append(layer);

    function open(playerId, opener, {actions = null} = {}) {
        const label = opener && opener.textContent;
        layer.innerHTML = `
        <section class="fuad-popup" role="dialog" aria-modal="true" aria-labelledby="fuad-popup-name" tabindex="-1">
            <span class="fuad-grabber" aria-hidden="true"></span>
            <div class="fuad-popup-head">
                <div class="fuad-popup-title">
                    <h2 id="fuad-popup-name">${esc(nameFromLink(label) || "Player")}</h2>
                    <span class="fuad-meta fuad-popup-meta"></span>
                </div>
                ${member ? `<button type="button" class="fuad-watch" aria-pressed="false" aria-label="Watch" hidden>${STAR}</button>` : ""}
                <button type="button" class="fuad-close" data-close aria-label="Close">${CLOSE_ICON}</button>
            </div>
            <p class="fuad-meta fuad-watch-note" role="status"></p>
            <div class="fuad-popup-body"></div>
        </section>`;
        const close = openDialog(layer, {opener});
        // the member's watch list: a star by the name, shown once the list is known
        const star = layer.querySelector(".fuad-watch");
        if (star) {
            const note = layer.querySelector(".fuad-watch-note");
            const show = (on) => {
                star.setAttribute("aria-pressed", String(on));
                star.setAttribute("aria-label", on ? "Watching" : "Watch");
            };
            watchList(context).then((list) => {
                // a change still on its way to MFL shows as made, and waits for MFL's answer
                const {on, done} = watchState(list, playerId);
                show(on);
                star.hidden = false;
                if (done) {
                    star.disabled = true;
                    done.then(() => {
                        if (star.isConnected) {
                            show(list.has(playerId));
                            star.disabled = false;
                        }
                    });
                }
            }, (error) => console.warn("[fuad] couldn't load the watch list:", error));
            star.addEventListener("click", () => {
                const on = star.getAttribute("aria-pressed") !== "true";
                show(on);
                star.disabled = true;
                note.textContent = "";
                setWatched(context, playerId, on).catch((error) => {
                    console.warn("[fuad] couldn't update the watch list:", error);
                    show(!on);
                    note.textContent = error.status === 429 ? "MFL asked us to wait. Try again in a minute." : "Couldn't update your watch list.";
                }).finally(() => {
                    star.disabled = false;
                });
            });
        }
        const dialog = layer.querySelector(".fuad-popup");
        drawPanel(layer.querySelector(".fuad-popup-body"), {
            what: "this player",
            rows: 6,
            load: async () => {
                const held = holders(context);
                if (!players.has(playerId)) {
                    const player = readPlayerPage(await page(`${window.location.origin}/${context.season}/player?L=${context.leagueId}&P=${encodeURIComponent(playerId)}`));
                    if (!player) {
                        return {unreadable: true};
                    }
                    player.id = playerId;
                    players.set(playerId, player);
                }
                return {...players.get(playerId), holders: await held};
            },
            render: (player, body) => {
                if (player.unreadable) {
                    // MFL changed its page: its own popup still works
                    close({restore: false});
                    if (typeof mflModal === "function") {
                        mflModal(context.leagueId, playerId);
                    }
                    return;
                }
                dialog.querySelector("h2").textContent = player.name;
                dialog.querySelector(".fuad-popup-meta").textContent = [player.position, NFL_TEAMS[player.team] || player.team, player.jersey && `#${player.jersey}`].filter(Boolean).join(" · ");
                drawPlayer(body, player, {context, franchiseId, teamNames, currentWeek: Number(window.liveScoringWeek) || 0, actions});
            }
        });
    }

    // the link that called it: Safari doesn't focus a tapped link
    let clicked = null;
    document.addEventListener("click", (event) => {
        clicked = event.target.closest && event.target.closest('a[href*="launch_player_modal"]');
    }, true);
    window.launch_player_modal = (leagueId, playerId) => {
        open(String(playerId), clicked || document.activeElement);
        clicked = null;
    };
    window.fuadOpenPlayer = (playerId, {opener = document.activeElement, actions = null} = {}) => open(String(playerId), opener, {actions});
    return {open};
}
