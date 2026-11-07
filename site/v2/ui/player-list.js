// MFL's player list, which every section reads: one request a page, kept a day in the browser as
// [id, name, position, team] rows, about half the size of the export's objects. Where it's only shown,
// a copy up to two days old draws the page at once and is asked for again behind it; Moves' checks and
// Home, whose forms write to MFL, wait for a fresh one.

import {API_BASE, asArray, exportUrl, fetchExport} from "../lib/mfl.js";
import {cached, cachedOrStale} from "./store.js";
import {mflFetch} from "./page-fetch.js";

const DAY = 24 * 60 * 60 * 1000;
const SHOWN_FOR = 2 * DAY;
export const PLAYERS_KEY = "fuad.playerList";

export const playerRows = (players) => asArray(players && players.player).map((player) => [player.id, player.name, player.position, player.team]);

// a failed request is forgotten, so the next asks again
const loads = new Map();
function load(season) {
    if (!loads.has(season)) {
        loads.set(season, fetchExport(exportUrl(API_BASE, season, "players"), "players", {fetchImpl: mflFetch}).then(playerRows).catch((error) => {
            loads.delete(season);
            throw error;
        }));
    }
    return loads.get(season);
}

// the export's shape, {player: [{id, name, position, team}]}
export async function playerList(season, {fresh = false} = {}) {
    const key = `${PLAYERS_KEY}.${season}`;
    const rows = await (fresh ? cached(key, DAY, () => load(season)) : cachedOrStale(key, DAY, SHOWN_FOR, () => load(season)));
    return {player: rows.map(([id, name, position, team]) => ({id, name, position, team}))};
}
