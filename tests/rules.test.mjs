// Rules reads MFL's League Rules and League Settings pages (the league's, saved 25 Oct 2026): if MFL
// changes them, these say where.

import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseHTML} from "linkedom";
import {matching, readScoring, readSettings, ruleSections} from "../site/v2/ui/rules-model.js";

const page = (name) => parseHTML(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")).document;
const scoring = readScoring(page("rules-scoring.html"));
const settings = readSettings(page("rules-settings.html"));

test("scoring: MFL's groups and lines as written, and when it last changed", () => {
    assert.deepEqual(scoring.groups.map((group) => [group.title, group.rows.length]), [["WR, TE, RB, QB, PK", 18], ["QB, PK, RB, WR", 1], ["TE", 1], ["PK", 8]]);
    assert.deepEqual(scoring.groups[0].rows[1], {event: "Passing Yards", range: "-999-999", points: "1 point for every 30"});
    assert.equal(scoring.modified, "Sun Jul 26 2:41:54 p.m. ET 2026");
    // other pages have no scoring tables
    assert.equal(readScoring(page("rules-settings.html")), null);
});

test("settings: every group in MFL's order, each setting with its value, lists kept whole", () => {
    const titles = settings.settings.map((group) => group.title);
    assert.equal(titles[0], "General League Setup");
    assert.ok(titles.includes("Starting Lineup Setup") && titles.includes("Injured Reserve Setup"));
    assert.ok(!titles.some((title) => /additional league rules/i.test(title)));
    const group = (title) => settings.settings.find((entry) => entry.title === title).rows;
    const value = (title, label) => group(title).find((row) => row.label === label).values.map((item) => item.text);
    assert.deepEqual(value("Starting Lineup Setup", "Number of Starting QBs"), ["1-2"]);
    assert.equal(value("Abilities Setup", "Franchise Abilities").length, 14);
    assert.deepEqual(value("Add/Drop and Waivers Setup", "Waiver Calendar"), [
        "Process Blind Bid Waivers · Wed Sep 9 2026 11:00 p.m. CT · repeats 16",
        "Put All Free Agents On Waivers · Sun Sep 13 2026 12:00 p.m. CT · repeats 16"
    ]);
    // MFL leaves this row's cells unclosed; the cap still reads
    assert.deepEqual(value("Salary Cap Setup", "Per-Franchise Roster Salary Cap"), ["$300"]);
    const mail = group("General League Setup").find((row) => row.label === "Commissioner Email Address").values[0];
    assert.equal(mail.text, "Send Email To Commish");
    assert.match(mail.href, /^mailto:/);
});

test("bylaws: a section per heading, each rule with its number, sub-rules a level down", () => {
    assert.equal(settings.bylaws.length, 16);
    assert.equal(settings.bylaws[0].title, "1. Playoffs");
    assert.equal(settings.bylaws[15].title, "16. Miscellaneous");
    assert.deepEqual(settings.bylaws[0].rules[0], {number: "1.1.", text: "2 division winners + 4 wildcards make playoffs", depth: 0});
    const contracts = settings.bylaws[1].rules;
    const sub = contracts.find((rule) => rule.number === "2.6.1.");
    assert.equal(sub.depth, 1);
    assert.match(sub.text, /^If the violation occurs during the season/);
    // 2.6's own words, without its sub-rules
    assert.match(contracts.find((rule) => rule.number === "2.6.").text, /following exceptions:$/);
    const misc = settings.bylaws[15].rules.map((rule) => rule.number);
    assert.ok(misc.includes("16.3.") && misc.includes("16.5.8."));
    assert.ok(settings.bylaws[12].rules.find((rule) => rule.number === "13.2.").text.includes("bye"));
});

test("the page's sections, and the filter showing only what matches", () => {
    const sections = ruleSections({scoring, settings});
    assert.deepEqual(sections.slice(0, 2).map((section) => [section.group, section.title]), [["", "Scoring"], ["Bylaws", "1. Playoffs"]]);
    assert.equal(sections[sections.length - 1].group, "League settings");
    const kicks = sections[0].items.filter((item) => item.kind === "score" && item.event.startsWith("Field goal"));
    assert.deepEqual(kicks[0], {kind: "score", event: "Field goal 0–39 yds", points: "3", words: "PK Field goal 0–39 yds 3"});
    const found = matching(sections, "BYE").filter((section) => section.count);
    assert.ok(found.some((section) => section.title === "13. Tanking"));
    assert.ok(found.some((section) => section.title === "Starting Lineup Setup"));
    assert.ok(found.every((section) => section.shown.every((item) => item.words.toLowerCase().includes("bye"))));
    // a scoring line keeps the positions it's for, which can be searched too
    const recep = matching(sections, "recep")[0];
    assert.deepEqual(recep.shown.map((item) => item.text || item.event), ["QB, PK, RB, WR", "Receptions", "TE", "Receptions"]);
    assert.equal(recep.count, 2);
    assert.equal(matching(sections, "TE")[0].shown.filter((item) => item.kind === "score").length >= 1, true);
    // one page unread: the other's sections alone
    assert.deepEqual(ruleSections({scoring, settings: null}).map((section) => section.title), ["Scoring"]);
    assert.equal(ruleSections({scoring: null, settings})[0].title, "1. Playoffs");
    // no filter: everything, no counts
    assert.ok(matching(sections, " ").every((section) => section.count === null && section.shown === section.items));
});
