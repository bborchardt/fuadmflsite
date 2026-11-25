// A panel's saved copy: one from an older version that its render no longer reads is loaded afresh,
// not left to break the page.

import {test} from "node:test";
import assert from "node:assert/strict";
import {parseHTML} from "linkedom";

const {window, document} = parseHTML("<!doctype html><html><body><div id=mount></div></body></html>");
const items = new Map();
window.localStorage = {getItem: (key) => (items.has(key) ? items.get(key) : null), setItem: (key, value) => items.set(key, String(value))};
globalThis.window = window;
globalThis.document = document;
const {drawPanel, failedMarkup} = await import("../site/v2/ui/panel.js");

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
