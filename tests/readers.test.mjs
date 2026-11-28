// Every reader of MFL's pages and feeds tells a page it doesn't recognise from one with nothing on it
// (docs/design.md: Outside change): on its own page it reads something, and on another MFL page, MFL's
// login page or an empty page it returns null or throws, never an empty result that would read as
// "none". A new reader goes in READERS, or in NOT_PAGES with what it reads instead.

import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {parseHTML} from "./fixtures/dom.mjs";
import {mflProgram} from "../site/v2/lib/mfl.js";
import {readLineupDetails, readTopicPage} from "../site/v2/lib/backups.js";
import {readProcessedWaivers} from "../site/v2/lib/contract-years.js";
import {readPlayerLists} from "../site/v2/ui/add-model.js";
import {readRoster} from "../site/v2/ui/drop-model.js";
import {readBidRun} from "../site/v2/ui/bids-model.js";
import {readLineupPage} from "../site/v2/ui/lineup-model.js";
import {readProposal, readTradesPage} from "../site/v2/ui/trades-model.js";
import {readSkinForm} from "../site/v2/ui/looks.js";
import {readCustomizeForm} from "../site/v2/ui/width.js";
import {readPowerPage} from "../site/v2/ui/league-model.js";
import {readCareer, readChampions, readSeries} from "../site/v2/ui/history-model.js";
import {readArticle, readPlayerPage} from "../site/v2/ui/player-page.js";
import {readScoring, readSettings} from "../site/v2/ui/rules-model.js";
import {readProjections, readStats} from "../site/v2/ui/live-scoring.js";
import {readChat} from "../site/v2/ui/home-feeds.js";
import {readIRPage} from "../site/v2/ui/ir-model.js";
import {readSetupNav} from "../site/v2/ui/setup.js";
import {readLineupForm} from "../jobs/backup-starters.mjs";
import {pageChecks} from "../jobs/mfl-check.mjs";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const doc = (html) => parseHTML(html).document;
const onDoc = (read) => (html) => read(doc(html));

// a page that isn't the one asked for, MFL's login page (what a lapsed login gets), and an empty one
const OTHERS = {
    "another page": fixture("pages/guest/home.html"),
    "the login page": fixture("pages/guest/add_drop.html"),
    "an empty page": "<!DOCTYPE html><html><head></head><body></body></html>",
    "nothing": ""
};

// name: [read(text), its own page]
const READERS = {
    readProcessedWaivers: [readProcessedWaivers, fixture("processed-waivers.html")],
    readLineupDetails: [readLineupDetails, fixture("backups/lineup-details.html")],
    readTopicPage: [readTopicPage, fixture("backups/topic-conditional-starters.html")],
    readLineupForm: [(html) => readLineupForm(html, {team: "0002", week: 8}), fixture("backups/lineup-commish.html")],
    readPlayerLists: [readPlayerLists, fixture("pages/member/add_drop.html")],
    readRoster: [readRoster, fixture("pages/member/options-O257.html")],
    readBidRun: [readBidRun, fixture("pages/member/processed_waivers.html")],
    readLineupPage: [onDoc(readLineupPage), fixture("pages/member/lineup.html")],
    readTradesPage: [onDoc(readTradesPage), fixture("pages/member/options-O05.html")],
    readProposal: [onDoc((page) => readProposal(page, "0001")), fixture("pages/member/options-O05-propose.html")],
    readSkinForm: [onDoc(readSkinForm), fixture("pages/member/csetup-SKIN.html")],
    readCustomizeForm: [onDoc(readCustomizeForm), fixture("pages/member/csetup-FCUSTOM.html")],
    readSetupNav: [onDoc((page) => readSetupNav(page.querySelector("#withmenus > span.reportnavigation"))), fixture("pages/member/csetup-SKIN.html")],
    readIRPage: [onDoc((page) => readIRPage(page, "0001")), fixture("pages/member/options-O18.html")],
    readPowerPage: [readPowerPage, fixture("pages/guest/options-O101.html")],
    readChampions: [readChampions, fixture("history-champions.html")],
    readCareer: [readCareer, fixture("history-career.html")],
    readSeries: [readSeries, fixture("history-series-0005.html")],
    readPlayerPage: [readPlayerPage, fixture("player-13593.html")],
    readArticle: [readArticle, fixture("article-rotowire642709.html")],
    readScoring: [onDoc(readScoring), fixture("rules-scoring.html")],
    readSettings: [onDoc(readSettings), fixture("rules-settings.html")],
    readStats: [readStats, fixture("live-stats-w6.txt")],
    readProjections: [readProjections, fixture("live-proj-w6.txt")],
    readChat: [(xml) => readChat(xml, {viewer: "0001"}), fixture("chat.xml")]
};

// readers of what isn't one of MFL's pages or feeds, and why
const NOT_PAGES = {
    readRequests: "a member's post or lineup message",
    readFormPost: "a member's post",
    readYears: "a bid comment or post",
    readMarks: "a player's name as MFL marks it",
    readName: "a player's name as MFL's lineup form writes it",
    readPick: "a draft pick's id",
    readAuction: "the commissioner's pasted spreadsheet",
    readRookies: "the commissioner's pasted spreadsheet",
    readSnapshot: "the job's own snapshot in league-data",
    readCsv: "nflverse's weekly rosters",
    readRules: "the rules export, checked by fetchExport",
    readBack: "a move's result, read back through a reader above",
    readThreads: "fetches the thread pages for readTopicPage",
    readLineups: "fetches Lineup Details for readLineupDetails",
    readLastRun: "GitHub's list of the daily job's runs (tests/home-run.test.mjs)"
};

// nothing found reads as "none": a list, map or object of them with nothing in it
function empty(value) {
    if (Array.isArray(value)) return value.length === 0;
    if (value instanceof Map) return value.size === 0;
    if (value && typeof value === "object") return Object.values(value).every((part) => part === null || empty(part) || part === 0 || part === "");
    return false;
}

for (const [name, [read, own]] of Object.entries(READERS)) {
    test(`${name} reads its own page, and only its own`, () => {
        const found = read(own);
        assert.ok(found && !empty(found), `${name} found nothing on its own page`);
        for (const [what, page] of Object.entries(OTHERS)) {
            let found;
            try {
                found = read(page);
            } catch {
                continue;
            }
            assert.ok(found === null || found === undefined, `${name} on ${what} returned ${JSON.stringify(found, (key, value) => (value instanceof Map ? [...value] : value)).slice(0, 80)}, not null`);
        }
    });
}

// every exported read*: from site/v2 and jobs/, listed in one of the two
test("every reader is listed: of MFL's pages, or of something else", () => {
    const files = [
        ...readdirSync(new URL("../site/v2/lib/", import.meta.url)).map((file) => `../site/v2/lib/${file}`),
        ...readdirSync(new URL("../site/v2/ui/", import.meta.url)).map((file) => `../site/v2/ui/${file}`),
        ...readdirSync(new URL("../jobs/", import.meta.url)).map((file) => `../jobs/${file}`)
    ].filter((file) => /\.m?js$/.test(file));
    const exported = files.flatMap((file) => [...readFileSync(new URL(file, import.meta.url), "utf8")
        .matchAll(/^export (?:async )?(?:function|const) (read[A-Z]\w*)/gm)].map((match) => match[1]));
    const unlisted = exported.filter((name) => !(name in READERS) && !(name in NOT_PAGES));
    assert.deepEqual(unlisted, [], "add each to READERS (with its own page) or NOT_PAGES (with what it reads)");
    const gone = [...Object.keys(READERS), ...Object.keys(NOT_PAGES)].filter((name) => !exported.includes(name));
    assert.deepEqual(gone, []);
});

// the daily job reads MFL's pages for its chores with these, on the days a chore needs them
const CHORES_READ = {
    readProcessedWaivers: "contract years, after a bid run",
    readLineupDetails: "backup starters, after a week's games",
    readTopicPage: "backup starters",
    readLineupForm: "backup starters, when one is due"
};

// so a change MFL made shows in the job's run before a member meets it (jobs/mfl-check.mjs)
test("every reader of MFL's pages is tried on MFL's live page by the daily job", async () => {
    const context = {season: 2026, leagueId: "48571", franchise: "0001", partner: "0002", playerId: "13593", week: 6, inSeason: true};
    const checked = new Set((await pageChecks(context)).flatMap((each) => each.uses));
    assert.deepEqual(Object.keys(READERS).filter((name) => !checked.has(name) && !(name in CHORES_READ)), [], "add each to jobs/mfl-check.mjs");
});

test("mflProgram names the page MFL drew, from its HTML or a document", () => {
    assert.equal(mflProgram(fixture("pages/member/options-O101.html")), "options_101");
    assert.equal(mflProgram(doc(fixture("pages/member/add_drop.html"))), "add_drop");
    assert.equal(mflProgram(OTHERS["the login page"]), "login");
    assert.equal(mflProgram(OTHERS["an empty page"]), null);
    assert.equal(mflProgram(doc(OTHERS["an empty page"])), null);
    assert.equal(mflProgram(""), null);
});

test("MFL's IR page is read whole, the table MFL leaves open as a browser repairs it", () => {
    const page = readIRPage(doc(fixture("pages/member/options-O18.html")), "0001");
    assert.deepEqual({active: page.active.length, reserve: page.reserve.length}, {active: 29, reserve: 2});
});
