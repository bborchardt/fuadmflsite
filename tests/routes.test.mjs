import {test} from "node:test";
import assert from "node:assert/strict";
import {ROUTES} from "../site/v2/ui/routes.js";
import {locate, pageOf, routeFor, sections} from "../site/v2/ui/nav.js";

const at = (path) => pageOf(new URL(`https://www44.myfantasyleague.com/2026/${path}`));
const routeOf = (page, franchiseId = "0001") => (routeFor(page, franchiseId) || {}).name;

test("each page v2 draws over has one screen", () => {
    assert.equal(routeOf(at("lineup?L=50965")), "Lineup");
    assert.equal(routeOf(at("options?L=50965&O=02")), "Lineup");
    assert.equal(routeOf(at("add_drop?L=50965")), "Add");
    assert.equal(routeOf(at("options?L=50965&O=257")), "Drop");
    assert.equal(routeOf(at("options?L=50965&O=18")), "IR");
    assert.equal(routeOf(at("options?L=50965&O=05&FRANCHISE=0001,0002")), "Trades");
    assert.equal(routeOf(at("options?L=50965&O=03")), "All moves");
    assert.equal(routeOf(at("processed_waivers?L=50965")), "All bids");
    assert.equal(routeOf(at("options?L=50965&O=76")), "All bids");
    assert.equal(routeOf(at("options?L=50965&O=26")), "Rules");
    assert.equal(routeOf(at("csetup?L=50965")), "Franchise setup");
    assert.equal(routeOf(at("mb/board_show.pl?LEAGUE=50965")), "the message board page");
    // the commissioner keeps MFL's rules pages; the home page and MFL's other pages have none
    assert.equal(routeOf(at("options?L=50965&O=09"), "0000"), undefined);
    assert.equal(routeOf(at("home/50965")), undefined);
    assert.equal(routeOf(at("options?L=50965&O=255")), undefined);
});

test("each screen's page is under its section or view", () => {
    const all = sections({base: "https://www44.myfantasyleague.com/2026", leagueId: "50965", franchiseId: "0001"});
    for (const route of ROUTES.filter((entry) => entry.view)) {
        const page = {path: route.match.paths ? route.match.paths[0] : "options", option: route.match.options ? route.match.options[0] : null, team: null, tab: null, hash: null};
        const found = locate(all, page, "0001");
        assert.equal(found && [found.section.name, found.view && found.view.name].filter(Boolean).join("/"), route.view, route.name);
    }
});
