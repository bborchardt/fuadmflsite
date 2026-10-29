import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseHTML} from "linkedom";
import {dayOnly, insertTags, restyleBoard, restyleTopic, shortDate, topicTitle} from "../site/v2/ui/topic.js";

const page = (name) => parseHTML(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")).document;

test("a post's date drops the seconds, the time zone and the year", () => {
    assert.equal(shortDate("\n Wed Sep 9 11:11:12 p.m. CT 2026\n"), "Wed Sep 9 · 11:11 p.m.");
    assert.equal(shortDate("Sat Oct 17 10:53:42 a.m. CT 2026"), "Sat Oct 17 · 10:53 a.m.");
    assert.equal(shortDate("yesterday"), "yesterday");
});

test("the topic bar gives the topic's name and views", () => {
    assert.deepEqual(topicTitle("Topic Fuad Reveiz Fan Club Dynasty League Message Board / Free Agent Contracts (103 hits)"), {title: "Free Agent Contracts", hits: 103});
    assert.deepEqual(topicTitle("Topic Board / Rules (1,204 hits)"), {title: "Rules", hits: 1204});
    assert.deepEqual(topicTitle("Topic Board / Rules (Page 2) (1,204 hits)"), {title: "Rules", hits: 1204});
    assert.equal(topicTitle("Something else"), null);
});

test("the topic list dates a topic by its last post's day, as Home does", () => {
    assert.equal(dayOnly("Sun Oct 18 3:29:08 p.m. CT 2026"), "Oct 18");
    assert.equal(dayOnly(" Tue Sep 8 1:44:30 p.m. CT 2026 "), "Sep 8");
    assert.equal(dayOnly("yesterday"), "yesterday");
});

test("a format chip wraps the selection, or puts the cursor between its tags", () => {
    assert.deepEqual(insertTags("make bold now", 5, 9, "b", "b"), {text: "make [b]bold[/b] now", caret: 16});
    assert.deepEqual(insertTags("ab", 1, 1, "i", "i"), {text: "a[i][/i]b", caret: 4});
    assert.deepEqual(insertTags("", 0, 0, "url=", "url"), {text: "[url=][/url]", caret: 5});
    assert.deepEqual(insertTags("see site", 4, 8, "url=", "url"), {text: "see [url=]site[/url]", caret: 9});
    assert.deepEqual(insertTags("[url=x.com][/url]", 10, 10, "url=", "url"), {text: "[url=x.com][/url]", caret: 11});
    assert.deepEqual(insertTags("a [b]bold[/b] c", 9, 9, "b", "b"), {text: "a [b]bold[/b] c", caret: 13});
});

test("logged out, the topic list is redrawn without New topic", () => {
    const doc = page("pages/guest/mb-board_show.html");
    assert.equal(restyleBoard(doc, {guest: true}), true);
    const board = doc.getElementById("fuad-topics");
    assert.equal(board.querySelector(".fuad-chip"), null);
    assert.deepEqual([...board.querySelectorAll(".fuad-board-links a")].map((a) => a.textContent), ["Search"]);
    assert.equal(board.querySelector(".fuad-board-topic .fuad-row-title").textContent, "New League Site");
    // a member's list without New topic is one v2 doesn't know
    assert.equal(restyleBoard(page("pages/guest/mb-board_show.html")), false);
});

test("logged out, a topic's posts are cards without Reply", () => {
    const doc = page("pages/guest/mb-topic_show.html");
    assert.equal(restyleTopic(doc, {guest: true}), true);
    const post = doc.querySelector(".fuad-post");
    assert.equal(post.querySelector(".fuad-post-team").textContent, "Commissioner");
    // the commissioner has no team page to lead to
    assert.equal(post.querySelectorAll(".fuad-post-team a").length, 0);
    assert.equal(post.querySelector(".fuad-post-when").textContent, "Sun Oct 25 · 5:24 p.m.");
    assert.equal(post.querySelector(".fuad-post-actions").children.length, 0);
    assert.equal(restyleTopic(page("pages/guest/mb-topic_show.html")), false);
});
