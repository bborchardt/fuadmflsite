import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pendingGroups, projectBids} from "../site/v2/lib/bids.js";
import {playersFromExport} from "../site/v2/lib/league.js";
import {
    boardTopics, calendarDates, comingUp, contractTopic, cutDownDate, homePhase, leagueAlerts, lineupProblems,
    myAlerts, nextBidRun, recentMoves
} from "../site/v2/ui/home-model.js";
import {moduleTopics, readChat, tradeOffers} from "../site/v2/ui/home-feeds.js";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const at = (text) => new Date(text).getTime() / 1000;

const links = {lineup: "L", add: "A", drop: "D", ir: "I", trades: "T", contracts: "C"};
const player = (playerId, fullName, extra = {}) => ({playerId, fullName, salary: 0, capPenalty: 0, years: 0, status: "ROSTER", team: "KC", ...extra});
const team = (franchiseId, teamName, extra = {}) => ({franchiseId, teamName, capTotal: 250, numPlayers: 26, unchargedPenalty: 0, lineup: [], irPlayers: [], signedPlayers: [], ...extra});
const leagueOf = (franchises, players = [], extra = {}) => ({
    week: "6", started: true, seasonOver: false, tankingOver: false, injuryReportKnown: true, pendingAdds: [],
    franchises: new Map(franchises.map((f) => [f.franchiseId, f])),
    players: new Map(players.map((p) => [p.playerId, p])),
    ...extra
});
const now = at("2026-10-17T12:00:00-05:00");
const titles = (alerts) => alerts.map((alert) => alert.title);

test("pending bids: each group's costliest claim, and an active player if any claim has no drop", () => {
    const groups = pendingGroups({blindBidWaiverRequest: [
        {round: "1", addsDrops: "13753_5_16619,13308_1_16152", comments: "x"},
        {round: "2", addsDrops: "14000_3_"}
    ]});
    assert.deepEqual(groups[0].claims[0], {add: "13753", bid: 5, drop: "16619"});
    assert.equal(groups[1].claims[0].drop, null);
    const players = new Map([
        ["16619", player("16619", "A B", {salary: 4, years: 2, capPenalty: 4})],
        ["16152", player("16152", "C D", {salary: 10, years: 1, capPenalty: 4})]
    ]);
    // group 1: +5 − (4 − 4) = +5 beats +1 − (10 − 4) = −5; group 2: +3, no drop
    assert.deepEqual(projectBids(team("0001", "Me", {capTotal: 290, numPlayers: 30}), groups, players),
        {bids: 3, cap: 298, roster: 31, overCap: false, overRoster: true});
    // a single pending group from MFL comes back as a bare object
    assert.equal(pendingGroups({blindBidWaiverRequest: {round: "1", addsDrops: "1_1_2"}}).length, 1);
    assert.deepEqual(pendingGroups(null), []);
});

test("dropping an IR player frees no active spot", () => {
    const groups = pendingGroups({blindBidWaiverRequest: {round: "1", addsDrops: "1_1_9"}});
    const players = new Map([["9", player("9", "On IR", {status: "INJURED_RESERVE"})]]);
    assert.equal(projectBids(team("0001", "Me", {numPlayers: 30}), groups, players).overRoster, true);
});

test("my alerts: invalid bids block, otherwise the deadline", () => {
    const me = team("0001", "Me", {capTotal: 297});
    const league = leagueOf([me]);
    const run = at("2026-10-21T23:00:00-05:00");
    const over = myAlerts({league, franchiseId: "0001", phase: "season", links, now, bidRun: run,
        groups: pendingGroups({blindBidWaiverRequest: {round: "1", addsDrops: "1_5_"}})});
    assert.deepEqual(over.map((a) => [a.title, a.detail, a.tone]), [["Current bids invalid", "If all high bids win: cap used $297 → $302 · Add", "red"]]);
    const fine = myAlerts({league, franchiseId: "0001", phase: "season", links, now, bidRun: run,
        groups: pendingGroups({blindBidWaiverRequest: [{round: "1", addsDrops: "1_1_"}, {round: "2", addsDrops: "2_1_"}]})});
    assert.deepEqual(fine.map((a) => [a.title, a.detail]), [["2 blind bids pending", "They process Wed Oct 21, 11:00 p.m. CT · Add"]]);
});

test("my alerts: the team's own violations, with where to fix them", () => {
    const back = player("5", "Kenneth Walker", {status: "INJURED_RESERVE", injuryStatus: "Questionable"});
    const me = team("0001", "Me", {capTotal: 302, numPlayers: 30, irPlayers: [back]});
    const other = team("0002", "Them", {numPlayers: 22});
    const alerts = myAlerts({league: leagueOf([me, other]), franchiseId: "0001", phase: "season", links, now});
    assert.deepEqual(alerts.map((a) => [a.title, a.detail, a.href]), [
        ["Over the salary cap: $302 of $300", "The commissioner will reverse the move that did it", null],
        ["Walker must come off IR", "That makes 31 active, so it needs a drop · IR", "I"]
    ]);
    assert.deepEqual(leagueAlerts(leagueOf([me, other]), "0001").map((a) => [a.franchise.teamName, a.text, a.figure, a.tone]), [
        ["Them", "Under the roster minimum: 22 active of 23", "22", "orange"]
    ]);
    // logged out (or the commissioner), every team is in League alerts
    assert.equal(leagueAlerts(leagueOf([me, other]), null).length, 3);
});

test("lineup problems: out, IR, suspended, bye and no team; a started game is left alone", () => {
    const kickoffs = new Map([["KC", at("2026-10-18T12:00:00-05:00")], ["BAL", at("2026-10-15T19:15:00-05:00")]]);
    const starters = [
        player("1", "Out Guy", {injuryStatus: "Out"}),
        player("2", "Hurt Guy", {injuryStatus: "IR-R"}),
        player("3", "Bye Guy", {team: "DET"}),
        player("4", "Cut Guy", {team: "FA"}),
        player("5", "Played Thursday", {team: "BAL", injuryStatus: "Out"}),
        player("6", "Fine Guy", {injuryStatus: "Questionable"})
    ];
    const problems = lineupProblems({starters, kickoffs, now});
    assert.deepEqual(problems.map((p) => `${p.player.fullName} ${p.why}`), ["Out Guy is out", "Hurt Guy is on IR", "Bye Guy is on a bye", "Cut Guy has no NFL team"]);
    const me = team("0001", "Me");
    const alerts = myAlerts({league: leagueOf([me]), franchiseId: "0001", phase: "season", links, now, lineup: {problems: problems.slice(2, 3), starters: 9, required: 10}});
    assert.deepEqual(alerts.map((a) => [a.title, a.detail]), [
        ["Bye Guy is on a bye and in your lineup", "A loss won’t count toward draft order (13.2) · Lineup"],
        ["Your lineup is 1 starter short", "Lineup"]
    ]);
    // the playoffs: no draft order consequence
    const late = myAlerts({league: leagueOf([me], [], {week: "15"}), franchiseId: "0001", phase: "season", links, now, lineup: {problems: problems.slice(0, 1), starters: 10, required: 10}});
    assert.equal(late[0].detail, "Lineup");
});

test("my alerts: a free agent add's contract length, as read from the board", () => {
    const me = team("0001", "Me");
    const waller = player("7", "Darren Waller");
    const added = at("2026-10-17T11:30:00-05:00");
    const league = leagueOf([me], [waller], {pendingAdds: [{playerId: "7", name: "Waller, Darren", franchiseId: "0001", type: "FREE_AGENT", added}]});
    const base = {league, franchiseId: "0001", phase: "season", links, now};
    assert.deepEqual(titles(myAlerts(base)), ["Post a contract length for Waller"]);
    assert.equal(myAlerts(base)[0].detail, "Free agent add, due 12:30 p.m. CT, or it’s 1 year · Message board");
    assert.deepEqual(titles(myAlerts({...base, readings: new Map([["7", {state: "read", years: 2}]])})), ["Waller: 2 years"]);
    // past the hour it's the job's
    assert.deepEqual(myAlerts({...base, now: added + 3601}), []);
});

test("my alerts: trade offers and dates within three days", () => {
    const alerts = myAlerts({league: leagueOf([team("0001", "Me")]), franchiseId: "0001", phase: "season", links, now,
        trades: [{from: "The Obliterators", summary: "Herbert for Hurts", expires: at("2026-10-23T12:00:00-05:00")}],
        coming: [{what: "Trade deadline", when: "Wed Nov 25 · Week 12 kickoff", soon: false}, {what: "Final cut-down", when: "Sun Oct 18", soon: true}]});
    assert.deepEqual(alerts.map((a) => [a.title, a.detail]), [
        ["Trade offer from The Obliterators", "Herbert for Hurts · expires Fri Oct 23 · Trades"],
        ["Final cut-down", "Sun Oct 18"]
    ]);
});

test("between the draft and the cut-down: lengths to post and the roster limits", () => {
    const signed = [player("1", "Auction Buy", {salary: 12}), player("2", "Another One", {salary: 3}), player("3", "New RFA", {salary: 0})];
    const me = team("0001", "Me", {numPlayers: 34, signedPlayers: signed});
    const cutDown = at("2026-09-07T22:00:00-05:00");
    const alerts = myAlerts({league: leagueOf([me], [], {started: false}), franchiseId: "0001", phase: "before-cut", links, now: at("2026-09-01T12:00:00-05:00"), cutDown});
    assert.deepEqual(alerts.map((a) => [a.title, a.detail]), [
        ["Post contract lengths for 2 players", "Draft-day players need them by Mon Sep 7; $5 a day late (12.6) · Message board"],
        ["Get to 30 active by Mon Sep 7", "You have 34 · Drop"]
    ]);
    // after the cut-down the limits hold (2.5): over 30 is a violation, fixed by dropping
    const after = myAlerts({league: leagueOf([me], [], {started: false}), franchiseId: "0001", phase: "preseason", links, now: at("2026-09-08T12:00:00-05:00"), cutDown});
    assert.deepEqual(after.map((a) => [a.title, a.detail]), [["Over the roster limit: 34 active of 30", "Drop"]]);
});

test("the phase: before the draft, draft to cut-down, preseason, season, over", () => {
    const dates = {week1: 100, cutDown: 50};
    assert.equal(homePhase({...dates, now: 10, drafted: false}), "before-draft");
    assert.equal(homePhase({...dates, now: 10, drafted: true}), "before-cut");
    assert.equal(homePhase({...dates, now: 60, drafted: true}), "preseason");
    assert.equal(homePhase({...dates, now: 150, drafted: true}), "season");
    assert.equal(homePhase({...dates, now: 250, drafted: true, seasonOver: true}), "over");
    // without a cut-down date on the calendar, it's "before the cut-down" until week 1
    assert.equal(homePhase({week1: 100, now: 60, drafted: true}), "before-cut");
});

test("coming up, from the league's calendar as saved 17 Oct 2026", () => {
    const {calendar} = fixture("calendar.json");
    const kickoffs = new Map([[1, at("2026-09-10T19:20:00-05:00")], [12, at("2026-11-25T19:00:00-06:00")], [15, at("2026-12-17T19:15:00-06:00")],
        [17, at("2026-12-31T19:15:00-06:00")]]);
    const dates = calendarDates(calendar, kickoffs);
    assert.equal(cutDownDate(dates), 1788842700);
    // in season, every date left: the waiver lock repeats for 17 more weeks after Sun Sep 13, so
    // free agency closes Sun Jan 10, still at noon CT
    assert.deepEqual(comingUp({dates, kickoffs, now}).map((d) => [d.what, d.when, d.soon]), [
        ["Trade deadline", "Wed Nov 25 · Week 12 kickoff", false],
        ["Rookie/Franchise Player Salaries Calculated for Next Year", "Wed Nov 25 · Week 12 kickoff", false],
        ["Playoffs begin", "Thu Dec 17 · Week 15 kickoff", false],
        ["Championship week", "Thu Dec 31 · Week 17 kickoff", false],
        ["Trades reopen", "Wed Jan 6, 12:00 p.m.", false],
        ["Free agency closes", "Sun Jan 10, 12:00 p.m.", false],
        ["Contract Year Ends - Lengths Reduced by 1", "Thu Mar 11, 3:00 p.m.", false]
    ]);
    // 16 more weeks ends it on Sun Jan 3; a lock that happens one time only ends it then
    const lock = calendar.event.find((event) => event.type === "WAIVER_LOCK");
    const closes = (happens) => calendarDates({event: [{...lock, happens}]}).map((d) => d.at);
    assert.deepEqual(closes("16"), [at("2027-01-03T12:00:00-06:00")]);
    assert.deepEqual(closes(""), [at("2026-09-13T12:00:00-05:00")]);
    // before the draft: draft day, the cut-down, week 1 (the first blind bids follow the draft)
    assert.deepEqual(comingUp({dates, kickoffs, now: at("2026-08-01T12:00:00-05:00")}).slice(0, 3).map((d) => d.what), ["Draft", "Final Cut Down/Contract Length Deadline", "Week 1 kickoff"]);
    // after the draft: the cut-down, the first blind bids, week 1
    assert.deepEqual(comingUp({dates, kickoffs, now: at("2026-09-07T15:00:00-05:00")}).slice(0, 3).map((d) => d.what), ["Final Cut Down/Contract Length Deadline", "First blind bids", "Week 1 kickoff"]);
    // logged out there's no calendar, but the season's own dates show
    assert.deepEqual(comingUp({dates: [], kickoffs, now}).map((d) => d.what), ["Trade deadline", "Playoffs begin", "Championship week"]);
    // the cut-down two days away is soon
    assert.equal(comingUp({dates, kickoffs, now: 1788842700 - 2 * 86400}).find((d) => d.what.startsWith("Final")).soon, true);
});

test("the next blind bid run repeats weekly from the first", () => {
    const {calendar} = fixture("calendar.json");
    // the first run is Wed Sep 9, 11 p.m. CT; on Sat Oct 17 the next is Wed Oct 21
    assert.equal(nextBidRun(calendar, now), at("2026-10-21T23:00:00-05:00"));
    assert.equal(nextBidRun(calendar, 1789012800 - 10), 1789012800);
    assert.equal(nextBidRun(null, now), null);
    // still 11 p.m. CT once daylight time ends (Nov 1)
    assert.equal(nextBidRun(calendar, at("2026-11-26T12:00:00-06:00")), at("2026-12-02T23:00:00-06:00"));
    assert.equal(nextBidRun(calendar, at("2026-12-02T22:30:00-06:00")), at("2026-12-02T23:00:00-06:00"));
});

test("recent moves: the latest 10 adds, bids, IR moves and trades, as saved 4 Oct 2026", () => {
    const players = playersFromExport(fixture("players-in-transactions.json").players);
    const franchises = new Map(["0001", "0002", "0003", "0004", "0005", "0006", "0007", "0008", "0009", "0010"].map((id) => [id, {teamName: `Team ${id.slice(2)}`}]));
    const moves = recentMoves(fixture("transactions.json").transactions, {players, franchises});
    assert.equal(moves.length, 10);
    assert.ok(moves.every((move, i) => i === 0 || moves[i - 1].at >= move.at));
    assert.ok(!moves.some((move) => /LOCK|LOAD/.test(move.kind)));
    const all = recentMoves(fixture("transactions.json").transactions, {players, franchises, limit: 200});
    const line = (kind) => all.find((move) => move.kind === kind);
    assert.match(`${line("Bid").team} ${line("Bid").what}`, /^Team \d\d won .+ \([A-Z]+ [A-Z]+\) for \$\d+/);
    assert.match(line("IR").what, /^moved .+ to IR$/);
    assert.match(line("Trade").what, /^traded .+ to Team 07 for .+ and 2028 4th \(Team 07\)$/);
    assert.match(all.find((move) => move.kind === "Add" && /dropped/.test(move.what)).what, /^added .+, dropped .+/);
    assert.equal(all.find((move) => move.kind === "Drop").what.startsWith("dropped "), true);
});

test("board topics: the newest five, and the contracts topic for lengths", () => {
    const board = fixture("message-board.json").messageBoard;
    assert.deepEqual(boardTopics(board).map((t) => [t.title, t.when]), [
        ["Standings", "Oct 3"], ["Conditional starters", "Oct 1"], ["Free Agent Contracts", "Oct 1"], ["Bateman Pickup", "Sep 27"], ["Tua pickup", "Sep 8"]
    ]);
    assert.equal(contractTopic(board).subject, "Free Agent Contracts");
    assert.equal(contractTopic({}), null);
});

test("chat: oldest first, private messages only to or from the viewer, as saved 17 Oct 2026", () => {
    const xml = readFileSync(new URL("./fixtures/chat.xml", import.meta.url), "utf8");
    // the feed lists the newest first; ids start with the post's time
    assert.deepEqual(readChat(xml, {viewer: "0001"}).map((m) => [m.from, m.to, m.text, m.at]), [
        ["0005", "0001", "Private, you're next", 1788724751],
        ["0005", "0001", "Private reply & more", 1788725744],
        ["0001", "0000", "Private to the commissioner", 1791682615]
    ]);
    assert.deepEqual(readChat(xml, {viewer: "0005"}).map((m) => m.text), ["Private, you're next", "Private reply & more"]);
    assert.deepEqual(readChat(xml, {viewer: null}), []);
    assert.deepEqual(readChat('<messages><message id="1791682615a" franchise_id="0002" to="" message=":clear:"/></messages>', {viewer: "0001"}), []);
});

test("board topics from MFL's own home page module, for guests", () => {
    assert.deepEqual(moduleTopics([
        {href: "https://www44.myfantasyleague.com/2026/options?L=48571&O=28&TOPIC_ID=6749013", text: "Fuad bot"},
        {href: "https://www44.myfantasyleague.com/2026/options?L=48571&O=28&ACTION=add", text: "Post New Topic"}
    ]), [{id: "6749013", title: "Fuad bot"}]);
});

test("trade offers waiting for the viewer, from pending trades", () => {
    const players = new Map([["1", {fullName: "Justin Herbert"}], ["2", {fullName: "Jalen Hurts"}]]);
    const teams = new Map([["0003", "The Obliterators"]]);
    const pending = {pendingTrade: [
        {trade_id: "9", offeringteam: "0003", offeredto: "0001", will_give_up: "1,FP_0003_2027_1,", will_receive: "2,", expires: "1792800000"},
        {trade_id: "10", offeringteam: "0001", offeredto: "0003", will_give_up: "2,", will_receive: "1,"}
    ]};
    assert.deepEqual(tradeOffers(pending, {franchiseId: "0001", players, teams}), [
        {from: "The Obliterators", summary: "Herbert, 2027 1st for Hurts", expires: 1792800000}
    ]);
    // none pending: MFL leaves the list out
    assert.deepEqual(tradeOffers({}, {franchiseId: "0001", players, teams}), []);
});

test("a group that could only lower cap used still counts as winning nothing", () => {
    // $295 used; group 1 adds $8 with no drop; group 2 would save $9, but may lose
    const players = new Map([["9", player("9", "Pricey Guy", {salary: 10, years: 0})]]);
    const groups = pendingGroups({blindBidWaiverRequest: [{round: "1", addsDrops: "1_8_"}, {round: "2", addsDrops: "2_1_9"}]});
    const projected = projectBids(team("0001", "Me", {capTotal: 295, numPlayers: 25}), groups, players);
    assert.equal(projected.cap, 303);
    assert.equal(projected.overCap, true);
});
