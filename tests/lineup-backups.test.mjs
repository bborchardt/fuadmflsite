// Lineup's backup starters (ui/lineup-backups.js): the pairs it reads from the team's lineup messages
// and the thread as the daily job does, who may back up whom, and the message Save writes, which the
// job must read back as sent.

import {test} from "node:test";
import assert from "node:assert/strict";
import {backupText, matchPlayer, readRequests} from "../site/v2/lib/backups.js";
import {backupMessage, backupOffered, canHaveBackup, choices, heldPairs, keptPairs, kickoffsOf, lockedStarters, pairProblems, pendingPairs, teamBackups, weekFacts} from "../site/v2/ui/lineup-backups.js";

// week 9 of the clone: Sunday's early games at noon CT, the late ones at 3:25
const NOON = Date.UTC(2026, 10, 8, 18) / 1000;
const LATE = NOON + 3 * 3600 + 25 * 60;
const schedule = {matchup: [
    {kickoff: String(NOON), team: [{id: "NYJ"}, {id: "DEN"}]},
    {kickoff: String(NOON), team: [{id: "NOS"}, {id: "KCC"}]},
    {kickoff: String(LATE), team: [{id: "NEP"}, {id: "SEA"}]},
    {kickoff: String(LATE), team: [{id: "ARI"}, {id: "LVR"}]}
]};

const player = (id, name, mflName, nfl, pos, extra = {}) => ({id, name, mflName, nfl, pos, onBye: false, locked: false, injury: "", proj: 5, ...extra});
const page = {
    team: "0001",
    week: 9,
    total: 6,
    limits: {QB: [1, 1], RB: [1, 2], WR: [2, 3], TE: [1, 1]},
    players: [
        player("q1", "Kyler Murray", "Murray, Kyler", "ARI", "QB"),
        player("r1", "Ashton Jeanty", "Jeanty, Ashton", "LVR", "RB"),
        player("r2", "Kendre Miller", "Miller, Kendre", "NOS", "RB"),
        player("w1", "A.J. Brown", "Brown, A.J.", "NEP", "WR", {injury: "Out"}),
        player("w2", "Chris Olave", "Olave, Chris", "NOS", "WR"),
        player("w3", "Tim Patrick", "Patrick, Tim", "NYJ", "WR"),
        player("w4", "Troy Franklin", "Franklin, Troy", "DEN", "WR"),
        player("w5", "Dontayvion Wicks", "Wicks, Dontayvion", "KCC", "WR", {injury: "Out"}),
        player("w6", "Marvin Harrison Jr.", "Harrison Jr., Marvin", "ARI", "WR"),
        player("w7", "Xavier Worthy", "Worthy, Xavier", "KCC", "WR", {onBye: true, locked: true}),
        player("t1", "AJ Barner", "Barner, AJ", "SEA", "TE"),
        player("t2", "Hunter Henry", "Henry, Hunter", "NEP", "TE", {injury: "Questionable"})
    ]
};
const on = new Set(["q1", "r1", "w1", "w2", "t1", "r2"]);
// week 8 ended with Monday night's game
const MONDAY = LATE - 6 * 86400 + 4 * 3600;
const facts = weekFacts(page, kickoffsOf(schedule), kickoffsOf({matchup: [{kickoff: String(MONDAY), team: [{id: "BUF"}]}]}));
const SAT = NOON - 18 * 3600;

const post = (franchiseId, html, at, extra = {}) => ({franchiseId, html, at, postedAt: at, posted: "", edited: null, ...extra});
// a week 9 lineup on Lineup Details, saved `minutes` after Saturday 6 p.m. CT (SAT)
const lineup = (message, minutes = 0, extra = {}) => ({week: 9, commish: false, failed: false, starters: [], unread: false,
    at: `Sat Nov 7 6:${String(minutes).padStart(2, "0")}:00 p.m. CT 2026`, message, ...extra});

test("v2's message reads back, through the job's own reader, as the pairs it was made from", () => {
    const text = backupText(9, [{starter: "A.J. Brown", backup: "Marvin Harrison Jr."}, {starter: "Chris Olave", backup: "Tim Patrick"}], ["Ashton Jeanty"]);
    assert.equal(text, "Week 9: If A.J. Brown is out, start Marvin Harrison Jr.; if Chris Olave is out, start Tim Patrick; no backup for Ashton Jeanty.");
    const asks = readRequests(text);
    const roster = page.players.map((each) => ({id: each.id, name: each.mflName}));
    const id = (phrase) => matchPlayer(phrase, roster).player.id;
    assert.equal(asks.week, 9);
    assert.deepEqual(asks.requests.map((ask) => [id(ask.starter), id(ask.backup)]), [["w1", "w6"], ["w2", "w3"]]);
    assert.deepEqual(asks.removals.map(id), ["r1"]);
    assert.deepEqual([asks.unreadable, asks.removeAll], [[], false]);
    // nothing left: every open pair taken back
    assert.deepEqual(readRequests(backupText(9, [], [])).removeAll, true);
});

test("the team's pairs for the week: its own posts naming the week, or made during it, as the job dates them", () => {
    const posts = [
        post("0001", "If A.J. Brown is out, start Tim Patrick", SAT),
        post("0002", "Week 9: If Olave is out, start Franklin", SAT),
        post("0001", "Week 8: If Olave is out, start Franklin", SAT - 3600),
        // before week 8's Monday night game: week 8's
        post("0001", "If Olave is out, start Franklin", MONDAY - 60),
        // week 8's, edited this week: the job leaves it out
        post("0001", "If Olave is out, start Patrick", MONDAY - 60, {at: SAT + 30})
    ];
    const team = teamBackups(posts, [], {team: "0001", week: 9, page, facts});
    assert.deepEqual(team.pairs.map((pair) => [pair.starter, pair.backup, pair.deadline]), [["w1", "w3", NOON - 300]]);
    // a later post's request for the same starter wins, as the job takes it
    const again = teamBackups([...posts, post("0001", "Week 9: if A.J. Brown is out start Troy Franklin", SAT + 60)], [], {team: "0001", week: 9, page, facts});
    assert.deepEqual(again.pairs.map((pair) => pair.backup), ["w4"]);
});

test("the team's pairs from its lineups' messages and its posts, the latest request standing", () => {
    const lineups = [
        lineup("Week 9: If A.J. Brown is out, start Tim Patrick.", 0),
        // an app's empty box, a note, the commissioner's, and last week's carried: none change anything
        lineup("", 1),
        lineup("Set from my phone", 2),
        lineup("Week 9: No backups.", 3, {commish: true}),
        lineup("Week 8: If Chris Olave is out, start Troy Franklin.", 4)
    ];
    const team = teamBackups([], lineups, {team: "0001", week: 9, page, facts});
    assert.deepEqual(team.pairs.map((pair) => [pair.starter, pair.backup]), [["w1", "w3"]]);
    // a post after the message replaces Brown's backup; a message after both replaces it again
    const posted = [post("0001", "Week 9: if A.J. Brown is out start Troy Franklin", SAT + 5 * 60)];
    assert.deepEqual(teamBackups(posted, lineups, {team: "0001", week: 9, page, facts}).pairs.map((pair) => pair.backup), ["w4"]);
    const later = [...lineups, lineup("Week 9: If A.J. Brown is out, start Marvin Harrison Jr.", 6)];
    assert.deepEqual(teamBackups(posted, later, {team: "0001", week: 9, page, facts}).pairs.map((pair) => pair.backup), ["w6"]);
});

test("a pair counts while its starter starts and its backup sits, and locks at its deadline", () => {
    const pairs = [{starter: "w1", backup: "w3", deadline: NOON - 300}, {starter: "w2", backup: "w4", deadline: NOON - 300}];
    const before = heldPairs(pairs, on, NOON - 3600);
    assert.deepEqual([[...before.unlocked], [...before.locked]], [[["w1", "w3"], ["w2", "w4"]], []]);
    const after = heldPairs(pairs, on, NOON - 299);
    assert.deepEqual([[...after.unlocked], [...after.locked]], [[], [["w1", "w3"], ["w2", "w4"]]]);
    // benching the starter or starting the backup ends an open pair
    assert.deepEqual([...keptPairs(before.unlocked, new Set([...on].filter((id) => id !== "w1")))], [["w2", "w4"]]);
    assert.deepEqual([...keptPairs(before.unlocked, new Set([...on, "w4"]))], [["w1", "w3"]]);
    // a locked pair whose starter MFL has benched doesn't count (16.5.3), so it locks nobody's box
    assert.deepEqual([...heldPairs(pairs, new Set([...on].filter((id) => id !== "w1")), NOON).locked], [["w2", "w4"]]);
});

test("a pair whose starter is benched is set aside, not taken back: it counts again when he starts", () => {
    const thread = new Map([["w1", "w3"]]);
    const benched = new Set([...on].filter((id) => id !== "w1"));
    // benched, it's out of force and not shown, but nothing changes in the thread
    assert.deepEqual([...keptPairs(thread, benched)], []);
    assert.deepEqual(pendingPairs(new Map(thread), thread), {set: [], dropped: []});
    // started again, it shows and counts as it was
    assert.deepEqual([...keptPairs(thread, on)], [["w1", "w3"]]);
    // a set-aside pair's backup isn't picked for another starter, though it doesn't count toward the fit
    const olave = page.players.find((each) => each.id === "w2");
    const {cant} = choices(page, {starter: olave, on: benched, pairs: thread, facts, now: SAT});
    assert.equal(cant.find((choice) => choice.player.id === "w3").why, "A.J. Brown's backup");
    // taken away in the picker, the message takes it back
    const team = teamBackups([post("0001", "Week 9: If A.J. Brown is out, start Tim Patrick.", SAT)], [], {team: "0001", week: 9, page, facts});
    assert.equal(backupMessage(team, {open: new Map(), before: thread, week: 9, facts, now: SAT}), "Week 9: No backup for A.J. Brown.");
});

test("a starter can be given a backup until 5 minutes before his game", () => {
    const brown = page.players.find((each) => each.id === "w1");
    assert.equal(canHaveBackup(brown, on, facts, LATE - 301), true);
    assert.equal(canHaveBackup(brown, on, facts, LATE - 300), false);
    // a bench player isn't a starter
    assert.equal(canHaveBackup(page.players.find((each) => each.id === "w3"), on, facts, SAT), false);
});

test("a starter nobody on the bench can back up gets no button", () => {
    const murray = page.players.find((each) => each.id === "q1");
    const brown = page.players.find((each) => each.id === "w1");
    // the only QB: any backup but a QB would leave none
    assert.equal(backupOffered(page, {starter: murray, on, pairs: new Map(), facts, now: SAT, locked: new Set()}), false);
    assert.equal(backupOffered(page, {starter: brown, on, pairs: new Map(), facts, now: SAT, locked: new Set()}), true);
    // once his game is 5 minutes off, nobody
    assert.equal(backupOffered(page, {starter: brown, on, pairs: new Map(), facts, now: LATE - 300, locked: new Set()}), false);
});

test("a starter whose pair has locked, even one set aside, gets no button: his backup can't change", () => {
    const brown = page.players.find((each) => each.id === "w1");
    // Brown's backup Patrick locked at 11:55; Brown, benched then, is started again at 1 p.m.
    const team = {pairs: [{starter: "w1", backup: "w3", deadline: NOON - 300}]};
    const locked = lockedStarters(team, NOON + 3600);
    assert.deepEqual([...heldPairs(team.pairs, new Set([...on].filter((id) => id !== "w1")), NOON + 3600).locked], []);
    assert.equal(backupOffered(page, {starter: brown, on, pairs: new Map(), facts, now: NOON + 3600, locked}), false);
});

test("Save refuses backups that no longer hold: locked since they were picked, out, or too many at once", () => {
    const team = {pairs: [{starter: "w1", backup: "w3", deadline: NOON - 300}]};
    const thread = new Map([["w1", "w3"]]);
    // Brown's backup changed to Harrison before 11:55 and saved after: Patrick's pair has locked
    assert.deepEqual(pairProblems(page, {open: new Map([["w1", "w6"]]), standing: thread, on, team, facts, now: NOON}), [{starter: "w1", lockedAt: NOON - 300}]);
    // the same before 11:55 is fine
    assert.deepEqual(pairProblems(page, {open: new Map([["w1", "w6"]]), standing: thread, on, team, facts, now: SAT}), []);
    // Henry, picked while Questionable, is now Out
    const henryOut = {...page, limits: {...page.limits, TE: [1, 2]}, players: page.players.map((each) => (each.id === "t2" ? {...each, injury: "Out"} : each))};
    const outFacts = weekFacts(henryOut, kickoffsOf(schedule));
    const wideOn = new Set([...on, "w6"].filter((id) => id !== "r2"));
    assert.deepEqual(pairProblems(henryOut, {open: new Map([["w6", "t2"]]), standing: new Map(), on: wideOn, team: {pairs: []}, facts: outFacts, now: SAT}),
        [{starter: "w6", why: "Hunter Henry is out"}]);
    // two TE backups for WRs, each fine alone: together two TEs could start, one the most
    const team2 = {...page, limits: {...page.limits, WR: [1, 3]}, players: [...page.players, player("t3", "Tucker Kraft", "Kraft, Tucker", "SEA", "TE")]};
    const facts2 = weekFacts(team2, kickoffsOf(schedule));
    assert.deepEqual(pairProblems(team2, {open: new Map([["w1", "t3"], ["w2", "t2"]]), standing: new Map(), on: wideOn, team: {pairs: []}, facts: facts2, now: SAT}),
        [{why: "the backups together would start 3 at TE (most 1)"}]);
});

test("the picker: the bench players who keep the lineup within MFL's ranges, the rest with why not", () => {
    const brown = page.players.find((each) => each.id === "w1");
    const {can, cant} = choices(page, {starter: brown, on, pairs: new Map([["w2", "w4"]]), facts, now: SAT});
    assert.deepEqual(can.map((choice) => [choice.player.id, choice.deadline]), [["w3", NOON - 300], ["w6", LATE - 300]]);
    assert.deepEqual(cant.map((choice) => [choice.player.id, choice.why]), [
        ["w4", "Chris Olave's backup"],
        ["w5", "Out"],
        ["w7", "on a bye"],
        // Questionable may play, but a TE for Brown would leave one WR
        ["t2", "would leave 1 at WR (least 2)"]
    ]);
});

test("the picker counts every pair at once: two backups into one position can't both fit", () => {
    const team = {
        ...page,
        limits: {QB: [1, 1], RB: [1, 3], WR: [1, 3], TE: [1, 1]},
        players: [...page.players, player("r3", "Jonah Coleman", "Coleman, Jonah", "DEN", "RB"), player("r4", "Rhamondre Stevenson", "Stevenson, Rhamondre", "NEP", "RB")]
    };
    const teamFacts = weekFacts(team, kickoffsOf(schedule));
    const olave = team.players.find((each) => each.id === "w2");
    // alone, a third RB fits; with Coleman already in for Brown, a fourth wouldn't
    assert.ok(choices(team, {starter: olave, on, pairs: new Map(), facts: teamFacts, now: SAT}).can.some((choice) => choice.player.id === "r4"));
    const {can, cant} = choices(team, {starter: olave, on, pairs: new Map([["w1", "r3"]]), facts: teamFacts, now: SAT});
    assert.equal(cant.find((choice) => choice.player.id === "r4").why, "would start 4 at RB (most 3)");
    assert.equal(cant.find((choice) => choice.player.id === "r3").why, "A.J. Brown's backup");
    // his own position first
    assert.equal(can[0].player.pos, "WR");
});

test("past a pair's deadline, its backup can't be picked", () => {
    const brown = page.players.find((each) => each.id === "w1");
    const {can, cant} = choices(page, {starter: brown, on, pairs: new Map(), facts, now: NOON - 300});
    assert.equal(cant.find((choice) => choice.player.id === "w3").why, "past the deadline");
    assert.ok(can.some((choice) => choice.player.id === "w6"));
});

test("Save's message restates every pair, locked ones too, and takes back the ones dropped", () => {
    const team = teamBackups([], [lineup("Week 9: If A.J. Brown is out, start Tim Patrick.")], {team: "0001", week: 9, page, facts});
    const before = heldPairs(team.pairs, on, SAT).unlocked;
    const args = {before, week: 9, facts, now: SAT};
    // as it stands: nothing to write
    assert.equal(backupMessage(team, {...args, open: new Map(before)}), null);
    // another pair added: both
    assert.equal(backupMessage(team, {...args, open: new Map([...before, ["w2", "w4"]])}),
        "Week 9: If A.J. Brown is out, start Tim Patrick; if Chris Olave is out, start Troy Franklin.");
    // Brown's taken away: said so, as an older message or post may have made it
    assert.equal(backupMessage(team, {...args, open: new Map()}), "Week 9: No backup for A.J. Brown.");
    // once Patrick's pair has locked, it's restated with the new one, so the latest message has them all
    const late = backupMessage(team, {open: new Map([["w6", "t2"]]), before: new Map(), week: 9, facts, now: NOON});
    assert.equal(late, "Week 9: If A.J. Brown is out, start Tim Patrick; if Marvin Harrison Jr. is out, start Hunter Henry.");
    // read back as the job reads it: the locked pair as it stood, the new one from the later message
    const read = teamBackups([], [lineup("Week 9: If A.J. Brown is out, start Tim Patrick."), lineup(late, 30, {at: "Sun Nov 8 12:00:00 p.m. CT 2026"})], {team: "0001", week: 9, page, facts});
    assert.deepEqual(read.pairs.map((pair) => [pair.starter, pair.backup]), [["w1", "w3"], ["w6", "t2"]]);
});

test("names match the whole roster, IR too, as the job's do: one on IR asks nothing", () => {
    const team = {...page, irNames: ["Brown, Chase"]};
    // "Brown" alone is A.J. Brown on the active roster, but the job, seeing Chase Brown too, can't tell
    const read = teamBackups([post("0001", "Week 9: if Brown is out start Patrick", SAT)], [], {team: "0001", week: 9, page: team, facts});
    assert.deepEqual(read.pairs, []);
});
