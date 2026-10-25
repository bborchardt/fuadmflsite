import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
    answerFields, assetView, bidsAfter, blockReason, zoneParts, zoneSeconds, deadlineWeek, expiryChoices, findOffer,
    kickoffText, lockedText, offersOf, pickedSummary, pickGroups, proposalFields, readPick, rosterNotices,
    teamKickoffs, throughGames, tradeEffect
} from "../site/v2/ui/trades-model.js";

const at = (...utc) => Date.UTC(...utc) / 1000;
const HOUR = 3600;

const player = (playerId, fullName, salary, years, extra = {}) => ({playerId, fullName, salary, years,
    capPenalty: years > 0 ? Math.max(Math.ceil(Math.max(1, 0.4 * salary * years)), years) : 0,
    status: "ROSTER", nflPosition: "WR", team: "DET", ...extra});

// my team 0001 and the partner 0002
function leagueOf({mineCap = 290, mineActive = 28, theirsCap = 280, theirsActive = 28} = {}) {
    const franchises = new Map([
        ["0001", {franchiseId: "0001", capTotal: mineCap, numPlayers: mineActive}],
        ["0002", {franchiseId: "0002", capTotal: theirsCap, numPlayers: theirsActive}]
    ]);
    const players = new Map([
        ["olave", player("olave", "Chris Olave", 5, 1)],
        ["lamar", player("lamar", "Lamar Jackson", 40, 2, {nflPosition: "QB", team: "BAL"})],
        ["achane", player("achane", "De'Von Achane", 12, 2, {status: "INJURED_RESERVE", nflPosition: "RB", team: "MIA"})],
        ["higbee", player("higbee", "Tyler Higbee", 8, 1, {nflPosition: "TE", team: "LAR"})],
        ["waller", player("waller", "Darren Waller", 8, 3, {nflPosition: "TE", team: "MIA"})]
    ]);
    return {franchises, players};
}

test("a trade's effect: salaries swap, picks change nothing, an IR player moves no active spot", () => {
    const league = leagueOf();
    const effect = tradeEffect(league, {mine: "0001", theirs: "0002", give: ["olave", "FP_0001_2027_1"], get: ["lamar"]});
    assert.deepEqual(effect.mine.cap, {from: 290, to: 325});
    assert.deepEqual(effect.theirs.cap, {from: 280, to: 245});
    assert.deepEqual(effect.mine.active, {from: 28, to: 28});
    const ir = tradeEffect(league, {mine: "0001", theirs: "0002", give: ["achane"], get: ["higbee", "waller"]});
    assert.deepEqual(ir.mine.active, {from: 28, to: 30});
    assert.deepEqual(ir.theirs.active, {from: 28, to: 26});
    assert.deepEqual(ir.mine.cap, {from: 290, to: 294});
});

test("a trade is blocked when either team ends over the cap (10.3), worded for proposing or answering", () => {
    const over = tradeEffect(leagueOf(), {mine: "0001", theirs: "0002", give: ["olave"], get: ["lamar"]});
    assert.equal(blockReason(over, {partnerName: "Pat", proposing: true}), "you’d be at $325 of $300. Send more salary their way, or take less back.");
    assert.equal(blockReason(over, {partnerName: "Pat", proposing: false}), "you’d be at $325 of $300, so the trade would be void.");
    const theirs = tradeEffect(leagueOf({theirsCap: 299}), {mine: "0001", theirs: "0002", give: ["higbee"], get: []});
    assert.equal(blockReason(theirs, {partnerName: "Pat", proposing: true}), "Pat would be at $307 of $300, so the trade would be void.");
    // exactly at the cap is fine
    const full = tradeEffect(leagueOf({mineCap: 292}), {mine: "0001", theirs: "0002", give: [], get: ["higbee"]});
    assert.equal(full.mine.cap.to, 300);
    assert.equal(blockReason(full, {partnerName: "Pat", proposing: true}), null);
});

test("a team already over the cap may trade back under, not stay over (the commissioner's ruling)", () => {
    const under = tradeEffect(leagueOf({mineCap: 305}), {mine: "0001", theirs: "0002", give: ["higbee"], get: []});
    assert.equal(under.mine.cap.to, 297);
    assert.equal(blockReason(under, {partnerName: "Pat", proposing: true}), null);
    const still = tradeEffect(leagueOf({mineCap: 310}), {mine: "0001", theirs: "0002", give: ["higbee"], get: []});
    assert.equal(still.mine.cap.to, 302);
    assert.match(blockReason(still, {partnerName: "Pat", proposing: true}), /\$302 of \$300/);
});

test("the pending bids after a trade: a limit they'd newly break (5.5), a claim dropping a traded player counting as no drop", () => {
    const league = leagueOf();
    const teamWith = (groups, franchise = league.franchises.get("0001")) => ({franchise, groups, players: league.players});
    // a $8 bid dropping Olave ($5, $2 penalty) adds $5: $295 before the trade
    const groups = [{round: 1, claims: [{add: "x", bid: 8, drop: "olave"}]}];
    // sending Olave for Higbee: $293, and the bid now adds its full $8, $301
    const effect = tradeEffect(league, {mine: "0001", theirs: "0002", give: ["olave"], get: ["higbee"]});
    assert.deepEqual(bidsAfter(teamWith(groups), effect, ["olave"]), {cap: 301, roster: null});
    // sending Higbee instead leaves the claim's drop in place: from $262, Higbee for Lamar is $294,
    // and the bid's $5 makes $299 (without the drop it would be $302)
    const low = leagueOf({mineCap: 262});
    const other = tradeEffect(low, {mine: "0001", theirs: "0002", give: ["higbee"], get: ["lamar"]});
    assert.equal(bidsAfter(teamWith(groups, low.franchises.get("0001")), other, ["higbee"]), null);
    assert.equal(bidsAfter(teamWith([]), effect, ["olave"]), null);
});

test("the pending bids after a trade: past 30 active only when the trade makes it worse", () => {
    const league = leagueOf({mineCap: 280, mineActive: 30});
    const franchise = league.franchises.get("0001");
    const team = {franchise, groups: [{round: 1, claims: [{add: "x", bid: 1, drop: null}]}], players: league.players};
    // already 31 with the bid; two for one makes 32
    const twoForOne = tradeEffect(league, {mine: "0001", theirs: "0002", give: ["olave"], get: ["higbee", "waller"]});
    assert.deepEqual(bidsAfter(team, twoForOne, ["olave"]), {cap: null, roster: 32});
    const even = tradeEffect(league, {mine: "0001", theirs: "0002", give: ["olave"], get: ["higbee"]});
    assert.equal(bidsAfter(team, even, ["olave"]), null);
});

test("roster notices (10.5): past 30 or under 23 only when the trade moves that way, the other team's on request", () => {
    const effect = (mine, theirs) => ({mine: {active: mine}, theirs: {active: theirs}});
    const heads = (notices) => notices.map((notice) => notice.head);
    assert.deepEqual(heads(rosterNotices(effect({from: 30, to: 31}, {from: 24, to: 22}), {partnerName: "Pat"})),
        ["You’d have 31 active.", "Pat would have 22 active."]);
    assert.deepEqual(heads(rosterNotices(effect({from: 23, to: 22}, {from: 30, to: 31}), {partnerName: "Pat"})),
        ["You’d have 22 active.", "Pat would have 31 active."]);
    // already over, and not more so; already under, and not less so
    assert.deepEqual(rosterNotices(effect({from: 32, to: 31}, {from: 21, to: 22}), {partnerName: "Pat"}), []);
    // how soon is the bylaws' to say
    assert.deepEqual(rosterNotices(effect({from: 30, to: 31}, {from: 24, to: 22}), {partnerName: "Pat"}).map((notice) => notice.text), [
        "Allowed in a trade, but you must get back to 30, and you can’t set a lineup until you do.",
        "They must add players to get back to 23."
    ]);
    assert.equal(rosterNotices(effect({from: 30, to: 31}, {from: 23, to: 22}), {partnerName: "Pat", others: false}).length, 1);
});

test("Central time: a date and hour as MFL's form takes it, across the end of daylight saving (Nov 1, 2026)", () => {
    // noon on the Sunday before (CDT) and after (CST)
    assert.equal(zoneSeconds({year: 2026, month: 9, day: 25, hour: 12}), at(2026, 9, 25, 17));
    assert.equal(zoneSeconds({year: 2026, month: 10, day: 8, hour: 12}), at(2026, 10, 8, 18));
    // noon on the day itself is already CST
    assert.equal(zoneSeconds({year: 2026, month: 10, day: 1, hour: 12}), at(2026, 10, 1, 18));
    // 1 a.m. comes twice that night: the first, in CDT
    assert.equal(zoneSeconds({year: 2026, month: 10, day: 1, hour: 1}), at(2026, 10, 1, 6));
    // MFL's hour 0 is 12:00:01 a.m.
    assert.equal(zoneSeconds({year: 2026, month: 10, day: 1, hour: 0}), at(2026, 10, 1, 5) + 1);
    // 2 a.m. doesn't happen the night daylight saving starts
    assert.equal(zoneSeconds({year: 2027, month: 2, day: 14, hour: 2}), null);
    assert.equal(zoneSeconds({year: 2026, month: NaN, day: 1, hour: 1}), null);
});

test("Central time: a moment's parts, a Thursday night game being Friday in UTC", () => {
    assert.deepEqual(zoneParts(at(2026, 9, 30, 0, 15)), {year: 2026, month: 9, day: 29, hour: 19, weekday: 4});
    assert.deepEqual(zoneParts(at(2026, 10, 1, 7)), {year: 2026, month: 10, day: 1, hour: 1, weekday: 0});
    assert.deepEqual(zoneParts(at(2026, 10, 1, 5)), {year: 2026, month: 10, day: 1, hour: 0, weekday: 0});
    // every hour of the week either side of the change reads back to itself
    for (let seconds = at(2026, 9, 28); seconds < at(2026, 10, 5); seconds += HOUR) {
        const parts = zoneParts(seconds);
        const back = zoneSeconds(parts);
        assert.equal(back - (parts.hour === 0 ? 1 : 0), seconds === at(2026, 10, 1, 7) ? at(2026, 10, 1, 6) : seconds,
            new Date(seconds * 1000).toISOString());
    }
});

// week 8 of 2026: Thursday 7:15 p.m. CDT, then Sunday after the change, noon and 3:05 p.m. CST
const THURSDAY = at(2026, 9, 30, 0, 15);
const SUNDAY = at(2026, 10, 1, 18);
const SUNDAY_LATE = at(2026, 10, 1, 21, 5);
const WEEK = [SUNDAY_LATE, THURSDAY, SUNDAY];

test("expiry choices in season: before Sunday's games and Thursday's, on the hour, then MFL's 7 days", () => {
    const now = at(2026, 9, 27, 12);
    const mflDefault = now + 7 * 24 * HOUR;
    assert.deepEqual(expiryChoices({phase: "season", kickoffs: WEEK, mflDefault, now}), [
        {key: "sunday", name: "Before Sunday’s games", at: SUNDAY},
        {key: "thursday", name: "Before Thursday’s game", at: at(2026, 9, 30)},
        {key: "week", name: "In 7 days", at: mflDefault}
    ]);
    // after Thursday's kickoff, only Sunday's
    assert.deepEqual(expiryChoices({phase: "season", kickoffs: WEEK, mflDefault, now: THURSDAY + 60}).map((choice) => choice.key), ["sunday", "week"]);
    // out of season, only MFL's
    assert.deepEqual(expiryChoices({phase: "preseason", kickoffs: WEEK, mflDefault, now}).map((choice) => choice.key), ["week"]);
    assert.deepEqual(expiryChoices({phase: "season", kickoffs: WEEK, mflDefault: null, now}).map((choice) => choice.key), ["sunday", "thursday"]);
});

test("an offer open through game time", () => {
    assert.equal(throughGames({expires: SUNDAY + HOUR, kickoffs: WEEK, now: THURSDAY + 60}), true);
    assert.equal(throughGames({expires: SUNDAY, kickoffs: WEEK, now: THURSDAY + 60}), false);
});

test("the proposal posts MFL's hidden fields, both sides' boxes and the expiry in Central time", () => {
    const form = {
        elements: [
            {name: "L", type: "hidden", value: "48571"},
            {name: "FRANCHISE_ID", type: "hidden", value: "0001,0002"},
            {name: "msg", type: "textarea", value: "typed on MFL's page"},
            {name: "drop0001", type: "checkbox", value: "olave"}
        ],
        querySelector: () => ({value: "Propose Trade"})
    };
    const fields = proposalFields(form, {mine: "0001", partner: "0002", give: ["olave", "FP_0001_2027_1"], get: ["lamar"], expires: SUNDAY, message: "Lamar?"});
    assert.deepEqual([...fields], [
        ["L", "48571"], ["FRANCHISE_ID", "0001,0002"],
        ["drop0001", "olave"], ["drop0001", "FP_0001_2027_1"], ["drop0002", "lamar"],
        ["TRADE_EXPIRES_MONTH", "10"], ["TRADE_EXPIRES_DAY", "1"], ["TRADE_EXPIRES_TIME", "12"], ["TRADE_EXPIRES_YEAR", "2026"],
        ["msg", "Lamar?"], ["Propose", "Propose Trade"]
    ]);
    // what it posts reads back as the moment chosen
    assert.equal(zoneSeconds({year: 2026, month: 10, day: 1, hour: 12}), SUNDAY);
});

test("an answer posts the offer form's hidden fields, or the league and trade without one", () => {
    const form = {elements: [{name: "LEAGUE_ID", type: "hidden", value: "48571"}, {name: "TRADE_ID", type: "hidden", value: "old"}, {name: "x", type: "text", value: "no"}]};
    assert.deepEqual(Object.fromEntries(answerFields(form, {tradeId: "77", leagueId: "1", action: "accept"})),
        {LEAGUE_ID: "48571", TRADE_ID: "77", ACTION: "accept", COMMENTS: ""});
    assert.deepEqual(Object.fromEntries(answerFields(null, {tradeId: "77", leagueId: "48571", action: "reject", comment: "No thanks"})),
        {LEAGUE_ID: "48571", TRADE_ID: "77", ACTION: "reject", COMMENTS: "No thanks"});
});

test("the member's offers both ways from pendingTrades, oldest first, and finding one already made", () => {
    const pendingTrades = {pendingTrade: [
        {trade_id: "9", offeringteam: "0003", offeredto: "0001", will_give_up: "lamar,", will_receive: "olave,FP_0001_2027_1,", expires: "1793000000", comments: " Deal? ", timestamp: "200"},
        {trade_id: "8", offeringteam: "0001", offeredto: "0002", will_give_up: "higbee", will_receive: "waller", expires: "", timestamp: "100"},
        {trade_id: "7", offeringteam: "0002", offeredto: "0003", will_give_up: "x", will_receive: "y", timestamp: "50"}
    ]};
    const offers = offersOf(pendingTrades, "0001");
    assert.deepEqual(offers, [
        {id: "8", received: false, partner: "0002", give: ["higbee"], get: ["waller"], expires: null, comment: "", made: 100},
        {id: "9", received: true, partner: "0003", give: ["olave", "FP_0001_2027_1"], get: ["lamar"], expires: 1793000000, comment: "Deal?", made: 200}
    ]);
    // MFL's export gives one trade as an object
    assert.equal(offersOf({pendingTrade: pendingTrades.pendingTrade[1]}, "0001").length, 1);
    assert.equal(findOffer(offers, {partner: "0002", give: ["higbee"], get: ["waller"]}).id, "8");
    assert.equal(findOffer(offers, {partner: "0002", give: ["higbee"], get: []}), null);
    // one received isn't the member's own
    assert.equal(findOffer(offers, {partner: "0003", give: ["FP_0001_2027_1", "olave"], get: ["lamar"]}), null);
});

test("picks: a future one's owner, year and round; this year's round and pick from 0", () => {
    assert.deepEqual(readPick("FP_0004_2027_2"), {owner: "0004", year: 2027, round: 2});
    assert.deepEqual(readPick("DP_0_9"), {round: 1, pick: 10});
    assert.equal(readPick("13593"), null);
});

test("an asset as it reads: a player's contract, a pick and whose it was", () => {
    const league = leagueOf();
    const names = new Map([["0004", "Pat's Team"]]);
    const view = (id, holder = "0001") => assetView(id, {league, mflNames: new Map([["olave", "Olave, Chris"]]), holder, names, season: 2026});
    assert.equal(view("olave").meta, "WR · DET · $5 · 1 yr");
    assert.equal(view("olave").surname, "Olave");
    assert.equal(view("achane").ir, true);
    assert.deepEqual(view("FP_0004_2027_1"), {id: "FP_0004_2027_1", pick: true, name: "2027 Round 1", meta: "from Pat's Team"});
    assert.equal(view("FP_0001_2027_1").meta, "own pick");
    assert.equal(view("DP_1_3").name, "2026 pick 2.04");
    assert.deepEqual(view("99999"), {id: "99999", pick: false, name: "A player", meta: "", surname: "him"});
});

test("Locked while a traded player's game has started, until the week's games are over", () => {
    const kickoffs = teamKickoffs({matchup: [
        {kickoff: String(THURSDAY), team: [{id: "MIA"}, {id: "BAL"}]},
        {kickoff: String(SUNDAY), team: [{id: "LAR"}, {id: "DET"}]},
        {kickoff: "0", team: [{id: "KC"}]}
    ]});
    assert.deepEqual([...kickoffs], [["MIA", THURSDAY], ["BAL", THURSDAY], ["LAR", SUNDAY], ["DET", SUNDAY]]);
    const league = leagueOf();
    const assets = ["waller", "higbee", "lamar"].map((id) => ({player: league.players.get(id), surname: league.players.get(id).fullName.split(" ")[1]}));
    assert.equal(lockedText(assets, kickoffs, THURSDAY - 60), null);
    assert.equal(lockedText(assets, kickoffs, THURSDAY + 60), "Waller’s and Jackson’s games have started.");
    assert.equal(lockedText(assets.slice(0, 2), kickoffs, SUNDAY + 60), "Waller’s and Higbee’s games have started.");
    // four hours after the last kickoff, the week is over
    assert.equal(lockedText(assets, kickoffs, SUNDAY + 4 * HOUR + 60), null);
});

test("the heads-up for accepting within 3 hours of a traded player's kickoff", () => {
    const kickoffs = new Map([["LAR", SUNDAY], ["MIA", SUNDAY + 3 * HOUR - 300]]);
    const league = leagueOf();
    const higbee = {player: league.players.get("higbee"), surname: "Higbee"};
    const waller = {player: league.players.get("waller"), surname: "Waller"};
    assert.equal(kickoffText([higbee], kickoffs, SUNDAY - 4 * HOUR), null);
    assert.equal(kickoffText([higbee], kickoffs, SUNDAY - 90 * 60),
        "Higbee’s game starts at 12:00 p.m., in 1 hour 30 minutes. Accepting moves him now, so both teams’ lineups need fixing before kickoff.");
    assert.equal(kickoffText([waller, higbee], kickoffs, SUNDAY - 60),
        "Higbee’s and Waller’s games start from 12:00 p.m., the first in 1 minute. Accepting moves them now, so both teams’ lineups need fixing before kickoff.");
    assert.equal(kickoffText([higbee], kickoffs, SUNDAY + 60), null);
});

test("the proposal's lists: by position, costliest first, then picks; the picked summary", () => {
    const league = leagueOf();
    const assets = ["waller", "olave", "higbee", "lamar", "FP_0001_2027_1"].map((id) => assetView(id, {league, mflNames: new Map(), holder: "0001", names: new Map(), season: 2026}));
    assert.deepEqual(pickGroups(assets, ["QB", "RB", "WR", "TE", "PK"]).map((group) => [group.label, group.items.map((item) => item.id)]),
        [["QB", ["lamar"]], ["WR", ["olave"]], ["TE", ["waller", "higbee"]], ["Draft picks", ["FP_0001_2027_1"]]]);
    assert.equal(pickedSummary(assets), "4 players ($61) + 1 pick");
    assert.equal(pickedSummary([]), "Nothing yet");
});

test("the trade deadline's week comes from the calendar's TRADE event", () => {
    const calendar = JSON.parse(readFileSync(new URL("fixtures/calendar.json", import.meta.url))).calendar;
    assert.equal(deadlineWeek(calendar, 11), 12);
    assert.equal(deadlineWeek({event: []}, 11), 11);
    assert.equal(deadlineWeek({event: {type: "TRADE", start_time: "1799258400"}}, 11), 11);
});
