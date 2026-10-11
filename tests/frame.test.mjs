import {test} from "node:test";
import assert from "node:assert/strict";
import {locate, pageOf, sections} from "../site/v2/ui/frame.js";

const base = "https://www44.myfantasyleague.com/2026";
const all = sections({base, leagueId: "48571", franchiseId: "0001"});
const at = (href, franchiseId = "0001") => {
    const found = locate(all, pageOf(new URL(href)), franchiseId);
    return found && [found.section.name, found.view && found.view.name];
};

test("each MFL page lands in its section and view", () => {
    assert.deepEqual(at(`${base}/home/48571`), ["Home", null]);
    assert.deepEqual(at(`${base}/home/48571#1`), ["League", "Standings"]);
    assert.deepEqual(at(`${base}/home/48571#3`), ["Rosters", "All players"]);
    assert.deepEqual(at(`${base}/lineup?L=48571`), ["Lineup", null]);
    assert.deepEqual(at(`${base}/add_drop?L=48571`), ["Moves", "Add/Drop"]);
    assert.deepEqual(at(`${base}/options?L=48571&O=255&ROUND=1`), ["Moves", "Add/Drop"]);
    assert.deepEqual(at(`${base}/options?L=48571&O=05`), ["Moves", "Trades"]);
    assert.deepEqual(at(`${base}/trade_offer`), ["Moves", "Trades"]);
    assert.deepEqual(at(`${base}/options?L=48571&O=18`), ["Moves", "IR"]);
    assert.deepEqual(at(`${base}/options?L=48571&O=03`), ["Moves", "Recent"]);
    assert.deepEqual(at(`${base}/ajax_ls?L=48571`), ["League", "Scores"]);
    assert.deepEqual(at(`${base}/options?L=48571&O=101`), ["League", "Power"]);
    assert.deepEqual(at(`${base}/options?L=48571&O=17`), ["Rosters", "Draft"]);
});

test("rosters: your own team is My team, any other is Teams", () => {
    assert.deepEqual(at(`${base}/options?L=48571&O=07&F=0001`), ["Rosters", "My team"]);
    assert.deepEqual(at(`${base}/options?L=48571&O=07&F=0002`), ["Rosters", "Teams"]);
    assert.deepEqual(at(`${base}/options?L=48571&O=07`), ["Rosters", "Teams"]);
    assert.deepEqual(at(`${base}/options?L=48571&O=07`, null), ["Rosters", "Teams"]);
});

test("pages left to the team sheet belong to no section", () => {
    assert.equal(at(`${base}/options?L=48571&O=26`), null);
    assert.equal(at(`${base}/home/48571#4`), null);
});

test("a section opens on its first view, and My team is your own roster", () => {
    assert.equal(all.find((s) => s.name === "Moves").href, `${base}/add_drop?L=48571`);
    assert.equal(all.find((s) => s.name === "Rosters").href, `${base}/options?L=48571&O=07&F=0001`);
    // MFL's home page tabs are picked by position, learned from the page
    const moved = sections({base, leagueId: "48571", franchiseId: "0001", tabs: {Main: 0, Contracts: 1, Standings: 2}});
    assert.equal(moved.find((s) => s.name === "League").views[1].href, `${base}/home/48571#2`);
});
