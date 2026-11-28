import {test} from "node:test";
import assert from "node:assert/strict";
import {cached, cachedOrStale, saved, save} from "../site/v2/ui/store.js";

const DAY = 24 * 60 * 60 * 1000;

function withStorage(run) {
    const items = new Map();
    globalThis.window = {localStorage: {
        getItem: (key) => (items.has(key) ? items.get(key) : null),
        setItem: (key, value) => items.set(key, String(value)),
        removeItem: (key) => items.delete(key)
    }};
    return Promise.resolve().then(() => run(items)).finally(() => {
        delete globalThis.window;
    });
}

// what's kept under `key` made `age` old; non-shared keys are stored per league (`key@league`)
function age(items, key, by) {
    const name = [...items.keys()].find((stored) => stored === key || stored.startsWith(`${key}@`));
    const entry = JSON.parse(items.get(name));
    items.set(name, JSON.stringify({...entry, storedAt: entry.storedAt - by}));
}

test("cached: a copy younger than its age is used; an older one is loaded again", () => withStorage(async (items) => {
    let loads = 0;
    const load = async () => ++loads;
    assert.equal(await cached("fuad.test.a", DAY, load), 1);
    assert.equal(await cached("fuad.test.a", DAY, load), 1);
    age(items, "fuad.test.a", DAY + 1);
    assert.equal(await cached("fuad.test.a", DAY, load), 2);
    assert.equal(saved("fuad.test.a").value, 2);
}));

test("cached: a failed load isn't kept, so the next asks again", () => withStorage(async () => {
    await assert.rejects(cached("fuad.test.b", DAY, async () => {
        throw new Error("HTTP 429");
    }), /429/);
    assert.equal(saved("fuad.test.b"), null);
    assert.equal(await cached("fuad.test.b", DAY, async () => "fresh"), "fresh");
}));

test("cached: a value `keep` turns down is used but not kept, so the next asks again", () => withStorage(async () => {
    assert.equal(await cached("fuad.test.d", DAY, async () => "partial", {keep: () => false}), "partial");
    assert.equal(saved("fuad.test.d"), null);
    assert.equal(await cached("fuad.test.d", DAY, async () => "whole", {keep: (value) => value === "whole"}), "whole");
    assert.equal(saved("fuad.test.d").value, "whole");
}));

test("cached: with storage blocked, every call loads and none fails", async (t) => {
    // its one warning a page
    t.mock.method(console, "warn", () => {});
    globalThis.window = {};
    Object.defineProperty(globalThis.window, "localStorage", {get() {
        throw new Error("SecurityError");
    }});
    try {
        let loads = 0;
        assert.equal(await cached("fuad.test.c", DAY, async () => ++loads), 1);
        assert.equal(await cached("fuad.test.c", DAY, async () => ++loads), 2);
        assert.equal(await cachedOrStale("fuad.test.c", DAY, 2 * DAY, async () => ++loads), 3);
    } finally {
        delete globalThis.window;
    }
});

test("cachedOrStale: an old copy is used at once and loaded again behind it", () => withStorage(async (items) => {
    let finish;
    const load = () => new Promise((resolve) => {
        finish = resolve;
    });
    save("fuad.test.d", "old");
    assert.equal(await cachedOrStale("fuad.test.d", DAY, 2 * DAY, load), "old");
    assert.equal(finish, undefined, "a young copy isn't asked again");
    age(items, "fuad.test.d", DAY + 1);
    assert.equal(await cachedOrStale("fuad.test.d", DAY, 2 * DAY, load), "old");
    await new Promise((resolve) => setTimeout(resolve));
    finish("new");
    await new Promise((resolve) => setTimeout(resolve));
    assert.equal(saved("fuad.test.d").value, "new");
    // past the age it may be shown at, it's loaded first
    age(items, "fuad.test.d", 2 * DAY);
    assert.equal(await cachedOrStale("fuad.test.d", DAY, 2 * DAY, async () => "newer"), "newer");
}));

test("cachedOrStale: with nothing kept, it waits for the load; a failed refresh keeps the old copy", () => withStorage(async (items) => {
    assert.equal(await cachedOrStale("fuad.test.e", DAY, 2 * DAY, async () => "first"), "first");
    age(items, "fuad.test.e", DAY + 1);
    const warn = console.warn;
    console.warn = () => {};
    try {
        assert.equal(await cachedOrStale("fuad.test.e", DAY, 2 * DAY, async () => {
            throw new Error("HTTP 429");
        }), "first");
        await new Promise((resolve) => setTimeout(resolve));
    } finally {
        console.warn = warn;
    }
    assert.equal(saved("fuad.test.e").value, "first");
}));

test("the player list: asked for once a page, kept as rows, read back as the export's objects", () => withStorage(async (items) => {
    const realFetch = globalThis.fetch;
    let asked = 0;
    globalThis.fetch = async () => {
        asked++;
        return new Response(JSON.stringify({players: {player: [{id: "5848", name: "Brady, Tom", position: "QB", team: "FA"}]}}), {status: 200});
    };
    try {
        const {playerList} = await import("../site/v2/ui/player-list.js?once");
        const [shown, checked] = await Promise.all([playerList(2026), playerList(2026, {fresh: true})]);
        assert.equal(asked, 1);
        assert.deepEqual(shown, {player: [{id: "5848", name: "Brady, Tom", position: "QB", team: "FA"}]});
        assert.deepEqual(checked, shown);
        assert.deepEqual(JSON.parse(items.get("fuad.playerList.2026")).value, [["5848", "Brady, Tom", "QB", "FA"]]);
    } finally {
        globalThis.fetch = realFetch;
    }
}));

test("a number a panel doesn't know (NaN) is kept as one, not as null, which reads as none", () => withStorage(() => {
    save("fuad.test.unknown", {total: NaN, pot: null, rows: [{amount: NaN}, {amount: 2}]});
    const {value} = saved("fuad.test.unknown");
    assert.ok(Number.isNaN(value.total));
    assert.equal(value.pot, null);
    assert.ok(Number.isNaN(value.rows[0].amount));
    assert.equal(value.rows[1].amount, 2);
}));

test("cached: an entry says when it's done with, cachedOrStale's when its stale copy is", () => withStorage(async (items) => {
    const before = Date.now();
    await cached("fuad.rules.2026", DAY, async () => "rules");
    await cachedOrStale("fuad.playerList.2026", DAY, 2 * DAY, async () => "players");
    const entry = (key) => JSON.parse(items.get([...items.keys()].find((name) => name.startsWith(key))));
    assert.ok(entry("fuad.rules.2026").expires >= before + DAY && entry("fuad.rules.2026").expires <= Date.now() + DAY);
    assert.ok(entry("fuad.playerList.2026").expires >= before + 2 * DAY);
    // a panel's saved copy has no expiry of its own
    save("fuad.panel.home", {shown: true});
    assert.equal("expires" in entry("fuad.panel.home"), false);
}));

test("what's done with goes at the page's first save, once: expired entries, and one without an expiry over a year old", async () => {
    const items = new Map();
    const localStorage = {
        getItem: (key) => (items.has(key) ? items.get(key) : null),
        setItem: (key, value) => items.set(key, String(value)),
        removeItem: (key) => items.delete(key)
    };
    globalThis.window = {localStorage: new Proxy(localStorage, {
        ownKeys: () => [...items.keys()],
        getOwnPropertyDescriptor: () => ({enumerable: true, configurable: true})
    })};
    const now = Date.now();
    const kept = {
        "fuad.bids.2026.3@48571": JSON.stringify({storedAt: now - DAY, expires: now + DAY, value: 1}),
        "fuad.panel.home@48571": JSON.stringify({storedAt: now - 300 * DAY, value: 1}),
        "fuad.keep.0001|https://x/export?TYPE=league": JSON.stringify({expires: now + DAY, body: "{}"}),
        "fuad.mflWait": String(now - 1),
        "fuad.beta": "v2",
        "MFL_something": JSON.stringify({expires: now - 1})
    };
    const gone = {
        "fuad.kickoff.2025.1": JSON.stringify({storedAt: now - 2 * DAY, expires: now - DAY, value: 1}),
        "fuad.series.2024.17.0001@48571": JSON.stringify({storedAt: now - 400 * DAY, value: 1}),
        "fuad.keep.0001|https://x/export?TYPE=calendar": JSON.stringify({expires: now - 1, body: "{}"})
    };
    Object.entries({...kept, ...gone}).forEach(([key, value]) => items.set(key, value));
    try {
        const store = await import("../site/v2/ui/store.js?sweep");
        store.save("fuad.rules.2026", "rules", DAY);
        assert.deepEqual(Object.keys(gone).filter((key) => items.has(key)), []);
        assert.deepEqual(Object.keys(kept).filter((key) => !items.has(key)), []);
        items.set("fuad.kickoff.2025.2", JSON.stringify({storedAt: now - 2 * DAY, expires: now - DAY, value: 1}));
        store.save("fuad.rules.2027", "rules", DAY);
        assert.equal(items.has("fuad.kickoff.2025.2"), true, "once a page");
    } finally {
        delete globalThis.window;
    }
});

test("storage that's full warns once a page, in the console only, and the page carries on", async (t) => {
    globalThis.window = {localStorage: {getItem: () => null, setItem: () => {
        throw new Error("QuotaExceededError");
    }}};
    const warnings = [];
    t.mock.method(console, "warn", (...args) => warnings.push(args[0]));
    try {
        const {storage} = await import("../site/v2/ui/store.js?full");
        storage.set("fuad.a", "1");
        storage.set("fuad.b", "2");
        assert.deepEqual(warnings, ["[fuad] couldn't keep in browser storage:"]);
    } finally {
        delete globalThis.window;
    }
});

test("a copy cachedOrStale may still show is kept as long, whichever read saved it", () => withStorage(async (items) => {
    const expiry = (key) => {
        const name = [...items.keys()].find((stored) => stored.startsWith(key));
        const entry = JSON.parse(items.get(name));
        return entry.expires - entry.storedAt;
    };
    // the refresh behind a stale copy
    save("fuad.test.f", "old", 2 * DAY);
    age(items, "fuad.test.f", DAY + 1);
    let refreshed;
    const done = new Promise((resolve) => {
        refreshed = resolve;
    });
    await cachedOrStale("fuad.test.f", DAY, 2 * DAY, async () => {
        setTimeout(refreshed);
        return "new";
    });
    await done;
    assert.equal(saved("fuad.test.f").value, "new");
    assert.equal(expiry("fuad.test.f"), 2 * DAY);
    // the player list's fresh read, which the shown ones read stale
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({players: {player: [{id: "1", name: "Last, First", position: "QB", team: "MIN"}]}}), {status: 200});
    try {
        const {playerList} = await import("../site/v2/ui/player-list.js");
        await playerList(2026, {fresh: true});
        assert.equal(expiry("fuad.playerList.2026"), 2 * DAY);
    } finally {
        globalThis.fetch = realFetch;
    }
}));

test("the page's first save sweeps before it writes, so what's swept makes room for it, and a kept answer with no expiry goes", async () => {
    const items = new Map();
    const room = 3;
    const localStorage = {
        getItem: (key) => (items.has(key) ? items.get(key) : null),
        setItem: (key, value) => {
            if (!items.has(key) && items.size >= room) {
                throw new Error("QuotaExceededError");
            }
            items.set(key, String(value));
        },
        removeItem: (key) => items.delete(key)
    };
    globalThis.window = {localStorage: new Proxy(localStorage, {
        ownKeys: () => [...items.keys()],
        getOwnPropertyDescriptor: () => ({enumerable: true, configurable: true})
    })};
    const now = Date.now();
    items.set("fuad.kickoff.2025.1", JSON.stringify({storedAt: now - 2 * DAY, expires: now - DAY, value: 1}));
    items.set("fuad.keep.0001|https://x/export?TYPE=league", JSON.stringify({body: "{}"}));
    items.set("fuad.beta", "v2");
    try {
        const store = await import("../site/v2/ui/store.js?room");
        store.save("fuad.kickoff.2026.1", 1, DAY);
        assert.equal(store.saved("fuad.kickoff.2026.1").value, 1);
        assert.deepEqual([...items.keys()].sort(), ["fuad.beta", "fuad.kickoff.2026.1"]);
    } finally {
        delete globalThis.window;
    }
});
