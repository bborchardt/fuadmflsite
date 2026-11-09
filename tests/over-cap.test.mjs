import {test} from "node:test";
import assert from "node:assert/strict";
import {overCapMessage, overRosterMessage, recentMoves, tradeOverRoster} from "../jobs/over-cap.mjs";

// 2026-10-03 16:00 UTC, noon in New York
const DAY = Date.UTC(2026, 9, 3, 16) / 1000;

const players = new Map([
    ["1", {fullName: "Ollie Gordon"}], ["2", {fullName: "Joe Mixon"}], ["3", {fullName: "Tez Johnson"}]
]);
const franchises = new Map([["0001", {teamName: "Alpha"}], ["0002", {teamName: "Beta "}]]);
const moves = (transactions, franchiseId) => recentMoves(transactions, franchiseId, {players, franchises, since: DAY - 86400, timeZone: "America/Chicago"});

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

test("the flag names the total, the moves and any held drop penalties", () => {
    assert.equal(overCapMessage({teamName: "Beta ", total: 304.5, cap: 300, moves: ["10/03 blind bid: won Tez Johnson for $5"], held: []}),
        "Beta is at $304.5, over the $300 cap. Moves in the last 7 days: 10/03 blind bid: won Tez Johnson for $5.");
    assert.equal(overCapMessage({teamName: "Beta", total: 301, cap: 300, moves: [], held: ["Joe Mixon (1yrs@1, 10/03)"]}),
        "Beta is at $301, over the $300 cap. Moves in the last 7 days: none. "
        + "Drop penalties held so the move can be reversed: Joe Mixon (1yrs@1, 10/03).");
});

test("over 30: a trade that did it is named with the bylaws' deadline, any other move may be reversed", () => {
    const trade = {type: "TRADE", franchise: "0001", franchise2: "0002", franchise1_gave_up: "1,", franchise2_gave_up: "2,3,FP_0002_2027_1,", timestamp: String(DAY - 3600)};
    const add = {type: "FREE_AGENT", franchise: "0002", transaction: "3,|", timestamp: String(DAY)};
    const since = DAY - 86400;
    // Alpha got two players for one; Beta gave them up
    assert.equal(tradeOverRoster([trade], "0001", since), trade);
    assert.equal(tradeOverRoster([trade], "0002", since), null);
    // an add since the trade is the move that broke the limit
    assert.equal(tradeOverRoster([trade, {...add, franchise: "0001"}], "0001", since), null);
    // nor does activating a player from IR since
    assert.equal(tradeOverRoster([trade, {type: "IR", franchise: "0001", activated: "3,", deactivated: "", timestamp: String(DAY)}], "0001", since), null);
    // a drop since doesn't change which
    assert.equal(tradeOverRoster([trade, {...add, franchise: "0001", transaction: "|3,"}], "0001", since), trade);
    const text = "Alpha is over the roster limit with 31 players!";
    assert.equal(overRosterMessage({text, max: 30, graceHours: 12, timeZone: "America/Chicago", moves: ["10/03 trade with Beta: got Joe Mixon, Tez Johnson; gave Ollie Gordon"], held: ["Ollie Gordon (2yrs@10, 10/03)"], trade}),
        `${text} Moves in the last 7 days: 10/03 trade with Beta: got Joe Mixon, Tez Johnson; gave Ollie Gordon. `
        + "Over 30 after the 10/03 trade, which the bylaws allow: it must be back to 30 by the next game, the next blind-bid deadline or 12 hours after the trade, whichever is first. "
        + "Drop penalties held until it's back to 30: Ollie Gordon (2yrs@10, 10/03).");
    assert.equal(overRosterMessage({text, max: 30, graceHours: 12, timeZone: "America/Chicago", moves: [], held: ["Ollie Gordon (2yrs@10, 10/03)"], trade: null}),
        `${text} Moves in the last 7 days: none. Drop penalties held so the move can be reversed: Ollie Gordon (2yrs@10, 10/03).`);
});
