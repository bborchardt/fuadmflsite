// One loading and error pattern for every panel: a first load shows the heading over placeholder
// bars, so nothing jumps; a cached copy shows at once and refreshes quietly; a failed refresh keeps
// it, dated; a failed load with nothing cached says so with Retry, the other panels unaffected.

import {esc} from "./html.js";
import {save, saved} from "./store.js";

// "7:42 p.m.", as the league's pages write times
export function clockText(date) {
    return date.toLocaleTimeString("en-US", {hour: "numeric", minute: "2-digit", timeZone: "America/Chicago"})
        .replace(/\s?AM$/, " a.m.").replace(/\s?PM$/, " p.m.");
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
    mount.classList.add("fuad-panel");
    const title = heading ? `<h2 class="fuad-panel-heading">${esc(heading)}</h2>` : "";
    mount.innerHTML = `${actions ? `<div class="fuad-panel-head">${title}<span class="fuad-panel-actions">${actions}</span></div>` : title}<p class="fuad-as-of" hidden></p><div class="fuad-panel-body"></div>`;
    const body = mount.querySelector(".fuad-panel-body");
    const asOf = mount.querySelector(".fuad-as-of");
    const entry = key ? saved(key) : null;

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
            body.innerHTML = `<div class="fuad-failed" role="alert"><span>Couldn't load ${esc(what)}.</span><button type="button" class="fuad-quiet">Retry</button></div>`;
            body.querySelector("button").addEventListener("click", run);
            return null;
        });
    };

    if (entry) {
        show(entry.value);
        if (Date.now() - entry.storedAt < maxAge) {
            return Promise.resolve(entry.value);
        }
    }
    return run();
}
