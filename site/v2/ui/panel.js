// One loading and error pattern for every panel: a first load shows the heading over placeholder
// bars, so nothing jumps; a cached copy shows at once and refreshes quietly; a failed refresh keeps
// it, dated; a failed load with nothing cached says so with Retry, the other panels unaffected.

import {esc} from "./html.js";
import {save, saved} from "./store.js";
import {waitLeft} from "./page-fetch.js";
import {TIME_ZONE, zoneLabel} from "../lib/zone.js";

// MFL refusing a burst (HTTP 429), as against any other failure
export const refused = (error) => Boolean(error && error.status === 429);

// "Couldn't load standings." and Retry; when MFL asked to wait, Retry is off until the wait is over
export function failedMarkup(what, error) {
    const text = refused(error) ? "MFL asked us to wait. Retry in a few seconds." : `Couldn’t load ${esc(what)}.`;
    return `<div class="fuad-failed" role="alert"><span>${text}</span><button type="button" class="fuad-quiet">Retry</button></div>`;
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

// "7:42 p.m.", as the league's pages write times (" CT" after it where the device's clock differs)
export function clockText(date) {
    return date.toLocaleTimeString("en-US", {hour: "numeric", minute: "2-digit", timeZone: TIME_ZONE})
        .replace(/\s?AM$/, " a.m.").replace(/\s?PM$/, " p.m.") + zoneLabel(Math.floor(date.getTime() / 1000));
}

export function placeholders(rows = 3) {
    const widths = ["78%", "56%", "66%", "48%", "72%"];
    return `<div class="fuad-placeholder" aria-hidden="true">${Array.from({length: rows}, (_, i) =>
        `<span style="width: ${widths[i % widths.length]}"></span>`).join("")}</div>`;
}

// `mount` gets the panel's markup. `what` names it in "Couldn't load standings.". `key` and
// `maxAge` cache what `load` resolves to; `render(value, body)` draws it into the body. `actions`
// is markup for the heading's row (a count, a link, a button).
export function drawPanel(mount, {heading = "", actions = "", what, key = null, maxAge = 0, load, render, rows = 3}) {
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
        if (!entry) {
            mount.setAttribute("aria-busy", "true");
            body.innerHTML = placeholders(rows);
        }
        return Promise.resolve().then(load).then((value) => {
            if (key) {
                save(key, value);
            }
            asOf.hidden = true;
            show(value);
            return value;
        }, (error) => {
            console.warn(`[fuad] couldn't load ${what}:`, error);
            if (entry) {
                asOf.textContent = `As of ${clockText(new Date(entry.storedAt))}`;
                asOf.hidden = false;
                return entry.value;
            }
            mount.removeAttribute("aria-busy");
            body.innerHTML = failedMarkup(what, error);
            armRetry(body.querySelector("button"), error, run);
            return null;
        });
    };

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
