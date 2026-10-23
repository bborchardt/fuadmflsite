// Recent moves' rows, on Home and on All moves (MFL's Transactions page). A won bid opens to the
// run's other bids, read from MFL's processed waivers page, which needs a login; a processed run
// doesn't change, so it's kept.

import {esc} from "./html.js";
import {cached} from "./store.js";
import {pageFetch} from "./page-fetch.js";
import {otherBids, readBidRun} from "./bids-model.js";

const YEAR = 365 * 24 * 60 * 60 * 1000;
const CHEVRON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>';

export const yearsText = (years) => (years ? ` · ${years} yr${years === 1 ? "" : "s"}` : "");

// a run's groups (bids-model.js), by its period
export function bidRuns({season, leagueId}) {
    return (period) => cached(`fuad.bids.${season}.${period}`, YEAR, async () => {
        const response = await pageFetch(`${window.location.origin}/${season}/processed_waivers?LEAGUE_ID=${leagueId}&PERIOD=${encodeURIComponent(period)}`, {credentials: "include"});
        if (!response.ok) {
            throw Object.assign(new Error(`HTTP ${response.status}`), {status: response.status});
        }
        const groups = readBidRun(await response.text());
        if (!groups) {
            throw new Error("MFL's processed waivers page has no waiver table");
        }
        return groups;
    });
}

// `players()` resolves to v2's players (for a bid's player's name), `teams` maps team ids to names;
// a bid opens only when `expandable` (logged in). `id` keeps the rows' element ids apart.
export function moveRows({context, players, teams, expandable, id = "moves"}) {
    const bidRun = bidRuns(context);
    const open = new Set();
    const shown = new Map();
    const keyOf = (bid) => `${bid.period}-${bid.player}`;

    const bidsMarkup = async (bid) => {
        const [groups, known] = await Promise.all([bidRun(bid.period), players()]);
        const player = known.get(bid.player);
        const bids = player ? otherBids(groups, player.fullName, bid.team) : [];
        return bids.length
            ? `<ul class="fuad-bid-list">${bids.map((entry) => `<li><span>${esc(teams.get(entry.team) || `Team ${entry.team}`)}</span><span class="fuad-bid-amount">$${entry.amount}${yearsText(entry.years)}</span></li>`).join("")}</ul>`
            : '<p class="fuad-meta">No other bids</p>';
    };

    const showBids = (row, bid) => {
        const box = row.querySelector(".fuad-bids");
        const key = keyOf(bid);
        if (shown.has(key)) {
            box.innerHTML = shown.get(key);
            return;
        }
        box.innerHTML = '<p class="fuad-meta">Loading…</p>';
        bidsMarkup(bid).then((markup) => {
            shown.set(key, markup);
            if (row.isConnected) {
                box.innerHTML = markup;
            }
        }, (error) => {
            console.warn("[fuad] couldn't load the run's other bids:", error);
            if (row.isConnected) {
                box.innerHTML = `<p class="fuad-meta">${error.status === 429 ? "MFL asked us to wait. Try again in a minute." : "Couldn't load the other bids."}</p>`;
            }
        });
    };

    const text = (move, when) => `<span class="fuad-row-text"><span><strong>${esc(move.team)}</strong> ${esc(move.what)}</span>${when ? `<span class="fuad-meta">${esc(move.when)}</span>` : ""}</span>`;
    return {
        // `when` adds each move's day under it (Home; All moves heads each day instead); `group` keeps
        // several lists' element ids apart
        markup(moves, {when = true, group = ""} = {}) {
            return `<ul class="fuad-rows">${moves.map((move, i) => {
                if (!(move.bid && expandable)) {
                    return `<li class="fuad-move"><span class="fuad-label">${esc(move.kind)}</span>${text(move, when)}</li>`;
                }
                const isOpen = open.has(keyOf(move.bid));
                return `<li class="fuad-move fuad-move-bid" data-move="${i}"><span class="fuad-label">${esc(move.kind)}</span>
                    <button type="button" class="fuad-move-toggle" aria-expanded="${isOpen}" aria-controls="fuad-${id}${group}-bids-${i}">${text(move, when)}<span class="fuad-move-chev" aria-hidden="true">${CHEVRON}</span></button>
                    <div class="fuad-bids" id="fuad-${id}${group}-bids-${i}"${isOpen ? "" : " hidden"}></div></li>`;
            }).join("")}</ul>`;
        },
        // after `markup(moves)` is in `container`: the bid rows open and close, and those open show
        wire(container, moves) {
            container.querySelectorAll(".fuad-move-bid").forEach((item) => {
                const bid = moves[Number(item.dataset.move)].bid;
                const toggle = item.querySelector(".fuad-move-toggle");
                if (open.has(keyOf(bid))) {
                    showBids(item, bid);
                }
                toggle.addEventListener("click", () => {
                    const opening = toggle.getAttribute("aria-expanded") !== "true";
                    toggle.setAttribute("aria-expanded", String(opening));
                    item.querySelector(".fuad-bids").hidden = !opening;
                    open[opening ? "add" : "delete"](keyOf(bid));
                    if (opening) {
                        showBids(item, bid);
                    }
                });
            });
        }
    };
}
