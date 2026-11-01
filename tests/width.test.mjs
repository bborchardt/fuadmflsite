import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DOMParser, parseHTML} from "linkedom";
import {readCustomizeForm, saveFullWidth, widthMarkup} from "../site/v2/ui/width.js";

const fixture = readFileSync(new URL("./fixtures/pages/member/csetup-FCUSTOM.html", import.meta.url), "utf8");
const doc = (html) => parseHTML(html).document;
const turned = (value) => fixture
    .replace('value="No" checked="checked"', 'value="No"')
    .replace('id="USE_FULL_WIDTH0001_Yes" value="Yes"', `id="USE_FULL_WIDTH0001_Yes" value="Yes"${value === "Yes" ? ' checked="checked"' : ""}`)
    .replace('id="USE_FULL_WIDTH0001_No" value="No"', `id="USE_FULL_WIDTH0001_No" value="No"${value === "No" ? ' checked="checked"' : ""}`);

test("MFL's Customize form: every field as the browser sends it, and Full width", () => {
    const form = readCustomizeForm(doc(fixture));
    assert.equal(form.action, "csetup");
    assert.equal(form.fullWidth, "USE_FULL_WIDTH0001");
    assert.equal(form.on, false);
    assert.equal(form.submit, "Save Franchise Customization");
    const sent = Object.fromEntries(form.fields);
    assert.equal(sent.input_expires, "1793463143");
    assert.equal(sent.TIME_ZONE0001, "CT");
    assert.equal(sent.USE_RESPONSIVE_SITE0001, "Yes");
    assert.equal(sent.NOTES0001, "test<br  /> \n");
    // file fields go empty, as a browser sends one with nothing chosen
    assert.deepEqual(form.fields.filter(([, value]) => value === null).map(([name]) => name),
        ["FRANCHISE_ICON_FILE0001", "FRANCHISE_LOGO_FILE0001", "FRANCHISE_SOUND_FILE0001"]);
    // one of each radio, the one checked
    assert.equal(form.fields.filter(([name]) => name === "USE_FULL_WIDTH0001").length, 1);
    assert.equal(readCustomizeForm(doc(turned("Yes"))).on, true);
    // neither checked: nothing sent for it, as the browser would
    assert.equal(readCustomizeForm(doc(turned(""))).fields.some(([name]) => name === "USE_FULL_WIDTH0001"), false);
    assert.equal(readCustomizeForm(doc("<html><body></body></html>")), null);
    // a field v2 wouldn't know to send, or no Full width: MFL's form has changed
    assert.equal(readCustomizeForm(doc(fixture.replace("</form>", '<input type="range" name="ODD" value="1"></form>'))), null);
    assert.equal(readCustomizeForm(doc(fixture.replaceAll("USE_FULL_WIDTH", "USE_WIDE"))), null);
});

test("saving reads the form, sends all of it with only Full width changed, and takes MFL's form as its word", async (t) => {
    const other = "<html><body>Something else</body></html>";
    let sent = [];
    let answers = [];
    const answering = (post) => {
        globalThis.fetch = async (url, init = {}) => {
            sent.push({url: String(url), init});
            if (post && init.method === "POST") {
                return post();
            }
            return answers.length ? new Response(answers.shift(), {status: 200}) : new Response("", {status: 500});
        };
    };
    globalThis.window = {location: new URL("https://www44.myfantasyleague.com/2026/home/48571"), localStorage: {getItem: () => null, setItem: () => {}}};
    globalThis.DOMParser = DOMParser;
    answering();
    t.after(() => {
        delete globalThis.window;
        delete globalThis.fetch;
        delete globalThis.DOMParser;
    });
    const save = (on, ...pages) => {
        sent = [];
        answers = pages;
        return saveFullWidth({season: 2026, leagueId: "48571"}, on);
    };

    await save(true, fixture, turned("Yes"));
    assert.equal(sent[0].url, "https://www44.myfantasyleague.com/2026/csetup?L=48571&C=FCUSTOM");
    assert.equal(sent[1].url, "https://www44.myfantasyleague.com/2026/csetup");
    assert.equal(sent[1].init.method, "POST");
    assert.equal(sent.length, 2);
    const body = sent[1].init.body;
    assert.ok(body instanceof FormData);
    const expected = readCustomizeForm(doc(fixture)).fields.map(([name, value]) => [name, name === "USE_FULL_WIDTH0001" ? "Yes" : value]);
    assert.deepEqual([...body].map(([name, value]) => [name, typeof value === "string" ? value : null]), [...expected, ["SUBMIT", "Save Franchise Customization"]]);
    for (const [, value] of [...body].filter(([, value]) => typeof value !== "string")) {
        assert.equal(value.name, "");
        assert.equal(value.size, 0);
        assert.equal(value.type, "application/octet-stream");
    }

    // turning it off
    await save(false, turned("Yes"), fixture);
    assert.equal(sent[1].init.body.get("USE_FULL_WIDTH0001"), "No");
    // an answer without the form: the form is read again and decides
    await save(true, fixture, other, turned("Yes"));
    assert.equal(sent.length, 3);
    await assert.rejects(save(true, fixture, other, fixture), /didn't save Full width/);
    await assert.rejects(save(true, fixture, fixture), /didn't save Full width/);
    // the form with neither checked: sent with the one asked for
    await save(true, turned(""), turned("Yes"));
    assert.equal(sent[1].init.body.get("USE_FULL_WIDTH0001"), "Yes");
    await assert.rejects(save(true, other), (error) => error.noForm === true);
    // sent, but the check can't be read: MFL may have saved it
    await assert.rejects(save(true, fixture, other), (error) => error.unconfirmed === true);
    // the save's own request failing on the way back
    answering(() => {
        throw new TypeError("Load failed");
    });
    await assert.rejects(save(true, fixture), (error) => error.unconfirmed === true);
    answering(() => new Response("", {status: 500}));
    await assert.rejects(save(true, fixture), (error) => error.status === 500 && !error.unconfirmed);
    answering();
    // before anything is sent, MFL's wait holds the first read
    globalThis.window.localStorage = {getItem: () => String(Date.now() + 60000), setItem: () => {}};
    await assert.rejects(save(true, fixture), (error) => error.status === 429);
    globalThis.window.localStorage = {getItem: () => null, setItem: () => {}};
});

test("the team sheet's switch shows the member's setting", () => {
    assert.match(widthMarkup(true), /<input type="checkbox" role="switch" checked>/);
    assert.match(widthMarkup(false), /<input type="checkbox" role="switch">/);
});
