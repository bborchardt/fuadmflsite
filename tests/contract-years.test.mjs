// Tests for the daily job's contract years chore. Names and posts are made up, in the styles
// owners actually use.

import {test} from "node:test";
import assert from "node:assert/strict";
import {contractsXml, decideYears, pendingAdds, readProcessedWaivers, readYears, yearMentions} from "../jobs/contract-years.mjs";

const T = 1790000000;
const DAYS_14 = 14 * 86400;
const players = new Map([
    ["1", {name: "Brazzell II, Chris"}], ["2", {name: "All, Erick"}], ["3", {name: "Wilson, Emanuel"}],
    ["4", {name: "Palmer, Joshua"}], ["5", {name: "Rush, Cooper"}], ["6", {name: "Keenum, Case"}],
    ["7", {name: "Wilson, Garrett"}], ["8", {name: "St. Brown, Amon-Ra"}]
]);
const candidate = (playerId) => ({playerId, name: players.get(playerId).name});

test("year counts in the ways owners write them", () => {
    const years = (text) => yearMentions(text).map((mention) => mention.years);
    assert.deepEqual(years("1yr"), [1]);
    assert.deepEqual(years("Woody Marks 3 yrs"), [3]);
    assert.deepEqual(years("Brandon Aiyuk 5 years 1 dollar"), [5]);
    assert.deepEqual(years("pat freiermuth - 3 years (in case it wasn't stated)"), [3]);
    assert.deepEqual(years("2-year deal, Five Years, 4YRS."), [2, 5, 4]);
    // a salary, not a length
    assert.deepEqual(years("$5 yr"), []);
});

test("a count belongs to the player named beside it, by surname or full name", () => {
    const read = (text, ...ids) => Object.fromEntries(readYears(text, ids.map(candidate)).years);
    assert.deepEqual(read("Brazzell 5 years", "1"), {1: 5});
    // a surname that's also a word
    assert.deepEqual(read("All 5 years ", "2", "1"), {2: 5});
    assert.deepEqual(read("cooper rush 1 year.", "5"), {5: 1});
    assert.deepEqual(read("3 years for Keenum please", "6", "5"), {6: 3});
    assert.deepEqual(read("Wilson 2yrs, Palmer 1yr", "3", "4"), {3: 2, 4: 1});
    assert.deepEqual(read("Amon-Ra St Brown 4 years", "8"), {8: 4});
    // a bare count with one candidate
    assert.deepEqual(read("1yr", "6"), {6: 1});
    assert.deepEqual(read("5 years please", "6"), {6: 5});
});

test("text naming someone else, or unclear text, sets nothing for the candidate", () => {
    // a post about another player isn't a bare count for the team's pending add
    assert.deepEqual(readYears("Cooper Rush 1 year", [candidate("6")]).years.size, 0);
    // two candidates share a surname
    const both = readYears("Wilson 3 years", [candidate("3"), candidate("7")]);
    assert.equal(both.years.size, 0);
    assert.match(both.problems[0], /doesn't say which of Wilson, Emanuel and Wilson, Garrett/);
    // out of range, and two lengths for one player
    assert.match(readYears("Keenum 6 years", [candidate("6")]).problems[0], /6 years for Keenum, Case is outside 1-5/);
    assert.match(readYears("Keenum 2 years, Keenum 3 years", [candidate("6")]).problems[0], /both 2 and 3 years/);
});

const page = (rows) => `<html><table class="pageheader"><tr><td>x</td></tr></table>
<table align="center" cellspacing="1" class="report nocaption"><tbody><tr>
<th>Round (or Group)</th><th>Franchise</th><th>Player Added</th><th>Player Dropped</th><th>Original Waiver Request</th><th>Reason Not Granted</th>
</tr>${rows}</tbody></table></html>`;
const row = (franchise, added, request) => `<tr class="oddtablerow"><td valign="top" align="right">1</td>
<td valign="top"><a title="Owner: Someone" class="franchise_${franchise} " href="#">Team</a></td><td valign="top">${added}</td><td valign="top">None</td><td valign="top">${request}</td><td valign="top"></td></tr>`;

test("blind bids are read from the processed waivers page, with their comments", () => {
    const requests = readProcessedWaivers(page(
        row("0006", "Wilson, Emanuel SEA RB ($2.00)",
            "Add Wilson, Emanuel SEA RB for $2.00 and drop None<br>\nAdd Palmer, Joshua BUF WR for $1.00 and drop None<br>\n"
            + "Submitted Tue Sep 22 3:15:29 p.m. CT 2026<br>Comments: Wilson 2yrs, Palmer 1 yr<br>")
        + row("0008", "None", "Add Keenum, Case DEN QB for $2.00 and drop None<br>\nSubmitted Wed Sep 23 7:43:30 p.m. CT 2026<br>")
        + row("0002", "St. Brown, Amon-Ra DET WR ($9.00)",
            "Add St. Brown, Amon-Ra DET WR for $9.00 and drop None<br>\nSubmitted Wed<br>Comments: it&#39;s 4 years<br>")));
    assert.deepEqual(requests, [
        {franchiseId: "0006", granted: "Wilson, Emanuel", adds: ["Wilson, Emanuel", "Palmer, Joshua"], comment: "Wilson 2yrs, Palmer 1 yr"},
        {franchiseId: "0008", granted: null, adds: ["Keenum, Case"], comment: ""},
        {franchiseId: "0002", granted: "St. Brown, Amon-Ra", adds: ["St. Brown, Amon-Ra"], comment: "it's 4 years"}
    ]);
    assert.throws(() => readProcessedWaivers("<html>Please log in</html>"), /no waiver table/);
});

test("pending adds: 0 years and last moved by the team's own add", () => {
    const rosters = {franchise: [
        {id: "0005", player: [
            {id: "1", salary: "1", contractYear: "0"},
            // dropped by another team first
            {id: "4", salary: "1", contractYear: "0"},
            // already has years
            {id: "2", salary: "1", contractYear: "5"},
            // an RFA after the rollover: no add this season
            {id: "6", salary: "0.01", contractYear: "0"}
        ]},
        {id: "0006", player: [
            // added by 0005, then traded to 0006
            {id: "5", salary: "1", contractYear: "0"},
            // loaded by the commissioner
            {id: "7", salary: "3", contractYear: "0"},
            // won in a blind bid
            {id: "3", salary: "2.00", contractYear: "0"}
        ]}
    ]};
    const transactions = [
        {type: "FREE_AGENT", franchise: "0005", transaction: "1,|", timestamp: String(T)},
        {type: "FREE_AGENT", franchise: "0007", transaction: "|4,", timestamp: String(T - 100)},
        {type: "FREE_AGENT", franchise: "0005", transaction: "4,|", timestamp: String(T)},
        {type: "FREE_AGENT", franchise: "0005", transaction: "5,|", timestamp: String(T)},
        {type: "TRADE", franchise: "0005", franchise2: "0006", franchise1_gave_up: "5,", franchise2_gave_up: ",", timestamp: String(T + 60)},
        {type: "LOAD_ROSTERS", franchise: "0006", transaction: "7,|", timestamp: String(T)},
        {type: "BBID_WAIVER", franchise: "0006", transaction: "3,|2|", timestamp: String(T + 120)}
    ];
    assert.deepEqual(pendingAdds({rosters, transactions, players}), [
        {playerId: "1", name: "Brazzell II, Chris", franchiseId: "0005", salary: "1", type: "FREE_AGENT", added: T, since: T - DAYS_14},
        {playerId: "4", name: "Palmer, Joshua", franchiseId: "0005", salary: "1", type: "FREE_AGENT", added: T, since: T - 100},
        {playerId: "3", name: "Wilson, Emanuel", franchiseId: "0006", salary: "2.00", type: "BBID_WAIVER", added: T + 120, since: T + 120 - DAYS_14}
    ]);
});

const add = (playerId, franchiseId, type, since = T - DAYS_14, added = T) =>
    ({playerId, name: players.get(playerId).name, franchiseId, salary: "1", type, added, since});
// every team's roster holds all the test players, so names in posts are recognized
const teams = new Map(["0005", "0006", "0007", "0008", "0009"].map((franchiseId) =>
    [franchiseId, [...players].map(([playerId, {name}]) => ({playerId, name}))]));
const post = (franchise, body, postTime = T + 60) => ({franchise, body, postTime: String(postTime)});
const bid = (franchiseId, names, comment) => ({franchiseId, granted: names[0], adds: names, comment});

test("years come from the bid comment or the team's later posts, else the default", () => {
    const {contracts, flags} = decideYears({
        adds: [add("1", "0005", "FREE_AGENT"), add("3", "0006", "BBID_WAIVER"), add("6", "0008", "BBID_WAIVER"),
            add("5", "0007", "FREE_AGENT", T - 30), add("4", "0009", "BBID_WAIVER")],
        posts: [
            post("0005", "Brazzell 5 years"),
            post("0008", "Keenum 3 yrs (in case it wasn&#39;t in the bid)"),
            // before Rush's previous move: about an earlier stint
            post("0007", "Cooper Rush 4 years", T - 60),
            // before the blind bid was processed
            post("0009", "Palmer 4 years", T - 3600)
        ],
        bidRequests: [bid("0006", ["Wilson, Emanuel", "Palmer, Joshua"], "Wilson 2yrs, Palmer 1yr"), bid("0008", ["Keenum, Case"], ""),
            bid("0009", ["Palmer, Joshua"], "")],
        teams,
        threadFound: true
    });
    assert.deepEqual(flags, []);
    assert.deepEqual(contracts.map(({playerId, years, source}) => ({playerId, years, source})), [
        {playerId: "1", years: 5, source: `post "Brazzell 5 years"`},
        {playerId: "3", years: 2, source: `blind bid comment "Wilson 2yrs, Palmer 1yr"`},
        {playerId: "6", years: 3, source: `post "Keenum 3 yrs (in case it wasn't in the bid)"`},
        {playerId: "5", years: 1, source: "no length stated: the default"},
        {playerId: "4", years: 4, source: `post "Palmer 4 years"`}
    ]);
});

test("conflicts, a missing bid and a missing thread are flagged, not guessed", () => {
    const decide = (adds, posts, bidRequests, threadFound = true) => decideYears({adds, posts, bidRequests, teams, threadFound});
    let result = decide([add("6", "0008", "BBID_WAIVER")], [post("0008", "Keenum 2 years")], [bid("0008", ["Keenum, Case"], "3yrs")]);
    assert.deepEqual(result.contracts, []);
    assert.match(result.flags[0], /^Case Keenum: the owner gave different lengths \(3 in blind bid comment "3yrs"; 2 in post "Keenum 2 years"\)$/);
    result = decide([add("6", "0008", "BBID_WAIVER")], [], []);
    assert.match(result.flags[0], /blind bid isn't on MFL's processed waivers page/);
    result = decide([add("5", "0007", "FREE_AGENT")], [], [], false);
    assert.match(result.flags[0], /contract thread wasn't found, so it wasn't defaulted/);
    result = decide([add("6", "0008", "FREE_AGENT")], [post("0008", "Keenum 7 years")], []);
    assert.match(result.flags[0], /7 years for Keenum, Case is outside 1-5/);
});

test("a stated length that can't be placed is flagged, never defaulted", () => {
    const decide = (adds, posts, bidRequests, teamMap = teams) => decideYears({adds, posts, bidRequests, teams: teamMap, threadFound: true});
    // a bare count in a conditional bid for two players
    let result = decide([add("3", "0006", "BBID_WAIVER")], [], [bid("0006", ["Wilson, Emanuel", "Palmer, Joshua"], "3 years")]);
    assert.deepEqual(result.contracts, []);
    assert.match(result.flags[0], /"3 years" gives 3 years without saying which of Wilson, Emanuel and Palmer, Joshua/);
    // a bare count from a team with two pending adds
    result = decide([add("6", "0008", "FREE_AGENT"), add("5", "0008", "FREE_AGENT")], [post("0008", "3 years")], []);
    assert.deepEqual(result.contracts, []);
    assert.equal(result.flags.length, 2);
    // a length in a form the reader doesn't know
    result = decide([add("6", "0008", "FREE_AGENT")], [post("0008", "Keenum 2y")], []);
    assert.match(result.flags[0], /post "Keenum 2y" names the player but gives no length the job can read/);
    result = decide([add("6", "0008", "BBID_WAIVER")], [], [bid("0008", ["Keenum, Case"], "two seasons")]);
    assert.match(result.flags[0], /blind bid comment "two seasons" gives no length the job can read/);
    // a misspelt name after the add
    result = decide([add("6", "0008", "FREE_AGENT")], [post("0008", "Keenam 3 years")], []);
    assert.match(result.flags[0], /post "Keenam 3 years" gives a length but names no player on the team the job recognizes/);
});

test("old bare posts and posts about other players don't touch a later add", () => {
    const decide = (adds, posts) => decideYears({adds, posts, bidRequests: [], teams, threadFound: true});
    // "3 years" posted a day before this add was for an earlier one
    let result = decide([add("6", "0008", "FREE_AGENT")], [post("0008", "3 years", T - 86400)]);
    assert.deepEqual(result.flags, []);
    assert.equal(result.contracts[0].years, 1);
    // a post after the add about another player on the team
    result = decide([add("6", "0008", "FREE_AGENT")], [post("0008", "Cooper Rush 4 years")]);
    assert.deepEqual(result.flags, []);
    assert.equal(result.contracts[0].years, 1);
});

test("the import keeps each salary exactly as MFL has it", () => {
    assert.equal(contractsXml([{playerId: "6", salary: "0.01", years: 2}, {playerId: "3", salary: "2.00", years: 1}]),
        `<salaries><leagueUnit unit="LEAGUE"><player id="6" salary="0.01" contractYear="2"/>`
        + `<player id="3" salary="2.00" contractYear="1"/></leagueUnit></salaries>`);
});
