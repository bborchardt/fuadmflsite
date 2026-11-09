import {test} from "node:test";
import assert from "node:assert/strict";
import {parseHTML} from "linkedom";
import {LAUNCH, launchedApp, linkWebApp, webAppManifest} from "../site/v2/ui/web-app.js";

const ORIGIN = "https://www44.myfantasyleague.com";
const ICONS = "https://bborchardt.github.io/fuadmflsite/v2/app/";
const context = {season: 2026, leagueId: "48571"};

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

// a page at `href`, with what linkWebApp and launchedApp use of the browser
function browserAt(href) {
    const blobs = [];
    const listeners = {};
    const browser = {
        location: Object.assign(new URL(href), {replace(to) {
            browser.replacedWith = to;
        }}),
        history: {state: null, replaceState(state, title, to) {
            browser.location = Object.assign(new URL(to, browser.location.href), {replace: browser.location.replace});
        }},
        URL: {createObjectURL: (blob) => `blob:${ORIGIN}/${blobs.push(blob)}`},
        Blob: class {
            constructor(parts, options) {
                this.text = parts.join("");
                this.type = options.type;
            }
        },
        addEventListener: (type, listener) => {
            listeners[type] = listener;
        },
        blobs,
        listeners
    };
    return browser;
}

const page = (head = "") => parseHTML(`<html><head><title>Fantasy Football: Fuad Reveiz Fan Club Dynasty League</title>${head}</head><body></body></html>`).document;

test("the manifest opens the season's home page on the page's own host, and stays one app across seasons", () => {
    const manifest = webAppManifest({origin: ORIGIN, season: 2026, leagueId: "48571", name: "League", shortName: "FUAD", iconBase: ICONS});
    assert.equal(manifest.start_url, `${ORIGIN}/2026/home/48571?${LAUNCH}=1`);
    // the whole host, so MFL's other pages and next season's stay in the app
    assert.equal(manifest.scope, `${ORIGIN}/`);
    assert.equal(manifest.display, "standalone");
    assert.equal(manifest.short_name, "FUAD");
    const next = webAppManifest({origin: ORIGIN, season: 2027, leagueId: "48571", name: "League", shortName: "FUAD", iconBase: ICONS});
    assert.equal(next.id, manifest.id);
    assert.ok(next.id.startsWith(`${ORIGIN}/`));
    assert.deepEqual(manifest.icons.map((icon) => [icon.src, icon.sizes, icon.purpose]), [
        [`${ICONS}icon-192.png`, "192x192", "any"],
        [`${ICONS}icon-512.png`, "512x512", "any"],
        [`${ICONS}icon-512.png`, "512x512", "maskable"]
    ]);
});

test("the page links the manifest, and the icon and name an iPhone takes, in place of MFL's", () => {
    const doc = page(`<link rel="apple-touch-icon" href="${ORIGIN}/apple-touch-icon.png" />`);
    const browser = browserAt(`${ORIGIN}/2026/options?L=48571&O=07`);
    linkWebApp(doc, {context, wordmark: "FUAD", iconBase: ICONS, browser});
    const link = doc.querySelector('link[rel="manifest"]');
    assert.equal(link.getAttribute("href"), `blob:${ORIGIN}/1`);
    const manifest = JSON.parse(browser.blobs[0].text);
    // from any page, the icon opens the home page
    assert.equal(manifest.start_url, `${ORIGIN}/2026/home/48571?${LAUNCH}=1`);
    // the same from every page, whatever MFL's title names
    assert.equal(manifest.name, "FUAD");
    assert.equal(browser.blobs[0].type, "application/manifest+json");
    const touch = doc.querySelectorAll('link[rel="apple-touch-icon"]');
    assert.equal(touch.length, 1);
    assert.equal(touch[0].getAttribute("href"), `${ICONS}apple-touch-icon.png`);
    assert.equal(doc.querySelector('meta[name="apple-mobile-web-app-title"]').getAttribute("content"), "FUAD");
    assert.equal(doc.querySelector('meta[name="apple-mobile-web-app-capable"]').getAttribute("content"), "yes");
    // Chrome's install bar stays away
    let prevented = false;
    browser.listeners.beforeinstallprompt({preventDefault: () => {
        prevented = true;
    }});
    assert.ok(prevented);
});

test("the iPhone's app keeps clear of the screen's edges; Safari's page keeps MFL's layout", () => {
    const viewport = '<meta name="viewport" content="initial-scale=1.0, width=device-width" />';
    const inSafari = page(viewport);
    linkWebApp(inSafari, {context, wordmark: "FUAD", iconBase: ICONS, browser: Object.assign(browserAt(`${ORIGIN}/2026/home/48571`), {navigator: {standalone: false}})});
    // read when the icon is added, which is in Safari
    assert.equal(inSafari.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]').getAttribute("content"), "black");
    assert.equal(inSafari.querySelector('meta[name="viewport"]').getAttribute("content"), "initial-scale=1.0, width=device-width");
    assert.ok(!inSafari.documentElement.classList.contains("fuad-app"));
    const inApp = page(viewport);
    const app = Object.assign(browserAt(`${ORIGIN}/2026/home/48571`), {navigator: {standalone: true}});
    linkWebApp(inApp, {context, wordmark: "FUAD", iconBase: ICONS, browser: app});
    linkWebApp(inApp, {context, wordmark: "FUAD", iconBase: ICONS, browser: app});
    assert.equal(inApp.querySelector('meta[name="viewport"]').getAttribute("content"), "initial-scale=1.0, width=device-width, viewport-fit=cover");
    assert.ok(inApp.documentElement.classList.contains("fuad-app"));
});

test("a page without MFL's icon gets ours", () => {
    const doc = page();
    linkWebApp(doc, {context, wordmark: "FUAD", iconBase: ICONS, browser: browserAt(`${ORIGIN}/2026/home/48571`)});
    assert.equal(doc.querySelector('link[rel="apple-touch-icon"]').getAttribute("href"), `${ICONS}apple-touch-icon.png`);
});

// MFL's league export for each season as `seasons` say: "site", "error" (a 200 with an error
// document), or an HTTP status; any other season is a 404
function mfl(seasons) {
    const asked = [];
    const fetchImpl = async (url) => {
        asked.push(url);
        const season = Number(new URL(url).pathname.split("/")[1]);
        const answer = seasons[season] || 404;
        const status = typeof answer === "number" ? answer : 200;
        const body = answer === "site" ? {league: {id: "48571"}} : {error: {$t: "Invalid league ID"}};
        return {status, ok: status === 200, json: async () => body};
    };
    return {asked, fetchImpl};
}

// what's kept under `key` made `by` older
function age(items, key, by) {
    const name = [...items.keys()].find((stored) => stored.startsWith(`${key}@`));
    const entry = JSON.parse(items.get(name));
    items.set(name, JSON.stringify({...entry, storedAt: entry.storedAt - by}));
}
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// what launchedApp asks behind the page has answered
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const launchAt = (season, query = "") => browserAt(`${ORIGIN}/${season}/home/48571?${LAUNCH}=1${query}`);
const launch = (season, browser, fetchImpl) => launchedApp({context: {season, leagueId: "48571"}, browser, fetchImpl});

test("a launch onto a past season's site goes on to the newest season's: behind the page, then at once for a year", () => withStorage(async (items) => {
    const year = new Date().getFullYear();
    const old = year - 2;
    const {asked, fetchImpl} = mfl({[old + 1]: "site", [old + 2]: "site"});
    const first = launchAt(old);
    // not known yet: the page draws while MFL is asked
    assert.equal(launch(old, first, fetchImpl), false);
    await settle();
    // as a launch, so that season's site looks for a newer one in a later year
    assert.equal(first.replacedWith, `${ORIGIN}/${year}/home/48571?${LAUNCH}=1`);
    // the league export, not the page
    assert.deepEqual(asked.map((url) => new URL(url).pathname), [`/${old + 1}/export`, `/${old + 2}/export`]);
    // the marker is taken off
    assert.equal(first.location.search, "");
    // MFL keeps a season's site, so a newer one found holds long after a day
    age(items, `fuad.appSeason.${old}`, 300 * DAY);
    const later = launchAt(old);
    assert.equal(launch(old, later, fetchImpl), true);
    assert.equal(later.replacedWith, `${ORIGIN}/${year}/home/48571?${LAUNCH}=1`);
    assert.equal(asked.length, 2);
}));

test("a launch before the new season's site exists stays, and asks MFL once a day", () => withStorage(async (items) => {
    const year = new Date().getFullYear();
    const {asked, fetchImpl} = mfl({});
    for (let count = 0; count < 2; count++) {
        const browser = launchAt(year - 1);
        assert.equal(launch(year - 1, browser, fetchImpl), false);
        await settle();
        assert.equal(browser.replacedWith, undefined);
    }
    assert.equal(asked.length, 1);
    // the next day it asks again, and finds the renewal
    age(items, `fuad.appSeason.${year - 1}`, DAY);
    const renewed = mfl({[year]: "site"});
    const browser = launchAt(year - 1);
    launch(year - 1, browser, renewed.fetchImpl);
    await settle();
    assert.equal(browser.replacedWith, `${ORIGIN}/${year}/home/48571?${LAUNCH}=1`);
}));

test("MFL's error document, a refusal or a failed request leave it unknown for an hour, not a day", async () => {
    const year = new Date().getFullYear();
    for (const answer of ["error", 429, "throws"]) {
        await withStorage(async (items) => {
            const browser = launchAt(year - 1);
            const fetchImpl = answer === "throws" ? async () => {
                throw new TypeError("Failed to fetch");
            } : mfl({[year]: answer}).fetchImpl;
            assert.equal(launch(year - 1, browser, fetchImpl), false);
            await settle();
            assert.equal(browser.replacedWith, undefined, String(answer));
            const renewed = mfl({[year]: "site"});
            launch(year - 1, launchAt(year - 1), renewed.fetchImpl);
            await settle();
            assert.equal(renewed.asked.length, 0, String(answer));
            age(items, `fuad.appSeason.${year - 1}`, HOUR);
            const later = launchAt(year - 1);
            launch(year - 1, later, renewed.fetchImpl);
            await settle();
            assert.equal(later.replacedWith, `${ORIGIN}/${year}/home/48571?${LAUNCH}=1`, String(answer));
        });
    }
});

test("a member who has tapped or typed before MFL answers stays, and the next launch moves at once", () => withStorage(async () => {
    const year = new Date().getFullYear();
    const {asked, fetchImpl} = mfl({[year]: "site"});
    const browser = launchAt(year - 1);
    assert.equal(launch(year - 1, browser, fetchImpl), false);
    browser.listeners.pointerdown();
    await settle();
    assert.equal(browser.replacedWith, undefined);
    const next = launchAt(year - 1);
    assert.equal(launch(year - 1, next, fetchImpl), true);
    assert.equal(next.replacedWith, `${ORIGIN}/${year}/home/48571?${LAUNCH}=1`);
    assert.equal(asked.length, 1);
}));

test("this season's site, or a visit rather than a launch, asks MFL nothing", () => withStorage(async () => {
    const year = new Date().getFullYear();
    const {asked, fetchImpl} = mfl({[year + 1]: "site"});
    const current = launchAt(year, "&X=1");
    assert.equal(launch(year, current, fetchImpl), false);
    assert.equal(current.location.search, "?X=1");
    const visit = browserAt(`${ORIGIN}/${year - 1}/home/48571`);
    assert.equal(launch(year - 1, visit, fetchImpl), false);
    await settle();
    assert.equal(asked.length, 0);
    assert.equal(visit.replacedWith, undefined);
}));

test("a manifest link already on the page is made ours, not followed by a second", () => {
    const doc = page('<link rel="manifest" href="/theirs.json">');
    const browser = browserAt(`${ORIGIN}/2026/home/48571`);
    linkWebApp(doc, {context, wordmark: "FUAD", iconBase: ICONS, browser});
    const links = doc.querySelectorAll('link[rel="manifest"]');
    assert.equal(links.length, 1);
    assert.equal(links[0].getAttribute("href"), `blob:${ORIGIN}/1`);
});

test("a past season's page, once a newer season is known, offers the newer one", () => withStorage(async () => {
    const year = new Date().getFullYear();
    launch(year - 1, launchAt(year - 1), mfl({[year]: "site"}).fetchImpl);
    await settle();
    const browser = browserAt(`${ORIGIN}/${year - 1}/standings?L=48571`);
    linkWebApp(page(), {context: {season: year - 1, leagueId: "48571"}, wordmark: "FUAD", iconBase: ICONS, browser});
    assert.equal(JSON.parse(browser.blobs[0].text).start_url, `${ORIGIN}/${year}/home/48571?${LAUNCH}=1`);
}));
