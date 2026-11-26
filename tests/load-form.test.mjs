// The commissioner's Load results form (ui/load-form.js), drawn in linkedom with MFL's exports
// answered here: a rookie sheet's plan is on the rookie scale however it's reached.

import {test} from "node:test";
import assert from "node:assert/strict";
import {parseHTML} from "linkedom";

const {window, document} = parseHTML("<!doctype html><html><body></body></html>");
window.history = {state: null, pushState: () => {}};
Object.defineProperty(window, "location", {value: {origin: "https://www44.myfantasyleague.com"}});
globalThis.window = window;
globalThis.document = document;
// linkedom lays nothing out: every control counts as shown, for the dialog's focus
window.HTMLElement.prototype.getClientRects = () => [{}];
const {openLoadForm} = await import("../site/v2/ui/load-form.js");

const EXPORTS = {
    rosters: {rosters: {franchise: [{id: "0001", player: []}, {id: "0002", player: []}]}},
    draftResults: {draftResults: {draftUnit: {draftPick: []}}}
};
globalThis.fetch = async (url) => {
    const type = new URL(url).searchParams.get("TYPE");
    return new Response(JSON.stringify(EXPORTS[type]), {status: 200, headers: {"Content-Type": "application/json"}});
};

const built = {
    boardContext: {playerNames: new Map([["9", {name: "Johnson, Josh", position: "WR", team: "KCC"}]])},
    franchises: new Map([["0001", {teamName: "Ann's Team"}], ["0002", {teamName: "Bob's Team"}]]),
    // "Zed" matches neither owner, so the commissioner picks his team
    raw: {league: {franchises: {franchise: [{id: "0001", owner_name: "Ann Smith"}, {id: "0002", owner_name: "Bob Jones"}]}}}
};
const until = async (found) => {
    for (let tries = 0; tries < 400; tries++) {
        if (found()) {
            return found();
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`not drawn: ${document.querySelector(".fuad-load-body").textContent.trim()}`);
};

test("a rookie sheet whose owner is picked after it's read is planned on the rookie scale", async () => {
    openLoadForm({context: {season: 2026, leagueId: "48571"}, built, opener: null, dataBase: ""});
    const layer = document.querySelector(".fuad-load");
    layer.querySelector('[data-kind="rookies"]').click();
    const text = layer.querySelector("textarea");
    text.value = "Pick\tOwner\tPlayer\n1.01\tZed\tJosh Johnson";
    text.dispatchEvent(new window.Event("input", {bubbles: true}));
    layer.querySelector(".fuad-load-read").click();
    const select = await until(() => layer.querySelector('select[data-choice="owner:Zed"]'));
    select.querySelector('option[value="0002"]').setAttribute("selected", "");
    select.dispatchEvent(new window.Event("change", {bubbles: true}));
    const list = await until(() => layer.querySelector(".fuad-load-list"));
    // the first pick of the draft, a WR: the scale's $10
    assert.match(list.textContent, /1\.01 Josh Johnson/);
    assert.match(list.textContent, /Bob's Team · \$10/);
});
