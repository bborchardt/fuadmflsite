import {test} from "node:test";
import assert from "node:assert/strict";
import {shortDate, topicTitle} from "../site/v2/ui/topic.js";

test("a post's date drops the seconds, the time zone and the year", () => {
    assert.equal(shortDate(" Date Wed Sep 9 11:11:12 p.m. CT 2026 ".replace("Date", "")), "Wed Sep 9 · 11:11 p.m.");
    assert.equal(shortDate("Sat Oct 17 10:53:42 a.m. CT 2026"), "Sat Oct 17 · 10:53 a.m.");
    assert.equal(shortDate("yesterday"), "yesterday");
});

test("the topic bar gives the topic's name and views", () => {
    assert.deepEqual(topicTitle("Topic Fuad Reveiz Fan Club Dynasty League Message Board / Free Agent Contracts (103 hits)"), {title: "Free Agent Contracts", hits: 103});
    assert.equal(topicTitle("Something else"), null);
});
