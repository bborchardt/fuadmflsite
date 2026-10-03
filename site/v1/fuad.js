// Entry point, loaded by the MFL league header on every league page:
//   <script type="module" src="https://bborchardt.github.io/fuadmflsite/v1/fuad.js"></script>
//
// Preview: add ?fuadPreview=v2 (a published version), ?fuadPreview=local (your laptop,
// see tools/dev-server.py) or ?fuadPreview=local:v2 to any league page URL. The choice is
// stored in this browser only; ?fuadPreview=off returns to the version in the header.

import {start} from "./ui/app.js";

const PREVIEW_KEY = "fuad.preview";
const PAGES_BASE = "https://bborchardt.github.io/fuadmflsite/";
const LOCAL_BASE = "http://localhost:8000/";
// Franchise snapshots are league data, not code: always read the published ones, even in a local preview.
const DATA_BASE = new URL("data/", PAGES_BASE);

const here = new URL("./", import.meta.url).href;
const versionHere = (here.match(/\/(v\d+)\/$/) || [])[1] || "v1";

function readPreview() {
    try {
        return window.localStorage.getItem(PREVIEW_KEY);
    } catch (error) {
        return null;
    }
}

function writePreview(value) {
    try {
        if (value) {
            window.localStorage.setItem(PREVIEW_KEY, value);
        } else {
            window.localStorage.removeItem(PREVIEW_KEY);
        }
    } catch (error) {
        // storage is blocked; preview just won't stick
    }
}

/** Turn a ?fuadPreview= value into a base URL. Only this repo's versions and localhost are allowed. */
function previewBase(choice) {
    let match;
    if ((match = /^(v\d+)$/.exec(choice))) {
        return `${PAGES_BASE}${match[1]}/`;
    }
    if ((match = /^local(?::(v\d+))?$/.exec(choice))) {
        return `${LOCAL_BASE}${match[1] || versionHere}/`;
    }
    return null;
}

function allowed(base) {
    return /^https:\/\/bborchardt\.github\.io\/fuadmflsite\/v\d+\/$/.test(base)
        || /^http:\/\/(localhost|127\.0\.0\.1):\d+\/v\d+\/$/.test(base);
}

/** Apply ?fuadPreview= from the address bar, then drop it from the URL. */
function takePreviewParam() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("fuadPreview")) {
        return;
    }
    const choice = params.get("fuadPreview");
    writePreview(choice === "off" ? null : previewBase(choice));
    params.delete("fuadPreview");
    const query = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : "") + window.location.hash);
}

function previewBadge(base, problem) {
    const badge = document.createElement("div");
    badge.id = "fuad-preview";
    const version = (base.match(/(v\d+)\/$/) || [])[1];
    const isLocal = /localhost|127\.0\.0\.1/.test(base);
    const label = isLocal ? `local ${version}` : version;
    const hint = isLocal
        ? "Is tools/dev-server.py running, and does the browser allow this site to access your local network? "
        : "Is that version published? ";
    badge.textContent = problem
        ? `Preview of ${label} failed to load, so it's been turned off. ${hint}`
        : `Previewing ${label}. `;
    if (!problem) {
        const exit = document.createElement("a");
        const url = new URL(window.location.href);
        url.searchParams.set("fuadPreview", "off");
        exit.href = url.href;
        exit.textContent = "Exit preview";
        badge.append(exit);
    }
    document.body.append(badge);
}

/** Run this version: the one the header loads, or the one being previewed. */
function boot() {
    window.fuadVersion = versionHere;
    start({dataBase: DATA_BASE}).catch((error) => console.error("[fuad]", error));
}

/** Swap this version for the previewed one: its stylesheet replaces ours, its script runs instead. */
function loadPreview(base) {
    const ours = [...document.querySelectorAll("link[rel=stylesheet]")].filter((link) => link.href === `${here}fuad.css`);
    ours.forEach((link) => {
        link.disabled = true;
    });
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = `${base}fuad.css`;
    document.head.append(style);
    const script = document.createElement("script");
    script.type = "module";
    script.src = `${base}fuad.js`;
    script.onerror = () => {
        // Forget a preview that can't load, so a shared ?fuadPreview= link can't leave someone
        // stuck, and fall back to the header's version for this page.
        writePreview(null);
        style.remove();
        ours.forEach((link) => {
            link.disabled = false;
        });
        previewBadge(base, true);
        boot();
    };
    document.head.append(script);
}

takePreviewParam();
const preview = readPreview();
if (preview && allowed(preview) && preview !== here) {
    loadPreview(preview);
} else {
    if (preview && preview === here) {
        previewBadge(here, false);
    }
    boot();
}
