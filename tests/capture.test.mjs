import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PRIVATE_FIELDS, contextOf, crc32, fixedPages, ownersOf, safeLink, scrub, topicLinks, topicsOn, viewerOf, zip} from "../site/capture/capture-model.js";

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
    const pages = fixedPages({season: "2026", leagueId: "50965", franchiseId: "0001"});
    for (const name of PRIVATE_FIELDS) {
        assert.ok(pages[name], name);
    }
    assert.ok(!Object.values(pages).some((path) => /FUNLINK/.test(path)));
});

test("links that change something are never followed", () => {
    assert.equal(safeLink("message_delete.pl?all=1"), false);
    assert.equal(safeLink("post_add_x.pl?tid=1"), false);
    assert.equal(safeLink("post_add.pl?tid=1"), true);
});

test("the board gives its first topic and its longest", () => {
    assert.deepEqual(topicsOn(fixture("pages/guest/mb-board_show.html")),
        {"mb-topic_show": "topic_show.pl?bid=202648571&tid=6758929", "mb-topic_show-long": "topic_show.pl?bid=202648571&tid=6737097"});
    assert.deepEqual(topicsOn("<p>No topics</p>"), {});
});

test("a guest's topic has no reply or edit form to follow", () => {
    assert.deepEqual(topicLinks(fixture("pages/guest/mb-topic_show.html")), {});
    // a member's, with a post of their own
    assert.deepEqual(topicLinks(fixture("pages/member/mb-topic_show.html")),
        {"mb-post_add": "post_add.pl?bid=202650965&pid=23216675", "mb-post_edit": "post_edit.pl?bid=202650965&pid=23216675"});
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

test("with fields, what a member typed in a field comes out, and the form's own values stay", () => {
    const html = `<input type="text" name="PHONE" value="6125550199"><input name=CELL value=6125550199>
        <input type="tel" value='612-555-0199' name="X"><textarea name="ADDR">1 Main St</textarea>
        <input type="hidden" name="C" value="FCONTACT"><input type="radio" name="CARRIER" value="att" checked>
        <input type="submit" name="SUBMIT" value="Save">`;
    const out = scrub(html, [], {fields: true});
    assert.doesNotMatch(out, /612|Main St/);
    assert.match(out, /name="C" value="FCONTACT"/);
    assert.match(out, /name="CARRIER" value="att"/);
    assert.match(out, /value="Save"/);
    assert.match(scrub('<input name="PHONE" value="6125550199">'), /6125550199/);
});

test("an owner's name in Franchise setup's fields comes out, one word or not", () => {
    const html = `<input type="text" name="FRANCHISE_OWNER_NAME0002" value="Dana" size="20">
        <input name=FRANCHISE_OWNER_NAME0003 value='Lee Ray'><input name="FRANCHISE_NAME0002" value="Dana's Team">`;
    const out = scrub(html);
    assert.match(out, /name="FRANCHISE_OWNER_NAME0002" value="Owner 0002" size="20"/);
    assert.match(out, /name=FRANCHISE_OWNER_NAME0003 value="Owner 0003">/);
    assert.match(out, /value="Dana's Team"/);
});

test("a value holding the other kind of quote comes out whole", () => {
    const out = scrub(`<input name="FRANCHISE_OWNER_NAME0002" value="Mary O'Brien"><input value='Say "Hi" Bo' name="FRANCHISE_OWNER_NAME0003">
        <input data-value="x" name="FRANCHISE_OWNER_NAME0004" value="Dana Lee"><input type="hidden" name="auth" value="ab'cd">`);
    assert.doesNotMatch(out, /Brien|Hi|Bo'|Dana|cd/);
    assert.match(out, /name="FRANCHISE_OWNER_NAME0002" value="Owner 0002">/);
    assert.match(out, /data-value="x"/);
    assert.match(scrub('<input type="hidden" name="auth"value="f00d1e">'), /name="auth"value="saved-sample">/);
    assert.match(scrub(`<input type="text" name="PHONE" value="Jo's cell 6125550199">`, [], {fields: true}), /name="PHONE" value="">/);
});

test("the board's per-member token and private message subjects come out", () => {
    const html = `<a href="post_add.pl?tid=1;auth=f00d1e">Reply</a><input type="hidden" name="auth" value="f00d1e">
        <input type='hidden' value='5ec' name='sid'><input name="subject" value="Hi">
        <a href="message_show.pl?mid=9">Trade talk, keep quiet</a>
        <a href='message_show.pl?mid=10' title='Don&#39;t tell the league'>Re: trade</a>`;
    const out = scrub(html);
    assert.doesNotMatch(out, /f00d1e|5ec|keep quiet|tell the league|Re: trade/);
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

test("owners' names become their team's placeholder; a one-word name only as an owner", () => {
    const owners = ownersOf({league: {franchises: {franchise: [
        {id: "0001", owner_name: "Sam Rivera"}, {id: "0004", owner_name: "Dana O'Toole"}, {id: "0002", owner_name: "Pat"}, {id: "0003", owner_name: ""}
    ]}}});
    assert.deepEqual(owners.map((owner) => owner.id), ["0001", "0004", "0002"]);
    const html = `<a title="Owner: Sam Rivera, Record: 6-1-0">A</a> <a title='Owner: Dana O'Toole, Record'>B</a>
        <a title="Owner: Pat, Record: 0-0-0">C</a> Dana O&#39;Toole posted; Sam&nbsp;Rivera too. Pat Freiermuth scored. {"owner_name":"Pat"}`;
    const out = scrub(html, owners);
    assert.doesNotMatch(out, /Rivera|Toole|Owner: Pat|"owner_name":"Pat"/);
    assert.match(out, /Owner: Owner 0001, Record/);
    assert.match(out, /Owner: Owner 0004, Record/);
    assert.match(out, /Owner 0004 posted; Owner 0001 too/);
    assert.match(out, /Owner: Owner 0002, Record/);
    assert.match(out, /Pat Freiermuth scored/);
    assert.match(out, /"owner_name":"Owner 0002"/);
    assert.equal(ownersOf(null).length, 0);
});

test("a longer name goes first, and a name ending in a stop, an accent or an ampersand is still found", () => {
    const owners = ownersOf({league: {franchises: {franchise: [
        {id: "0001", owner_name: "Dana"}, {id: "0002", owner_name: "Dana O'Toole"}, {id: "0003", owner_name: "Bob Smith Jr."},
        {id: "0004", owner_name: "Zoë Adams-Zoë"}, {id: "0005", owner_name: "Bob & Sue"}
    ]}}});
    const out = scrub(`Owner: Dana O'Toole, Owner: Dana, Bob Smith Jr. said; Zoë Adams-Zoë too; Owner: Bob &amp; Sue, Bob Smith Jr.x`, owners);
    assert.equal(out, "Owner: Owner 0002, Owner: Owner 0001, Owner 0003 said; Owner 0004 too; Owner: Owner 0005, Bob Smith Jr.x");
});
