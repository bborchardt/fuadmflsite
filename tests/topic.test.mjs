import {test} from "node:test";
import assert from "node:assert/strict";
import {dayOnly, shortDate, topicTitle} from "../site/v2/ui/topic.js";

test("a post's date drops the seconds, the time zone and the year", () => {
    assert.equal(shortDate("\n Wed Sep 9 11:11:12 p.m. CT 2026\n"), "Wed Sep 9 · 11:11 p.m.");
    assert.equal(shortDate("Sat Oct 17 10:53:42 a.m. CT 2026"), "Sat Oct 17 · 10:53 a.m.");
    assert.equal(shortDate("yesterday"), "yesterday");
});

test("the topic bar gives the topic's name and views", () => {
    assert.deepEqual(topicTitle("Topic Fuad Reveiz Fan Club Dynasty League Message Board / Free Agent Contracts (103 hits)"), {title: "Free Agent Contracts", hits: 103});
    assert.deepEqual(topicTitle("Topic Board / Rules (1,204 hits)"), {title: "Rules", hits: 1204});
    assert.equal(topicTitle("Something else"), null);
});

test("the topic list dates a topic by its last post's day, as Home does", () => {
    assert.equal(dayOnly("Sun Oct 18 3:29:08 p.m. CT 2026"), "Oct 18");
    assert.equal(dayOnly(" Tue Sep 8 1:44:30 p.m. CT 2026 "), "Sep 8");
    assert.equal(dayOnly("yesterday"), "yesterday");
});
