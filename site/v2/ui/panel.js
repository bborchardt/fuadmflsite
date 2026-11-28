// One loading and error pattern for every panel: a first load shows the heading over placeholder
// bars, so nothing jumps; a cached copy shows at once and refreshes quietly; a failed refresh keeps
// it, dated; a failed load with nothing cached says so with Retry, the other panels unaffected.

import {esc} from "./html.js";
import {save, saved} from "./store.js";
import {waitLeft} from "./page-fetch.js";
import {clock} from "./format.js";

// MFL refusing a burst (HTTP 429), as against any other failure
export const refused = (error) => Boolean(error && error.status === 429);

// a read cut off before MFL answered (a phone's signal dropping, the app put away): fetchExport's, or
// fetch's own rejection as each browser words it ("Load failed" on an iPhone)
export const cutOff = (error) => Boolean(error && (error.cutOff
    || error.name === "TypeError" && /^(?:Load failed|Failed to fetch|NetworkError when attempting to fetch resource\.?)$/.test(error.message)));

// how long a load cut off waits to be tried again
export const CUT_OFF_RETRY = 3000;

// `load()`, tried once more CUT_OFF_RETRY on when a read was cut off (on a phone the signal is often
// back by then) and `still()` says it's still wanted; warned, as only a second failure is the
// member's to see. `what` names it in the warning. Any other failure is at once.
export function retryCutOff(load, {what, still = () => true}) {
    return Promise.resolve().then(load).catch((error) => {
        if (!cutOff(error) || !still()) {
            throw error;
        }
        console.warn(`[fuad] ${what} cut off, trying again:`, error);
        return new Promise((resolve) => setTimeout(resolve, CUT_OFF_RETRY)).then(() => {
            if (!still()) {
                throw error;
            }
            return load();
        });
    });
}

// "Couldn't load standings." and Retry; when MFL asked to wait, Retry is off until the wait is over.
// `basic`: the MFL page the view replaces (nav.js basicHref), as Basic view, so a member always has
// a way on; the site's link rewriting leaves it be (frame.js).
export function failedMarkup(what, error, basic = null) {
    const text = refused(error) ? "Server is busy. Try again in a few seconds." : `Couldn’t load ${esc(what)}.`;
    const fallback = basic ? `<a class="fuad-quiet" href="${esc(basic)}" data-fuad-basic>Basic view</a>` : "";
    return `<div class="fuad-failed" role="alert"><span>${text}</span><span class="fuad-failed-actions"><button type="button" class="fuad-quiet">Retry</button>${fallback}</span></div>`;
}

export function armRetry(button, error, retry) {
    button.addEventListener("click", retry);
    if (refused(error) && waitLeft()) {
        button.disabled = true;
        setTimeout(() => {
            button.disabled = false;
        }, waitLeft());
    }
}

export function placeholders(rows = 3) {
    const widths = ["78%", "56%", "66%", "48%", "72%"];
    return `<div class="fuad-placeholder" aria-hidden="true">${Array.from({length: rows}, (_, i) =>
        `<span style="width: ${widths[i % widths.length]}"></span>`).join("")}</div>`;
}

// `mount` gets the panel's markup. `what` names it in "Couldn't load standings.". `key` and
// `maxAge` cache what `load` resolves to; `render(value, body)` draws it into the body. `actions`
// is markup for the heading's row (a count, a link, a button). `basic`: failedMarkup's. `refreshes`,
// when given, gets the panel's load again (ui/back.js), which keeps what's shown until it's in.
export function drawPanel(mount, {heading = "", actions = "", what, key = null, maxAge = 0, load, render, rows = 3, basic = null, refreshes = null}) {
    const title = heading ? `<h2 class="fuad-panel-heading">${esc(heading)}</h2>` : "";
    let body;
    let asOf;
    const frame = () => {
        mount.classList.add("fuad-panel");
        mount.innerHTML = `${actions ? `<div class="fuad-panel-head">${title}<span class="fuad-panel-actions">${actions}</span></div>` : title}<p class="fuad-as-of" hidden></p><div class="fuad-panel-body"></div>`;
        body = mount.querySelector(".fuad-panel-body");
        asOf = mount.querySelector(".fuad-as-of");
    };
    frame();
    let entry = key ? saved(key) : null;

    const show = (value) => {
        mount.removeAttribute("aria-busy");
        body.innerHTML = "";
        render(value, body);
    };
    const run = () => {
        // with nothing shown, a load cut off is tried again before it says so
        const first = !entry;
        if (first) {
            mount.setAttribute("aria-busy", "true");
            body.innerHTML = placeholders(rows);
        }
        return (first ? retryCutOff(load, {what}) : Promise.resolve().then(load)).then((value) => {
            if (key) {
                save(key, value);
            }
            entry = {value, storedAt: Date.now()};
            asOf.hidden = true;
            show(value);
            return value;
        }, (error) => {
            if (entry) {
                console.warn(`[fuad] couldn't refresh ${what}:`, error);
                asOf.textContent = `As of ${clock(Math.floor(entry.storedAt / 1000))}`;
                asOf.hidden = false;
                return entry.value;
            }
            // what the member sees fail is logged as an error, which the header's devices form counts
            console.error(`[fuad] couldn't load ${what}:`, error);
            mount.removeAttribute("aria-busy");
            body.innerHTML = failedMarkup(what, error, basic);
            armRetry(body.querySelector("button"), error, run);
            return null;
        });
    };

    if (refreshes) {
        refreshes.push(run);
    }
    if (entry) {
        try {
            show(entry.value);
        } catch (error) {
            // a copy saved by an older version, in a shape `render` no longer reads: loaded afresh,
            // in a new frame, as what `render` changed before it threw (a count, a class) is wrong
            console.warn(`[fuad] dropped the saved ${what}:`, error);
            entry = null;
            frame();
        }
        if (entry && Date.now() - entry.storedAt < maxAge) {
            return Promise.resolve(entry.value);
        }
    }
    return run();
}

// MFL gave a page or feed v2 doesn't recognise, which v2 steps back from. Logged as an error, so the
// header's devices form counts it: an MFL change is seen without a member reporting it
// (docs/design.md: Outside change).
export function pageChanged(what, detail = "") {
    console.error(`[fuad] MFL's ${what} has changed${detail ? `: ${detail}` : ""}`);
}
