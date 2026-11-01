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
const {drawPanel} = await import("../site/v2/ui/panel.js");

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
