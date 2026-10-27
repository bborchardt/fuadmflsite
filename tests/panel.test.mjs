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

test("a saved copy render can't draw is dropped and loaded afresh", async () => {
    items.set("fuad.test", JSON.stringify({storedAt: Date.now(), value: [{team: "Old"}]}));
    const mount = document.getElementById("mount");
    const render = (moves, body) => {
        body.innerHTML = moves.map((move) => `<p>${move.teamIds[0]}</p>`).join("");
    };
    const warn = console.warn;
    console.warn = () => {};
    try {
        const value = await drawPanel(mount, {what: "recent moves", key: "fuad.test", load: async () => [{team: "New", teamIds: ["0001"]}], render});
        assert.deepEqual(value, [{team: "New", teamIds: ["0001"]}]);
    } finally {
        console.warn = warn;
    }
    assert.equal(mount.querySelector(".fuad-panel-body").textContent, "0001");
    assert.deepEqual(JSON.parse(items.get("fuad.test")).value, [{team: "New", teamIds: ["0001"]}]);
});
