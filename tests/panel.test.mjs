// A panel's saved copy: one from an older version that its render no longer reads is loaded afresh,
// not left to break the page.

import {mock, test} from "node:test";
import assert from "node:assert/strict";
import {parseHTML} from "linkedom";

const {window, document} = parseHTML("<!doctype html><html><body><div id=mount></div></body></html>");
const items = new Map();
window.localStorage = {getItem: (key) => (items.has(key) ? items.get(key) : null), setItem: (key, value) => items.set(key, String(value))};
globalThis.window = window;
globalThis.document = document;
const {CUT_OFF_RETRY, cutOff, drawPanel, failedMarkup, retryCutOff} = await import("../site/v2/ui/panel.js");
const {fetchExport} = await import("../site/v2/lib/mfl.js");

const OLD = [{team: "Old"}];
const NEW = [{team: "New", teamIds: ["0001"]}];

// as Home's My alerts and the Rosters pages: a count and the panel's class changed before the rows
function draw({maxAge = 0, load = async () => NEW} = {}) {
    items.set("fuad.test@48571", JSON.stringify({storedAt: Date.now(), value: OLD}));
    const mount = document.getElementById("mount");
    mount.className = "";
    const render = (moves, body) => {
        mount.querySelector(".fuad-count").textContent = `${moves.length} to do`;
        mount.classList.remove("fuad-panel");
        body.innerHTML = moves.map((move) => `<p>${move.teamIds[0]}</p>`).join("");
    };
    const warn = console.warn;
    console.warn = () => {};
    return drawPanel(mount, {what: "recent moves", key: "fuad.test", maxAge, actions: '<span class="fuad-count"></span>', load, render})
        .then((value) => ({value, mount}))
        .finally(() => {
            console.warn = warn;
        });
}

const bodyOf = (mount) => mount.querySelector(".fuad-panel-body");

test("a saved copy render can't draw is dropped and loaded afresh", async () => {
    const {value, mount} = await draw();
    assert.deepEqual(value, NEW);
    assert.equal(bodyOf(mount).textContent, "0001");
    assert.deepEqual(JSON.parse(items.get("fuad.test@48571")).value, NEW);
});

test("even while the saved copy is new enough not to load again", async () => {
    let loads = 0;
    const {value, mount} = await draw({maxAge: 60 * 1000, load: async () => {
        loads += 1;
        return NEW;
    }});
    assert.equal(loads, 1);
    assert.deepEqual(value, NEW);
    assert.equal(bodyOf(mount).textContent, "0001");
});

test("if the fresh load fails too, the panel says so in a clean frame, not the dropped copy", async () => {
    const {value, mount} = await draw({load: async () => {
        throw new Error("offline");
    }});
    assert.equal(value, null);
    assert.ok(mount.classList.contains("fuad-panel"));
    assert.equal(mount.querySelector(".fuad-count").textContent, "");
    assert.equal(mount.querySelector(".fuad-as-of").hidden, true);
    assert.match(bodyOf(mount).textContent, /Couldn’t load recent moves\./);
    assert.ok(bodyOf(mount).querySelector("button"));
});

test("a panel that couldn't load says so, and when MFL refused, that the server is busy", () => {
    assert.match(failedMarkup("standings", new Error("HTTP 500")), /<span>Couldn’t load standings\.<\/span>.*>Retry</);
    assert.match(failedMarkup("standings", Object.assign(new Error("HTTP 429"), {status: 429})), /<span>Server is busy\. Try again in a few seconds\.<\/span>/);
});

test("a view that couldn't load offers Basic view, MFL's page, beside Retry", () => {
    const box = document.createElement("div");
    box.innerHTML = failedMarkup("standings", new Error("HTTP 500"), "https://www44.myfantasyleague.com/2026/standings?L=48571");
    assert.equal(box.querySelector("span").textContent, "Couldn’t load standings.");
    assert.deepEqual([...box.querySelectorAll(".fuad-failed-actions > *")].map((node) => node.textContent), ["Retry", "Basic view"]);
    const link = box.querySelector("a[data-fuad-basic]");
    assert.equal(link.getAttribute("href"), "https://www44.myfantasyleague.com/2026/standings?L=48571");
    assert.doesNotMatch(failedMarkup("the champions", new Error("HTTP 500")), /Basic view/);
});

test("a panel the member sees fail is logged as an error, with Basic view when it has one", async () => {
    const logged = [];
    const error = console.error;
    console.error = (first) => logged.push(first);
    try {
        const mount = document.getElementById("mount");
        await drawPanel(mount, {what: "standings", load: async () => {
            throw new Error("HTTP 500");
        }, render: () => {}, basic: "https://www44.myfantasyleague.com/2026/standings?L=48571"});
        assert.ok(mount.querySelector("a[data-fuad-basic]"));
    } finally {
        console.error = error;
    }
    assert.deepEqual(logged, ["[fuad] couldn't load standings:"]);
});

test("loaded again (a screen shown again), a panel keeps what it shows until the new answer is in, and on a failure keeps it, dated", async () => {
    const mount = document.getElementById("mount");
    const refreshes = [];
    let answer = Promise.resolve(["first"]);
    const render = (rows, body) => {
        body.innerHTML = rows.map((row) => `<p>${row}</p>`).join("");
    };
    await drawPanel(mount, {what: "my alerts", load: () => answer, render, refreshes});
    assert.equal(refreshes.length, 1);
    let arrive;
    answer = new Promise((resolve) => {
        arrive = resolve;
    });
    const again = refreshes[0]();
    assert.equal(bodyOf(mount).textContent, "first");
    assert.equal(mount.getAttribute("aria-busy"), null);
    arrive(["second"]);
    await again;
    assert.equal(bodyOf(mount).textContent, "second");
    const warn = console.warn;
    console.warn = () => {};
    try {
        answer = Promise.reject(new Error("offline"));
        await refreshes[0]();
    } finally {
        console.warn = warn;
    }
    assert.equal(bodyOf(mount).textContent, "second");
    assert.match(mount.querySelector(".fuad-as-of").textContent, /^As of /);
    assert.equal(mount.querySelector(".fuad-as-of").hidden, false);
});

test("a read cut off before MFL answered is told from MFL's answers and from v2's own errors", async () => {
    // fetch's rejection, as Safari (an iPhone), Chrome and Firefox word it
    for (const message of ["Load failed", "Failed to fetch", "NetworkError when attempting to fetch resource."]) {
        assert.equal(cutOff(new TypeError(message)), true, message);
    }
    const failing = (thrown) => () => Promise.reject(thrown);
    const exportError = (fetchImpl) => fetchExport("https://example.test/export", "liveScoring", {fetchImpl}).then(() => null, (error) => error);
    const network = await exportError(failing(new TypeError("Load failed")));
    assert.equal(network.message, "Couldn't load liveScoring: network error (Load failed)");
    assert.equal(cutOff(network), true);
    // MFL answered: an error page, a refusal, or something not JSON
    assert.equal(cutOff(await exportError(async () => ({ok: false, status: 500, statusText: ""}))), false);
    assert.equal(cutOff(await exportError(async () => ({ok: false, status: 429, statusText: ""}))), false);
    assert.equal(cutOff(await exportError(async () => ({ok: true, json: async () => { throw new SyntaxError("Unexpected token <"); }}))), false);
    // v2's own mistake, a TypeError too
    assert.equal(cutOff(new TypeError("Cannot read properties of undefined (reading 'week')")), false);
    assert.equal(cutOff(null), false);
});

test("a load cut off is tried once more after a wait; MFL's answers, and a load no longer wanted, aren't", async () => {
    mock.timers.enable({apis: ["setTimeout"]});
    const warn = console.warn;
    console.warn = () => {};
    try {
        const loads = (...results) => {
            const load = () => {
                load.calls += 1;
                const next = results.shift();
                return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
            };
            load.calls = 0;
            return load;
        };
        const settle = async (promise) => {
            const result = promise.then((value) => ({value}), (error) => ({error}));
            for (let i = 0; i < 5; i++) {
                await Promise.resolve();
            }
            mock.timers.tick(CUT_OFF_RETRY);
            return result;
        };
        const once = loads(new TypeError("Load failed"), "drawn");
        assert.deepEqual(await settle(retryCutOff(once, {what: "test"})), {value: "drawn"});
        assert.equal(once.calls, 2);
        const twice = loads(new TypeError("Load failed"), new TypeError("Load failed"));
        assert.equal((await settle(retryCutOff(twice, {what: "test"}))).error.message, "Load failed");
        assert.equal(twice.calls, 2);
        // MFL answered: shown at once
        const answered = loads(Object.assign(new Error("Couldn't load rosters: HTTP 500"), {status: 500}), "never");
        assert.match((await settle(retryCutOff(answered, {what: "test"}))).error.message, /HTTP 500/);
        assert.equal(answered.calls, 1);
        // the member moved on during the wait
        let wanted = true;
        const left = loads(new TypeError("Load failed"), "never");
        const leaving = retryCutOff(left, {what: "test", still: () => wanted});
        for (let i = 0; i < 5; i++) {
            await Promise.resolve();
        }
        wanted = false;
        mock.timers.tick(CUT_OFF_RETRY);
        assert.equal((await leaving.then(() => null, (error) => error)).message, "Load failed");
        assert.equal(left.calls, 1);
    } finally {
        console.warn = warn;
        mock.timers.reset();
    }
});
