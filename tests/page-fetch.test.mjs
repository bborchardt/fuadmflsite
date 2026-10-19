import {test} from "node:test";
import assert from "node:assert/strict";
import {forget, gameToday, keepFor, keepable, mflFetch} from "../site/v2/ui/page-fetch.js";

const MINUTE = 60 * 1000;
const league = (type, extra = "") => `https://www44.myfantasyleague.com/2026/export?TYPE=${type}&L=48571${extra}&JSON=1`;
const api = (type, extra = "") => `https://api.myfantasyleague.com/2026/export?TYPE=${type}${extra}&JSON=1`;
const options = (gameDay = false) => ({liveWeek: 6, gameDay: () => gameDay});

test("exports that rarely change are kept for a day or an hour; what a move changes, 2 minutes", () => {
    assert.equal(keepFor(api("nflSchedule", "&W=6"), options()), 24 * 60 * MINUTE);
    assert.equal(keepFor(league("league"), options()), 24 * 60 * MINUTE);
    assert.equal(keepFor(league("calendar"), options()), 24 * 60 * MINUTE);
    assert.equal(keepFor(league("weeklyResults"), options()), 60 * MINUTE);
    for (const type of ["rosters", "transactions", "salaryAdjustments", "freeAgents", "pendingWaivers", "pendingTrades", "messageBoard"]) {
        assert.equal(keepFor(league(type), options()), 2 * MINUTE, type);
    }
    // who starts, for League › Scores: never older than the page
    assert.equal(keepFor(league("liveScoring", "&W=6&DETAILS=1"), options()), 0);
    // Rosters › Draft shows picks as they're entered
    assert.equal(keepFor(league("draftResults"), options()), 0);
    assert.equal(keepFor(league("weeklyResults", "&W=YTD"), options()), 0);
    assert.equal(keepFor("https://www44.myfantasyleague.com/2026/options?L=48571&O=101", options()), 0);
});

test("injury reports: a past week's for a day, this week's never, today's briefly on game days", () => {
    assert.equal(keepFor(api("injuries", "&W=5"), options()), 24 * 60 * MINUTE);
    assert.equal(keepFor(api("injuries", "&W=6"), options()), 0);
    assert.equal(keepFor(api("injuries"), options(true)), 5 * MINUTE);
    assert.equal(keepFor(api("injuries"), options(false)), 60 * MINUTE);
});

test("a game day is one with a kickoff on today's Central date, or an unknown schedule", () => {
    // Sunday 18 Oct 2026, noon CT
    const kickoff = (text) => ({kickoff: String(new Date(text).getTime() / 1000)});
    const schedule = {matchup: [kickoff("2026-10-15T19:15:00-05:00"), kickoff("2026-10-18T12:00:00-05:00")]};
    assert.equal(gameToday(schedule, new Date("2026-10-18T08:00:00-05:00")), true);
    assert.equal(gameToday(schedule, new Date("2026-10-17T22:00:00-05:00")), false);
    // 11 p.m. Sunday CT is already Monday in UTC
    assert.equal(gameToday({matchup: kickoff("2026-10-18T19:20:00-05:00")}, new Date("2026-10-18T23:00:00-05:00")), true);
    assert.equal(gameToday(null, new Date()), true);
});

test("a move made in v2 forgets what it changes, and keeps the rest", () => {
    const items = new Map();
    const localStorage = {
        getItem: (key) => (items.has(key) ? items.get(key) : null),
        setItem: (key, value) => items.set(key, String(value)),
        removeItem: (key) => items.delete(key)
    };
    // Object.keys(localStorage) lists what's stored, as in a browser
    globalThis.window = {localStorage: new Proxy(localStorage, {
        ownKeys: () => [...items.keys()],
        getOwnPropertyDescriptor: () => ({enumerable: true, configurable: true})
    })};
    const entry = JSON.stringify({expires: Date.now() + MINUTE, body: "{}"});
    items.set(`fuad.keep.0001|${league("rosters")}`, entry);
    items.set(`fuad.keep.guest|${league("pendingWaivers")}`, entry);
    items.set(`fuad.keep.0001|${league("league")}`, entry);
    items.set("fuad.capUsed.2026.0001", entry);
    items.set("fuad.players.2026", entry);
    forget();
    assert.deepEqual([...items.keys()].sort(), [`fuad.keep.0001|${league("league")}`, "fuad.players.2026"]);
    delete globalThis.window;
});

test("after MFL answers 429, nothing is asked of it for 30 seconds", async () => {
    const items = new Map();
    globalThis.window = {localStorage: {getItem: (key) => (items.has(key) ? items.get(key) : null), setItem: (key, value) => items.set(key, String(value))}};
    const realFetch = globalThis.fetch;
    const asked = [];
    let status = 429;
    globalThis.fetch = async (url) => {
        asked.push(url);
        return new Response("{}", {status});
    };
    try {
        assert.equal((await mflFetch(league("rosters"))).status, 429);
        status = 200;
        assert.equal((await mflFetch(league("transactions"))).status, 429);
        assert.deepEqual(asked, [league("rosters")]);
        items.set("fuad.mflWait", String(Date.now() - 1));
        assert.equal((await mflFetch(league("transactions"))).status, 200);
        assert.equal(asked.length, 2);
    } finally {
        globalThis.fetch = realFetch;
        delete globalThis.window;
    }
});

test("only an answer with its section is kept, never MFL's error", () => {
    assert.equal(keepable(league("calendar"), '{"version":"1.0","calendar":{"event":[]}}'), true);
    assert.equal(keepable(league("calendar"), '{"error":{"$t":"API requires logged in user"}}'), false);
    assert.equal(keepable(league("calendar"), '{"version":"1.0"}'), false);
    assert.equal(keepable(league("calendar"), "<html>"), false);
});

test("what's expired goes when something new is kept; the viewer's own copy is used", async () => {
    const items = new Map();
    const localStorage = {
        getItem: (key) => (items.has(key) ? items.get(key) : null),
        setItem: (key, value) => items.set(key, String(value)),
        removeItem: (key) => items.delete(key)
    };
    globalThis.window = {
        franchise_id: "0001",
        liveScoringWeek: 6,
        location: {pathname: "/2026/home/48571"},
        localStorage: new Proxy(localStorage, {
            ownKeys: () => [...items.keys()],
            getOwnPropertyDescriptor: () => ({enumerable: true, configurable: true})
        })
    };
    const realFetch = globalThis.fetch;
    const asked = [];
    globalThis.fetch = async (url) => {
        asked.push(url);
        return new Response('{"league":{"name":"FUAD"}}', {status: 200});
    };
    try {
        const old = league("injuries", "&W=1");
        items.set(`fuad.keep.0001|${old}`, JSON.stringify({expires: Date.now() - 1, body: "{}"}));
        items.set(`fuad.keep.guest|${league("league")}`, JSON.stringify({expires: Date.now() + MINUTE, body: '{"league":{"name":"guest"}}'}));
        const {pageFetch} = await import("../site/v2/ui/page-fetch.js");
        assert.equal((await (await pageFetch(league("league"))).json()).league.name, "FUAD");
        assert.deepEqual(asked, [league("league")]);
        assert.equal(items.has(`fuad.keep.0001|${old}`), false);
        assert.equal(items.has(`fuad.keep.0001|${league("league")}`), true);
    } finally {
        globalThis.fetch = realFetch;
        delete globalThis.window;
    }
});
