// A screen shown again (ui/back.js) refreshes once what it shows is older than MOVES_KEPT, in each way
// of coming back, and not when it isn't the screen in view or was drawn just now.

import {test} from "node:test";
import assert from "node:assert/strict";
import {parseHTML} from "linkedom";

const {window, document} = parseHTML("<!doctype html><html><body></body></html>");
globalThis.window = window;
globalThis.document = document;
globalThis.MutationObserver = window.MutationObserver;
globalThis.CustomEvent = window.CustomEvent;
const {onBack} = await import("../site/v2/ui/back.js");
const {sectionTapped} = await import("../site/v2/ui/kept.js");
const {MOVES_KEPT} = await import("../site/v2/ui/page-fetch.js");

const realNow = Date.now;
let now = 1_800_000_000_000;
Date.now = () => now;
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));
const root = document.documentElement;

function screen(section) {
    const name = `fuad-${section.toLowerCase()}-on`;
    root.classList.add(name);
    let refreshed = 0;
    onBack({showing: () => root.classList.contains(name), section, refresh: () => refreshed++});
    return {count: () => refreshed, name};
}

test("shown again after the keep time: the app or tab come back to, Back from the cache, its section tapped", async () => {
    const home = screen("Home");
    const ways = [
        () => document.dispatchEvent(new window.Event("visibilitychange")),
        () => window.dispatchEvent(Object.assign(new window.Event("pageshow"), {persisted: true})),
        () => sectionTapped("Home")
    ];
    for (const [at, way] of ways.entries()) {
        now += MOVES_KEPT;
        way();
        await settled();
        assert.equal(home.count(), at + 1);
    }
    // a page loaded anew isn't a page shown again, nor another section's tap
    now += MOVES_KEPT;
    window.dispatchEvent(Object.assign(new window.Event("pageshow"), {persisted: false}));
    sectionTapped("Lineup");
    await settled();
    assert.equal(home.count(), 3);
    root.classList.remove(home.name);
});

test("back from another view on the page, as the frame marks it", async () => {
    const rosters = screen("Rosters");
    root.classList.remove(rosters.name);
    await settled();
    now += MOVES_KEPT;
    root.classList.add(rosters.name);
    await settled();
    assert.equal(rosters.count(), 1);
    // another class changing while it's in view isn't coming back
    now += MOVES_KEPT;
    root.classList.add("fuad-leaving");
    await settled();
    assert.equal(rosters.count(), 1);
    root.classList.remove(rosters.name, "fuad-leaving");
    await settled();
});

test("not within the keep time, and not while another screen is in view", async () => {
    const league = screen("League");
    now += MOVES_KEPT - 1;
    document.dispatchEvent(new window.Event("visibilitychange"));
    sectionTapped("League");
    await settled();
    assert.equal(league.count(), 0);
    root.classList.remove(league.name);
    await settled();
    now += MOVES_KEPT;
    document.dispatchEvent(new window.Event("visibilitychange"));
    await settled();
    assert.equal(league.count(), 0);
    Date.now = realNow;
});
