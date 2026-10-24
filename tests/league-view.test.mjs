import {test} from "node:test";
import assert from "node:assert/strict";
import {cardsMarkup, championsMarkup, scoresFrame, seasonMarkup, winnersMarkup} from "../site/v2/ui/league-view.js";

const names = new Map([["0001", "Mine"], ["0002", "Kings"], ["0003", "Pat's Team"], ["0004", "Rivals"]]);
const line = (id, name, points, game, extra = {}) => ({id, name, position: "WR", points, projected: 12.34, game, line: "", ...extra});
const playing = {state: "playing", quarter: "Q2"};
const over = {state: "over"};
const team = (id, score, extra = {}) => ({
    id, score, started: true, done: false, projected: score + 20, chance: 50, playing: 1, toPlay: 2, minutes: 90,
    starters: [line(`${id}a`, "Amon-Ra St. Brown", 14.5, playing)], bench: [line(`${id}b`, "Tyler Higbee", 3, over)], ...extra
});
const cards = [
    {mine: true, teams: [team("0001", 101.25, {chance: 64}), team("0002", 88, {chance: 36})]},
    {mine: false, teams: [team("0003", 70, {playing: 0}), team("0004", 70, {playing: 0})]}
];
const options = {names, viewer: "0001", open: new Set([0]), bench: new Set(), preview: false, best: false};

test("a week's cards: the open one shows its lineups, the bench behind its button, and who leads", () => {
    const html = cardsMarkup(cards, options);
    assert.match(html, /<article class="fuad-card fuad-card-mine fuad-card-open" data-card="0">/);
    assert.match(html, /aria-expanded="true" aria-label="Mine versus Kings"/);
    assert.match(html, /<article class="fuad-card" data-card="1">\s*<button type="button" class="fuad-card-head" aria-expanded="false"/);
    // the trailing side dimmed, a tie neither
    assert.match(html, /fuad-face fuad-face-right fuad-trailing/);
    assert.equal((html.match(/fuad-trailing/g) || []).length, 1);
    assert.match(html, /Win chance 64% to 36%/);
    // chips only where a game is on
    assert.equal((html.match(/fuad-chip-row/g) || []).length, 1);
    // a short name on phones, the full one on desktop; a player opens the popup
    assert.match(html, /data-player="0001a">[\s\S]*?<span class="fuad-short">A\. St\. Brown<\/span><span class="fuad-full">Amon-Ra St\. Brown<\/span>/);
    assert.match(html, /Playing · Q2/);
    assert.match(html, /aria-expanded="false" data-bench>Show bench<\/button>/);
    assert.doesNotMatch(html, /Tyler Higbee/);
    const bench = cardsMarkup(cards, {...options, bench: new Set([0])});
    assert.match(bench, /aria-expanded="true" data-bench>Hide bench<\/button>\s*<div class="fuad-bench">/);
    assert.match(bench, /Tyler Higbee/);
});

test("Best drops the win chance, the chips and the projections; a preview opens nothing and shows no scores", () => {
    const best = cardsMarkup(cards, {...options, best: true});
    assert.doesNotMatch(best, /fuad-winbar|fuad-chip-row/);
    // Best's lines (bestCard tags each) show their mark in place of a projection
    const tagged = {mine: true, teams: cards[0].teams.map((side) => ({...side, starters: side.starters.map((entry) => ({...entry, tag: "in"}))}))};
    const marks = cardsMarkup([tagged], {...options, best: true});
    assert.match(marks, /Playing · Q2 <span class="fuad-ln-tag fuad-ln-tag-in">in<\/span>/);
    assert.match(marks, /14\.5<span class="fuad-ln-proj"><\/span>/);
    const fresh = (id) => ({id, score: 0, started: false, done: false, projected: null, chance: null, playing: 0, toPlay: 0, minutes: 0, starters: [], bench: []});
    const preview = cardsMarkup([{mine: true, teams: [fresh("0001"), fresh("0002")]}], {...options, preview: true});
    assert.match(preview, /aria-expanded="false"/);
    assert.doesNotMatch(preview, /fuad-card-body/);
    assert.match(preview, /<span class="fuad-face-score"><\/span>/);
    assert.match(cardsMarkup([], options), /No games this week\./);
});

test("Scores' bar: Season for a member, Best for anyone, neither before week 1", () => {
    const member = scoresFrame({before: false, viewer: "0001"});
    assert.match(member, /fuad-scores-bar fuad-scores-toggles/);
    assert.match(member, /data-season>Season<\/button>/);
    assert.match(member, /data-best disabled>Best<\/button>/);
    const visitor = scoresFrame({before: false, viewer: null});
    assert.doesNotMatch(visitor, /data-season/);
    assert.match(visitor, /data-best/);
    const before = scoresFrame({before: true, viewer: "0001"});
    assert.doesNotMatch(before, /data-season|data-best|fuad-scores-toggles/);
    assert.match(before, /data-step="-1"[\s\S]*data-step="1"/);
});

test("Season: each week's result in its tone, this week live, and the playoffs' weeks after", () => {
    const rows = [{week: 1, opponent: "0002", result: "W 120.0–99.5"}, {week: 2, opponent: "0003", result: "L 80.0–90.0"}, {week: 3, opponent: "0004", result: ""}];
    const html = seasonMarkup({lastRegular: 14, endWeek: 17, rows, names, current: 3, live: "Live 50.0–40.0", title: "2026 season", line: "2-1-0 · West 1st"});
    assert.match(html, /<span class="fuad-good">W 120\.0–99\.5<\/span>/);
    assert.match(html, /<span class="fuad-bad-text">L 80\.0–90\.0<\/span>/);
    assert.match(html, /<li class="fuad-season-row fuad-row-mine"><span class="fuad-meta">W3<\/span><span>Rivals<\/span><span class="fuad-live">Live 50\.0–40\.0<\/span>/);
    assert.match(html, /Weeks 15–17<\/span><span class="fuad-muted">Playoffs/);
    assert.match(html, /2-1-0 · West 1st/);
    assert.match(seasonMarkup({lastRegular: 14, endWeek: 17, rows, names, current: 3, live: "", title: "", line: ""}), /<span class="fuad-muted">This week<\/span>/);
});

test("Winners: so far in season, payouts once final; the viewer's row and titles marked", () => {
    const result = {
        rows: [
            {id: "0001", name: "Mine", weeks: [1, 4], weekly: 30, record: "41-4", allPlay: 27.75, total: 57.75, prize: null},
            {id: "0002", name: "Kings", weeks: [], weekly: 0, record: "13-32", allPlay: 0, total: 0, prize: null}
        ],
        prizes: [{place: "1st", share: 0.6, amount: 300, team: null}], pot: 600, potEntries: [], weeklyTotal: 30, allPlayPaid: 27.75, forPlayoffs: 542.25
    };
    const html = winnersMarkup(result, {viewer: "0001", final: "", teamHref: (id) => `#rosters-teams/${id}`});
    assert.match(html, /Won so far<\/h2><p class="fuad-meta fuad-if">If the season ended today/);
    assert.match(html, /<li class="fuad-won fuad-row-mine">/);
    assert.match(html, /<td class="fuad-num">1, 4<\/td>/);
    // no Playoffs column until a prize has its team
    assert.doesNotMatch(html, />Playoffs<\/th>/);
    assert.match(html, /Weekly points · 2 × \$15/);
    const final = winnersMarkup({...result, prizes: [{place: "1st", share: 0.6, amount: 300, team: "0001"}], rows: [{...result.rows[0], prize: {place: "1st", amount: 300}}]}, {viewer: "0001", final: "2025", teamHref: (id) => `#rosters-teams/${id}`});
    assert.match(final, /2025 payouts<\/h2>/);
    assert.doesNotMatch(final, /If the season ended today/);
    assert.match(final, />Playoffs<\/th>/);
    assert.match(final, /<span class="fuad-prize-team"><a href="#rosters-teams\/0001">Mine<\/a><\/span>/);
    assert.match(championsMarkup([{year: 2024, name: "Mine"}, {year: 2023, name: "Kings"}], [2024]), /<li class="fuad-row-mine">\s*<span class="fuad-meta">2024<\/span>/);
});
