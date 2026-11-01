// Browser storage that fails quietly: private windows and blocked storage just don't remember.

import {league} from "../lib/settings.js";

export const storage = {
    get(key) {
        try {
            return window.localStorage.getItem(key);
        } catch (error) {
            return null;
        }
    },
    set(key, value) {
        try {
            window.localStorage.setItem(key, value);
        } catch (error) {
        }
    }
};

// Leagues on one MFL host share a browser's storage, so what's kept is kept per league, and per
// settings for a test league. MFL's player list, NFL kickoffs and byes are the same for every league.
const SHARED = /^fuad\.(players|kickoff|byes)\./;
const keyOf = (key) => (SHARED.test(key) ? key : `${key}@${league.keyId}`);

// what's kept from before it was kept per league, a bid run for up to a year, and a list v2 no longer keeps
const UNUSED = /^fuad\.(?:(?:context|rules|home|league|rosters|history|capUsed|bids)\.[^@]*|homeTabs)$/;
const TIDIED = "fuad.tidied";

// Also what this league kept under settings it no longer has, nothing else would ever remove it. Once
// for the settings a browser has, as MFL's pages fill this storage too and this is on every page.
export function dropUnusedKeys() {
    try {
        if (storage.get(`${TIDIED}.${league.id}`) === league.keyId) {
            return;
        }
        const own = `@${league.id}-`;
        const current = `@${league.keyId}`;
        Object.keys(window.localStorage)
            .filter((name) => UNUSED.test(name) || (name.startsWith("fuad.") && name.includes(own) && !name.endsWith(current)))
            .forEach((name) => window.localStorage.removeItem(name));
        storage.set(`${TIDIED}.${league.id}`, league.keyId);
    } catch (error) {
        // storage is blocked: nothing is kept
    }
}

// {storedAt, value} under `key`, or null
export function saved(key) {
    try {
        const entry = JSON.parse(storage.get(keyOf(key)));
        return entry && "storedAt" in entry ? entry : null;
    } catch (error) {
        return null;
    }
}

export function save(key, value) {
    storage.set(keyOf(key), JSON.stringify({storedAt: Date.now(), value}));
}

export async function cached(key, maxAge, load) {
    const entry = saved(key);
    if (entry && Date.now() - entry.storedAt < maxAge) {
        return entry.value;
    }
    const value = await load();
    save(key, value);
    return value;
}
