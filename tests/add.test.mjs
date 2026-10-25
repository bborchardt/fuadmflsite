import {test} from "node:test";
import assert from "node:assert/strict";
import {readYears} from "../site/v2/lib/contract-years.js";
import {
    addBlock, banner, bidsLeft, checkAdd, checkBid, commentLines, composeCheck, copyTargets, dropCheck, findClaim, droppedByTeam, freeAgencyOver, freeAgentRows, fullNameLines, isLengthLine, lengthLine, lineFor, maxBid,
    readMarks, readPlayerLists, rewriteComment, surname, usedDrops, yearsIn
} from "../site/v2/ui/add-model.js";

// MFL's Add/Drop page script, as saved from the clone on 18 Oct 2026
const page = `
   pdb_add[0] = new Player2 ("15720","Haskins, Hassan#","NEP","RB",11,"$1","","","","NYJ","","1.00");
   pdb_add[1] = new Player2 ("17715","Montgomery, Tyren (R)#","TEN","WR",9,"$1","","","","@IND","","1.00");
   pdb_add[2] = new Player2 ("14239","Moreau, Foster!","HOU","TE",8,"$1","","","","@JAC",3,"1.00");
   pdb_add[3] = new Player2 ("13598","White, Mike","FA","QB","n/a","$1","Q","","","BYE","","1.00");
   pdb_drop[0] = new Player2 ("12263","Waller, Darren","CAR","TE",5,"$1","","NS","","@PHI",5,"1");
   pdb_drop[1] = new Player2 ("15287","St. Brown, Amon-Ra!","DET","WR",6,"$61","","NS","","Bye","","61");`;

test("MFL's player lists come from the page's script, with its marks read off the names", () => {
    const lists = readPlayerLists(page);
    assert.equal(lists.add.length, 4);
    assert.equal(lists.drop.length, 2);
    assert.deepEqual(lists.add[1], {index: 1, id: "17715", rawName: "Montgomery, Tyren (R)#", mflName: "Montgomery, Tyren", name: "Tyren Montgomery",
        mark: "#", rookie: true, nfl: "TEN", pos: "WR", bye: 9, salary: 1, inj: "", roster: "", pts: null, opp: "@IND", proj: null});
    assert.equal(lists.add[2].mark, "!");
    assert.equal(lists.add[2].proj, 3);
    assert.equal(lists.add[3].mark, null);
    assert.equal(lists.add[3].bye, null);
    assert.equal(lists.drop[1].salary, 61);
    assert.equal(lists.drop[1].name, "Amon-Ra St. Brown");
    assert.deepEqual(readMarks("Fant, Noah*"), {mflName: "Fant, Noah", mark: "*", rookie: false});
});

test("the banner: the window is open while MFL lets any free agent be added outright", () => {
    const calendar = {event: [
        {type: "WAIVER_BBID", start_time: "1789012800", happens: "17"},
        {type: "WAIVER_LOCK", start_time: "1789318800", happens: "17"}
    ]};
    const sunday = new Date("2026-10-18T10:00:00-05:00").getTime() / 1000;
    const {add} = readPlayerLists(page);
    assert.deepEqual(banner({phase: "season", freeAgents: add, calendar, now: sunday}), {kind: "window", text: "Free agent window open until Sunday noon CT"});
    const locked = add.filter((player) => player.mark);
    assert.deepEqual(banner({phase: "season", freeAgents: locked, calendar, now: sunday}), {kind: "bids", text: "Blind bids only until Wednesday 11 p.m. CT"});
    // before week 1 the first run is named by its date
    const august = new Date("2026-09-05T12:00:00-05:00").getTime() / 1000;
    assert.equal(banner({phase: "preseason", freeAgents: locked, calendar, now: august}).text, "Blind bids only until Wed Sep 9, 11 p.m. CT");
    assert.deepEqual(banner({phase: "closed", freeAgents: add, calendar, now: august}), {kind: "closed", text: "Adds open after the draft."});
    assert.deepEqual(banner({phase: "over", freeAgents: add, calendar, now: sunday}), {kind: "closed", text: "Adds open after the draft."});
    // after the last bid run (Wed Jan 6), the window runs to the last lock (Sun Jan 10)
    const lastWeek = Date.parse("2027-01-08T12:00:00-06:00") / 1000;
    assert.equal(banner({phase: "season", freeAgents: add, calendar, now: lastWeek}).text, "Free agent window open until Sunday noon CT");
    assert.equal(banner({phase: "season", freeAgents: locked, calendar, now: lastWeek}).text, "Blind bids only");
    // free agency is over at the last lock; bids once the last run has passed
    const closes = Date.parse("2027-01-10T12:00:00-06:00") / 1000;
    assert.equal(freeAgencyOver({phase: "season", calendar, now: lastWeek}), false);
    assert.equal(freeAgencyOver({phase: "season", calendar, now: closes}), true);
    assert.equal(freeAgencyOver({phase: "season", calendar: null, now: closes}), false);
    assert.equal(bidsLeft("season", calendar, sunday), true);
    assert.equal(bidsLeft("season", calendar, lastWeek), false);
    // before the season the calendar may still be last season's
    assert.equal(freeAgencyOver({phase: "preseason", calendar, now: closes}), false);
    assert.equal(bidsLeft("preseason", calendar, closes), true);
});

// the clone's team: $293 used, 30 active
const player = (playerId, fullName, salary, years, extra = {}) => ({playerId, fullName, salary, years, capPenalty: years > 0 ? Math.max(Math.ceil(Math.max(1, 0.4 * salary * years)), years) : 0,
    status: "ROSTER", nflPosition: "WR", transactions: [], ...extra});
function teamOf({cap = 293, active = 30, groups = []} = {}) {
    const franchise = {franchiseId: "0001", capTotal: cap, numPlayers: active};
    const players = new Map([
        ["lamar", player("lamar", "Lamar Jackson", 68, 1, {nflPosition: "QB"})],
        ["williams", player("williams", "Antonio Williams", 1, 5)],
        ["olave", player("olave", "Chris Olave", 1, 1)],
        ["achane", player("achane", "De'Von Achane", 1, 2, {status: "INJURED_RESERVE", nflPosition: "RB"})]
    ]);
    players.forEach((entry) => {
        entry.franchise = franchise;
    });
    return {franchise, groups, players};
}

test("a bid's max leaves room for every other group's costliest claim", () => {
    const team = teamOf({groups: [{round: 2, claims: [{add: "patrick", bid: 2, drop: null}]}]});
    // $300 − ($293 + $2) = $5, and Lamar's drop frees $68 − $28 = $40
    assert.equal(maxBid(team, {round: 1, drop: null}), 5);
    assert.equal(maxBid(team, {round: 1, drop: "lamar"}), 45);
    // Williams' penalty ($5) is more than his salary: cap used goes up $4
    assert.equal(maxBid(team, {round: 1, drop: "williams"}), 1);
    // in group 2 itself, only the other groups count
    assert.equal(maxBid(team, {round: 2, drop: null}), 7);
});

test("a bid is blocked when it takes a limit past what the pending bids could reach", () => {
    const team = teamOf({active: 29});
    assert.equal(checkBid(team, {round: 1, claim: {add: "x", bid: 7, drop: null}, phase: "season"}).fits, true);
    assert.equal(checkBid(team, {round: 1, claim: {add: "x", bid: 8, drop: null}, phase: "season"}).why, "over cap");
    // at 30 active a claim needs a drop; an IR drop frees no spot
    const full = teamOf({active: 30});
    assert.equal(checkBid(full, {round: 1, claim: {add: "x", bid: 1, drop: null}, phase: "season"}).why, "over roster limit");
    assert.equal(checkBid(full, {round: 1, claim: {add: "x", bid: 1, drop: "achane"}, phase: "season"}).why, "over roster limit");
    assert.equal(checkBid(full, {round: 1, claim: {add: "x", bid: 1, drop: "olave"}, phase: "season"}).fits, true);
    // two groups with no drop at 29 make 31
    const one = teamOf({active: 29, groups: [{round: 1, claims: [{add: "y", bid: 1, drop: null}]}]});
    assert.equal(checkBid(one, {round: 2, claim: {add: "x", bid: 1, drop: null}, phase: "season"}).why, "over roster limit");
    // but a second no-drop claim in the same group wins at most one
    assert.equal(checkBid(one, {round: 1, claim: {add: "x", bid: 1, drop: null}, phase: "season"}).fits, true);
    // bids already over a limit: a swap that leaves them as they are isn't what breaks them
    const invalid = teamOf({active: 30, groups: [{round: 1, claims: [{add: "y", bid: 1, drop: null}]}]});
    assert.equal(checkBid(invalid, {round: 2, claim: {add: "x", bid: 1, drop: "olave"}, phase: "season"}).fits, true);
    // under 23 in season, an add can't drop an active player (10.5); an IR player is fine
    const short = teamOf({active: 22});
    assert.equal(checkBid(short, {round: 1, claim: {add: "x", bid: 1, drop: "olave"}, phase: "season"}).why, "under roster minimum");
    assert.equal(checkBid(short, {round: 1, claim: {add: "x", bid: 1, drop: "achane"}, phase: "season"}).fits, true);
    assert.equal(checkBid(short, {round: 1, claim: {add: "x", bid: 1, drop: "olave"}, phase: "preseason"}).fits, true);
    // editing a claim replaces it rather than adding to it
    const editing = teamOf({groups: [{round: 1, claims: [{add: "x", bid: 7, drop: null}]}]});
    assert.equal(checkBid(editing, {round: 1, claim: {add: "x", bid: 7, drop: null}, without: "1_x_7_0000", phase: "season"}).fits, true);
});

test("an immediate add lands now, so every pending group still has to fit after it", () => {
    const team = teamOf({cap: 296, active: 29, groups: [{round: 1, claims: [{add: "y", bid: 3, drop: null}]}]});
    // $296 + $1 + $3 = $300
    assert.equal(checkAdd(team, {cost: 1, drop: null, phase: "season"}).why, "over roster limit");
    const room = teamOf({cap: 296, active: 28, groups: [{round: 1, claims: [{add: "y", bid: 3, drop: null}]}]});
    assert.equal(checkAdd(room, {cost: 1, drop: null, phase: "season"}).fits, true);
    assert.equal(checkAdd(room, {cost: 2, drop: null, phase: "season"}).why, "over cap");
    assert.deepEqual(checkAdd(room, {cost: 1, drop: "lamar", phase: "season"}).cap, {from: 299, to: 260});
    // over 30 active in season, no adds at all, even with a drop
    const over = teamOf({active: 31});
    assert.equal(checkAdd(over, {cost: 1, drop: "olave", phase: "season"}).why, "over roster limit");
    assert.equal(addBlock(over, {phase: "season"}), "over roster limit");
    // before the season a team still at 34 can swap
    assert.equal(checkAdd(teamOf({active: 34}), {cost: 1, drop: "olave", phase: "preseason"}).fits, true);
    assert.equal(checkAdd(teamOf({active: 34}), {cost: 1, drop: null, phase: "preseason"}).why, "over roster limit");
});

test("copies go to another group or a new one, each checked first", () => {
    const team = teamOf({cap: 292, active: 28, groups: [
        {round: 1, claims: [{add: "x", bid: 4, drop: null}]},
        {round: 2, claims: [{add: "z", bid: 1, drop: "olave"}]}
    ]});
    const targets = copyTargets(team, {round: 1, claim: {add: "x", bid: 4, drop: null}, rounds: [1, 2], maxGroups: 8, phase: "season"});
    // now $292 + $4 + $1 = $297; in group 2 its max grows by $3 to $300, and 30 active; a new group
    // 3 adds $4
    assert.deepEqual(targets, [{round: 2, isNew: false, off: false, why: null}, {round: 3, isNew: true, off: true, why: "over cap"}]);
});

test("a re-add is blocked for 48 hours after the team's own drop (9.4)", () => {
    const me = {franchiseId: "0001"};
    const dropped = new Date("2026-10-16T15:12:00-05:00").getTime() / 1000;
    const players = new Map([
        ["a", {playerId: "a", transactions: [{timestamp: dropped, franchise: me, added: false}]}],
        ["b", {playerId: "b", transactions: [{timestamp: dropped, franchise: {franchiseId: "0002"}, added: false}]}]
    ]);
    const blocked = droppedByTeam(players, "0001", dropped + 3600);
    assert.deepEqual([...blocked.keys()], ["a"]);
    const rows = freeAgentRows([{id: "a", name: "A A", mflName: "A, A", mark: "#", pos: "WR", proj: 2}, {id: "c", name: "C C", mflName: "C, C", mark: null, pos: "WR", proj: 5}], {blocked});
    assert.deepEqual(rows.map((row) => [row.player.id, row.off, row.why]), [["c", false, ""], ["a", true, "Dropped by you · bid from Sun 3:12 p.m."]]);
    assert.equal(droppedByTeam(players, "0001", dropped + 49 * 3600).size, 0);
    // with no bid run left, a bid-only player is off
    const late = freeAgentRows([{id: "a", name: "A A", mflName: "A, A", mark: "#", pos: "WR", proj: 2}, {id: "c", name: "C C", mflName: "C, C", mark: null, pos: "WR", proj: 5}], {bids: false});
    assert.deepEqual(late.map((row) => [row.player.id, row.off, row.why]), [["c", false, ""], ["a", true, "No bid runs left"]]);
});

test("each claim writes a named line the job's reader gives back to the right player", () => {
    const names = ["Fehoko, Simi", "St. Brown, Amon-Ra", "Harrison Jr., Marvin", "Williams, Antonio", "Williams, Mike"];
    assert.equal(surname("Harrison Jr., Marvin"), "Harrison");
    assert.equal(lengthLine("St. Brown, Amon-Ra", 2), "St. Brown: 2 years");
    assert.equal(lengthLine("Fehoko, Simi", 1), "Fehoko: 1 year");
    // two in a group share a surname: the full name
    assert.equal(lengthLine("Williams, Antonio", 3, names), "Antonio Williams: 3 years");
    const comment = names.map((name, i) => lengthLine(name, i + 1, names)).join("\n");
    const read = readYears(comment, names.map((name) => ({playerId: name, name})), {bareForAll: true});
    assert.deepEqual(read.problems, []);
    assert.deepEqual([...read.years], names.map((name, i) => [name, i + 1]));
});

test("a group's comment keeps one line per claim when one is edited or removed", () => {
    const comment = "Fehoko: 1 year\nPatrick: 2 years";
    assert.equal(lineFor(["Fehoko: 1 year", "Patrick: 2 years"], "Patrick, Tim"), "Patrick: 2 years");
    assert.equal(yearsIn("Patrick: 2 years"), 2);
    assert.equal(rewriteComment(comment, "Fehoko, Simi", "Fehoko: 3 years"), "Fehoko: 3 years\nPatrick: 2 years");
    assert.equal(rewriteComment(comment, "Fehoko, Simi", null), "Patrick: 2 years");
    assert.equal(rewriteComment("Fehokobr/Patrick: 2 years".replace("Fehoko", "Fehoko: 1 year"), "Higbee, Tyler", "Higbee: 2 years"), "Fehoko: 1 year\nPatrick: 2 years\nHigbee: 2 years");
});

test("two claims of one surname each keep their own line through an edit", () => {
    const names = ["Harrison Jr., Marvin", "Harrison, Rondale"];
    const comment = "Marvin Harrison Jr.: 2 years\nRondale Harrison: 3 years";
    assert.equal(lineFor(commentLines(comment), "Harrison, Rondale", names), "Rondale Harrison: 3 years");
    assert.equal(rewriteComment(comment, "Harrison, Rondale", "Rondale Harrison: 1 year", names), "Marvin Harrison Jr.: 2 years\nRondale Harrison: 1 year");
    // a surname line no longer tells them apart
    assert.equal(lineFor(["Harrison: 2 years"], "Harrison, Rondale", names), null);
    assert.equal(isLengthLine("Fehoko: 1 year"), true);
    assert.equal(isLengthLine("If Evans doesn't play, Fehoko"), false);
    assert.equal(yearsIn("Evans two years"), null);
});

test("with bids already over the cap, a claim that leaves them as they are can still bid", () => {
    const team = teamOf({cap: 295, active: 28, groups: [{round: 1, claims: [{add: "y", bid: 10, drop: null}]}]});
    // $305 projected; a $1 claim in group 1 doesn't raise its max
    assert.equal(maxBid(team, {round: 1, drop: null}), 10);
    assert.equal(checkBid(team, {round: 1, claim: {add: "x", bid: 1, drop: null}, phase: "season"}).fits, true);
    assert.equal(checkBid(team, {round: 2, claim: {add: "x", bid: 1, drop: null}, phase: "season"}).why, "over cap");
});

test("an immediate add's drop no longer frees anything for a pending claim that drops him too", () => {
    const team = teamOf({cap: 280, active: 30, groups: [{round: 1, claims: [{add: "y", bid: 15, drop: "lamar"}]}]});
    // the claim can only win without Lamar: +$15 and an active player
    const result = checkAdd(team, {cost: 1, drop: "lamar", phase: "season"});
    assert.equal(result.why, "over roster limit");
    assert.equal(checkAdd(team, {cost: 1, drop: "olave", phase: "season"}).fits, true);
});

test("a short line takes the full name when a claim of the same surname joins the group", () => {
    assert.deepEqual(fullNameLines(["Harrison: 2 years", "Fehoko: 1 year"], "Harrison, Rondale", ["Harrison Jr., Marvin", "Fehoko, Simi"]),
        ["Marvin Harrison Jr.: 2 years", "Fehoko: 1 year"]);
    assert.deepEqual(fullNameLines(["Harrison: 2 years"], "Fehoko, Simi", ["Harrison Jr., Marvin"]), ["Harrison: 2 years"]);
});

test("the Watching chip shows only the watched free agents, with the position and search still applied", () => {
    const player = (id, name, pos) => ({id, name, mflName: name, pos, proj: 0, pts: 0, mark: ""});
    const agents = [player("1", "Ann Able", "RB"), player("2", "Bo Best", "WR"), player("3", "Cy Cole", "RB")];
    const ids = (rows) => rows.map((row) => row.player.id);
    assert.deepEqual(ids(freeAgentRows(agents, {sort: "name", watched: new Set(["1", "2"])})), ["1", "2"]);
    assert.deepEqual(ids(freeAgentRows(agents, {sort: "name", pos: "RB", watched: new Set(["1", "2"])})), ["1"]);
    assert.deepEqual(ids(freeAgentRows(agents, {sort: "name"})), ["1", "2", "3"]);
});

test("a composed bid: its amount as typed, its max, and the same claim twice in a group blocked", () => {
    const team = teamOf({active: 29, groups: [{round: 1, claims: [{add: "x", bid: 2, drop: "olave"}]}]});
    const bid = {add: "x", drop: "olave", round: 1, bid: "2", years: 1, editing: null, kind: "bid"};
    const twice = composeCheck(team, bid, {phase: "season"});
    assert.equal(twice.fits, false);
    assert.equal(twice.why, "already in this group");
    // an edit of that claim is the claim itself, and another drop makes it another claim
    assert.equal(composeCheck(team, {...bid, editing: "1_x_2_olave"}, {phase: "season"}).fits, true);
    assert.equal(composeCheck(team, {...bid, drop: null}, {phase: "season"}).fits, true);
    // until the drop is picked it can't be a copy of one
    assert.equal(composeCheck(team, {...bid, drop: undefined}, {phase: "season"}).why, null);
    // only the other groups count against a claim's max, and there are none: $300 − $293 = $7
    const over = composeCheck(team, {...bid, add: "y", drop: null, bid: "8"}, {phase: "season"});
    assert.deepEqual([over.bid, over.max, over.tooHigh, over.fits], [8, 7, true, false]);
    const empty = composeCheck(team, {...bid, add: "y", drop: null, bid: ""}, {phase: "season"});
    assert.deepEqual([empty.bid, empty.why, empty.fits], [0, "Bids start at $1.", false]);
});

test("a composed add costs the free agent's salary on MFL's page, $1 when it isn't listed", () => {
    const team = teamOf({cap: 296, active: 28});
    const add = {add: "x", drop: null, round: null, bid: "1", years: 1, editing: null, kind: "add"};
    assert.deepEqual(composeCheck(team, add, {phase: "season", freeAgent: {salary: 4}}), {...checkAdd(team, {cost: 4, drop: null, phase: "season"}), bid: null});
    assert.equal(composeCheck(team, add, {phase: "season", freeAgent: {salary: 5}}).why, "over cap");
    assert.equal(composeCheck(team, add, {phase: "season"}).fits, true);
    // each drop on the list is checked as the move's drop
    assert.equal(dropCheck(team, add, "lamar", {phase: "season", freeAgent: {salary: 5}}).fits, true);
    assert.equal(dropCheck(teamOf({active: 22}), {...add, kind: "bid", round: 1}, "olave", {phase: "season"}).why, "under roster minimum");
});

test("the drop list names the other groups that already drop a player", () => {
    const team = teamOf({groups: [
        {round: 1, claims: [{add: "x", bid: 1, drop: "olave"}]},
        {round: 2, claims: [{add: "y", bid: 1, drop: "lamar"}, {add: "z", bid: 1, drop: null}]}
    ]});
    assert.deepEqual([...usedDrops(team, 1)], [["lamar", 2]]);
    assert.deepEqual([...usedDrops(team, 3)], [["olave", 1], ["lamar", 2]]);
    const groups = [{round: 2, claims: [{key: "a"}, {key: "b"}]}];
    assert.deepEqual(findClaim(groups, "b"), {group: groups[0], claim: {key: "b"}});
    assert.equal(findClaim(groups, "c"), null);
});
