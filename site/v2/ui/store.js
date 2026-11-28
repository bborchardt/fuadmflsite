// Browser storage that fails quietly: private windows and blocked storage just don't remember. A
// full one is warned of once a page (only in the console), as it also drops the 429 hold's key.

import {league} from "../lib/settings.js";

let warned = false;
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
            if (!warned) {
                warned = true;
                console.warn("[fuad] couldn't keep in browser storage:", error);
            }
        }
    },
    remove(key) {
        try {
            window.localStorage.removeItem(key);
        } catch (error) {
        }
    }
};

// Leagues on one MFL host share a browser's storage, so what's kept is kept per league, and per
// settings for a test league. MFL's player list, NFL kickoffs and byes are the same for every league.
const SHARED = /^fuad\.(playerList|kickoff|byes)\./;
const keyOf = (key) => (SHARED.test(key) ? key : `${key}@${league.keyId}`);

// what's kept from before it was kept per league, a bid run for up to a year, a list v2 no longer
// keeps, Moves' copy of the league export from when it kept the owners' names and emails, the
// player list as the export's objects, and the season's facts from before they were kept per viewer
const UNUSED = /^fuad\.(?:(?:context|rules|home|league|rosters|history|capUsed|bids|players)\.[^@]*|homeTabs|tidied[23]?\.\d+|league\.\d+\.\d+@.*|context\.\d+@.*)$/;
// a new name when there's more to tidy, so each browser tidies once more
const TIDIED = "fuad.tidied4";

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

// A number a display panel doesn't know (NaN, a field MFL left out: ui/checked.js lenient) is kept as
// one, where JSON would make it null, which reads as none
const UNKNOWN = "fuad:unknown";
const keepUnknown = (name, value) => (typeof value === "number" && Number.isNaN(value) ? UNKNOWN : value);
const readUnknown = (name, value) => (value === UNKNOWN ? NaN : value);

// {storedAt, value} under `key`, or null
export function saved(key) {
    try {
        const entry = JSON.parse(storage.get(keyOf(key)), readUnknown);
        return entry && "storedAt" in entry ? entry : null;
    } catch (error) {
        return null;
    }
}

// `keptFor`, in ms: how long anything reads it, after which the sweep takes it out
export function save(key, value, keptFor) {
    const storedAt = Date.now();
    storage.set(keyOf(key), JSON.stringify(keptFor ? {storedAt, expires: storedAt + keptFor, value} : {storedAt, value}, keepUnknown));
    sweep();
}

// the longest anything is read without an expiry of its own (a panel's saved copy, the launch's
// season, an entry from before entries had one)
const YEAR = 365 * 24 * 60 * 60 * 1000;
// MFL's pages share this storage, and keys carry a season or week, so what's expired goes as the
// first thing a page keeps is kept: reading every entry is slow on a phone, so once a page
let swept = false;
export function sweep() {
    if (swept) {
        return;
    }
    swept = true;
    const now = Date.now();
    try {
        for (const name of Object.keys(window.localStorage)) {
            if (!name.startsWith("fuad.")) {
                continue;
            }
            let entry = null;
            try {
                entry = JSON.parse(window.localStorage.getItem(name));
            } catch (error) {
                // not one of these (a look's folder, the beta's version)
            }
            if (entry && typeof entry === "object"
                && (typeof entry.expires === "number" ? entry.expires <= now : typeof entry.storedAt === "number" && now - entry.storedAt > YEAR)) {
                window.localStorage.removeItem(name);
            }
        }
    } catch (error) {
    }
}

// `keep(value)` false: the value is used but not kept, so the next call loads again. `keptFor`: how
// long it's read for, when longer than `maxAge` (cachedOrStale)
export async function cached(key, maxAge, load, keep = () => true, keptFor = maxAge) {
    const entry = saved(key);
    if (entry && Date.now() - entry.storedAt < maxAge) {
        return entry.value;
    }
    const value = await load();
    if (keep(value)) {
        save(key, value, keptFor);
    }
    return value;
}

// A copy older than `maxAge` but within `staleAge` is used, so the page draws at once, and is asked
// for again behind it, for the next page. Only for what's shown.
export async function cachedOrStale(key, maxAge, staleAge, load) {
    const entry = saved(key);
    if (!entry || Date.now() - entry.storedAt >= staleAge) {
        return cached(key, maxAge, load, undefined, staleAge);
    }
    if (Date.now() - entry.storedAt >= maxAge) {
        Promise.resolve().then(load).then((value) => save(key, value, staleAge)).catch((error) => console.warn(`[fuad] couldn't refresh ${key}:`, error));
    }
    return entry.value;
}
