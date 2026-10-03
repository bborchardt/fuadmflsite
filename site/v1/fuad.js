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
    badge.textContent = problem ? `Preview of ${label} failed to load. ${hint}` : `Previewing ${label}. `;
    const exit = document.createElement("a");
    exit.href = "?fuadPreview=off";
    exit.textContent = "Exit preview";
    badge.append(exit);
    document.body.append(badge);
}

/** Swap this version for the previewed one: its stylesheet replaces ours, its script runs instead. */
function loadPreview(base) {
    for (const link of document.querySelectorAll("link[rel=stylesheet]")) {
        if (link.href === `${here}fuad.css`) {
            link.disabled = true;
        }
    }
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = `${base}fuad.css`;
    document.head.append(style);
    const script = document.createElement("script");
    script.type = "module";
    script.src = `${base}fuad.js`;
    script.onerror = () => previewBadge(base, true);
    document.head.append(script);
}

takePreviewParam();
const preview = readPreview();
if (preview && allowed(preview) && preview !== here) {
    loadPreview(preview);
} else {
    window.fuadVersion = versionHere;
    if (preview && preview === here) {
        previewBadge(here, false);
    }
    start({dataBase: new URL("../data/", import.meta.url)}).catch((error) => console.error("[fuad]", error));
}
