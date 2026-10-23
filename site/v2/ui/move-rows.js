// Recent moves' rows, on Home and on All moves (MFL's Transactions page). A won bid shows the run's
// other bids, read from MFL's processed waivers page, which needs a login; a processed run doesn't
// change, so it's kept.

import {esc} from "./html.js";
import {cached} from "./store.js";
import {pageFetch} from "./page-fetch.js";
import {otherBids, readBidRun} from "./bids-model.js";

const YEAR = 365 * 24 * 60 * 60 * 1000;

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

// `players()` resolves to v2's players (for a bid's player's name), `teams` maps team ids to names; a
// won bid shows the run's other bids only `withBids` (logged in)
export function moveRows({context, players, teams, withBids}) {
    const bidRun = bidRuns(context);
    // one read per run however many rows show it; one that fails isn't asked again until the page
    // reloads, as All moves draws its rows again on every filter
    const runs = new Map();
    const runOf = (period) => {
        if (!runs.has(period)) {
            runs.set(period, bidRun(period));
        }
        return runs.get(period);
    };
    const lines = new Map();
    const keyOf = (bid) => `${bid.period}-${bid.player}`;

    // "Also bid: So your saying there's a chance? $3 · Not 100% A Dick $2", or "" if no one else bid
    const alsoLine = async (bid) => {
        const [groups, known] = await Promise.all([runOf(bid.period), players()]);
        const player = known.get(bid.player);
        const bids = player ? otherBids(groups, player.fullName, bid.team) : [];
        return bids.length ? `Also bid: ${bids.map((entry) => `${(teams.get(entry.team) || `Team ${entry.team}`).trim()} $${entry.amount}`).join(" · ")}` : "";
    };

    return {
        // `when` adds each move's day under it (Home; All moves heads each day instead)
        markup(moves, {when = true} = {}) {
            return `<ul class="fuad-rows">${moves.map((move, i) => `<li class="fuad-move"><span class="fuad-label">${esc(move.kind)}</span>
                <span class="fuad-row-text"><span><strong>${esc(move.team)}</strong> ${esc(move.what)}</span>${when ? `<span class="fuad-meta">${esc(move.when)}</span>` : ""}${
                move.bid && withBids ? `<span class="fuad-also" data-move="${i}">${esc(lines.get(keyOf(move.bid)) || "")}</span>` : ""}</span></li>`).join("")}</ul>`;
        },
        // after `markup(moves)` is in `container`: each won bid's line once its run arrives
        fill(container, moves) {
            container.querySelectorAll(".fuad-also").forEach((line) => {
                const bid = moves[Number(line.dataset.move)].bid;
                if (lines.has(keyOf(bid))) {
                    return;
                }
                alsoLine(bid).then((text) => {
                    lines.set(keyOf(bid), text);
                    line.textContent = text;
                }, (error) => {
                    // the row goes without the line; the warning once
                    if (!lines.has(keyOf(bid))) {
                        lines.set(keyOf(bid), "");
                        console.warn("[fuad] couldn't load the run's other bids:", error);
                    }
                });
            });
        }
    };
}
