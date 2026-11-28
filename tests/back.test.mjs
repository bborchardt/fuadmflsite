// A screen shown again (ui/back.js) refreshes once what it shows is older than MOVES_KEPT, in each way
// of coming back, and not when it isn't the screen in view or was drawn just now; and every screen
// takes part.

import {test} from "node:test";
import assert from "node:assert/strict";
import {parseHTML} from "./fixtures/dom.mjs";

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
});

test("a section's view back from another under its own #", async () => {
    root.classList.add("fuad-league-on");
    let hash = "#league-standings";
    let refreshed = 0;
    onBack({showing: () => root.classList.contains("fuad-league-on") && hash === "#league-standings", section: "League", refresh: () => refreshed++});
    hash = "#league-power";
    window.dispatchEvent(new window.Event("hashchange"));
    now += MOVES_KEPT;
    hash = "#league-standings";
    window.dispatchEvent(new window.Event("hashchange"));
    assert.equal(refreshed, 1);
    root.classList.remove("fuad-league-on");
    await settled();
});

test("a page of its own loads again, unless the member has tapped or typed on it", async () => {
    const {reloadIfUntouched} = await import("../site/v2/ui/back.js");
    let reloads = 0;
    // jsdom's location can't be replaced, so the page's window is one whose location counts reloads
    const location = {hash: "", reload: () => reloads++};
    globalThis.window = new Proxy(window, {get: (target, name) => {
        if (name === "location") {
            return location;
        }
        const value = Reflect.get(target, name, target);
        return typeof value === "function" && !/^[A-Z]/.test(String(name)) ? value.bind(target) : value;
    }});
    try {
        reloadIfUntouched("Lineup");
        now += MOVES_KEPT;
        document.dispatchEvent(new window.Event("visibilitychange"));
        assert.equal(reloads, 1);
        document.body.dispatchEvent(new window.Event("click", {bubbles: true}));
        now += MOVES_KEPT;
        document.dispatchEvent(new window.Event("visibilitychange"));
        assert.equal(reloads, 1);
    } finally {
        globalThis.window = window;
    }
});

// Every screen takes part: a page of its own says what it does when shown again, and every panel on
// Home, League and Rosters is loaded again (drawPanel's `refreshes`)
test("every v2 screen is refreshed when shown again", async () => {
    const {ROUTES} = await import("../site/v2/ui/routes.js");
    for (const route of ROUTES) {
        assert.ok(["reload", "as left"].includes(route.shownAgain), `${route.name} says what it does when shown again`);
    }
    const {readFileSync} = await import("node:fs");
    for (const file of ["home", "league", "rosters", "scores"]) {
        const source = readFileSync(new URL(`../site/v2/ui/${file}.js`, import.meta.url), "utf8");
        let at = source.indexOf("drawPanel(", source.indexOf("export function"));
        let calls = 0;
        while (at !== -1) {
            let depth = 0;
            let end = at + "drawPanel".length;
            do {
                depth += {"(": 1, ")": -1}[source[end]] || 0;
                end++;
            } while (depth > 0 && end < source.length);
            const call = source.slice(at, end);
            assert.match(call, /\brefreshes\b/, `${file}.js: ${call.split("\n")[0]}`);
            calls++;
            at = source.indexOf("drawPanel(", end);
        }
        assert.ok(calls > 0, file);
    }
});
test.after(() => {
    Date.now = realNow;
});
