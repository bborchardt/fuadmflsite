// Scores' backup starters (ui/scores-backups.js): an open card's pairs from the team's lineup messages,
// as the job reads them, shown once locked, and what they put on its lines.

import {test} from "node:test";
import assert from "node:assert/strict";
import {kickoffsOf} from "../site/v2/ui/lineup-backups.js";
import {backupMarks, lockedPairs} from "../site/v2/ui/scores-backups.js";
import {cardsMarkup} from "../site/v2/ui/league-view.js";

// week 9 of the clone: Sunday's early games at noon CT, the late ones at 3:25
const NOON = Date.UTC(2026, 10, 8, 18) / 1000;
const LATE = NOON + 3 * 3600 + 25 * 60;
const kickoffs = kickoffsOf({matchup: [
    {kickoff: String(NOON), team: [{id: "NYJ"}, {id: "DEN"}]},
    {kickoff: String(LATE), team: [{id: "NEP"}, {id: "SEA"}]}
]});
const before = kickoffsOf({matchup: [{kickoff: String(LATE - 6 * 86400 + 4 * 3600), team: [{id: "BUF"}]}]});

// Scores' lines (league-model's), as the card has them
const line = (id, name, sortName, team, position) => ({id, name, sortName, team, position, game: {state: "scheduled", kickoff: team === "NEP" ? LATE : NOON}, points: null});
const brown = line("w1", "A.J. Brown", "Brown, A.J.", "NEP", "WR");
const patrick = line("w3", "Tim Patrick", "Patrick, Tim", "NYJ", "WR");
const franklin = line("w4", "Troy Franklin", "Franklin, Troy", "DEN", "WR");
const barner = line("t1", "AJ Barner", "Barner, AJ", "SEA", "TE");
const lines = [brown, patrick, franklin, barner];

// a week 9 lineup on Lineup Details, saved Saturday at 6 p.m. CT and `minutes` after
const lineup = (message, minutes = 0, extra = {}) => ({week: 9, commish: false, failed: false, unread: false,
    starters: [{name: "Brown, A.J.", nfl: "NEP", pos: "WR"}, {name: "Barner, AJ", nfl: "SEA", pos: "TE"}],
    at: `Sat Nov 7 6:${String(minutes).padStart(2, "0")}:00 p.m. CT 2026`, message, ...extra});
const read = (lineups, now) => lockedPairs(lines, {posts: [], lineups, team: "0001", week: 9, kickoffs, before, now});

test("a pair shows from its deadline, five minutes before the earlier of its two kickoffs", () => {
    const lineups = [lineup("Week 9: If A.J. Brown is out, start Tim Patrick.")];
    assert.deepEqual(read(lineups, NOON - 301), []);
    assert.deepEqual(read(lineups, NOON - 300), [{starter: "w1", backup: "w3", deadline: NOON - 300, counted: true}]);
    // a late kickoff on both sides: not yet at noon
    assert.deepEqual(read([lineup("Week 9: If A.J. Brown is out, start AJ Barner.")], NOON), []);
});

test("the pairs are the job's: a later message's change counts, a repeat or the commissioner's doesn't", () => {
    const lineups = [
        lineup("Week 9: If A.J. Brown is out, start Tim Patrick."),
        lineup("Week 9: If A.J. Brown is out, start Troy Franklin.", 5),
        lineup("Week 9: If A.J. Brown is out, start Troy Franklin.", 6),
        lineup("Week 9: No backups.", 7, {commish: true})
    ];
    assert.deepEqual(read(lineups, LATE).map((pair) => pair.backup), ["w4"]);
});

test("a pair whose starter sat at its deadline doesn't count (16.5.3)", () => {
    const benched = lineup("Week 9: If A.J. Brown is out, start Tim Patrick.", 0, {starters: [{name: "Patrick, Tim", nfl: "NYJ", pos: "WR"}]});
    assert.equal(read([benched], LATE)[0].counted, false);
});

test("the marks: the backup under a starter still starting, 'in for' on a backup swapped in", () => {
    const pairs = [{starter: "w1", backup: "w3", deadline: NOON - 300, counted: true}];
    const team = {starters: [brown, barner], bench: [patrick, franklin]};
    assert.deepEqual([...backupMarks(team, pairs)], [["w1", {backup: "Tim Patrick"}]]);
    const swapped = {starters: [patrick, barner], bench: [brown, franklin]};
    assert.deepEqual([...backupMarks(swapped, pairs)], [["w3", {inFor: "A.J. Brown"}]]);
    // both on the bench, or one that didn't count: nothing
    assert.equal(backupMarks({starters: [barner], bench: [brown, patrick]}, pairs).size, 0);
    assert.equal(backupMarks(team, [{...pairs[0], counted: false}]).size, 0);
    // one backup for two starters: the job uses neither
    const both = {starters: [brown, barner, franklin], bench: [patrick]};
    assert.equal(backupMarks(both, [...pairs, {starter: "w4", backup: "w3", deadline: NOON - 300, counted: true}]).size, 0);
});

test("the card draws the lock line and the tag", () => {
    const game = {state: "scheduled", kickoff: LATE};
    const at = (each, extra) => ({...each, game, points: null, line: "", ...extra});
    const side = (id, starters) => ({id, score: 0, started: false, done: false, projected: null, chance: null, playing: 0, toPlay: 2, minutes: 120, starters, bench: []});
    const card = {mine: true, teams: [side("0001", [at(brown, {backup: "Tim Patrick"})]), side("0002", [at(patrick, {inFor: "A.J. Brown"})])]};
    const html = cardsMarkup([card], {names: new Map(), viewer: "0001", open: new Set([0]), bench: new Set(), preview: false, best: false});
    assert.match(html, /<span class="fuad-ln-if"><svg[^>]*aria-label="Locked"[\s\S]*?<\/svg>If out → <b><span class="fuad-short">T\. Patrick<\/span><span class="fuad-full">Tim Patrick<\/span><\/b><\/span>/);
    assert.match(html, /<span class="fuad-ln-tag fuad-ln-tag-in">in for A\.J\. Brown<\/span>/);
});
