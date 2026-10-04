// Tests for the daily job's contract years chore. Names and posts are made up, in the styles
// owners actually use.

import {test} from "node:test";
import assert from "node:assert/strict";
import {contractsXml, decideYears as decide_, readProcessedWaivers, readYears, yearMentions} from "../jobs/contract-years.mjs";
import {contractDeadline, pendingAdds, windowClosed} from "../site/v1/lib/adds.js";

const decideYears = (options) => decide_({contractDeadline, ...options});

const T = 1790000000;
const players = new Map([
    ["1", {name: "Brazzell II, Chris"}], ["2", {name: "All, Erick"}], ["3", {name: "Wilson, Emanuel"}],
    ["4", {name: "Palmer, Joshua"}], ["5", {name: "Rush, Cooper"}], ["6", {name: "Keenum, Case"}],
    ["7", {name: "Wilson, Garrett"}], ["8", {name: "St. Brown, Amon-Ra"}], ["9", {name: "Allen, Josh"}],
    ["10", {name: "Allen, Keenan"}], ["11", {name: "Cameron, Josh"}], ["12", {name: "Smith, Geno"}], ["13", {name: "Lock, Drew"}],
    ["14", {name: "Jones, Daniel"}], ["15", {name: "Jones, Julio"}]
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
            + "Submitted Tue Sep 22 3:15:29 p.m. CT 2026<br>Comments: Wilson 2yrs,<br>\nPalmer 1 yr<br>")
        + row("0008", "None", "Add Keenum, Case DEN QB for $2.00 and drop None<br>\nSubmitted Wed Sep 23 7:43:30 p.m. CT 2026<br>")
        // a player with no NFL team
        + row("0009", "Gronkowski, Rob FA* TE ($1.00)", "Add Gronkowski, Rob FA* TE for $1.00 and drop None<br />\nSubmitted Wed<br />Comments: 2yrs<br />")
        + row("0002", "St. Brown, Amon-Ra DET WR ($9.00)",
            "Add St. Brown, Amon-Ra DET WR for $9.00 and drop None<br>\nSubmitted Wed<br>Comments: it&#39;s 4 years<br>")));
    assert.deepEqual(requests, [
        {franchiseId: "0006", granted: "Wilson, Emanuel", adds: ["Wilson, Emanuel", "Palmer, Joshua"], comment: "Wilson 2yrs,\n\nPalmer 1 yr"},
        {franchiseId: "0008", granted: null, adds: ["Keenum, Case"], comment: ""},
        {franchiseId: "0009", granted: "Gronkowski, Rob", adds: ["Gronkowski, Rob"], comment: "2yrs"},
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
        {playerId: "1", name: "Brazzell II, Chris", franchiseId: "0005", salary: "1", type: "FREE_AGENT", added: T},
        {playerId: "4", name: "Palmer, Joshua", franchiseId: "0005", salary: "1", type: "FREE_AGENT", added: T},
        {playerId: "3", name: "Wilson, Emanuel", franchiseId: "0006", salary: "2.00", type: "BBID_WAIVER", added: T + 120}
    ]);
});

const add = (playerId, franchiseId, type, added = T) => ({playerId, name: players.get(playerId).name, franchiseId, salary: "1", type, added});
// every team's roster holds all the test players, so names in posts are recognized
const teams = new Map(["0003", "0005", "0006", "0007", "0008", "0009"].map((franchiseId) =>
    [franchiseId, [...players].map(([playerId, {name}]) => ({playerId, name}))]));
const post = (franchise, body, postTime = T + 60) => ({franchise, body, postTime: String(postTime)});
const bid = (franchiseId, names, comment) => ({franchiseId, granted: names[0], adds: names, comment});

test("years come from the bid comment, or posts after a free agent add, else the default", () => {
    const {contracts, flags} = decideYears({
        adds: [add("1", "0005", "FREE_AGENT"), add("3", "0006", "BBID_WAIVER"), add("6", "0008", "BBID_WAIVER"),
            add("5", "0007", "FREE_AGENT"), add("4", "0009", "BBID_WAIVER")],
        posts: [
            post("0005", "Brazzell 5 years"),
            // a blind bid's length must be in its comment
            post("0008", "Keenum 3 yrs (in case it wasn&#39;t in the bid)"),
            post("0009", "Palmer 4 years", T - 3600),
            // before the add: about an earlier stint
            post("0007", "Cooper Rush 4 years", T - 60)
        ],
        bidRequests: [bid("0006", ["Wilson, Emanuel", "Palmer, Joshua"], "Wilson 2yrs, Palmer 1yr"), bid("0008", ["Keenum, Case"], ""),
            bid("0009", ["Palmer, Joshua"], "")],
        teams
    });
    assert.deepEqual(flags, []);
    assert.deepEqual(contracts.map(({playerId, years, source}) => ({playerId, years, source})), [
        {playerId: "1", years: 5, source: `post "Brazzell 5 years"`},
        {playerId: "3", years: 2, source: `blind bid comment "Wilson 2yrs, Palmer 1yr"`},
        {playerId: "6", years: 1, source: "no length stated: the default"},
        {playerId: "5", years: 1, source: "no length stated: the default"},
        {playerId: "4", years: 1, source: "no length stated: the default"}
    ]);
});

test("conflicts and a missing bid are flagged, not guessed", () => {
    const decide = (adds, posts, bidRequests) => decideYears({adds, posts, bidRequests, teams});
    let result = decide([add("6", "0008", "FREE_AGENT")], [post("0008", "Keenum 3yrs"), post("0008", "Keenum 2 years", T + 120)], []);
    assert.deepEqual(result.contracts, []);
    assert.match(result.flags[0], /^Case Keenum: the owner gave different lengths \(3 in post "Keenum 3yrs"; 2 in post "Keenum 2 years"\)$/);
    result = decide([add("6", "0008", "BBID_WAIVER")], [], []);
    assert.match(result.flags[0], /blind bid isn't on MFL's processed waivers page/);
    result = decide([add("6", "0008", "FREE_AGENT")], [post("0008", "Keenum 7 years")], []);
    assert.match(result.flags[0], /7 years for Keenum, Case is outside 1-5/);
});

test("a stated length that can't be placed is flagged, never defaulted", () => {
    const decide = (adds, posts, bidRequests, teamMap = teams) => decideYears({adds, posts, bidRequests, teams: teamMap});
    // a length in a form the reader doesn't know
    let result = decide([add("6", "0008", "FREE_AGENT")], [post("0008", "Keenum 2y")], []);
    assert.match(result.flags[0], /post "Keenum 2y" names the player but gives no length the job can read/);
    result = decide([add("6", "0008", "BBID_WAIVER")], [], [bid("0008", ["Keenum, Case"], "two seasons")]);
    assert.match(result.flags[0], /blind bid comment "two seasons" gives no length the job can read/);
    // a misspelt name after the add
    result = decide([add("6", "0008", "FREE_AGENT")], [post("0008", "Keenam 3 years")], []);
    assert.match(result.flags[0], /post "Keenam 3 years" gives 3 years without naming a player on the team the job recognizes/);
});

test("a bare count in a conditional blind bid covers whichever player is won", () => {
    const result = decideYears({
        adds: [add("3", "0006", "BBID_WAIVER")], posts: [], teams,
        bidRequests: [bid("0006", ["Wilson, Emanuel", "Palmer, Joshua"], "3 years")]
    });
    assert.deepEqual(result.flags, []);
    assert.deepEqual(result.contracts.map(({playerId, years}) => ({playerId, years})), [{playerId: "3", years: 3}]);
});

test("every length in a post is accounted for", () => {
    const decide = (adds, posts) => decideYears({adds, posts, bidRequests: [], teams});
    // one name right, one misspelt
    let result = decide([add("6", "0003", "FREE_AGENT"), add("11", "0003", "FREE_AGENT")], [post("0003", "Cameron 5 years, Keenam 3 years")]);
    assert.deepEqual(result.contracts.map(({playerId, years}) => ({playerId, years})), [{playerId: "11", years: 5}]);
    assert.match(result.flags[0], /^Case Keenum: post "Cameron 5 years, Keenam 3 years" gives 3 years without naming/);
    // a rostered player named correctly beside the misspelt one
    result = decide([add("6", "0003", "FREE_AGENT")], [post("0003", "Brazzell 5 years, Keenam 3 years")]);
    assert.deepEqual(result.contracts, []);
    assert.equal(result.flags.length, 1);
    // a full name of a rostered player isn't a pending add sharing the surname
    result = decide([add("10", "0003", "FREE_AGENT")], [post("0003", "Josh Allen 3 years")]);
    assert.deepEqual(result.flags, []);
    assert.equal(result.contracts[0].years, 1);
    assert.equal(decide([add("10", "0003", "FREE_AGENT")], [post("0003", "Keenan Allen 3 years")]).contracts[0].years, 3);
});

test("naming a teammate in full doesn't hide the add's length", () => {
    const decide = (body) => decideYears({adds: [add("13", "0003", "FREE_AGENT")], posts: [post("0003", body)], bidRequests: [], teams});
    for (const body of ["Backup for Geno Smith: Lock 2 years", "2 years for Lock, backup to Geno Smith", "Geno Smith hurt so Lock 2 years",
        "Lock 2 years, backup to Geno Smith", "Drew Lock 2 years (Geno Smith backup)"]) {
        const result = decide(body);
        assert.deepEqual(result.flags, [], body);
        assert.equal(result.contracts[0].years, 2, body);
    }
});

test("dotted initials, each/both lists, sentence bounds and shared surnames", () => {
    const decide = (adds, body) => decideYears({adds, posts: [post("0003", body)], bidRequests: [], teams});
    assert.equal(decide([add("6", "0003", "FREE_AGENT")], "C.Keenum - 1 year").contracts[0].years, 1);
    assert.equal(decide([add("6", "0003", "FREE_AGENT")], "QB - C. Keenum 3yrs").contracts[0].years, 3);
    let result = decide([add("6", "0003", "FREE_AGENT"), add("5", "0003", "FREE_AGENT"), add("1", "0003", "FREE_AGENT")],
        "2 years, each:<br/><br/>Keenum<br/>Rush<br/>Brazzell");
    assert.deepEqual(result.flags, []);
    assert.deepEqual(result.contracts.map((contract) => contract.years), [2, 2, 2]);
    // the next sentence's name isn't what a count is for
    result = decide([add("13", "0003", "FREE_AGENT")], "I had 3 years on his contract. Lock for 5 years.");
    assert.deepEqual(result.flags, []);
    assert.equal(result.contracts[0].years, 5);
    // a rostered Garrett Wilson makes "Wilson" ambiguous for a pending Emanuel Wilson
    result = decide([add("3", "0003", "FREE_AGENT")], "Wilson 2 years");
    assert.deepEqual(result.contracts, []);
    assert.match(result.flags[0], /doesn't say which of Wilson, Emanuel and Wilson, Garrett/);
    // an initial tells two players with the same surname apart
    assert.equal(decide([add("14", "0003", "FREE_AGENT")], "D. Jones 1 year").contracts[0].years, 1);
    assert.deepEqual(decide([add("14", "0003", "FREE_AGENT")], "J. Jones 4 years").contracts[0].source, "no length stated: the default");
});

test("counts only pair with a name in the same sentence, in plain number formats", () => {
    const decide = (adds, body) => decideYears({adds, posts: [post("0003", body)], bidRequests: [], teams});
    let result = decide([add("6", "0003", "FREE_AGENT")], "Got Keenum. Been in this league 5 years");
    assert.equal(result.contracts.length, 0);
    assert.equal(result.flags.length, 1);
    for (const body of ["Keenum 1.5 years", "Keenum 2-3 years"]) {
        result = decide([add("6", "0003", "FREE_AGENT")], body);
        assert.equal(result.contracts.length, 0, body);
        assert.match(result.flags[0], /names the player but gives no length/, body);
    }
    // a name in its own sentence just before the count
    assert.equal(decide([add("6", "0003", "FREE_AGENT")], "Keenum. 3 years.").contracts[0].years, 3);
    // initials and abbreviations aren't sentence ends
    assert.equal(decide([add("8", "0003", "FREE_AGENT")], "WR - A. St. Brown 4 yrs").contracts[0].years, 4);
});

test("a bid is only matched on its own period's page", () => {
    const result = decideYears({adds: [add("6", "0008", "BBID_WAIVER")], posts: [], teams,
        bidRequests: [{...bid("0008", ["Keenum, Case"], "4 years"), granted: null, period: T - 7 * 86400},
            {...bid("0008", ["Keenum, Case"], ""), period: T}]});
    assert.deepEqual(result.flags, []);
    assert.equal(result.contracts[0].source, "no length stated: the default");
});

test("a problem with another player in a conditional bid doesn't hide this one's unreadable length", () => {
    const result = decideYears({adds: [add("3", "0006", "BBID_WAIVER")], posts: [], teams,
        bidRequests: [bid("0006", ["Wilson, Emanuel", "Palmer, Joshua"], "Palmer 6 years; EWil 2 years")]});
    assert.deepEqual(result.contracts, []);
    assert.match(result.flags[0], /gives no length the job can read/);
});

test("a post must name the player: a bare count isn't a valid post", () => {
    const result = decideYears({adds: [add("6", "0008", "FREE_AGENT"), add("5", "0008", "FREE_AGENT")],
        posts: [post("0008", "3 years"), post("0008", "1 yr")], bidRequests: [], teams});
    assert.deepEqual(result.flags, []);
    assert.deepEqual(result.contracts.map(({playerId, years, source}) => ({playerId, years, source})), [
        {playerId: "6", years: 1, source: "no length stated: the default"},
        {playerId: "5", years: 1, source: "no length stated: the default"}
    ]);
});

test("posts about other players on the team don't touch an add", () => {
    const decide = (adds, posts) => decideYears({adds, posts, bidRequests: [], teams});
    // chat naming the player without a length, in another thread
    assert.deepEqual(decide([add("6", "0008", "FREE_AGENT")], [post("0008", "if Rush doesnt play, play Keenum")]).flags, []);
    // a post after the add about another player on the team
    const result = decide([add("6", "0008", "FREE_AGENT")], [post("0008", "Cooper Rush 4 years")]);
    assert.deepEqual(result.flags, []);
    assert.equal(result.contracts[0].years, 1);
});

test("an add is decided once its one-hour posting window closes, and later posts don't count", () => {
    assert.equal(windowClosed({added: T}, T + 3599), false);
    assert.equal(windowClosed({added: T}, T + 3600), true);
    const result = decideYears({adds: [add("6", "0008", "FREE_AGENT")], bidRequests: [], teams,
        posts: [post("0008", "Keenum 3 years", T + 3601)]});
    assert.equal(result.contracts[0].source, "no length stated: the default");
    assert.equal(decideYears({adds: [add("6", "0008", "FREE_AGENT")], bidRequests: [], teams,
        posts: [post("0008", "Keenum 3 years", T + 3600)]}).contracts[0].years, 3);
});

test("the import keeps each salary exactly as MFL has it", () => {
    assert.equal(contractsXml([{playerId: "6", salary: "0.01", years: 2}, {playerId: "3", salary: "2.00", years: 1}]),
        `<salaries><leagueUnit unit="LEAGUE"><player id="6" salary="0.01" contractYear="2"/>`
        + `<player id="3" salary="2.00" contractYear="1"/></leagueUnit></salaries>`);
});
