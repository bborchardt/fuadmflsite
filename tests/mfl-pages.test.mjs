// MFL's pages as each kind of viewer gets them (the capture bookmark's, in tests/fixtures/pages): what
// v2 reads or restyles on each, and what each viewer is shown. Guest pages are the real league's,
// the member's (0001) and the commissioner's the clone's. Which of v2's screens takes each page in a
// browser, the IR and Trades pages included (their readers need a browser's forms), is
// tools/verify/pages.py's to check.

import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseHTML} from "linkedom";
import {readLineupPage} from "../site/v2/ui/lineup-model.js";
import {readPlayerLists} from "../site/v2/ui/add-model.js";
import {readRoster} from "../site/v2/ui/drop-model.js";
import {readBidRun} from "../site/v2/ui/bids-model.js";
import {readScoring, readSettings} from "../site/v2/ui/rules-model.js";
import {readPowerPage} from "../site/v2/ui/league-model.js";
import {readCareer, readChampions, readSeries} from "../site/v2/ui/history-model.js";
import {readSkinForm} from "../site/v2/ui/looks.js";
import {readPlayerPage} from "../site/v2/ui/player-page.js";
import {restyleBoard, restyleReply, restyleSidePage, restyleTopic} from "../site/v2/ui/topic.js";

const VIEWERS = ["guest", "member", "commish"];
const html = (viewer, name) => readFileSync(new URL(`./fixtures/pages/${viewer}/${name}.html`, import.meta.url), "utf8");
const doc = (viewer, name) => parseHTML(html(viewer, name)).document;
const served = (viewer, name) => {
    const manifest = JSON.parse(readFileSync(new URL(`./fixtures/pages/${viewer}/manifest.json`, import.meta.url), "utf8"));
    const page = manifest.pages.find((entry) => entry.name === name);
    return new URL(page.served || page.url).pathname;
};

test("a guest asking for what needs a login gets MFL's login page, which v2 doesn't read", () => {
    for (const name of ["lineup", "options-O02", "add_drop", "options-O257", "options-O18", "options-O05", "options-O76", "processed_waivers"]) {
        assert.equal(served("guest", name), "/2026/login", name);
    }
    assert.equal(readLineupPage(doc("guest", "lineup")), null);
    assert.deepEqual(readPlayerLists(html("guest", "add_drop")).add || [], []);
    assert.deepEqual(readRoster(html("guest", "options-O257")), []);
    assert.equal(readBidRun(html("guest", "processed_waivers")), null);
    assert.equal(readSkinForm(doc("guest", "csetup-SKIN")), null);
});

test("the commissioner gets MFL's team picker for Lineup, Drop, IR and Trades, which v2 doesn't read", () => {
    for (const name of ["options-O02", "options-O257", "options-O18", "options-O05"]) {
        assert.equal(served("commish", name), "/2026/select_franchise", name);
    }
    assert.equal(readLineupPage(doc("commish", "lineup")), null);
    assert.deepEqual(readRoster(html("commish", "options-O257")), []);
});

test("a member's Moves pages and Lineup read as v2 knows them", () => {
    assert.equal(readLineupPage(doc("member", "lineup")).week, 8);
    assert.equal(readLineupPage(doc("member", "options-O02")).team, "0001");
    assert.ok(readPlayerLists(html("member", "add_drop")).add.length > 100);
    assert.equal(readRoster(html("member", "options-O257")).length, 31);
});

test("All bids reads for anyone logged in", () => {
    for (const viewer of ["member", "commish"]) {
        assert.ok(readBidRun(html(viewer, "processed_waivers")), viewer);
        assert.ok(doc(viewer, "processed_waivers").querySelector("select[name=PERIOD]"), viewer);
    }
});

test("Rules, Power, History and the player page read for every viewer", () => {
    for (const viewer of VIEWERS) {
        assert.ok(readScoring(doc(viewer, "options-O09")), viewer);
        assert.ok(readSettings(doc(viewer, "options-O26")), viewer);
        assert.equal(Object.keys(readPowerPage(html(viewer, "options-O101"))).length, 10, viewer);
        assert.ok(readCareer(html(viewer, "options-O208")), viewer);
        assert.ok(readPlayerPage(html(viewer, "player")), viewer);
    }
    // the real league has titles; the clone, a new league, none yet
    assert.ok(readChampions(html("guest", "options-O194")).length > 10);
    assert.deepEqual(readChampions(html("member", "options-O194")), []);
    // a series page reads only once games have been played: the clone has none
    assert.ok(readSeries(html("guest", "options-O171")));
    assert.equal(readSeries(html("member", "options-O171")), null);
});

test("Looks reads the skin page for anyone logged in", () => {
    for (const viewer of ["member", "commish"]) {
        assert.ok(readSkinForm(doc(viewer, "csetup-SKIN")), viewer);
    }
});

test("the board: New topic, Options and Messages for anyone logged in; Search only for a guest", () => {
    const board = (viewer) => {
        const page = doc(viewer, "mb-board_show");
        assert.equal(restyleBoard(page, {guest: viewer === "guest"}), true, viewer);
        return page.getElementById("fuad-topics");
    };
    const guest = board("guest");
    assert.equal(guest.querySelector(".fuad-chip"), null);
    assert.deepEqual([...guest.querySelectorAll(".fuad-board-links a")].map((a) => a.textContent), ["Search"]);
    assert.ok(guest.querySelectorAll(".fuad-board-topic").length > 5);
    for (const viewer of ["member", "commish"]) {
        const shown = board(viewer);
        assert.deepEqual([...shown.querySelectorAll(".fuad-chip")].map((chip) => chip.textContent.trim()), ["New topic"], viewer);
        assert.deepEqual([...shown.querySelectorAll(".fuad-board-links a")].map((a) => a.textContent), ["Search", "Options", "Messages"], viewer);
    }
    // a guest's list read as a member's lacks New topic, so v2 leaves it
    assert.equal(restyleBoard(doc("guest", "mb-board_show")), false);
    // options?O=28 is the board itself
    assert.equal(served("member", "options-O28"), "/2026/mb/board_show.pl");
});

test("a topic: Reply, Quote and Edit on a member's own posts; nothing for a guest", () => {
    const posts = (viewer, name = "mb-topic_show") => {
        const page = doc(viewer, name);
        assert.equal(restyleTopic(page, {guest: viewer === "guest"}), true, `${viewer} ${name}`);
        return [...page.querySelectorAll(".fuad-post")];
    };
    const actions = (post) => [...post.querySelectorAll(".fuad-post-actions a, .fuad-post-actions button")].map((a) => a.textContent.trim());
    for (const post of posts("guest")) {
        assert.deepEqual(actions(post), []);
    }
    assert.ok(posts("guest", "mb-topic_show-long").length > 10);
    for (const viewer of ["member", "commish"]) {
        assert.deepEqual(actions(posts(viewer)[0]), ["Reply", "Quote", "Edit"], viewer);
    }
    // a guest's topic read as a member's lacks Reply, so v2 leaves it
    assert.equal(restyleTopic(doc("guest", "mb-topic_show")), false);
});

test("reply, new topic and edit forms restyle for anyone logged in; a guest gets no new topic form", () => {
    for (const viewer of ["member", "commish"]) {
        for (const name of ["mb-post_add", "mb-post_edit", "mb-topic_add"]) {
            assert.equal(restyleReply(doc(viewer, name)), true, `${viewer} ${name}`);
        }
    }
    assert.equal(restyleReply(doc("guest", "mb-topic_add")), false);
});

test("private messages and board options restyle for anyone logged in; a guest gets only Search", () => {
    const side = (viewer, page) => restyleSidePage(page, "board", doc(viewer, `mb-${page}`));
    for (const viewer of ["member", "commish"]) {
        for (const page of ["message_list", "message_add", "user_options", "forum_search"]) {
            assert.equal(side(viewer, page), true, `${viewer} ${page}`);
        }
    }
    for (const page of ["message_list", "message_add", "user_options"]) {
        assert.equal(side("guest", page), false, page);
    }
    assert.equal(side("guest", "forum_search"), true);
});
