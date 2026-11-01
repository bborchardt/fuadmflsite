// Entry point: the header message loads one version's fuad.js on every league page, and it decides
// which version runs (docs/design.md: previews and the beta). A version it hands the page to only runs.

import {pageContext, start} from "./ui/app.js";
import {pageOf} from "./ui/nav.js";
import {LEAVE_BETA, PAGES_BASE, betaOffer, decide, leaveBetaHref, offeredVersion, withParam} from "./loader.js";
import {applyLook, keepResponsive, markCommish} from "./ui/looks.js";

const PREVIEW_KEY = "fuad.preview";
const BETA_KEY = "fuad.beta";
// snapshots are league data, not code: always read the published ones, even in a local preview
const DATA_BASE = new URL("data/", PAGES_BASE);

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

function leaveLink(text) {
    const anchor = link(text, leaveBetaHref(window.location));
    anchor.setAttribute(LEAVE_BETA, "");
    return anchor;
}

// before the link loads the page, so the header finds no choice (loader.js: LEAVE_BETA); not when
// it opens in another tab or window, which would leave this one in the beta without its choice
document.addEventListener("click", (event) => {
    const elsewhere = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
    if (!elsewhere && event.target.closest && event.target.closest(`a[${LEAVE_BETA}]`)) {
        storage.set(BETA_KEY, null);
    }
}, true);

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
        bar.append(leaveLink("Leave the beta"));
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
        bar.append(leaveLink("Back to the current site"));
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

// The header hides the page while a beta or preview loads (at most a few seconds); whichever
// version runs shows it again.
function reveal() {
    document.documentElement.classList.remove("fuad-cloak");
}

function boot(beta) {
    window.fuadVersion = versionHere;
    try {
        keepResponsive(document);
    } catch (error) {
        console.warn("[fuad] couldn't restore the phone layout:", error);
    }
    // before the page shows: the member's look is in MFL's page already
    try {
        applyLook(document);
        markCommish(document);
    } catch (error) {
        console.warn("[fuad] couldn't apply the look:", error);
    }
    const context = pageContext();
    const loader = window.fuadLoader;
    // `started` only when the header's version handed this page over: after a beta fails to load,
    // the header's own version runs with the mode still "beta"
    const inBeta = loader.started && loader.mode === "beta" ? {feedback: loader.feedback} : null;
    // in the beta, the bar that leads back is hidden until something fails (docs/design.md)
    const onTrouble = () => document.documentElement.classList.add("fuad-trouble");
    if (inBeta) {
        document.documentElement.classList.add("fuad-beta");
    }
    let drawn;
    const viewDrawn = new Promise((resolve) => {
        drawn = resolve;
    });
    // loaded on its own, so a failure here leaves MFL's menus and the rest of the page working
    (context ? import("./ui/frame.js").then(({drawFrame}) => drawFrame({context})) : Promise.resolve())
        .catch((error) => {
            console.error("[fuad] couldn't draw the frame:", error);
            onTrouble();
        })
        // a view v2 draws over MFL's page (its fuad-…-on class, set by now) shows once it has drawn,
        // so MFL's page doesn't show first
        .then(() => (/\bfuad-[a-z-]+-on\b/.test(document.documentElement.className) ? viewDrawn : null))
        .then(reveal);
    start({dataBase: DATA_BASE, beta, inBeta, onTrouble, onDrawn: drawn})
        .finally(drawn)
        .then((alertsShown) => {
            // the home page without League Alerts would leave no way back
            if (!alertsShown && pageOf(window.location).path === "home") {
                onTrouble();
            }
        })
        .catch((error) => {
            console.error("[fuad]", error);
            onTrouble();
        });
}

// drawn here, so the way back is there even if the other version's code doesn't run
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
        // a broken preview is forgotten, so a shared ?fuadPreview= link can't leave someone stuck; a beta is
        // kept, since the failure may pass
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
    // onload without a start: fetched, but a syntax error or a failing import stopped it
    script.onerror = fallBack;
    script.onload = () => {
        if (!window.fuadLoader.started) {
            fallBack();
        }
    };
    document.head.append(script);
}

if (window.fuadLoader) {
    // handed this page by the header's version, which drew the bar (unless it's older code)
    window.fuadLoader.started = true;
    if (!window.fuadLoader.barShown) {
        showBar({mode: window.fuadLoader.mode, base: here, feedback: window.fuadLoader.feedback});
    }
    boot(null);
} else {
    window.fuadLoader = {};
    const offer = betaOffer(window.fuadBeta, {versionHere, teamId: window.franchise_id});
    const params = new URLSearchParams(window.location.search);
    const target = decide({
        here, versionHere, params, preview: storage.get(PREVIEW_KEY), beta: storage.get(BETA_KEY), offer,
        offered: offeredVersion(window.fuadBeta, versionHere)
    });
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
