import {test} from "node:test";
import assert from "node:assert/strict";
import {allAtOnce, forget, gameToday, keepFor, keepable, mflFetch} from "../site/v2/ui/page-fetch.js";
import {fetchExport} from "../site/v2/lib/mfl.js";

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

// first of the tests to keep anything, as the sweep is once a page
test("what's expired goes when the page first keeps something, not each time; the viewer's own copy is used", async () => {
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
        const type = new URL(url).searchParams.get("TYPE");
        return new Response(JSON.stringify({[type]: {name: "FUAD"}}), {status: 200});
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
        items.set(`fuad.keep.0001|${old}`, JSON.stringify({expires: Date.now() - 1, body: "{}"}));
        await pageFetch(league("calendar"));
        assert.equal(items.has(`fuad.keep.0001|${league("calendar")}`), true);
        assert.equal(items.has(`fuad.keep.0001|${old}`), true, "swept once a page");
    } finally {
        globalThis.fetch = realFetch;
        delete globalThis.window;
    }
});

test("after a move, the page asks again for what it changes, and not for the rest", async () => {
    const items = new Map();
    globalThis.window = {franchise_id: "0001", location: {pathname: "/2026/home/48571"}, localStorage: new Proxy({
        getItem: (key) => (items.has(key) ? items.get(key) : null),
        setItem: (key, value) => items.set(key, String(value)),
        removeItem: (key) => items.delete(key)
    }, {ownKeys: () => [...items.keys()], getOwnPropertyDescriptor: () => ({enumerable: true, configurable: true})})};
    const realFetch = globalThis.fetch;
    const asked = [];
    globalThis.fetch = async (url) => {
        asked.push(url);
        const type = new URL(url).searchParams.get("TYPE");
        return new Response(JSON.stringify({[type]: {}}), {status: 200});
    };
    try {
        // a copy of its own, so its answers are its own
        const {forget: forgetHere, pageFetch} = await import("../site/v2/ui/page-fetch.js?forget");
        const rosters = league("rosters", "&FRANCHISE=0001");
        const settings = league("league", "&X=forget");
        await pageFetch(rosters);
        await pageFetch(settings);
        forgetHere();
        await pageFetch(rosters);
        await pageFetch(settings);
        assert.deepEqual(asked, [rosters, settings, rosters]);
    } finally {
        globalThis.fetch = realFetch;
        delete globalThis.window;
    }
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
        // MFL's refusal and v2's hold after it are told apart in what's logged
        await assert.rejects(fetchExport(league("rosters"), "rosters", {fetchImpl: mflFetch}), {status: 429, message: /HTTP 429$/});
        status = 200;
        await assert.rejects(fetchExport(league("transactions"), "transactions", {fetchImpl: mflFetch}), {status: 429, message: /HTTP 429, held by v2 after MFL's 429$/});
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

test("a page left open asks again once an answer's keep time is over, the one kept or not", async () => {
    const items = new Map();
    globalThis.window = {franchise_id: "0001", location: {pathname: "/2026/home/48571"}, localStorage: new Proxy({
        getItem: (key) => (items.has(key) ? items.get(key) : null),
        setItem: (key, value) => items.set(key, String(value)),
        removeItem: (key) => items.delete(key)
    }, {ownKeys: () => [...items.keys()], getOwnPropertyDescriptor: () => ({enumerable: true, configurable: true})})};
    const realFetch = globalThis.fetch;
    const realNow = Date.now;
    let now = realNow();
    Date.now = () => now;
    const asked = [];
    globalThis.fetch = async (url) => {
        asked.push(url);
        const type = new URL(url).searchParams.get("TYPE");
        return new Response(JSON.stringify({[type]: {}}), {status: 200});
    };
    try {
        const {pageFetch} = await import("../site/v2/ui/page-fetch.js?open");
        const trades = league("pendingTrades", "&X=open");
        const live = league("liveScoring", "&W=6&X=open");
        // one kept on the page before: it lasts only as long as it's kept
        const calendar = league("calendar", "&X=open");
        items.set(`fuad.keep.0001|${calendar}`, JSON.stringify({expires: now + MINUTE, body: '{"calendar":{}}'}));
        await Promise.all([pageFetch(trades), pageFetch(live), pageFetch(calendar), pageFetch(trades)]);
        assert.deepEqual(asked, [trades, live]);
        now += MINUTE;
        await Promise.all([pageFetch(trades), pageFetch(live), pageFetch(calendar)]);
        assert.deepEqual(asked, [trades, live, calendar]);
        now += MINUTE;
        await Promise.all([pageFetch(trades), pageFetch(live), pageFetch(calendar)]);
        assert.deepEqual(asked, [trades, live, calendar, trades, live]);
    } finally {
        globalThis.fetch = realFetch;
        Date.now = realNow;
        delete globalThis.window;
    }
});

test("reads asked at once fail with MFL's refusal, whichever failed first", async () => {
    const refusal = Object.assign(new Error("HTTP 429"), {status: 429});
    const early = Promise.reject(new Error("network"));
    const late = new Promise((resolve, reject) => setTimeout(() => reject(refusal), 5));
    await assert.rejects(allAtOnce([early, late, Promise.resolve(1)]), (error) => error === refusal);
    await assert.rejects(allAtOnce([Promise.reject(new Error("first")), Promise.resolve(1)]), /first/);
    assert.deepEqual(await allAtOnce([1, Promise.resolve(2), null]), [1, 2, null]);
});

test("a move MFL answers with 429 holds the reads after it, as a read's 429 does", async () => {
    const items = new Map();
    globalThis.window = {localStorage: {getItem: (key) => (items.has(key) ? items.get(key) : null), setItem: (key, value) => items.set(key, String(value))}};
    const realFetch = globalThis.fetch;
    const asked = [];
    globalThis.fetch = async (url) => {
        asked.push(url);
        return new Response("", {status: 429});
    };
    try {
        const {send} = await import("../site/v2/ui/moves.js");
        await assert.rejects(send("https://www44.myfantasyleague.com/2026/add_drop", {method: "POST", body: "a=1"}), /HTTP 429/);
        const read = await mflFetch(league("rosters"));
        assert.equal(read.status, 429);
        assert.deepEqual(asked, ["https://www44.myfantasyleague.com/2026/add_drop"]);
    } finally {
        globalThis.fetch = realFetch;
        delete globalThis.window;
    }
});

test("a read MFL doesn't start answering in 20 seconds fails as one cut off, and a move isn't timed", {timeout: 10000}, async (t) => {
    t.mock.timers.enable({apis: ["setTimeout"]});
    globalThis.window = {localStorage: {getItem: () => null, setItem: () => {}}};
    const realFetch = globalThis.fetch;
    const signals = [];
    // never answers, until its signal aborts it, as a browser's fetch does
    globalThis.fetch = (url, init = {}) => new Promise((resolve, reject) => {
        signals.push(init.signal);
        if (init.signal) {
            init.signal.addEventListener("abort", () => reject(Object.assign(new Error("The operation was aborted."), {name: "AbortError"})));
        }
    });
    try {
        const {cutOff} = await import("../site/v2/ui/panel.js");
        const read = mflFetch(league("rosters"));
        let settled = false;
        read.catch(() => {}).finally(() => {
            settled = true;
        });
        t.mock.timers.tick(19999);
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(settled, false, "still waiting");
        t.mock.timers.tick(1);
        const error = await read.catch((each) => each);
        assert.match(error.message, /MFL didn't answer in 20 seconds/);
        assert.equal(cutOff(error), true);
        // fetchExport's own failure for it, which a panel tries again
        const exported = fetchExport(league("league"), "league", {fetchImpl: mflFetch});
        t.mock.timers.tick(20000);
        await assert.rejects(exported, (each) => each.cutOff === true && /network error \(MFL didn't answer in 20 seconds\)/.test(each.message));
        const {mflSend} = await import("../site/v2/ui/page-fetch.js");
        mflSend("https://www44.myfantasyleague.com/2026/add_drop", {method: "POST"});
        assert.equal(signals.at(-1), undefined);
    } finally {
        globalThis.fetch = realFetch;
        delete globalThis.window;
    }
});
