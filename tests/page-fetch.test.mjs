import {test} from "node:test";
import assert from "node:assert/strict";
import {gameToday, keepFor} from "../site/v2/ui/page-fetch.js";

const MINUTE = 60 * 1000;
const league = (type, extra = "") => `https://www44.myfantasyleague.com/2026/export?TYPE=${type}&L=48571${extra}&JSON=1`;
const api = (type, extra = "") => `https://api.myfantasyleague.com/2026/export?TYPE=${type}${extra}&JSON=1`;
const options = (gameDay = false) => ({liveWeek: 6, gameDay: () => gameDay});

test("exports that rarely change are kept; those that do, and Moves' inputs, aren't", () => {
    assert.equal(keepFor(api("nflSchedule", "&W=6"), options()), 24 * 60 * MINUTE);
    assert.equal(keepFor(league("league"), options()), 24 * 60 * MINUTE);
    assert.equal(keepFor(league("calendar"), options()), 24 * 60 * MINUTE);
    assert.equal(keepFor(league("weeklyResults"), options()), 60 * MINUTE);
    for (const type of ["rosters", "transactions", "salaryAdjustments", "freeAgents", "pendingWaivers", "pendingTrades", "liveScoring", "messageBoard", "draftResults"]) {
        assert.equal(keepFor(league(type), options()), 0, type);
    }
    assert.equal(keepFor(league("weeklyResults", "&W=YTD"), options()), 0);
    assert.equal(keepFor("https://www44.myfantasyleague.com/2026/options?L=48571&O=101", options()), 0);
});

test("injury reports: a past week's for a day, this week's never, today's briefly on game days", () => {
    assert.equal(keepFor(api("injuries", "&W=5"), options()), 24 * 60 * MINUTE);
    assert.equal(keepFor(api("injuries", "&W=6"), options()), 0);
    assert.equal(keepFor(api("injuries"), options(true)), 5 * MINUTE);
    assert.equal(keepFor(api("injuries"), options(false)), 60 * MINUTE);
});

test("a game day is one with a kickoff on today's Central date, or an unknown schedule", () => {
    // Sunday 18 Oct 2026, noon CT
    const kickoff = (text) => ({kickoff: String(new Date(text).getTime() / 1000)});
    const schedule = {matchup: [kickoff("2026-10-15T19:15:00-05:00"), kickoff("2026-10-18T12:00:00-05:00")]};
    assert.equal(gameToday(schedule, new Date("2026-10-18T08:00:00-05:00")), true);
    assert.equal(gameToday(schedule, new Date("2026-10-17T22:00:00-05:00")), false);
    // 11 p.m. Sunday CT is already Monday in UTC
    assert.equal(gameToday({matchup: kickoff("2026-10-18T19:20:00-05:00")}, new Date("2026-10-18T23:00:00-05:00")), true);
    assert.equal(gameToday(null, new Date()), true);
});
