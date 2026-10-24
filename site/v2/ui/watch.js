// The member's watch list, MFL's own (My Watch List): read with MFL's `myWatchList` export and
// changed with its import (ADD or REMOVE), from the member's own page. Read once a page and shared
// by the player popup, which changes it, and the Watching chips in Moves › Add and Rosters › Players,
// which hear of a change through the window's `fuad-watch` event.

import {exportUrl} from "../lib/mfl.js";
import {mflFetch, pageFetch} from "./page-fetch.js";

let loading = null;
// changes MFL hasn't answered yet, player id → {on: whether he'll be watched, done: settles when MFL answers}
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

// whether a player is watched, counting a change MFL hasn't answered yet; `done`, when one is waiting,
// settles once MFL answers it
export function watchState(list, playerId) {
    const change = pending.get(String(playerId));
    return change ? {on: change.on, done: change.done} : {on: list.has(String(playerId)), done: null};
}

// puts a player on the list or takes him off; throws if MFL doesn't say OK. Not through pageFetch,
// which answers the same address once a page.
export function setWatched(context, playerId, on) {
    const id = String(playerId);
    const change = {on, done: null};
    const sent = send(context, id, on).finally(() => {
        if (pending.get(id) === change) {
            pending.delete(id);
        }
    });
    change.done = sent.catch(() => {});
    pending.set(id, change);
    return sent;
}

async function send({season, leagueId}, id, on) {
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
    window.dispatchEvent(new CustomEvent("fuad-watch", {detail: {playerId: id, on}}));
}

// `redraw` now, or once the player popup closes: redrawing under it would take away the row it opened
// from, and with it where focus and a phone's scroll return to. Each redraw runs once however many
// changes asked for it.
const waiting = new Set();
let watcher = null;
export function whenPopupClosed(redraw) {
    const layer = document.querySelector(".fuad-popup-layer");
    if (!layer || layer.hidden) {
        redraw();
        return;
    }
    waiting.add(redraw);
    if (!watcher) {
        watcher = new MutationObserver(() => {
            if (layer.hidden) {
                watcher.disconnect();
                watcher = null;
                const due = [...waiting];
                waiting.clear();
                due.forEach((run) => run());
            }
        });
        watcher.observe(layer, {attributes: true, attributeFilter: ["hidden"]});
    }
}
