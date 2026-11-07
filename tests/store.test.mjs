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

test("cached: with storage blocked, every call loads and none fails", async () => {
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
