import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {lineupFields, lineupSaved, mflTeam, readCsv, readLineupForm, recalcFields, changeText, teamChange, weekFinder, weekStatuses} from "../jobs/backup-starters.mjs";
import {lineupAt, lineupRules, weekLineup} from "../site/v2/lib/backups.js";
import {mflForm} from "../jobs/mfl-form.mjs";

const fixture = (name) => readFileSync(new URL(`./fixtures/backups/${name}`, import.meta.url), "utf8");

test("a CSV's rows by its header, quoted fields with commas and quotes kept", () => {
    assert.deepEqual(readCsv("a,b,c\n1,\"x, y\",\"say \"\"hi\"\"\"\r\n2,,3\n"), [{a: "1", b: "x, y", c: "say \"hi\""}, {a: "2", b: "", c: "3"}]);
});

test("nflverse's week: who was inactive, by MFL id, and which teams' lists are in", () => {
    const {statuses, reported} = weekStatuses(readCsv(fixture("roster_weekly.csv")), readCsv(fixture("db_playerids.csv")), 6);
    assert.deepEqual(statuses.get("17102"), {status: "INA", team: "IND"});
    assert.deepEqual(statuses.get("16194"), {status: "INA", team: "KCC"});
    assert.deepEqual(statuses.get("13589"), {status: "ACT", team: "BUF"});
    // week 5's inactive Addison isn't week 6's
    assert.equal(statuses.has("16186"), false);
    assert.deepEqual([...reported].sort(), ["BUF", "IND", "KCC"]);
    assert.equal(mflTeam("LA"), "LAR");
    assert.equal(mflTeam("NYJ"), "NYJ");
});

test("the commissioner's lineup form gives the lineup's fields, a box per player who can start", () => {
    const form = readLineupForm(fixture("lineup-commish.html"), {team: "0002", week: 8});
    assert.deepEqual(form.fields.map(([name]) => name), ["FRANCHISE", "LEAGUE_ID", "WEEK", "FORM", "lineup_expires", "INITPROJSRC", "PROJSRC"]);
    assert.equal(form.boxes.get("16186"), "WR0002");
    const fields = lineupFields(form, ["11150", "11675"]);
    assert.deepEqual(fields.slice(-4), [["QB0002", "11150"], ["WR0002", "11675"], ["MESSAGE0002", ""], ["SUBMIT", "Submit Lineup"]]);
    assert.throws(() => lineupFields(form, ["99999"]), /no box for player\(s\) 99999/);
    assert.throws(() => readLineupForm(fixture("lineup-commish.html"), {team: "0003", week: 8}), /team 0002, week 8, not team 0003/);
    assert.throws(() => readLineupForm(fixture("lineup-details.html"), {team: "0002", week: 8}), /no lineup form/);
    assert.equal(lineupSaved("So your saying there's a chance? Week 8 lineup SUBMITTED Warning(s): The lineup deadline …"), true);
    assert.equal(lineupSaved("Error(s) submitting lineup: You must select 1 PK"), false);
});

test("Recalculate Standings for one week, no email to the owners", () => {
    const fields = Object.fromEntries(recalcFields(fixture("csetup-RECALC.html"), 8));
    assert.deepEqual({...fields, input_expires: "…"}, {form_name: "recalc", LEAGUE_ID: "50965", C: "RECALC", input_expires: "…",
        WEEK: "8", SENDMAIL: "No", PREVWEEK: "No", SUBMIT: "Recalculate Standings"});
    assert.throws(() => recalcFields(fixture("csetup-RECALC.html"), 12), /no form for week 12/);
});

test("the job's log says what it changed", () => {
    const names = {a: "Jordan Addison", b: "Davante Adams", c: "Geno Smith", d: "Aaron Rodgers"};
    const text = changeText({swaps: [{starter: "a", backup: "b"}], restored: [{starter: "c", backup: "d"}]}, (id) => names[id]);
    assert.equal(text, "Geno Smith and Aaron Rodgers were locked in as they were at their deadline (16.5.5), so the later change was undone; Davante Adams started for Jordan Addison, who was inactive");
});

test("a form refuses a dry run, and a page that says it failed throws", async () => {
    const page = (body, status = 200) => async () => ({ok: status === 200, status, text: async () => body});
    const options = {dryRun: false, host: "https://example.test", headers: {}};
    const form = {what: "Submit Lineup", path: "/2026/lineup", fields: [["A", "1"]], ok: lineupSaved};
    await assert.rejects(mflForm(form, {...options, dryRun: true, fetchImpl: page("")}), /dry run reached MFL's Submit Lineup form/);
    assert.match(await mflForm(form, {...options, fetchImpl: page("Week 8 lineup SUBMITTED")}), /SUBMITTED/);
    await assert.rejects(mflForm(form, {...options, fetchImpl: page("<b>Error(s) submitting lineup: You must select 1 PK.</b>")}), /Error\(s\) submitting lineup: You must select 1 PK/);
    await assert.rejects(mflForm(form, {...options, fetchImpl: page("", 500)}), /HTTP 500/);
});

// Team 0002 starts QB q1 and TE t1, with QB q2 on the bench; it asked for q2 if t1 is out, and
// submitted once before the pair's deadline (1000). The league starts 2: QB 0-2, TE 0-1.
const changeOf = async ({statuses, scores = [], saved = "q1,t1,", submissions = [{at: 500, starters: ["q1", "t1"]}]} = {}) => {
    const reads = [];
    const positions = {q1: "QB", q2: "QB", t1: "TE"};
    const result = await teamChange({
        team: "0002", week: 6, submissions, statuses: new Map(Object.entries(statuses)),
        pairs: [{starter: "t1", backup: "q2", at: 400, deadline: 1000}],
        positionOf: (id) => positions[id], rules: lineupRules({starters: {count: "2", position: [{name: "QB", limit: "0-2"}, {name: "TE", limit: "0-1"}]}}),
        kickoffOf: () => 1300, nameOf: (id) => id.toUpperCase()
    }, {lineupAt, weekLineup}, {
        saved: async () => (reads.push("saved"), [{id: "0002", starters: saved}]),
        lastWeek: async () => (reads.push("lastWeek"), []),
        scores: async (ids) => (reads.push(`scores ${ids}`), scores)
    });
    return {...result, reads};
};

test("a team's week: an inactive starter's backup goes in", async () => {
    const {flags, change, reads} = await changeOf({statuses: {t1: {status: "INA"}, q2: {status: "ACT"}}});
    assert.deepEqual(flags, []);
    assert.deepEqual(change, {lineup: ["q1", "q2"], submit: true, what: "Q2 started for T1, who was inactive"});
    assert.deepEqual(reads, ["saved", "lastWeek", "scores t1"]);
    // already in MFL's saved results: nothing to do
    assert.equal((await changeOf({statuses: {t1: {status: "INA"}, q2: {status: "ACT"}}, saved: "q1,q2,", submissions: [{at: 500, starters: ["q1", "t1"]}, {at: 2000, starters: ["q1", "q2"], commish: true}]})).change, null);
});

test("a team's week: an active starter, or one nflverse can't vouch for, keeps his place", async () => {
    assert.deepEqual(await changeOf({statuses: {t1: {status: "ACT"}, q2: {status: "ACT"}}}).then(({flags, change}) => [flags, change]), [[], null]);
    const missing = await changeOf({statuses: {q2: {status: "ACT"}}});
    assert.deepEqual([missing.flags, missing.change], [["T1's week 6 status on nflverse is missing, so his backup Q2 wasn't started"], null]);
    const unlisted = await changeOf({statuses: {t1: {status: "INA"}}});
    assert.deepEqual([unlisted.flags, unlisted.change], [["Q2, T1's backup, isn't in nflverse's week 6 rosters, so he wasn't started"], null]);
    // inactive on nflverse but scored: taken as active
    const scored = await changeOf({statuses: {t1: {status: "INA"}, q2: {status: "ACT"}}, scores: [{id: "t1", score: "4.5"}]});
    assert.deepEqual([scored.flags, scored.change], [["nflverse lists T1 as inactive, but he scored 4.5, so he's taken as active"], null]);
});

test("a team's week: a Lineup Details row it can't read stops the team, asking MFL nothing", async () => {
    const {flags, change, reads} = await changeOf({statuses: {}, submissions: [{at: null, starters: ["q1", "t1"]}]});
    assert.deepEqual([flags, change, reads], [["a lineup on MFL's Lineup Details couldn't be read"], null, []]);
});

test("the week a moment is in: the one whose games are still to come", async () => {
    const weeks = {1: [100, 300], 2: [700, 900], 3: [1300, 1500]};
    const weekOf = weekFinder(async (week) => weeks[week] || [], 3);
    assert.deepEqual(await Promise.all([50, 299, 300, 800, 1499, 1500].map(weekOf)), [1, 1, 2, 2, 3, null]);
});
