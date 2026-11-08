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

test("a page without MFL's icon gets ours", () => {
    const doc = page();
    linkWebApp(doc, {context, wordmark: "FUAD", iconBase: ICONS, browser: browserAt(`${ORIGIN}/2026/home/48571`)});
    assert.equal(doc.querySelector('link[rel="apple-touch-icon"]').getAttribute("href"), `${ICONS}apple-touch-icon.png`);
});

// MFL answers each season's home page as `seasons` say: 200 for a site, 404 for none
function mfl(seasons) {
    const asked = [];
    const fetchImpl = async (url, init) => {
        asked.push([url, init.method]);
        const season = Number(new URL(url).pathname.split("/")[1]);
        return {status: seasons[season] || 404, ok: (seasons[season] || 404) === 200};
    };
    return {asked, fetchImpl};
}

// what launchedApp asks behind the page has answered
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const launchAt = (season, query = "") => browserAt(`${ORIGIN}/${season}/home/48571?${LAUNCH}=1${query}`);
const launch = (season, browser, fetchImpl) => launchedApp({context: {season, leagueId: "48571"}, browser, fetchImpl});

test("a launch onto a past season's site goes on to the newest season's: behind the page, then at once that day", () => withStorage(async () => {
    const year = new Date().getFullYear();
    const old = year - 2;
    const {asked, fetchImpl} = mfl({[old + 1]: 200, [old + 2]: 200});
    const first = launchAt(old);
    // not known yet: the page draws while MFL is asked
    assert.equal(launch(old, first, fetchImpl), false);
    await settle();
    assert.equal(first.replacedWith, `${ORIGIN}/${year}/home/48571`);
    assert.deepEqual(asked.map(([, method]) => method), ["HEAD", "HEAD"]);
    // the marker is taken off
    assert.equal(first.location.search, "");
    const next = launchAt(old);
    assert.equal(launch(old, next, fetchImpl), true);
    assert.equal(next.replacedWith, `${ORIGIN}/${year}/home/48571`);
    assert.equal(asked.length, 2);
}));

test("a launch before the new season's site exists stays, and asks MFL once a day", () => withStorage(async () => {
    const year = new Date().getFullYear();
    const {asked, fetchImpl} = mfl({});
    for (let count = 0; count < 2; count++) {
        const browser = launchAt(year - 1);
        assert.equal(launch(year - 1, browser, fetchImpl), false);
        await settle();
        assert.equal(browser.replacedWith, undefined);
    }
    assert.equal(asked.length, 1);
}));

test("a refusal or a failed request counts as no new season for the day", () => withStorage(async () => {
    const year = new Date().getFullYear();
    const refused = mfl({[year]: 429});
    const browser = launchAt(year - 1);
    assert.equal(launch(year - 1, browser, refused.fetchImpl), false);
    await settle();
    assert.equal(browser.replacedWith, undefined);
    const renewed = mfl({[year]: 200});
    assert.equal(launch(year - 1, launchAt(year - 1), renewed.fetchImpl), false);
    await settle();
    assert.equal(renewed.asked.length, 0);
}));

test("a request that fails outright is kept as no new season too", () => withStorage(async () => {
    const year = new Date().getFullYear();
    const browser = launchAt(year - 1);
    launch(year - 1, browser, async () => {
        throw new TypeError("Failed to fetch");
    });
    await settle();
    assert.equal(browser.replacedWith, undefined);
    let asked = 0;
    launch(year - 1, launchAt(year - 1), async () => ({ok: true, status: 200, asked: ++asked}));
    await settle();
    assert.equal(asked, 0);
}));

test("this season's site, or a visit rather than a launch, asks MFL nothing", () => withStorage(async () => {
    const year = new Date().getFullYear();
    const {asked, fetchImpl} = mfl({[year + 1]: 200});
    const current = launchAt(year, "&X=1");
    assert.equal(launch(year, current, fetchImpl), false);
    assert.equal(current.location.search, "?X=1");
    const visit = browserAt(`${ORIGIN}/${year - 1}/home/48571`);
    assert.equal(launch(year - 1, visit, fetchImpl), false);
    await settle();
    assert.equal(asked.length, 0);
    assert.equal(visit.replacedWith, undefined);
}));
