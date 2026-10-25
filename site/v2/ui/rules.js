// Rules: MFL's League Rules (`options?O=09`, scoring) and League Settings (`options?O=26`, MFL's
// settings and the commissioner's bylaws) as one v2 page over whichever of them is open, reached from
// Home's League alerts. The other page is read in; if it can't be, the open one's part still shows.
// A page v2 can't read stays MFL's.

import {drawPanel} from "./panel.js";
import {pageFetch} from "./page-fetch.js";
import {matching, readScoring, readSettings, ruleSections} from "./rules-model.js";
import {rulesMarkup} from "./rules-view.js";

const SEARCH = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path></svg>';

async function readOther({season, leagueId}, option, read) {
    const response = await pageFetch(`${window.location.origin}/${season}/options?L=${encodeURIComponent(leagueId)}&O=${option}`, {credentials: "include"});
    if (!response.ok) {
        throw Object.assign(new Error(`HTTP ${response.status}`), {status: response.status});
    }
    const found = read(new DOMParser().parseFromString(await response.text(), "text/html"));
    if (!found) {
        throw new Error(`MFL's O=${option} page has changed`);
    }
    return found;
}

// `option` is the open page's, "09" or "26"; resolves to whether v2 drew over it
export function drawRules({context, option}) {
    const scoringPage = option === "09";
    const here = scoringPage ? readScoring(document) : readSettings(document);
    const body = document.querySelector(".pagebody");
    if (!here || !body) {
        return false;
    }
    const mount = document.createElement("div");
    mount.id = "fuad-rules";
    mount.innerHTML = `<div class="fuad-page-head"><div class="fuad-page-title"><h2>Rules</h2></div></div>
        <p class="fuad-failed fuad-rules-missing" role="alert" hidden>Couldn’t load ${scoringPage ? "the bylaws and league settings" : "the scoring"}. Reload the page to try again.</p>
        <label class="fuad-rules-filter">${SEARCH}<input type="search" placeholder="Filter rules" aria-label="Filter rules" autocomplete="off"></label>
        <section class="fuad-panel fuad-rules-list" aria-label="Rules"></section>`;
    body.prepend(mount);
    document.documentElement.classList.add("fuad-rules-on");

    const input = mount.querySelector("input");
    const list = mount.querySelector(".fuad-rules-list");
    // the sections open by hand when a filter starts come back open when it's cleared
    let opened = new Set();
    let filtered = false;
    let sections = [];
    const show = () => {
        const target = list.querySelector(".fuad-panel-body");
        const query = input.value;
        if (query.trim() && !filtered) {
            opened = new Set([...target.querySelectorAll("details[open]")].map((section) => section.dataset.key));
        }
        filtered = Boolean(query.trim());
        target.innerHTML = rulesMarkup(matching(sections, query), {query, opened});
    };
    input.addEventListener("input", () => {
        if (sections.length) {
            show();
        }
    });

    drawPanel(list, {
        what: "the rules", rows: 8,
        load: async () => {
            const other = await readOther(context, scoringPage ? "26" : "09", scoringPage ? readSettings : readScoring).catch((error) => {
                console.warn("[fuad] couldn't read the other rules page:", error);
                return null;
            });
            return scoringPage ? {scoring: here, settings: other} : {scoring: other, settings: here};
        },
        render: (value) => {
            sections = ruleSections(value);
            mount.querySelector(".fuad-rules-missing").hidden = Boolean(scoringPage ? value.settings : value.scoring);
            show();
        }
    });
    return true;
}
