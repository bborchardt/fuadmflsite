// jobs/mfl-check.mjs: on the saved pages and exports every read is as v2 expects, and a page or
// export MFL changed is named, while one it couldn't be asked for this time isn't taken for a change.

import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {join} from "node:path";
import {checkShape} from "../site/v2/lib/shapes.js";
import {checkMfl} from "../jobs/mfl-check.mjs";

const fixtures = join(import.meta.dirname, "fixtures");
const fixture = (name) => readFileSync(join(fixtures, name), "utf8");

// each saved export's section, as tests/export-shapes.test.mjs finds them
const sections = new Map();
for (const file of readdirSync(fixtures).filter((name) => name.endsWith(".json"))) {
    for (const [section, body] of Object.entries(JSON.parse(fixture(file)))) {
        if (!sections.has(section) && body && typeof body === "object") {
            sections.set(section, body);
        }
    }
}
// none saved: as docs/mfl.md has them
sections.set("pendingWaivers", {blindBidWaiverRequest: {round: "1", addsDrops: "13753_1_16619"}});
sections.set("pendingTrades", {pendingTrade: [{trade_id: "9", offeringteam: "0003", offeredto: "0001", will_give_up: "13604,", will_receive: "14800,"}]});
sections.set("playoffBrackets", {playoffBracket: [{id: "1"}]});
sections.set("projectedScores", {playerScore: [{id: "13593", score: "18.5"}]});

const asked = [];
function savedExport({type, section = type}) {
    asked.push(type);
    if (!sections.has(section)) {
        throw new Error(`no saved ${section}`);
    }
    return checkShape(section, structuredClone(sections.get(section)));
}

// the saved member pages (the clone's team 0001), by the path the check asks for; the clone has no
// past seasons, so its series page has no rows, and the real league's is read in its place
function savedPage(path) {
    const url = new URL(path, "https://www44.myfantasyleague.com");
    const params = url.searchParams;
    const name = (/\/([^/]+)$/.exec(url.pathname) || [])[1];
    const file = name === "options" && params.get("O") === "171" ? "history-series-0005.html"
        : name === "options" ? `pages/member/options-O${params.get("O")}${params.get("FRANCHISE") ? "-propose" : ""}.html`
        : name === "csetup" ? `pages/member/csetup-${params.get("C")}.html`
            : name === "view_news_article" ? "article-rotowire642709.html"
                : name === "live_stats_05.txt" ? "live-stats-w5.txt"
                    : name === "live_proj_06.txt" ? "live-proj-w6.txt"
                        : name === "50965_chat.xml" ? "chat.xml"
                            : `pages/member/${name}.html`;
    return {status: 200, body: fixture(file)};
}

const CONTEXT = {season: 2026, leagueId: "50965", franchise: "0001", partner: "0002", playerId: "13593", inSeason: true};
const pages = [];
const run = (context = CONTEXT, {exportRead = savedExport, pageRead = savedPage} = {}) => checkMfl(context, {exportRead, pageRead: (path) => {
    pages.push(path);
    return pageRead(path);
}});

test("on the saved pages and exports, every read is as v2 expects", async () => {
    asked.length = 0;
    pages.length = 0;
    const result = await run();
    assert.deepEqual(result.changed, []);
    assert.deepEqual(result.unchecked, []);
    assert.equal(result.count, asked.length + pages.length);
    // the week is the live scoring's, so the stats feed is week 5's and the projections week 6's
    assert.ok(pages.includes("/fflnetdynamic2026/live_stats_05.txt") && pages.includes("/fflnetdynamic2026/live_proj_06.txt"));
    // and the article the player's page names
    assert.ok(pages.includes("/2026/view_news_article?L=50965&ID=rotowire644769"), pages.join("\n"));
    assert.ok(pages.includes("/2026/options?L=50965&O=05&FRANCHISE=0001,0002"));
});

test("a page that isn't the one v2 reads is named as changed, by what it is and where", async () => {
    const other = fixture("pages/guest/home.html");
    const {changed, unchecked} = await run(CONTEXT, {pageRead: () => ({status: 200, body: other})});
    assert.deepEqual(unchecked, []);
    assert.ok(changed.includes("Add/Drop (/2026/add_drop?L=50965): v2 can't read it"), changed.join("\n"));
    assert.ok(changed.some((item) => item.startsWith("the chat feed")));
    // the article is found on the player's page, so without one it isn't asked for
    assert.ok(!changed.some((item) => item.startsWith("a news article")));
});

test("a missing field or a page gone is a change; a refusal, an error or MFL's home page is only unchecked", async () => {
    const exportRead = (each) => {
        if (each.type === "futureDraftPicks") {
            return checkShape("futureDraftPicks", {franchise: [{futureDraftPick: [{year: "2027", round: "1"}]}]});
        }
        if (each.type === "rules") {
            throw Object.assign(new Error("Couldn't load rules: HTTP 404"), {status: 404});
        }
        if (each.type === "schedule") {
            throw Object.assign(new Error("Couldn't load schedule: HTTP 429"), {status: 429});
        }
        return savedExport(each);
    };
    const pageRead = (path) => {
        if (path.includes("O=101")) {
            return {status: 404, body: ""};
        }
        if (path.includes("O=194")) {
            return {status: 500, body: ""};
        }
        if (path.includes("O=208")) {
            throw new Error("MFL turned it away with its home page 3 times");
        }
        if (path.includes("O=09")) {
            return {status: 200, body: "<title>MyFantasyLeague Home Page</title>"};
        }
        return savedPage(path);
    };
    const {changed, unchecked} = await run(CONTEXT, {exportRead, pageRead});
    assert.deepEqual(changed, ["Couldn't load rules: HTTP 404", "Couldn't load futureDraftPicks: MFL's export has changed: franchise 1 has no id",
        "Power Rankings (/2026/options?L=50965&O=101): MFL answered HTTP 404"]);
    assert.deepEqual(unchecked, ["Couldn't load schedule: HTTP 429", "Couldn't load League Rules: MFL sent its own home page instead",
        "Couldn't load League Champions: HTTP 500", "Couldn't load Career Records: MFL turned it away with its home page 3 times"]);
});

test("Lineup's refusal in place of the form is as v2 takes it, not a change", async () => {
    const refusal = fixture("lineup-refused-2025.html");
    const {changed} = await run(CONTEXT, {pageRead: (path) => (path.includes("/lineup?") ? {status: 200, body: refusal} : savedPage(path))});
    assert.deepEqual(changed, []);
});

test("without the login's team, only the exports; out of season, nothing of a week", async () => {
    pages.length = 0;
    asked.length = 0;
    await run({...CONTEXT, franchise: null});
    assert.deepEqual(pages, []);
    assert.ok(asked.includes("liveScoring"));
    asked.length = 0;
    await run({...CONTEXT, inSeason: false});
    assert.ok(!asked.some((type) => ["liveScoring", "projectedScores", "nflSchedule"].includes(type)), asked.join());
    assert.ok(!pages.some((path) => /live_/.test(path)), pages.join("\n"));
});
