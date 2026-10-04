// Entry point, loaded by the MFL league header on every league page:
//   <script type="module" src="https://bborchardt.github.io/fuadmflsite/v1/fuad.js"></script>
//
// Preview: add ?fuadPreview=v2 (a published version), ?fuadPreview=local (your laptop,
// see tools/dev-server.py) or ?fuadPreview=local:v2 to any league page URL. The choice is
// stored in this browser only; ?fuadPreview=off returns to the version in the header.
// Beta: the header message can offer members a version to try (see loader.js); ?fuadBeta=on
// and ?fuadBeta=off switch to it and back, in this browser only.
//
// The entry point the header loads decides which version runs. When it hands the page to
// another version, that version's entry point only shows its bar and runs.

import {start} from "./ui/app.js";
import {betaOffer, decide, withParam} from "./loader.js";

const PREVIEW_KEY = "fuad.preview";
const BETA_KEY = "fuad.beta";
// Franchise snapshots are league data, not code: always read the published ones, even in a local preview.
const DATA_BASE = new URL("data/", "https://bborchardt.github.io/fuadmflsite/");

const here = new URL("./", import.meta.url).href;
const versionHere = (here.match(/\/(v\d+)\/$/) || [])[1] || "v1";

const storage = {
    get(key) {
        try {
            return window.localStorage.getItem(key);
        } catch (error) {
            return null;
        }
    },
    set(key, value) {
        try {
            if (value) {
                window.localStorage.setItem(key, value);
            } else {
                window.localStorage.removeItem(key);
            }
        } catch (error) {
            // storage is blocked; the choice just won't stick
        }
    }
};

const isLocal = (base) => /localhost|127\.0\.0\.1/.test(base);
const versionOf = (base) => (base.match(/(v\d+)\/$/) || [])[1];

function link(text, href) {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.textContent = text;
    return anchor;
}

/** The bar at the bottom of the page while another version than the header's runs, or when one failed to load. */
function showBar({mode, base, feedback, failed}) {
    const drawn = document.getElementById("fuad-preview");
    if (drawn) {
        drawn.remove();
    }
    const bar = document.createElement("div");
    bar.id = "fuad-preview";
    const label = isLocal(base) ? `local ${versionOf(base)}` : versionOf(base);
    if (failed && mode === "beta") {
        bar.textContent = "The beta couldn't load, so this is the current site. ";
        bar.append(link("Leave the beta", withParam(window.location.href, "fuadBeta", "off")));
    } else if (failed) {
        bar.textContent = `Preview of ${label} failed to load, so it's been turned off. `
            + (isLocal(base)
                ? "Is tools/dev-server.py running, and does the browser allow this site to access your local network? "
                : "Is that version published? ");
    } else if (mode === "beta") {
        bar.textContent = "You're using the beta of the league site. ";
        if (feedback) {
            bar.append(link("Send feedback", feedback), " · ");
        }
        bar.append(link("Back to the current site", withParam(window.location.href, "fuadBeta", "off")));
    } else {
        bar.textContent = `Previewing ${label}. `;
        bar.append(link("Exit preview", withParam(window.location.href, "fuadPreview", "off")));
    }
    const put = () => document.body.append(bar);
    if (document.body) {
        put();
    } else {
        document.addEventListener("DOMContentLoaded", put);
    }
}

/** Run this version. `beta` is the offer League Alerts shows, if this is the header's version. */
function boot(beta) {
    window.fuadVersion = versionHere;
    start({dataBase: DATA_BASE, beta}).catch((error) => console.error("[fuad]", error));
}

/**
 * Hand the page to another version: its stylesheet replaces ours, its script runs instead. This
 * version draws the bar, so the way back is there even if the other one's code doesn't run.
 */
function handOver(target, offer) {
    const feedback = offer && offer.feedback;
    window.fuadLoader = {mode: target.mode, feedback, barShown: true};
    showBar({mode: target.mode, base: target.load, feedback});
    const ours = [...document.querySelectorAll("link[rel=stylesheet]")].filter((sheet) => sheet.href === `${here}fuad.css`);
    ours.forEach((sheet) => {
        sheet.disabled = true;
    });
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = `${target.load}fuad.css`;
    document.head.append(style);
    const script = document.createElement("script");
    script.type = "module";
    script.src = `${target.load}fuad.js`;
    const fallBack = () => {
        // a developer preview that can't load or run is forgotten, so a shared ?fuadPreview= link
        // can't leave someone stuck; a beta is kept, since the failure may pass. Either way this
        // page falls back to the header's version
        if (target.mode === "preview") {
            storage.set(PREVIEW_KEY, null);
        }
        style.remove();
        ours.forEach((sheet) => {
            sheet.disabled = false;
        });
        showBar({mode: target.mode, base: target.load, failed: true});
        boot(null);
    };
    // onerror: it couldn't be fetched. onload with no start: it was fetched, but a syntax error
    // or a failing import stopped it before it ran
    script.onerror = fallBack;
    script.onload = () => {
        if (!window.fuadLoader.started) {
            fallBack();
        }
    };
    document.head.append(script);
}

if (window.fuadLoader) {
    // the header's version handed the page to this one, and drew the bar (unless it's older code)
    window.fuadLoader.started = true;
    if (!window.fuadLoader.barShown) {
        showBar({mode: window.fuadLoader.mode, base: here, feedback: window.fuadLoader.feedback});
    }
    boot(null);
} else {
    window.fuadLoader = {};
    const offer = betaOffer(window.fuadBeta, {versionHere, teamId: window.franchise_id});
    const params = new URLSearchParams(window.location.search);
    const target = decide({here, versionHere, params, preview: storage.get(PREVIEW_KEY), beta: storage.get(BETA_KEY), offer});
    storage.set(PREVIEW_KEY, target.preview);
    storage.set(BETA_KEY, target.beta);
    if (params.has("fuadPreview") || params.has("fuadBeta")) {
        params.delete("fuadPreview");
        params.delete("fuadBeta");
        const query = params.toString();
        window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : "") + window.location.hash);
    }
    if (target.load) {
        handOver(target, offer);
    } else {
        boot(offer);
    }
}
