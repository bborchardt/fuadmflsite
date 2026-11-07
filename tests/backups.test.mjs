import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fits, lineupAt, lineupRules, matchPlayer, pairsFit, postText, readLineupDetails, readRequests, readTopicPage, standingPairs, weekLineup}
    from "../site/v2/lib/backups.js";

const page = (name) => readFileSync(new URL(`./fixtures/backups/${name}`, import.meta.url), "utf8");

const roster = [
    {id: "1", name: "Nacua, Puka"}, {id: "2", name: "Washington, Parker"}, {id: "3", name: "Washington, Malik"},
    {id: "4", name: "Charbonnet, Zach"}, {id: "5", name: "Allen, Josh"}, {id: "6", name: "Allen, Keenan"},
    {id: "7", name: "Brown, A.J."}, {id: "8", name: "St. Brown, Amon-Ra"}, {id: "9", name: "Pierce, Alec"}
];
const named = (phrase) => {
    const found = matchPlayer(phrase, roster);
    return found.player ? found.player.id : found.ambiguous ? found.ambiguous.map((player) => player.id) : null;
};

test("a name matches the team's player by full name, initial, surname, first name or a near surname", () => {
    assert.equal(named("Parker Washington WR"), "2");
    assert.equal(named("P. Washington"), "2");
    assert.equal(named("Puka"), "1");
    assert.equal(named("Zach Chabonnet"), "4");
    assert.equal(named("Charbonet"), "4");
    assert.equal(named("Josh Allen"), "5");
    assert.equal(named("Amon-Ra St. Brown"), "8");
    assert.equal(named("A.J. Brown"), "7");
    // two players by surname alone, or nobody on the team
    assert.deepEqual(named("Washington"), ["2", "3"]);
    assert.deepEqual(named("Allen"), ["5", "6"]);
    assert.equal(named("Lamar Jackson"), null);
});

test("the live thread's posts: requests with the week when stated, and reminders and replies ask nothing", () => {
    const {posts, pages} = readTopicPage(page("topic-conditional-starters.html"));
    assert.deepEqual(pages, []);
    assert.deepEqual(posts.map((post) => [post.franchiseId, post.posted, post.edited]), [
        ["0004", "Sat Sep 19 5:25:57 p.m. CT 2026", null],
        ["0004", "Mon Sep 21 8:21:44 p.m. CT 2026", null],
        [null, "Tue Sep 22 12:25:26 p.m. CT 2026", null],
        [null, "Thu Oct 1 12:06:21 p.m. CT 2026", null],
        ["0008", "Sat Oct 31 11:15:50 p.m. CT 2026", null]
    ]);
    const asks = posts.map((post) => readRequests(postText(post.html)));
    assert.deepEqual(asks[0].requests.map(({starter, backup}) => [starter, backup]), [["Puka", "Parker Washington WR"]]);
    assert.equal(asks[0].week, null);
    // "Puka was out, please insert P. Washington": the reminder 16.5.8 asked for
    assert.deepEqual([asks[1].requests, asks[1].unreadable], [[], []]);
    assert.deepEqual([asks[2].requests, asks[2].unreadable], [[], []]);
    assert.equal(asks[3].week, 4);
    assert.deepEqual(asks[4].requests.map(({starter, backup}) => [starter, backup]), [["Zach Chabonnet", "Malik Washington"]]);
    assert.equal(asks[4].week, 8);
});

test("a post's requests, one a line or joined by semicolons, and how one is taken back", () => {
    const lines = readRequests("Week 10: If Jordan Addison is out, start Davante Adams\nIf Geno Smith is out, start Matthew Stafford");
    assert.equal(lines.week, 10);
    assert.deepEqual(lines.requests.map(({starter, backup}) => [starter, backup]),
        [["Jordan Addison", "Davante Adams"], ["Geno Smith", "Matthew Stafford"]]);
    const joined = readRequests("Week 10: If Jordan Addison is out, start Davante Adams; If Geno Smith is inactive then play Matthew Stafford.");
    assert.deepEqual(joined.requests.map(({backup}) => backup), ["Davante Adams", "Matthew Stafford"]);
    assert.deepEqual(readRequests("If P. Washington can't go, sub in Malik Washington").requests.map(({starter, backup}) => [starter, backup]),
        [["P. Washington", "Malik Washington"]]);
    assert.deepEqual(readRequests("Week 10: No backup for Jordan Addison").removals, ["Jordan Addison"]);
    assert.equal(readRequests("Week 10: Conditional starters were removed").removeAll, true);
    assert.equal(readRequests("No backups this week").removeAll, true);
    // an "if" it can't read goes to the commissioner
    assert.deepEqual(readRequests("If Addison is out, Adams").unreadable, ["If Addison is out, Adams"]);
    assert.deepEqual(readRequests("week 9 and week 10: if Addison is out start Adams").weeks, [9, 10]);
});

test("Lineup Details lists each submission's starters and time, the failed import too", () => {
    const submissions = readLineupDetails(page("lineup-details.html"));
    assert.deepEqual(submissions.map((each) => [each.week, each.commish, each.failed, each.at, each.starters.length]), [
        [8, true, false, "Sat Nov 7 12:15:29 p.m. CT 2026", 10],
        [8, true, false, "Sat Nov 7 1:57:06 p.m. CT 2026", 10],
        [8, true, false, "Sat Nov 7 1:58:15 p.m. CT 2026", 10],
        [8, true, true, "Sat Nov 7 5:27:17 p.m. CT 2026", 10]
    ]);
    // a note after the starters ("Reserved Addison … after kickoff") isn't one of them
    assert.deepEqual(submissions[1].starters.slice(5, 6), [{name: "Adams, Davante", nfl: "LAR", pos: "WR"}]);
    assert.deepEqual(submissions[1].starters.at(-1), {name: "McPherson, Evan", nfl: "CIN", pos: "PK"});
});

test("the lineup at a moment is the last submission before it that went through, else last week's", () => {
    const submissions = [{at: 100, starters: ["a"]}, {at: 200, starters: ["b"]}, {at: 300, failed: true, starters: ["c"]}];
    assert.deepEqual(lineupAt(submissions, 150, ["x"]), ["a"]);
    assert.deepEqual(lineupAt(submissions, 400, ["x"]), ["b"]);
    assert.deepEqual(lineupAt(submissions, 50, ["x"]), ["x"]);
});

const rules = lineupRules({starters: {count: "10", position: [{name: "QB", limit: "1-2"}, {name: "RB", limit: "1-3"},
    {name: "WR", limit: "2-5"}, {name: "TE", limit: "1-3"}, {name: "PK", limit: "1"}]}});
const POS = {q1: "QB", q2: "QB", r1: "RB", r2: "RB", w1: "WR", w2: "WR", w3: "WR", t1: "TE", t2: "TE", k1: "PK", w4: "WR", w5: "WR", r3: "RB", q3: "QB"};
const positionOf = (id) => POS[id];
const starting = ["q1", "q2", "r1", "r2", "w1", "w2", "w3", "t1", "t2", "k1"];

test("a lineup fits MFL's ranges, and a set of pairs fits whichever of them are swapped in", () => {
    assert.equal(fits(starting.map(positionOf), rules), true);
    assert.equal(fits(["q1", "q2", "r1", "w1", "w2", "w3", "w4", "t1", "t2", "k1"].map(positionOf), rules), true);
    assert.equal(fits(["q1", "q2", "w1", "w2", "w3", "w4", "w5", "t1", "t2", "k1"].map(positionOf), rules), false);
    // a WR may back up one of the two RBs, not both
    assert.equal(pairsFit(starting, [{starter: "r1", backup: "w4"}], positionOf, rules), true);
    assert.equal(pairsFit(starting, [{starter: "r1", backup: "w4"}, {starter: "r2", backup: "w5"}], positionOf, rules), false);
    // the same position either way changes no count
    assert.equal(pairsFit(starting, [{starter: "r1", backup: "r3"}, {starter: "r2", backup: "w4"}], positionOf, rules), true);
});

test("per starter, the latest request before its pair's deadline stands, and a pair locks at its deadline", () => {
    // the backup w4 plays Thursday (deadline 100), w5 Sunday (deadline 1000)
    const deadline = (starter, backup) => (backup === "none" ? null : backup === "w4" ? 100 : 1000);
    const result = standingPairs([
        {at: 50, starter: "w1", backup: "w4"},
        // after w4's deadline: the pair is locked, so this doesn't replace it
        {at: 500, starter: "w1", backup: "w5"},
        {at: 60, starter: "w2", backup: "w5"},
        {at: 70, starter: "w2", backup: "w3"},
        {at: 80, starter: "w3", backup: "w5"},
        {at: 90, starter: "w3", remove: true},
        {at: 95, starter: "t1", backup: "none"},
        // late for its own deadline
        {at: 2000, starter: "r1", backup: "w5"}
    ], deadline);
    assert.deepEqual(result.pairs.map(({starter, backup, deadline: due}) => [starter, backup, due]), [["w1", "w4", 100], ["w2", "w3", 1000]]);
    assert.deepEqual(result.late.map(({at, noGame = false}) => [at, noGame]), [[95, true], [500, false], [2000, false]]);
    const cleared = standingPairs([{at: 10, starter: "w1", backup: "w5"}, {at: 20, removeAll: true}], deadline);
    assert.deepEqual(cleared.pairs, []);
});

test("the week's lineup: backups in for inactive starters, a locked pair changed afterwards put back", () => {
    const pair = (starter, backup, extra = {}) => ({starter, backup, starting, ...extra});
    const base = {positionOf, rules, kickoff: () => 0};
    // a lineup is a set of players, in no order
    const same = (actual, expected) => assert.deepEqual([...actual].sort(), [...expected].sort());
    const swapped = weekLineup({...base, pairs: [pair("w1", "w4")], final: starting, out: new Set(["w1"])});
    same(swapped.lineup, ["q1", "q2", "r1", "r2", "w4", "w2", "w3", "t1", "t2", "k1"]);
    assert.deepEqual(swapped.swaps.map((each) => each.starter), ["w1"]);
    // run again on what it set: nothing more to do
    const again = weekLineup({...base, pairs: [pair("w1", "w4")], final: swapped.lineup, out: new Set(["w1"])});
    same(again.lineup, swapped.lineup);
    assert.deepEqual(again.restored.map((each) => each.starter), []);
    // the backup inactive too: nothing
    same(weekLineup({...base, pairs: [pair("w1", "w4")], final: starting, out: new Set(["w1", "w4"])}).lineup, starting);
    // benched after the deadline for w5: put back, w5 out again; he played, so no swap
    const benched = ["q1", "q2", "r1", "r2", "w5", "w2", "w3", "t1", "t2", "k1"];
    const restored = weekLineup({...base, pairs: [pair("w1", "w4")], final: benched, out: new Set()});
    same(restored.lineup, starting);
    assert.deepEqual(restored.restored.map((each) => each.starter), ["w1"]);
    // benched after the deadline and out: put back, then the backup in
    const both = weekLineup({...base, pairs: [pair("w1", "w4")], final: benched, out: new Set(["w1"])});
    same(both.lineup, ["q1", "q2", "r1", "r2", "w2", "w3", "t1", "t2", "k1", "w4"]);
    // a starter benched before the deadline has no backup (16.5.3)
    const notStarting = ["q1", "q2", "r1", "r2", "w5", "w2", "w3", "t1", "t2", "k1"];
    same(weekLineup({...base, pairs: [{starter: "w1", backup: "w4", starting: notStarting}], final: notStarting, out: new Set(["w1"])}).lineup, notStarting);
    // one backup for two starters (16.5.2)
    const twice = weekLineup({...base, pairs: [pair("w1", "w4"), pair("w2", "w4")], final: starting, out: new Set(["w1", "w2"])});
    assert.deepEqual([twice.lineup, twice.flags.map((flag) => flag.why)], [starting, ["same-backup", "same-backup"]]);
    // hand-written pairs that break the lineup together: the earlier kickoff's, then a flag
    const rbs = weekLineup({...base, kickoff: (id) => (id === "r2" ? 1 : 2), pairs: [pair("r1", "w4"), pair("r2", "w5")], final: starting, out: new Set(["r1", "r2"])});
    assert.deepEqual([rbs.swaps.map((each) => each.starter), rbs.flags.map((flag) => [flag.pair.starter, flag.why])], [["r2"], [["r1", "wont-fit"]]]);
});
