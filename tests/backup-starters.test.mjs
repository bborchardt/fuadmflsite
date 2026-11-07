import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {REPLY, lineupFields, lineupSaved, mflTeam, readCsv, readLineupForm, recalcFields, replyText, weekStatuses} from "../jobs/backup-starters.mjs";
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

test("the job's reply says what it did, and marks the team's week", () => {
    const names = {a: "Jordan Addison", b: "Davante Adams", c: "Geno Smith", d: "Aaron Rodgers"};
    const text = replyText(9, "Golden Ratio ", {swaps: [{starter: "a", backup: "b"}], restored: [{starter: "c", backup: "d"}]}, (id) => names[id]);
    assert.equal(text, "Week 9, Golden Ratio: Geno Smith and Aaron Rodgers were locked in as they were at their deadline (16.5.5), so the later change was undone. Davante Adams started for Jordan Addison, who was inactive. Standings recalculated.");
    assert.deepEqual([...REPLY.exec(text)].slice(1), ["9", "Golden Ratio"]);
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
