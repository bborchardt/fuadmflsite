// The member's watch list, MFL's own (My Watch List): read with MFL's `myWatchList` export and
// changed with its import (ADD or REMOVE), from the member's own page. Read once a page and shared
// by the player popup, which changes it, and the Watching chips in Moves › Add and Rosters › Players,
// which hear of a change through the window's `fuad-watch` event.

import {asArray, exportUrl, fetchExport} from "../lib/mfl.js";
import {mflFetch, pageFetch} from "./page-fetch.js";

let loading = null;

// the player ids on the list
export function watchList({season, leagueId}) {
    if (!loading) {
        loading = fetchExport(exportUrl(window.location.origin, season, "myWatchList", {L: leagueId}), "myWatchList", {fetchImpl: pageFetch, init: {cache: "no-store"}})
            .then((list) => new Set(asArray(list && list.player).map((player) => String(typeof player === "object" ? player.id : player))))
            .catch((error) => {
                loading = null;
                throw error;
            });
    }
    return loading;
}

// puts a player on the list or takes him off; throws if MFL doesn't say OK. Not through pageFetch,
// which answers the same address once a page.
export async function setWatched({season, leagueId}, playerId, on) {
    const response = await mflFetch(`${window.location.origin}/${season}/import`, {
        method: "POST",
        credentials: "include",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: new URLSearchParams({TYPE: "myWatchList", L: leagueId, [on ? "ADD" : "REMOVE"]: playerId})
    });
    const answer = await response.text();
    if (!response.ok || !/<status\b[^>]*>\s*OK\s*<\/status>/i.test(answer)) {
        throw Object.assign(new Error(`MFL didn't update the watch list: ${(/<error>([^<]*)<\/error>/.exec(answer) || [])[1] || `HTTP ${response.status}`}`), {status: response.status});
    }
    const list = await watchList({season, leagueId});
    list[on ? "add" : "delete"](String(playerId));
    window.dispatchEvent(new CustomEvent("fuad-watch", {detail: {playerId: String(playerId), on}}));
}
