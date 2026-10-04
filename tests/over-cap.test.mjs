// Tests for the daily job's over-cap flag.

import {test} from "node:test";
import assert from "node:assert/strict";
import {capTotals, overCapMessage, recentMoves} from "../jobs/over-cap.mjs";

// 2026-10-03 16:00 UTC, noon in New York
const DAY = Date.UTC(2026, 9, 3, 16) / 1000;

const players = new Map([
    ["1", {fullName: "Ollie Gordon"}], ["2", {fullName: "Joe Mixon"}], ["3", {fullName: "Tez Johnson"}]
]);
const franchises = new Map([["0001", {teamName: "Alpha"}], ["0002", {teamName: "Beta "}]]);
const moves = (transactions, franchiseId) => recentMoves(transactions, franchiseId, {players, franchises, since: DAY - 86400});

test("moves are described newest first, in words", () => {
    const transactions = [
        {type: "FREE_AGENT", franchise: "0002", transaction: "1,|2,", timestamp: String(DAY - 3600)},
        {type: "BBID_WAIVER", franchise: "0002", transaction: "3,|5|2,", timestamp: String(DAY)},
        {type: "BBID_WAIVER", franchise: "0002", transaction: "1,|2|", timestamp: String(DAY - 7200)},
        {type: "WAIVER", franchise: "0002", added: "3,", dropped: "", timestamp: String(DAY - 7300)},
        {type: "LOAD_ROSTERS", franchise: "0002", transaction: "|1,", by_commish: "1", timestamp: String(DAY - 7400)},
        {type: "LOAD_ROSTERS", franchise: "0002", transaction: "1,2,3,4,5,6,|", by_commish: "1", timestamp: String(DAY - 7500)},
        {type: "IR", franchise: "0002", activated: "", deactivated: "1,", timestamp: String(DAY)},
        {type: "LOCK_ALL_PLAYERS", franchise: "", transaction: "", timestamp: String(DAY)}
    ];
    assert.deepEqual(moves(transactions, "0002"), [
        "10/03 blind bid: won Tez Johnson for $5, dropped Joe Mixon",
        "10/03 free agent: added Ollie Gordon, dropped Joe Mixon",
        "10/03 blind bid: won Ollie Gordon for $2",
        "10/03 waiver: added Tez Johnson",
        "10/03 commissioner: dropped Ollie Gordon",
        "10/03 commissioner: added 6 players"
    ]);
});

test("trades read from either side, with picks named generically", () => {
    const trade = {type: "TRADE", franchise: "0001", franchise2: "0002", franchise1_gave_up: "1,FP_0001_2028_4,",
        franchise2_gave_up: ",", timestamp: String(DAY)};
    assert.deepEqual(moves([trade], "0001"), ["10/03 trade with Beta: got nothing; gave Ollie Gordon, a draft pick"]);
    assert.deepEqual(moves([trade], "0002"), ["10/03 trade with Alpha: got Ollie Gordon, a draft pick; gave nothing"]);
});

test("only the team's moves within the window are listed", () => {
    const transactions = [
        {type: "FREE_AGENT", franchise: "0001", transaction: "1,|", timestamp: String(DAY)},
        {type: "FREE_AGENT", franchise: "0002", transaction: "2,|", timestamp: String(DAY - 2 * 86400)}
    ];
    assert.deepEqual(moves(transactions, "0002"), []);
});

test("cap totals are rounded to the cent", () => {
    // 0.1 + 0.2 + 299.7 is 300.00000000000006 in floating point
    const league = {franchises: new Map([["0001", {franchiseId: "0001", salary: 0.1 + 0.2 + 299.7}]])};
    assert.deepEqual([...capTotals(league, [], [])], [["0001", 300]]);
});

test("the flag names the total, the moves and any held drop penalties", () => {
    assert.equal(overCapMessage({teamName: "Beta ", total: 304.5, cap: 300, moves: ["10/03 blind bid: won Tez Johnson for $5"], held: []}),
        "Beta is at $304.5, over the $300 cap. Moves in the last 7 days: 10/03 blind bid: won Tez Johnson for $5.");
    assert.equal(overCapMessage({teamName: "Beta", total: 301, cap: 300, moves: [], held: ["Joe Mixon (1yrs@1, 10/03)"]}),
        "Beta is at $301, over the $300 cap. Moves in the last 7 days: none. "
        + "Drop penalties held so the move can be reversed: Joe Mixon (1yrs@1, 10/03).");
});
