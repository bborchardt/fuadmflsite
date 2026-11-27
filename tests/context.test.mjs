// What the line under the wordmark, League and Rosters read about the season: week 1's kickoff, the
// season's end, the draft. MFL answers from `answers`; each test its own season, as pageFetch keeps
// one answer per address for the page's life.

import {afterEach, beforeEach, test} from "node:test";
import assert from "node:assert/strict";
import {beforeWeek1, loadContext, seasonFacts, seasonStarted} from "../site/v2/ui/context.js";

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
        league: {league: {lastRegularSeasonWeek: "14", endWeek: "17"}},
        draftResults: {draftResults: {draftUnit: {draftPick: [{round: "01", pick: "01", player: "16001"}, {round: "01", pick: "02", player: ""}]}}},
        calendar: {calendar: {event: [{type: "CUSTOM", title: "Rookie Draft", start_time: String(at("2026-05-02T23:00:00Z"))}, {type: "TRADE_DEADLINE", title: "Trade deadline", start_time: "12"}]}}
    };
    // a member: the calendar needs a login
    globalThis.window.franchise_id = "0001";
    const facts = await seasonFacts({season: 2101, leagueId: "48571"});
    assert.deepEqual(facts, {
        week1: WEEK1 * 1000, week1Known: true, seasonEnd: Date.parse("2027-01-04T01:25:00Z"), drafted: true, draftKnown: true, draftDays: ["2026-05-02"]
    });
    // kept a day in the browser, per viewer, so the line under the wordmark doesn't ask again on every page
    assert.deepEqual(JSON.parse(globalThis.window.localStorage.getItem("fuad.context.2101.0001@48571")).value, facts);
    globalThis.window.liveScoringWeek = "1";
    assert.equal(await loadContext({season: 2101, leagueId: "48571"}), "Draft day");
});

test("in season the draft isn't asked for, and what can't be read is left out rather than hold up the line, logged and not kept", async (t) => {
    t.mock.timers.enable({apis: ["Date"], now: Date.parse("2026-10-24T12:00:00Z")});
    const logged = t.mock.method(console, "error", () => {});
    answers = {nflSchedule1: schedule(WEEK1), nflSchedule17: 500, league: {league: {lastRegularSeasonWeek: "14", endWeek: "17"}}, calendar: 500, draftResults: {draftResults: {}}};
    const facts = await seasonFacts({season: 2102, leagueId: "48571"});
    assert.deepEqual(facts, {week1: WEEK1 * 1000, week1Known: true, seasonEnd: null, drafted: false, draftKnown: false, draftDays: []});
    assert.ok(!asked.some((url) => url.includes("TYPE=draftResults")));
    // a guest's calendar is refused every time, so it isn't asked for, and only the season's end is a failure
    assert.ok(!asked.some((url) => url.includes("TYPE=calendar")));
    assert.deepEqual(logged.mock.calls.map((call) => call.arguments[0]), ["[fuad] the season's facts couldn't read the season's end:"]);
    assert.equal(globalThis.window.localStorage.getItem("fuad.context.2102.guest@48571"), null);
    globalThis.window.liveScoringWeek = "7";
    assert.equal(await loadContext({season: 2102, leagueId: "48571"}), "Week 7");
    // the next page asks again for what failed, and the rest is kept
    asked = [];
    answers.nflSchedule17 = schedule(at("2027-01-03T18:00:00Z"));
    const again = await seasonFacts({season: 2102, leagueId: "48571"});
    assert.equal(again.seasonEnd, Date.parse("2027-01-03T22:00:00Z"));
    const params = (url) => new URL(url).searchParams;
    assert.deepEqual(asked.map((url) => params(url).get("TYPE") + (params(url).get("W") || "")), ["nflSchedule17"]);
    assert.ok(globalThis.window.localStorage.getItem("fuad.context.2102.guest@48571"));
});

test("a member's calendar that can't be read isn't kept, and a guest's facts aren't a member's", async (t) => {
    t.mock.timers.enable({apis: ["Date"], now: Date.parse("2026-10-24T12:00:00Z")});
    const logged = t.mock.method(console, "error", () => {});
    answers = {nflSchedule1: schedule(WEEK1), nflSchedule17: schedule(at("2027-01-03T18:00:00Z")), league: {league: {lastRegularSeasonWeek: "14", endWeek: "17"}}, calendar: 500};
    await seasonFacts({season: 2106, leagueId: "48571"});
    assert.ok(globalThis.window.localStorage.getItem("fuad.context.2106.guest@48571"));
    assert.equal(logged.mock.calls.length, 0);
    globalThis.window.franchise_id = "0001";
    await seasonFacts({season: 2106, leagueId: "48571"});
    // the member's own facts, not the guest's, and their own calendar
    assert.equal(asked.filter((url) => url.includes("TYPE=calendar")).length, 1);
    assert.deepEqual(logged.mock.calls.map((call) => call.arguments[0]), ["[fuad] the season's facts couldn't read the calendar:"]);
    assert.equal(globalThis.window.localStorage.getItem("fuad.context.2106.0001@48571"), null);
});

for (const [part, failing] of [["the draft results", "draftResults"], ["week 1's kickoff", "nflSchedule1"]]) {
    test(`before week 1, ${part} that can't be read is logged and not kept`, async (t) => {
        t.mock.timers.enable({apis: ["Date"], now: Date.parse("2026-05-02T15:00:00Z")});
        const logged = t.mock.method(console, "error", () => {});
        answers = {
            nflSchedule1: schedule(WEEK1),
            nflSchedule17: schedule(at("2027-01-03T18:00:00Z")),
            league: {league: {lastRegularSeasonWeek: "14", endWeek: "17"}},
            draftResults: {draftResults: {draftUnit: {draftPick: [{round: "01", pick: "01", player: "16001"}]}}},
            [failing]: 500
        };
        const season = failing === "draftResults" ? 2107 : 2108;
        await seasonFacts({season, leagueId: "48571"});
        assert.deepEqual(logged.mock.calls.map((call) => call.arguments[0]), [`[fuad] the season's facts couldn't read ${part}:`]);
        assert.equal(globalThis.window.localStorage.getItem(`fuad.context.${season}.guest@48571`), null);
    });
}

test("an export MFL has changed counts as none and is kept, as asking again can't help; strict logs it once", async (t) => {
    t.mock.timers.enable({apis: ["Date"], now: Date.parse("2026-10-24T12:00:00Z")});
    const logged = t.mock.method(console, "error", () => {});
    // the league's teams without their names
    answers = {nflSchedule1: schedule(WEEK1), league: {league: {lastRegularSeasonWeek: "14", endWeek: "17", franchises: {franchise: [{id: "0001"}]}}}};
    const facts = await seasonFacts({season: 2109, leagueId: "48571"});
    assert.equal(facts.seasonEnd, null);
    assert.equal(logged.mock.calls.length, 1);
    assert.match(logged.mock.calls[0].arguments[0], /^\[fuad\] MFL's league export has changed/);
    assert.ok(globalThis.window.localStorage.getItem("fuad.context.2109.guest@48571"));
});

test("in season, a kickoff that can't be read leaves MFL's page to say so: the week shows and the draft isn't asked for", async (t) => {
    t.mock.timers.enable({apis: ["Date"], now: Date.parse("2026-10-24T12:00:00Z")});
    t.mock.method(console, "error", () => {});
    answers = {nflSchedule1: 500, nflSchedule17: schedule(at("2027-01-03T18:00:00Z")), league: {league: {lastRegularSeasonWeek: "14", endWeek: "17"}}};
    globalThis.window.liveScoringWeek = "7";
    assert.equal(await loadContext({season: 2110, leagueId: "48571"}), "Week 7");
    assert.ok(!asked.some((url) => url.includes("TYPE=draftResults")));
});

test("before MFL publishes the schedule, the draft is asked for even when MFL's page still shows last season's week", async (t) => {
    t.mock.timers.enable({apis: ["Date"], now: Date.parse("2027-03-20T17:00:00Z")});
    answers = {nflSchedule1: 404, nflSchedule17: 404, league: {league: {lastRegularSeasonWeek: "14", endWeek: "17"}}, draftResults: {draftResults: {draftUnit: {draftPick: [{round: "01", pick: "01", player: ""}]}}}};
    globalThis.window.liveScoringWeek = "17";
    assert.equal(await loadContext({season: 2111, leagueId: "48571"}), "Before the draft");
    assert.ok(asked.some((url) => url.includes("TYPE=draftResults")));
});

test("the season has begun by week 1's kickoff; without it by MFL's page, unless MFL hasn't published the schedule", () => {
    const kickoff = WEEK1 * 1000;
    assert.equal(seasonStarted({week1: kickoff, week1Known: true}, kickoff - 1, true), false);
    assert.equal(seasonStarted({week1: kickoff, week1Known: true}, kickoff, false), true);
    // the kickoff couldn't be read, or nothing could: MFL's page says
    assert.equal(seasonStarted({week1: null, week1Known: false}, kickoff, true), true);
    assert.equal(seasonStarted({week1: null, week1Known: false}, kickoff, false), false);
    assert.equal(seasonStarted({}, kickoff, true), true);
    assert.equal(seasonStarted(null, kickoff, true), true);
    // not published yet: not begun, though MFL's page may still show last season's week
    assert.equal(seasonStarted({week1: null, week1Known: true}, kickoff, true), false);
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
