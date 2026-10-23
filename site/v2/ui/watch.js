// The member's watch list, MFL's own (My Watch List): read with MFL's `myWatchList` export and
// changed with its import (ADD or REMOVE), from the member's own page. Read once a page and shared
// by the player popup, which changes it, and the Watching chips in Moves › Add and Rosters › Players,
// which hear of a change through the window's `fuad-watch` event.

import {exportUrl} from "../lib/mfl.js";
import {mflFetch, pageFetch} from "./page-fetch.js";

let loading = null;
// changes MFL hasn't answered yet, player id → whether he'll be watched
const pending = new Map();

// The ids in MFL's answer: a list of players or one (`{"id": …}` or a bare id), or the ids as one
// comma-separated string, as the import takes them; none when the list is empty or the section missing
export function watchedIds(body) {
    const section = body && body.myWatchList;
    const players = section && typeof section === "object" ? section.player : section;
    return new Set([].concat(players || []).flatMap((player) => String(player && typeof player === "object" ? player.id : player).split(","))
        .map((id) => id.trim()).filter(Boolean));
}

// the player ids on the list
export function watchList({season, leagueId}) {
    if (!loading) {
        loading = pageFetch(exportUrl(window.location.origin, season, "myWatchList", {L: leagueId}), {cache: "no-store"})
            .then(async (response) => {
                if (!response.ok) {
                    throw Object.assign(new Error(`HTTP ${response.status}`), {status: response.status});
                }
                const body = await response.json();
                if (body.error) {
                    throw new Error(`MFL said "${typeof body.error === "object" ? body.error.$t || JSON.stringify(body.error) : body.error}"`);
                }
                return watchedIds(body);
            })
            .catch((error) => {
                loading = null;
                throw error;
            });
    }
    return loading;
}

// whether a player is watched, counting a change MFL hasn't answered yet, and whether one is waiting
export const watchState = (list, playerId) => ({
    on: pending.has(String(playerId)) ? pending.get(String(playerId)) : list.has(String(playerId)),
    waiting: pending.has(String(playerId))
});

// puts a player on the list or takes him off; throws if MFL doesn't say OK. Not through pageFetch,
// which answers the same address once a page.
export async function setWatched({season, leagueId}, playerId, on) {
    const id = String(playerId);
    pending.set(id, on);
    try {
        const response = await mflFetch(`${window.location.origin}/${season}/import`, {
            method: "POST",
            credentials: "include",
            headers: {"Content-Type": "application/x-www-form-urlencoded"},
            body: new URLSearchParams({TYPE: "myWatchList", L: leagueId, [on ? "ADD" : "REMOVE"]: id})
        });
        const answer = await response.text();
        if (!response.ok || !/<status\b[^>]*>\s*OK\s*<\/status>/i.test(answer)) {
            throw Object.assign(new Error(`MFL didn't update the watch list: ${(/<error>([^<]*)<\/error>/.exec(answer) || [])[1] || `HTTP ${response.status}`}`), {status: response.status});
        }
        const list = await watchList({season, leagueId});
        list[on ? "add" : "delete"](id);
    } finally {
        pending.delete(id);
    }
    window.dispatchEvent(new CustomEvent("fuad-watch", {detail: {playerId: id, on}}));
}

// `redraw` now, or once the player popup closes: redrawing under it would take away the row it opened
// from, and with it where focus and a phone's scroll return to
export function whenPopupClosed(redraw) {
    const layer = document.querySelector(".fuad-popup-layer");
    if (!layer || layer.hidden) {
        redraw();
        return;
    }
    const watcher = new MutationObserver(() => {
        if (layer.hidden) {
            watcher.disconnect();
            redraw();
        }
    });
    watcher.observe(layer, {attributes: true, attributeFilter: ["hidden"]});
}
