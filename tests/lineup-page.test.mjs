// Lineup reads MFL's Submit Lineup page (the clone's, saved for the screen harness): if MFL changes it,
// these say where.

import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseHTML} from "linkedom";
import {applyInjuries, lineupForm, lineupStatus, readLineupPage} from "../site/v2/ui/lineup-model.js";

const saved = readFileSync(new URL("../tools/verify/screens/lineup.html", import.meta.url), "utf8");
const pageOf = (html = saved) => parseHTML(html).document;
// the checkbox element itself doesn't compare
const withoutBox = (player) => Object.fromEntries(Object.entries(player).filter(([key]) => key !== "box"));

test("the week, the team, how many start at each position, and the weeks either side", () => {
    const page = readLineupPage(pageOf());
    assert.equal(page.team, "0001");
    assert.equal(page.week, 6);
    assert.equal(page.total, 10);
    assert.deepEqual(page.limits, {QB: [1, 2], RB: [1, 3], WR: [2, 5], TE: [1, 3], PK: [1, 1]});
    assert.deepEqual(page.ir, ["De'Von Achane", "Jalen McMillan"]);
    // MFL offers this week and later
    assert.equal(page.prev, null);
    assert.equal(page.next, "lineup?L=50965&WEEK=7&F=0001");
});

test("each player: name, team and position from MFL's label, the game, injury, and whether he starts", () => {
    const {players} = readLineupPage(pageOf());
    assert.equal(players.length, 30);
    // linkedom has no .checked, so this reads MFL's checked attribute, as a browser does on load
    assert.equal(players.filter((player) => player.starter).length, 10);
    assert.deepEqual(withoutBox(players.find((player) => player.id === "13593")), {
        id: "13593", name: "Lamar Jackson", nfl: "BAL", pos: "QB", opp: "@CLE Sun 12:00 p.m.", onBye: false, code: "O", injury: "Out",
        bye: "13", oppRank: "", ytd: null, avg: null, proj: null, starter: true, locked: false
    });
    // MFL's box off: a bye, or a game under way
    assert.equal(players.filter((player) => player.locked).length, 5);
    assert.deepEqual(players.filter((player) => player.injury).map((player) => `${player.name} ${player.injury}`),
        ["Jalen Hurts IR", "Lamar Jackson Out", "Jonah Coleman IR", "A.J. Brown Questionable", "Tre Harris Out", "Chris Olave Questionable"]);
});

test("points as numbers; a dash or nothing as none (the clone plays no games, so its are blank)", () => {
    const document = pageOf();
    const row = [...lineupForm(document).querySelectorAll("tr")].find((tr) => tr.textContent.includes("Jackson, Lamar"));
    const cells = [...row.children];
    // Opp Rank, YTD, Avg and Proj, as the heading row orders them
    [cells[6].textContent, cells[7].textContent, cells[8].textContent, cells[9].textContent] = ["3rd", " 101.25 ", "20.3", "—"];
    const lamar = readLineupPage(document).players.find((player) => player.id === "13593");
    assert.deepEqual([lamar.oppRank, lamar.ytd, lamar.avg, lamar.proj], ["3rd", 101.25, 20.3, null]);
});

test("a page that isn't the lineup form reads as nothing, so Lineup leaves MFL's page as it is", () => {
    assert.equal(readLineupPage(pageOf("<p>Log in</p>")), null);
    // the form without its table
    assert.equal(readLineupPage(pageOf('<form action="/2026/lineup"><input name="WEEK" value="6"><input name="FRANCHISE" value="0001"></form>')), null);
    // a form posting elsewhere isn't it
    assert.equal(lineupForm(pageOf(saved.replace(/action="([^"]*)\/lineup"/, 'action="$1/options"'))), null);
});

test("without MFL's total, the most each position may start add up; without the injury report, MFL's letters stand", () => {
    const page = readLineupPage(pageOf(saved.replace(/Select A Total Of 10 Starters/, "Select Starters")));
    assert.equal(page.total, 2 + 3 + 5 + 3 + 1);
    const players = [{id: "1", code: "Q", injury: "Questionable"}];
    applyInjuries(players, null);
    assert.equal(players[0].injury, "Questionable");
});

test("week 8 with the only kicker on a bye: no lineup MFL takes, so the bar says why (the capture's page)", () => {
    const page = readLineupPage(pageOf(readFileSync(new URL("./fixtures/pages/member/lineup.html", import.meta.url), "utf8")));
    assert.equal(page.week, 8);
    const kicker = page.players.find((player) => player.pos === "PK");
    // MFL greys out a player on a bye and leaves him unticked, with no hidden input keeping him
    assert.deepEqual([kicker.onBye, kicker.locked, kicker.starter], [true, true, false]);
    const status = lineupStatus(page, new Set(page.players.filter((player) => !player.locked).map((player) => player.id)));
    assert.equal(status.ok, false);
    assert.deepEqual(status.stuck, [{pos: "PK", why: `${kicker.name} is on a bye`}]);
});
