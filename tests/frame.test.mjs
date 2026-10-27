import {test} from "node:test";
import assert from "node:assert/strict";
import {REBUILT, locate, pageOf, sectionHref, sections, viewHash} from "../site/v2/ui/nav.js";
import {readFileSync} from "node:fs";
import {contextLine, draftDays, draftPicked} from "../site/v2/ui/context.js";

const base = "https://www44.myfantasyleague.com/2026";
const all = sections({base, leagueId: "48571", franchiseId: "0001"});
const at = (href, franchiseId = "0001", list = all) => {
    const found = locate(list, pageOf(new URL(href)), franchiseId);
    return found && [found.section.name, found.view && found.view.name];
};

test("each MFL page lands in its section and view", () => {
    assert.deepEqual(at(`${base}/home/48571`), ["Home", null]);
    assert.deepEqual(at(`${base}/home/48571#1`), ["League", "Standings"]);
    assert.deepEqual(at(`${base}/home/48571#3`), ["Rosters", "Players"]);
    assert.deepEqual(at(`${base}/lineup?L=48571`), ["Lineup", null]);
    assert.deepEqual(at(`${base}/add_drop?L=48571`), ["Moves", "Add"]);
    assert.deepEqual(at(`${base}/options?L=48571&O=255&ROUND=1`), ["Moves", "Add"]);
    assert.deepEqual(at(`${base}/options?L=48571&O=257`), ["Moves", "Drop"]);
    assert.deepEqual(at(`${base}/options?L=48571&O=05`), ["Moves", "Trades"]);
    assert.deepEqual(at(`${base}/trade_offer`), ["Moves", "Trades"]);
    assert.deepEqual(at(`${base}/options?L=48571&O=18`), ["Moves", "IR"]);
    assert.deepEqual(at(`${base}/ajax_ls?L=48571`), ["League", "Scores"]);
    assert.deepEqual(at(`${base}/options?L=48571&O=101`), ["League", "Power"]);
    assert.deepEqual(at(`${base}/options?L=48571&O=17`), ["Rosters", "Draft"]);
});

test("the views are the redesign's, Winners only once v2 draws it", () => {
    const names = (name, list = all) => list.find((s) => s.name === name).views.map((v) => v.name);
    assert.deepEqual(names("Moves"), ["Add", "Drop", "Trades", "IR"]);
    assert.deepEqual(names("League"), ["Scores", "Standings", "Power"]);
    assert.deepEqual(names("Rosters"), ["My team", "Teams", "Players", "Draft"]);
    const built = sections({base, leagueId: "48571", franchiseId: "0001", rebuilt: ["League/Winners"]});
    assert.deepEqual(names("League", built), ["Scores", "Standings", "Power", "Winners"]);
});

test("rosters: your own team is My team, any other is Teams", () => {
    assert.deepEqual(at(`${base}/options?L=48571&O=07&F=0001`), ["Rosters", "My team"]);
    assert.deepEqual(at(`${base}/options?L=48571&O=07&F=0002`), ["Rosters", "Teams"]);
    assert.deepEqual(at(`${base}/options?L=48571&O=07`), ["Rosters", "Teams"]);
});

test("logged out, the views that need a login are v2's pages saying so, and Rosters opens on Teams", () => {
    const guest = sections({base, leagueId: "48571", franchiseId: null, rebuilt: REBUILT});
    const home = `${base}/home/48571`;
    const view = (section, name) => guest.find((s) => s.name === section).views.find((v) => v.name === name);
    const lineup = guest.find((s) => s.name === "Lineup");
    assert.deepEqual([lineup.href, lineup.after, lineup.login], [`${home}#lineup`, `${base}/lineup?L=48571`, "set your lineup"]);
    assert.deepEqual([view("Moves", "Add").href, view("Moves", "Add").after], [`${home}#moves-add`, `${base}/add_drop?L=48571`]);
    assert.deepEqual([view("Rosters", "My team").href, view("Rosters", "My team").after], [`${home}#rosters-my-team`, `${home}#rosters-my-team`]);
    assert.equal(guest.find((s) => s.name === "Rosters").href, `${home}#rosters-teams`);
    assert.equal(view("Rosters", "Teams").login, undefined);
    assert.equal(sectionHref(guest.find((s) => s.name === "Rosters"), "Home", {Rosters: "My team"}), `${home}#rosters-teams`);
    const found = locate(guest, pageOf(new URL(`${home}#moves-trades`)), null);
    assert.deepEqual([found.section.name, found.view.name], ["Moves", "Trades"]);
});

test("logged in, Lineup and Moves are MFL's pages", () => {
    const member = sections({base, leagueId: "48571", franchiseId: "0001", rebuilt: REBUILT});
    const lineup = member.find((s) => s.name === "Lineup");
    assert.deepEqual([lineup.href, lineup.login], [`${base}/lineup?L=48571`, undefined]);
    assert.equal(member.find((s) => s.name === "Moves").href, `${base}/add_drop?L=48571`);
});

test("Rules, over League Rules or League Settings, lives under Home", () => {
    assert.deepEqual(at(`${base}/options?L=48571&O=26`), ["Home", null]);
    assert.deepEqual(at(`${base}/options?L=48571&O=09`), ["Home", null]);
});

test("pages left to the site menu belong to no section", () => {
    assert.equal(at(`${base}/options?L=48571&O=156`), null);
    assert.equal(at(`${base}/home/48571#4`), null);
});

test("a section opens on its first view, and My team is your own roster", () => {
    assert.equal(all.find((s) => s.name === "Moves").href, `${base}/add_drop?L=48571`);
    assert.equal(all.find((s) => s.name === "Rosters").href, `${base}/options?L=48571&O=07&F=0001`);
    // MFL's home page tabs are picked by position, learned from the page
    const moved = sections({base, leagueId: "48571", franchiseId: "0001", tabs: {Main: 0, Contracts: 1, Standings: 2}});
    assert.equal(moved.find((s) => s.name === "League").views[1].href, `${base}/home/48571#2`);
});

test("a rebuilt view lives on the home page under its own #", () => {
    assert.equal(viewHash("League", "Standings"), "#league-standings");
    assert.equal(viewHash("Rosters", "My team"), "#rosters-my-team");
    const built = sections({base, leagueId: "48571", franchiseId: "0001", rebuilt: ["League/Standings", "Home"]});
    const league = built.find((s) => s.name === "League");
    assert.equal(league.views[1].href, `${base}/home/48571#league-standings`);
    assert.equal(built[0].href, `${base}/home/48571#home-page`);
    assert.deepEqual(at(`${base}/home/48571#league-standings`, "0001", built), ["League", "Standings"]);
    assert.deepEqual(at(`${base}/home/48571#home-page`, "0001", built), ["Home", null]);
    // the MFL page it replaces still belongs to the view
    assert.deepEqual(at(`${base}/standings?L=48571`, "0001", built), ["League", "Standings"]);
    // a # v2 doesn't know is the home page's Main tab
    assert.deepEqual(at(`${base}/home/48571#top`, "0001", built), ["Home", null]);
    assert.deepEqual(at(`${base}/home/48571#top`), ["Home", null]);
});

const at2026 = (text) => new Date(text);
const week1 = at2026("2026-09-10T19:20:00-05:00");
const seasonEnd = at2026("2027-01-04T02:00:00-06:00");

test("the context line: the week in season, the phase outside it", () => {
    const line = (now, extra = {}) => contextLine({now: at2026(now), week: 6, week1, seasonEnd, drafted: true, ...extra});
    assert.equal(line("2026-10-17T12:00:00-05:00"), "Week 6");
    assert.equal(line("2026-09-01T12:00:00-05:00"), "Before week 1");
    assert.equal(line("2026-05-01T12:00:00-05:00", {drafted: false}), "Before the draft");
    assert.equal(line("2026-08-29T21:00:00-05:00", {drafted: false, draftDays: ["2026-08-29"]}), "Draft day");
    assert.equal(line("2027-01-10T12:00:00-06:00"), "Season over");
    // MFL hasn't published the schedule yet
    assert.equal(contextLine({now: at2026("2027-03-20T12:00:00-05:00"), week: 17, week1: null, seasonEnd: null, drafted: false}), "Before the draft");
});

test("the draft is in once a pick names a player; draft day comes from the calendar", () => {
    assert.equal(draftPicked({draftUnit: {draftPick: [{pick: "01", player: ""}]}}), false);
    assert.equal(draftPicked({draftUnit: {draftPick: [{pick: "01", player: "17497"}, {pick: "02", player: ""}]}}), true);
    assert.equal(draftPicked(null), false);
    // 7 p.m. CT on Aug 29 is already Aug 30 in UTC
    assert.deepEqual(draftDays({event: [{title: "Rookie Draft", start_time: "1788048000"}, {title: "Final cut-down", start_time: "1788500000"}]}), ["2026-08-29"]);
    assert.deepEqual(draftDays(null), []);
});

test("draft day from the league's calendar export, as saved 17 Oct 2026", () => {
    const {calendar} = JSON.parse(readFileSync(new URL("./fixtures/calendar.json", import.meta.url), "utf8"));
    // "draft" on Sep 6, 2026; the trade deadline's start_time is a week number, not a time
    assert.deepEqual(draftDays(calendar), ["2026-09-06"]);
});

test("a section's link returns to the view last seen in it; the section you're in, to its first", () => {
    const league = all.find((s) => s.name === "League");
    const view = (name) => league.views.find((v) => v.name === name).href;
    assert.equal(sectionHref(league, "Rosters", {League: "Standings"}), view("Standings"));
    assert.equal(sectionHref(league, "League", {League: "Standings"}), view("Scores"));
    assert.equal(sectionHref(league, "Rosters", {}), view("Scores"));
    // a view no longer offered (My team, logged out) falls back to the first
    assert.equal(sectionHref(league, "Rosters", {League: "Gone"}), view("Scores"));
    const home = all.find((s) => s.name === "Home");
    assert.equal(sectionHref(home, "League", {Home: "Anything"}), home.href);
});
