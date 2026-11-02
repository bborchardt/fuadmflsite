import {test} from "node:test";
import assert from "node:assert/strict";
import {formLengths, formPost, lengthTopics, lengthsDue, readFormPost} from "../site/v2/lib/lengths.js";

const players = new Map([
    {id: "1", name: "Mahomes, Patrick", team: "KCC", position: "QB"},
    {id: "2", name: "Kelce, Travis", team: "KCC", position: "TE"},
    {id: "3", name: "Johnson, Josh", team: "FA", position: "QB"},
    {id: "4", name: "Johnson, Josh", team: "WAS", position: "WR"},
    {id: "5", name: "St. Brown, Amon-Ra", team: "DET", position: "WR"}
].map((player) => [player.id, player]));

test("due a length: 0 years with a salary; an unsettled RFA's $0.01 isn't one", () => {
    const rosters = {franchise: [{id: "0001", player: [
        {id: "1", contractYear: "0", salary: "12"},
        {id: "2", contractYear: "0", salary: "0.01"},
        {id: "3", contractYear: "2", salary: "4"},
        {id: "5", contractYear: "0", salary: "1"}
    ]}, {id: "0002", player: {id: "4", contractYear: "0", salary: "3"}}]};
    assert.deepEqual(lengthsDue(rosters, "0001"), ["1", "5"]);
    assert.deepEqual(lengthsDue(rosters, "0002"), ["4"]);
    assert.deepEqual(lengthsDue(rosters, "0003"), []);
});

test("the form's post reads back, with or without its line breaks", () => {
    const body = formPost([{player: players.get("1"), years: 3}, {player: players.get("5"), years: 1}]);
    assert.equal(body, "Contract lengths, sent from the league site:\nMahomes, Patrick KCC QB: 3 years\nSt. Brown, Amon-Ra DET WR: 1 year");
    const expected = [
        {name: "Mahomes, Patrick", team: "KCC", position: "QB", years: 3},
        {name: "St. Brown, Amon-Ra", team: "DET", position: "WR", years: 1}
    ];
    assert.deepEqual(readFormPost(body), expected);
    assert.deepEqual(readFormPost(body.replace(/\n/g, "<br />")), expected);
    assert.deepEqual(readFormPost(body.replace(/\n/g, " ")), expected);
    // any other post isn't the form's
    assert.equal(readFormPost("Mahomes, Patrick KCC QB: 3 years"), null);
    assert.equal(readFormPost("Allar - 4 years"), null);
});

test("a team's lengths: its latest form post per player; posts by hand are flagged while any is missing", () => {
    const at = (franchise, postTime, body) => ({franchise, postTime: String(postTime), body});
    const posts = [
        at("0001", 100, formPost([{player: players.get("1"), years: 2}, {player: players.get("2"), years: 9}])),
        at("0001", 200, "Mahomes 3, Kelce 2"),
        at("0001", 300, formPost([{player: players.get("1"), years: 4}])),
        at("0001", 400, "Thanks all, good draft"),
        at("0002", 150, formPost([{player: players.get("2"), years: 1}]))
    ];
    // 9 years isn't a length; another team's post isn't this one's
    const some = formLengths({posts, franchiseId: "0001", due: ["1", "2"], players});
    assert.deepEqual([...some.years], [["1", 4]]);
    assert.deepEqual(some.unread.map((post) => post.body), ["Mahomes 3, Kelce 2"]);
    // nothing missing: nothing to flag
    const all = formLengths({posts, franchiseId: "0001", due: ["1"], players});
    assert.deepEqual([[...all.years], all.unread], [[["1", 4]], []]);
});

test("a name two of a team's players share is told apart by NFL team and position; one is matched by name alone", () => {
    const both = formPost([{player: players.get("3"), years: 1}, {player: players.get("4"), years: 5}]);
    const read = formLengths({posts: [{franchise: "0001", postTime: "1", body: both}], franchiseId: "0001", due: ["3", "4"], players});
    assert.deepEqual([...read.years], [["3", 1], ["4", 5]]);
    // since the post, he signed with another NFL team
    const moved = formPost([{player: {...players.get("1"), team: "FA"}, years: 2}]);
    assert.deepEqual([...formLengths({posts: [{franchise: "0001", postTime: "1", body: moved}], franchiseId: "0001", due: ["1"], players}).years], [["1", 2]]);
});

test("the topics a form post can be in: any with \"contract\" in its name", () => {
    const board = {thread: [{id: "1", subject: "Rosters loaded, contract lengths due by EOD"}, {id: "2", subject: "Trade talk"}, {id: "3", subject: "Contract lengths"}]};
    assert.deepEqual(lengthTopics(board).map((thread) => thread.id), ["1", "3"]);
    assert.deepEqual(lengthTopics({thread: {id: "4", subject: "Contracts"}}).map((thread) => thread.id), ["4"]);
});
