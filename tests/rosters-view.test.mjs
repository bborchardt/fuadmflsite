import {test} from "node:test";
import assert from "node:assert/strict";
import {draftMarkup, playerChips, playerLayout, playerRows, playersFrame, teamMarkup, teamsMarkup} from "../site/v2/ui/rosters-view.js";

const seasons = [{season: 2026, used: 293, tight: true}, {season: 2027, used: 180, tight: false}];
const sheet = {
    name: "Smooth City Styles!", capUsed: 293, tight: true, salaries: 289, penaltyTotal: 4, active: 30, ir: 1, seasons,
    groups: [{position: "QB", salary: 68, players: [{id: "13", name: "Lamar Jackson", nfl: "BAL", bye: 7, points: 101.25, salary: 68, years: 1, cutPenalty: 28, capAfterCut: 253, ir: false}]}],
    penalties: [{who: "Darren Waller", when: "Sep 2", terms: "$8 · 3 yrs", amount: 4}]
};
const picks = [{year: 2027, rows: [{round: 1, number: "1.04", note: "", traded: false}, {round: 2, number: "—", note: "to Kings", traded: true}]}];

test("a team's page: your own with the cut columns, another's with the way back and Propose a trade", () => {
    const own = teamMarkup({sheet, picks, live: true, own: true, fromTeams: false, tradeHref: null, season: 2026});
    assert.match(own, /Cut penalty<\/th><th scope="col" class="fuad-num fuad-wide">Cap used after cut/);
    assert.match(own, /<td class="fuad-num fuad-wide">\$28<\/td><td class="fuad-num fuad-wide">\$253<\/td>/);
    assert.doesNotMatch(own, /Teams<\/a>|Propose a trade/);
    assert.match(own, /\$293<\/span><span class="fuad-meta"> of \$300/);
    assert.match(own, /\+ 1 on IR/);
    // this season's penalties as the roster's last group
    assert.match(own, /<span class="fuad-band-pos">Penalties<\/span><span>1 penalty<\/span>/);
    assert.match(own, /Darren Waller<span class="fuad-meta">Cut Sep 2 · \$8 · 3 yrs<\/span>/);
    assert.match(own, /If the season ended today/);
    const other = teamMarkup({sheet, picks, live: false, own: false, fromTeams: true, tradeHref: "/trade?x", season: 2026});
    assert.match(other, /<a class="fuad-back" href="#rosters-teams">‹ Teams<\/a>/);
    assert.match(teamMarkup({sheet, picks, live: false, own: false, fromTeams: true, backHistory: true, tradeHref: null, season: 2026}), /<a class="fuad-back" href="#rosters-teams" data-back>‹ Back<\/a>/);
    assert.match(other, /<a class="fuad-cta" href="\/trade\?x">Propose a trade<\/a>/);
    assert.doesNotMatch(other, /Cut penalty/);
    // before week 1, last season's points
    assert.match(other, />2025 pts<\/th>/);
    assert.doesNotMatch(other, /If the season ended today/);
});

test("Teams: each by cap used, the viewer's marked, the bar never past full", () => {
    const list = [
        {id: "0001", name: "Mine", capUsed: 305, tight: true, picksLine: "1, 2, 3", picksYear: 2027, active: 30, ir: 2, seasons},
        {id: "0002", name: "Kings", capUsed: 150, tight: false, picksLine: "2", picksYear: 2027, active: 28, ir: 0, seasons}
    ];
    const html = teamsMarkup(list, {viewer: "0001", season: 2026});
    assert.match(html, /<li class="fuad-row-mine">\s*<a class="fuad-team-row" href="#rosters-teams\/0001">/);
    assert.match(html, /<span class="fuad-bar-mine" style="width: 100%">/);
    assert.match(html, /style="width: 50%"/);
    assert.match(html, /2027 picks 1, 2, 3 · 30 \/ 30 \+ 2 IR/);
    assert.match(html, /<td class="fuad-num">28 \/ 30<\/td>/);
    assert.match(html, /<th scope="col" class="fuad-num">’27<\/th>/);
    assert.match(html, /<tr class="fuad-row-link" data-href="#rosters-teams\/0002">/);
});

test("Players: the columns in season and before it, and each kind of player's contract", () => {
    const season = playerLayout({before: false, season: 2026});
    assert.deepEqual(season.columns.map(([key]) => key), ["name", "position", "nfl", "bye", "projected", "points", "salary", "years", "owner"]);
    assert.deepEqual(season.phoneKeys, ["projected", "points"]);
    const before = playerLayout({before: true, season: 2026});
    assert.equal(before.columns.find(([key]) => key === "points")[1], "2025 pts");
    assert.ok(!before.columns.some(([key]) => key === "projected"));
    assert.deepEqual(before.yearChips, ["All", "FA", "1", "2", "3", "4", "5"]);
    // only the name and the phone's two numbers show on phones
    assert.match(playersFrame(season, "Lam"), /class="fuad-col-salary fuad-wide fuad-num"/);
    assert.match(playersFrame(season, "Lam"), /class="fuad-col-points fuad-num"/);
    assert.match(playersFrame(season, "Lam"), /value="Lam"/);
    const players = [
        {id: "1", name: "Lamar Jackson", position: "QB", nfl: "BAL", bye: 7, projected: 21.04, points: 101.25, salary: 68, years: 2, owner: "0001", ownerName: "Mine"},
        {id: "2", name: "Mike White", position: "QB", nfl: "FA", bye: null, projected: null, points: 0, salary: null, years: 0, fa: true, owner: null, ownerName: "Free agent"}
    ];
    const rows = playerRows(players, season, {before: false, viewer: "0001"});
    assert.match(rows, /^<tr class="fuad-row-mine">/);
    assert.match(rows, /QB · BAL · \$68 · 2 yrs · Mine/);
    assert.match(rows, /<td class="fuad-num">21\.0<\/td><td class="fuad-num">101\.3<\/td>/);
    // a free agent: no salary or years in season, UFA before it
    assert.match(rows, /<td class="fuad-num fuad-wide">—<\/td><td class="fuad-num fuad-muted fuad-wide">—<\/td>/);
    assert.match(playerRows(players, before, {before: true, viewer: "0001"}), /<td class="fuad-num fuad-wide">UFA<\/td>/);
});

test("Players' chips: Mine and the Watching star only for a member logged in", () => {
    const state = {positions: ["QB"], years: [], owners: [], watching: true};
    const member = playerChips(state, {yearChips: ["All", "1"], viewer: "0001", watched: new Set()});
    assert.match(member, /data-chip="positions" data-value="QB">QB/);
    assert.match(member, /aria-pressed="true" data-chip="positions" data-value="QB"/);
    assert.match(member, /aria-pressed="true" data-chip="years" data-value="All"/);
    assert.match(member, /data-value="Mine"/);
    assert.match(member, /data-chip="watching"/);
    assert.doesNotMatch(playerChips(state, {yearChips: ["All"], viewer: "0001", watched: null}), /data-chip="watching"/);
    const visitor = playerChips(state, {yearChips: ["All"], viewer: null, watched: null});
    assert.doesNotMatch(visitor, /data-value="Mine"/);
    // short names on phones
    assert.match(visitor, /<span class="fuad-desktop-only">Free agents<\/span><span class="fuad-phone-only">FAs<\/span>/);
});

const round = (n, picks) => ({round: n, picks});
const pick = (team, number, extra = {}) => ({team, teamName: team === "0001" ? "Mine" : "Kings", number, overall: 1, salary: null, player: null, from: null, ...extra});

test("Draft: before the draft the viewer's picks and the board; after it next year's order and the results", () => {
    const board = [round(1, [pick("0002", "1.01"), pick("0001", "1.02", {from: "Kings"})]), round(2, [pick("0002", "2.01")])];
    const tags = {phase: "next", topSalaries: {}};
    const before = draftMarkup({board, before: true, tags, order: null, viewer: "0001", season: 2026, phone: true});
    assert.match(before, /2027 franchise tags/);
    assert.match(before, /Your 2026 picks/);
    assert.match(before, /<span class="fuad-pick-number">1\.02<\/span>\s*<span class="fuad-row-text"><span>[^<]*<\/span><span class="fuad-caution">from Kings<\/span>/);
    // every round open before the draft
    assert.equal((before.match(/aria-expanded="true" aria-controls="fuad-round-/g) || []).length, 2);
    assert.doesNotMatch(before, /draft order/);
    assert.match(before, /Rookie scale/);
    const done = [round(1, [pick("0002", "1.01", {player: {id: "9", name: "Ashton Jeanty", position: "RB"}, salary: 8})]), round(2, [pick("0001", "2.01")])];
    const order = {rows: [{pick: 1, name: "Kings", why: "worst record", traded: []}], final: false};
    const phone = draftMarkup({board: done, before: false, tags, order, viewer: "0001", season: 2026, phone: true});
    assert.match(phone, /2027 draft order/);
    assert.doesNotMatch(phone, /Your 2026 picks/);
    assert.match(phone, /data-player="9">Ashton Jeanty<\/button> <span class="fuad-meta">RB<\/span>/);
    assert.match(phone, /<span class="fuad-num">\$8<\/span>/);
    // in season the rounds start closed on phones, open on desktop
    assert.equal((phone.match(/aria-expanded="false" aria-controls="fuad-round-/g) || []).length, 2);
    const desk = draftMarkup({board: done, before: false, tags, order, viewer: "0001", season: 2026, phone: false});
    assert.equal((desk.match(/aria-expanded="true" aria-controls="fuad-round-/g) || []).length, 2);
    // drafted but not yet in week 1: the results alone, without the tags
    assert.doesNotMatch(draftMarkup({board: done, before: true, tags, order: null, viewer: "0001", season: 2026, phone: true}), /franchise tags/);
});
