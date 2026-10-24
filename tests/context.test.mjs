// What the line under the wordmark, League and Rosters read about the season: week 1's kickoff, the
// season's end, the draft. MFL answers from `answers`; each test its own season, as pageFetch keeps
// one answer per address for the page's life.

import {afterEach, beforeEach, test} from "node:test";
import assert from "node:assert/strict";
import {beforeWeek1, loadContext, seasonFacts} from "../site/v2/ui/context.js";

const at = (iso) => Date.parse(iso) / 1000;
const WEEK1 = at("2026-09-11T00:20:00Z");
const schedule = (...kickoffs) => ({nflSchedule: {matchup: kickoffs.map((kickoff) => ({kickoff: String(kickoff)}))}});

let answers;
let asked;
const realFetch = globalThis.fetch;
beforeEach(() => {
    const items = new Map();
    globalThis.window = {
        location: {origin: "https://www44.myfantasyleague.com", pathname: "/2026/home/48571"},
        localStorage: {getItem: (key) => (items.has(key) ? items.get(key) : null), setItem: (key, value) => items.set(key, String(value))}
    };
    asked = [];
    answers = {};
    globalThis.fetch = async (url) => {
        asked.push(String(url));
        const params = new URL(url).searchParams;
        const key = params.get("TYPE") === "nflSchedule" ? `nflSchedule${params.get("W")}` : params.get("TYPE");
        const answer = answers[key];
        if (typeof answer === "number") {
            return new Response("", {status: answer});
        }
        if (answer instanceof Error) {
            throw answer;
        }
        return new Response(JSON.stringify(answer === undefined ? {error: "none here"} : answer), {status: 200});
    };
});
afterEach(() => {
    globalThis.fetch = realFetch;
    delete globalThis.window;
});

test("before week 1: its kickoff, the season's end, whether the draft is in, and the draft's days", async (t) => {
    t.mock.timers.enable({apis: ["Date"], now: Date.parse("2026-05-02T15:00:00Z")});
    answers = {
        nflSchedule1: schedule(WEEK1, WEEK1 + 3 * 86400),
        // week 17's last game ends 4 hours after its kickoff
        nflSchedule17: schedule(at("2027-01-03T18:00:00Z"), at("2027-01-03T21:25:00Z")),
        draftResults: {draftResults: {draftUnit: {draftPick: [{round: "01", pick: "01", player: "16001"}, {round: "01", pick: "02", player: ""}]}}},
        calendar: {calendar: {event: [{title: "Rookie Draft", start_time: String(at("2026-05-02T23:00:00Z"))}, {title: "Trade deadline", start_time: "12"}]}}
    };
    const facts = await seasonFacts({season: 2101, leagueId: "48571"});
    assert.deepEqual(facts, {
        week1: WEEK1 * 1000, seasonEnd: Date.parse("2027-01-04T01:25:00Z"), drafted: true, draftKnown: true, draftDays: ["2026-05-02"]
    });
    // kept a day in the browser, so the line under the wordmark doesn't ask again on every page
    assert.deepEqual(JSON.parse(globalThis.window.localStorage.getItem("fuad.context.2101")).value, facts);
    globalThis.window.liveScoringWeek = "1";
    assert.equal(await loadContext({season: 2101, leagueId: "48571"}), "Draft day");
});

test("in season the draft isn't asked for, and what can't be read is left out rather than hold up the line", async (t) => {
    t.mock.timers.enable({apis: ["Date"], now: Date.parse("2026-10-24T12:00:00Z")});
    answers = {nflSchedule1: schedule(WEEK1), nflSchedule17: 500, calendar: 500, draftResults: {draftResults: {}}};
    const facts = await seasonFacts({season: 2102, leagueId: "48571"});
    assert.deepEqual(facts, {week1: WEEK1 * 1000, seasonEnd: null, drafted: false, draftKnown: false, draftDays: []});
    assert.ok(!asked.some((url) => url.includes("TYPE=draftResults")));
    globalThis.window.liveScoringWeek = "7";
    assert.equal(await loadContext({season: 2102, leagueId: "48571"}), "Week 7");
});

test("before week 1: MFL's page says once a week is done; otherwise week 1's kickoff decides", async (t) => {
    t.mock.timers.enable({apis: ["Date"], now: Date.parse("2026-08-01T12:00:00Z")});
    globalThis.window.completedWeek = "1";
    assert.equal(await beforeWeek1(2103), false);
    assert.deepEqual(asked, []);
    delete globalThis.window.completedWeek;
    answers = {nflSchedule1: schedule(WEEK1)};
    assert.equal(await beforeWeek1(2103), true);
    t.mock.timers.setTime(Date.parse("2026-09-12T12:00:00Z"));
    // weeks later the kickoff has passed
    assert.equal(await beforeWeek1(2103), false);
});

test("before week 1: no schedule yet counts as before; a failed read as in season, so nothing is hidden", async () => {
    answers = {nflSchedule1: 404};
    assert.equal(await beforeWeek1(2104), true);
    answers = {nflSchedule1: new Error("offline")};
    assert.equal(await beforeWeek1(2105), false);
});
