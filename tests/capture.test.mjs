import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {contextOf, crc32, fixedPages, safeLink, scrub, topicLinks, topicsOn, viewerOf, zip} from "../site/capture/capture-model.js";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("the viewer is the commissioner, a member or a guest", () => {
    assert.equal(viewerOf("0000"), "commish");
    assert.equal(viewerOf("0003"), "member");
    assert.equal(viewerOf(undefined), "guest");
});

test("the league comes from the page's address, the home page's or any other", () => {
    assert.deepEqual(contextOf(new URL("https://www44.myfantasyleague.com/2026/home/50965#0"), "0001"),
        {origin: "https://www44.myfantasyleague.com", season: "2026", leagueId: "50965", franchiseId: "0001", viewer: "member"});
    assert.equal(contextOf(new URL("https://www44.myfantasyleague.com/2026/mb/board_show.pl?bid=202650965"), null), null);
    assert.equal(contextOf(new URL("https://www44.myfantasyleague.com/2026/mb/board_show.pl?bid=202650965"), null, "50965").leagueId, "50965");
    assert.equal(contextOf(new URL("https://www44.myfantasyleague.com/2026/options?L=50965&O=28"), null).viewer, "guest");
});

test("only a member gets a trade proposal page, with another team", () => {
    assert.equal(fixedPages({season: "2026", leagueId: "50965", franchiseId: "0001"})["options-O05-propose"], "options?L=50965&O=05&FRANCHISE=0001,0002");
    assert.equal(fixedPages({season: "2026", leagueId: "50965", franchiseId: "0000"})["options-O05-propose"], undefined);
    assert.equal(fixedPages({season: "2026", leagueId: "50965", franchiseId: null})["mb-board_show"], "mb/board_show.pl?bid=202650965");
});

test("links that change something are never followed", () => {
    assert.equal(safeLink("message_delete.pl?all=1"), false);
    assert.equal(safeLink("post_add_x.pl?tid=1"), false);
    assert.equal(safeLink("post_add.pl?tid=1"), true);
});

test("the board gives its first topic and its longest", () => {
    const topics = topicsOn(fixture("board-show-guest.html"));
    assert.equal(topics["mb-topic_show"], "topic_show.pl?bid=202648571&tid=6758929");
    assert.match(topics["mb-topic_show-long"] || topics["mb-topic_show"], /^topic_show\.pl\?bid=202648571&tid=\d+$/);
    assert.deepEqual(topicsOn("<p>No topics</p>"), {});
});

test("a guest's topic has no reply or edit form to follow", () => {
    assert.deepEqual(topicLinks(fixture("topic-show-guest.html")), {});
    assert.deepEqual(topicLinks("<a href='post_add.pl?tid=1&amp;pid=2'>Reply</a><a href=\"post_edit.pl?pid=2\">Edit</a>", "-long"),
        {"mb-post_add-long": "post_add.pl?tid=1&pid=2", "mb-post_edit-long": "post_edit.pl?pid=2"});
});

test("emails, phone numbers and the apiKey come out; MFL's support address stays", () => {
    const html = `var apiKey = "abc123XYZ";<a href="mailto:jo.smith@gmail.com,a@b.org">x</a> support@myfantasyleague.com
        <img src="x?APIKEY=zzz&L=1"> <a href="tel:+16125550199">(612) 555-0199</a> 612.555.0199 score 123.45`;
    const out = scrub(html);
    assert.doesNotMatch(out, /abc123XYZ|jo\.smith|a@b\.org|zzz|612/);
    assert.match(out, /var apiKey = "saved-sample"/);
    assert.match(out, /support@myfantasyleague\.com/);
    assert.match(out, /score 123\.45/);
    assert.doesNotMatch(scrub("612 555 0199 jo%40gmail.com jo&#64;gmail.com apiKey: 'k1'"), /612|jo|k1/);
    assert.match(scrub('<img src="logo@2x.png">'), /logo@2x\.png/);
});

test("the board's per-member token and private message subjects come out", () => {
    const html = `<a href="post_add.pl?tid=1;auth=f00d1e">Reply</a><input type="hidden" name="auth" value="f00d1e">
        <input type='hidden' value='5ec' name='sid'><input name="subject" value="Hi">
        <a href="message_show.pl?mid=9">Trade talk, keep quiet</a>`;
    const out = scrub(html);
    assert.doesNotMatch(out, /f00d1e|5ec|keep quiet/);
    assert.match(out, /tid=1;auth=saved-sample/);
    assert.match(out, /name="subject" value="Hi"/);
    assert.match(out, /mid=9">A message</);
});

test("the zip holds each page as written", () => {
    assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
    const files = {"member/home.html": "<p>Home</p>", "member/manifest.json": "{\"é\":1}"};
    const bytes = zip(files);
    const view = new DataView(bytes.buffer);
    const read = {};
    let at = 0;
    while (view.getUint32(at, true) === 0x04034b50) {
        const size = view.getUint32(at + 18, true);
        const nameLength = view.getUint16(at + 26, true);
        const name = new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + nameLength));
        const data = bytes.subarray(at + 30 + nameLength, at + 30 + nameLength + size);
        assert.equal(view.getUint32(at + 14, true), crc32(data));
        read[name] = new TextDecoder().decode(data);
        at += 30 + nameLength + size;
    }
    assert.deepEqual(read, files);
    // the directory's end says how many
    assert.equal(view.getUint16(bytes.length - 22 + 10, true), 2);
});
