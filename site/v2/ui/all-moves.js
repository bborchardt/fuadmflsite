// All moves and All bids: MFL's Transactions page (`options?O=03`) and Previously Processed Waivers
// page (`processed_waivers`), each with v2's own view over it, reached from Home's Recent moves.
// All moves draws the season's transactions in Recent moves' rows; All bids reads the run from the
// page itself, so anything v2 can't read leaves MFL's page as it is.

import {API_BASE, displayName, exportUrl, fetchExport} from "../lib/mfl.js";
import {playersFromExport} from "../lib/league.js";
import {esc} from "./html.js";
import {drawPanel} from "./panel.js";
import {cached} from "./store.js";
import {mflFetch, pageFetch} from "./page-fetch.js";
import {recentMoves} from "./home-model.js";
import {moveRows, yearsText} from "./move-rows.js";
import {readBidRun, runPlayers} from "./bids-model.js";

const DAY = 24 * 60 * 60 * 1000;
const KINDS = [["All", null], ["Adds", "Add"], ["Drops", "Drop"], ["Bids", "Bid"], ["Trades", "Trade"], ["IR", "IR"]];
const CHEVRON_DOWN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>';

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

// today's teams by id, from MFL's page
function teamNames() {
    return new Map(Object.values(window.franchiseDatabase || {}).filter((team) => team.id && team.id !== "0000").map((team) => [team.id, String(team.name).trim()]));
}

// a link in MFL's own menu, found by its text
function menuLink(pattern) {
    const link = [...document.querySelectorAll("a[href]")].find((a) => pattern.test(a.textContent.replace(/\s+/g, " ").trim()));
    return link ? link.href : null;
}

const allBidsHref = ({season, leagueId}) => menuLink(/^processed waivers$/i) || `${window.location.origin}/${season}/processed_waivers?L=${leagueId}`;
const allMovesHref = ({season, leagueId}) => menuLink(/^transactions$/i) || `${window.location.origin}/${season}/options?L=${leagueId}&O=03`;

function players(season) {
    return cached(`fuad.players.${season}`, DAY, async () => ({player: (await fetchExport(exportUrl(API_BASE, season, "players"), "players", {fetchImpl: mflFetch})).player}))
        .then(playersFromExport);
}

const transactions = ({season, leagueId}) => fetchExport(exportUrl(window.location.origin, season, "transactions", {L: leagueId}), "transactions", {fetchImpl: pageFetch, init: {cache: "no-store"}});

// v2's view at the top of MFL's page body, MFL's own content hidden under it (fuad.css)
function mountOn(id, className) {
    const body = document.querySelector(".pagebody");
    if (!body) {
        return null;
    }
    const mount = document.createElement("div");
    mount.id = id;
    body.prepend(mount);
    document.documentElement.classList.add(className);
    return mount;
}

function head(title, meta, link) {
    return `<div class="fuad-page-head">
        <div class="fuad-page-title"><h2>${esc(title)}</h2><span class="fuad-meta" data-meta>${esc(meta)}</span></div>
        ${link ? `<a class="fuad-page-link" href="${esc(link.href)}">${esc(link.text)} ›</a>` : ""}
    </div>`;
}

// ---- All moves ----

export function drawAllMoves({context, franchiseId}) {
    if (franchiseId === "0000") {
        return;
    }
    const mount = mountOn("fuad-all-moves", "fuad-all-moves-on");
    if (!mount) {
        return;
    }
    const teams = teamNames();
    const state = {team: "", kind: null};
    const known = () => players(context.season);
    const rows = moveRows({context, players: known, teams, expandable: Boolean(franchiseId), id: "all"});
    mount.innerHTML = `${head("All moves", "", franchiseId ? {text: "All bids", href: allBidsHref(context)} : null)}
        <div class="fuad-moves-filters">
            <label class="fuad-select"><span class="fuad-hidden">Team</span><select data-team>
                <option value="">All teams</option>${[...teams].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join("")}
            </select>${CHEVRON_DOWN}</label>
            <div class="fuad-chip-row-group" role="group" aria-label="Kind">${KINDS.map(([label, kind]) => `<button type="button" class="fuad-filter" aria-pressed="${kind === null}" data-kind="${kind || ""}">${esc(label)}</button>`).join("")}</div>
        </div>
        <section class="fuad-panel fuad-moves-days" aria-label="Moves"></section>`;
    const list = mount.querySelector(".fuad-moves-days");
    const meta = mount.querySelector("[data-meta]");
    let all = [];

    const show = () => {
        const shown = all.filter((move) => (!state.team || move.teamIds.includes(state.team)) && (!state.kind || move.kind === state.kind));
        meta.textContent = plural(shown.length, "move");
        const days = [];
        shown.forEach((move) => {
            if (!days.length || days[days.length - 1].when !== move.when) {
                days.push({when: move.when, moves: []});
            }
            days[days.length - 1].moves.push(move);
        });
        const body = list.querySelector(".fuad-panel-body");
        body.innerHTML = days.length
            ? days.map((day, i) => `<div class="fuad-moves-day" data-day="${i}"><h3 class="fuad-label">${esc(day.when)}</h3>${rows.markup(day.moves, {when: false, group: `-${i}`})}</div>`).join("")
            : '<p class="fuad-muted fuad-empty">No moves.</p>';
        days.forEach((day, i) => rows.wire(body.querySelector(`[data-day="${i}"]`), day.moves));
    };

    mount.querySelector("[data-team]").addEventListener("change", (event) => {
        state.team = event.target.value;
        show();
    });
    mount.querySelector("[role=group]").addEventListener("click", (event) => {
        const chip = event.target.closest("[data-kind]");
        if (!chip) {
            return;
        }
        state.kind = chip.dataset.kind || null;
        mount.querySelectorAll("[data-kind]").forEach((button) => button.setAttribute("aria-pressed", String(button === chip)));
        show();
    });

    drawPanel(list, {
        what: "the moves", rows: 8,
        load: async () => {
            const [found, knownPlayers] = await Promise.all([transactions(context), known()]);
            const franchises = new Map([...teams].map(([id, name]) => [id, {teamName: name}]));
            return recentMoves(found, {players: knownPlayers, franchises, limit: Infinity});
        },
        render: (moves) => {
            all = moves;
            show();
        }
    });
}

// ---- All bids ----

// "Wed Oct 1 11:00:00 p.m. CT 2025" → {day: "Wed Oct 1", time: "11 p.m."}
function runLabel(text) {
    const match = /^(\w+ \w+ \d+) (\d+):(\d+):\d+ ([ap])\.m\./.exec(String(text).trim());
    return match ? {day: match[1], time: `${match[2]}${match[3] === "00" ? "" : `:${match[3]}`} ${match[4]}.m.`} : {day: String(text).trim(), time: ""};
}

// the bids MFL awarded that have no won-bid transaction for that team and player: the commissioner
// voided them, deleting the transaction (docs/design.md)
async function voided(context, period, list) {
    const [found, known] = await Promise.all([transactions(context), players(context.season)]);
    const wins = new Set([].concat(found && found.transaction || [])
        .filter((transaction) => transaction.type === "BBID_WAIVER" && Number(transaction.timestamp) === Number(period))
        .map((transaction) => {
            const player = known.get(String(transaction.transaction || "").split("|")[0].split(",")[0]);
            return player ? `${transaction.franchise}|${player.fullName}` : null;
        }).filter(Boolean));
    return new Set(list.filter((player) => player.won && !wins.has(`${player.won.team}|${displayName(player.name)}`)).map((player) => player.name));
}

function bidItem(bid, teams, {won = false, tag = ""} = {}) {
    return `<li class="${won ? "fuad-run-won" : ""}">
        <span class="fuad-run-team">${esc(teams.get(bid.team) || `Team ${bid.team}`)}${tag}</span>
        <span class="fuad-run-amount">$${bid.amount}<span class="fuad-meta">${esc(yearsText(bid.years))}${bid.reason ? ` · ${esc(bid.reason)}` : ""}</span></span>
    </li>`;
}

function playerBlock(player, teams, {isVoided}) {
    const count = (player.won ? 1 : 0) + player.bids.length;
    const top = player.won
        ? bidItem(player.won, teams, {won: true, tag: isVoided ? '<span class="fuad-tag fuad-tag-muted">Voided</span>' : '<span class="fuad-tag fuad-tag-lime">Won</span>'})
        : '<li class="fuad-run-none"><span class="fuad-muted">Not awarded</span></li>';
    return `<section class="fuad-panel fuad-run-player">
        <div class="fuad-run-who"><h3>${esc(displayName(player.name))}</h3><span class="fuad-meta">${esc([player.position, player.nfl, plural(count, "bid")].join(" · "))}</span></div>
        <ul class="fuad-run-bids">${top}${player.bids.map((bid) => bidItem(bid, teams)).join("")}</ul>
    </section>`;
}

// Resolves to false, leaving MFL's page, when the page isn't one v2 can read (logged out, or changed)
export function drawAllBids({context, franchiseId}) {
    if (franchiseId === "0000") {
        return false;
    }
    const groups = readBidRun(document.body.innerHTML);
    const select = document.querySelector("select[name=PERIOD]");
    if (!groups || !select || !select.options.length) {
        return false;
    }
    const mount = mountOn("fuad-all-bids", "fuad-all-bids-on");
    if (!mount) {
        return false;
    }
    const teams = teamNames();
    const options = [...select.options];
    const at = Math.max(0, options.findIndex((option) => option.selected));
    const period = options[at].value;
    const label = runLabel(options[at].textContent);
    const list = runPlayers(groups);
    const bids = list.reduce((sum, player) => sum + (player.won ? 1 : 0) + player.bids.length, 0);
    // another run is MFL's own form with that run picked
    const runHref = (option) => {
        if (!option) {
            return null;
        }
        const form = select.form;
        if (form && form.action) {
            const fields = new URLSearchParams(new FormData(form));
            fields.set("PERIOD", option.value);
            return `${form.action.split("?")[0]}?${fields}`;
        }
        return `${window.location.origin}/${context.season}/processed_waivers?LEAGUE_ID=${context.leagueId}&PERIOD=${encodeURIComponent(option.value)}`;
    };
    // the list is newest first: earlier runs further down
    const earlier = runHref(options[at + 1]);
    const later = runHref(options[at - 1]);
    const draw = (gone = new Set()) => {
        mount.innerHTML = `${head("All bids", plural(options.length, "bid run"), {text: "All moves", href: allMovesHref(context)})}
            <div class="fuad-run-picker">
                ${earlier ? `<a class="fuad-step" href="${esc(earlier)}" aria-label="Earlier run">‹</a>` : '<span class="fuad-step" aria-hidden="true"></span>'}
                <div class="fuad-week-label"><span class="fuad-week-name">${esc(label.day)}</span><span class="fuad-label">${esc([label.time, plural(bids, "bid")].filter(Boolean).join(" · "))}</span></div>
                ${later ? `<a class="fuad-step" href="${esc(later)}" aria-label="Later run">›</a>` : '<span class="fuad-step" aria-hidden="true"></span>'}
            </div>
            ${list.length ? list.map((player) => playerBlock(player, teams, {isVoided: gone.has(player.name)})).join("") : '<section class="fuad-panel"><p class="fuad-muted fuad-empty">No bids in this run.</p></section>'}`;
    };
    draw();
    // voided bids once the transactions arrive; without them the run shows as MFL has it
    voided(context, period, list).then((gone) => {
        if (gone.size) {
            draw(gone);
        }
    }).catch((error) => console.warn("[fuad] couldn't check the run for voided bids:", error));
    return true;
}
