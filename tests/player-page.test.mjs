import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {holderOf, ownerOf, readArticle, readPlayerPage, text} from "../site/v2/ui/player-page.js";
import {clockText} from "../site/v2/ui/panel.js";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("MFL's player page gives the popup its player, contract, news and season", () => {
    const player = readPlayerPage(fixture("player-13593.html"));
    assert.equal(player.name, "Lamar Jackson");
    assert.equal(player.team, "BAL");
    assert.equal(player.position, "QB");
    assert.equal(player.jersey, "8");
    assert.deepEqual(player.injury, {status: "Out", detail: "Ankle"});
    assert.equal(player.expectedReturn, "Oct 25, 2026");
    assert.equal(player.owner, "All Hands on Beck");
    assert.equal(player.salary, 68);
    assert.equal(player.years, 1);
    assert.equal(player.bye, "13");
    assert.deepEqual(player.bio, {age: 29, born: "Jan 7, 1997", size: "6′2″ · 205 lbs", college: "Louisville", drafted: {year: "2018", pick: "round 1, pick 32"}, experience: "9"});
    assert.equal(player.news.length, 5);
    assert.deepEqual(player.news[0], {id: "rotowire642709", headline: "QB Lamar Jackson: Ruled out for Sunday's game", published: "1 day"});
    assert.equal(player.rows.length, 17);
    assert.deepEqual(player.rows[0], {week: 1, points: 22.5, opponent: "@ Colts", bye: false, started: true, mark: null});
    assert.deepEqual(player.rows[4], {week: 5, points: null, opponent: "@ Falcons", bye: false, started: false, mark: "Out"});
    assert.equal(player.rows[12].bye, true);
    assert.equal(player.total, 74.4);
});

test("a page MFL draws differently is left to MFL's own popup", () => {
    assert.equal(readPlayerPage("<html><body>Something else</body></html>"), null);
});

test("a news article: its source, time, update and analysis", () => {
    const article = readArticle(fixture("article-rotowire642709.html"));
    assert.equal(article.source, "Rotowire");
    assert.equal(article.published, "Fri Oct 16, 1:04 p.m. CT");
    assert.equal(readArticle(fixture("article-rotowire642709.html").replace("1:04:42 p.m. CT", "2:04:42 p.m. ET")).published, "Fri Oct 16, 1:04 p.m. CT");
    assert.match(article.update, /^Head coach Jesse Minter said Friday/);
    assert.match(article.analysis, /^Considering Jackson hasn't practiced/);
    assert.doesNotMatch(article.analysis, /Article Link|Premium/);
});

test("text: tags out, entities in, spaces collapsed", () => {
    assert.equal(text("All&nbsp;Hands <b>on</b>&#39;s &amp; Beck"), "All Hands on's & Beck");
});

test("times read as the league writes them", () => {
    assert.equal(clockText(new Date("2026-10-17T19:42:00-05:00")), "7:42 p.m. CT");
    assert.equal(clockText(new Date("2026-10-17T09:05:00-05:00")), "9:05 a.m. CT");
});

test("a free agent has no owner, whatever MFL writes for him", () => {
    const teams = ["All Hands on Beck", "Golden Ratio"];
    assert.equal(ownerOf("Golden Ratio", teams), "Golden Ratio");
    assert.equal(ownerOf("FA (Locked)", teams), "");
    assert.equal(ownerOf("Free Agent", teams), "");
});

test("MFL's team list may have spaces around a name the player page doesn't", () => {
    assert.equal(ownerOf("The Obliterators", ["The Obliterators ", "Golden Ratio"]), "The Obliterators ");
});

test("the team holding a player comes from the rosters, the player page's owner line only without them", () => {
    const teamNames = new Map([["0003", "The Obliterators "], ["0004", "Smooth City Styles!"]]);
    const holders = new Map([["14782", "0004"]]);
    // an owner line that isn't a team's name, as a logged-in member's page had for Smooth City Styles!
    assert.equal(holderOf({id: "14782", owner: "Smooth City Styles! (something else)"}, holders, teamNames), "0004");
    assert.equal(holderOf({id: "99999", owner: "Free Agent"}, holders, teamNames), null);
    assert.equal(holderOf({id: "11222", owner: "The Obliterators"}, null, teamNames), "0003");
    assert.equal(holderOf({id: "99999", owner: "FA (Locked)"}, null, teamNames), null);
});
