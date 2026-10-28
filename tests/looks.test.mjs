// Looks read the member's MFL skin from the page and save one through MFL's Franchise setup › Skin
// form (the league's, saved 27 Oct 2026, cut to its stylesheets and the form): if MFL changes it,
// these say where.

import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DOMParser, parseHTML} from "linkedom";
import {LOOKS, applyLook, lookOf, looksMarkup, readSkinForm, saveLook, skinFolder} from "../site/v2/ui/looks.js";

const fixture = readFileSync(new URL("./fixtures/skin-setup.html", import.meta.url), "utf8");
const doc = (html) => parseHTML(html).document;
const page = (skin) => doc(`<html><head><link rel="stylesheet" id="skin" href="https://www44.myfantasyleague.com/skins17/${skin}/${skin}.css"></head><body></body></html>`);
const night = LOOKS[0];
const red = {id: "red", name: "Red", skin: "1031", folder: "RedSteel"};
const looks = [night, red];

test("the page's skin picks the look; any skin no look names is the default", () => {
    assert.equal(skinFolder(doc(fixture)), "MFL");
    assert.equal(lookOf(page("RedSteel"), looks), red);
    assert.equal(lookOf(page("redsteel"), looks), red);
    assert.equal(lookOf(page("BlueMesh"), looks), night);
    assert.equal(lookOf(doc("<html><head></head></html>"), looks), night);
    const shown = page("RedSteel");
    applyLook(shown, lookOf(shown, looks));
    assert.equal(shown.documentElement.getAttribute("data-fuad-look"), "red");
});

test("the default is saved as the commissioner's choice of skin", () => {
    assert.equal(night.id, "night");
    assert.equal(night.skin, "-1");
    assert.equal(night.folder, null);
    assert.equal(new Set(LOOKS.map((look) => look.id)).size, LOOKS.length);
});

test("every look's skin is one MFL offers, and its folder is MFL's", () => {
    const form = readSkinForm(doc(fixture));
    const folders = new Map([...fixture.matchAll(/id="USE_SKIN_(-?\d+)"[\s\S]*?(?:skins17\/([^/]+)\/thumbnail|(?=id="USE_SKIN_|<\/form))/g)].map((match) => [match[1], match[2] || null]));
    for (const look of LOOKS) {
        assert.ok(form.skins.includes(look.skin), `${look.id}: skin ${look.skin}`);
        if (look.folder) {
            assert.equal(folders.get(look.skin), look.folder, `${look.id}: folder`);
        }
    }
    // the fixture's own check, on a skin that's surely there
    assert.equal(folders.get("1031"), "RedSteel");
});

test("MFL's skin form: its hidden fields, the skins it offers and the one chosen", () => {
    const form = readSkinForm(doc(fixture));
    assert.equal(form.action, "csetup");
    assert.deepEqual([...form.fields.keys()], ["form_name", "LEAGUE_ID", "C", "input_expires"]);
    assert.equal(form.fields.get("C"), "SKIN");
    assert.ok(form.skins.includes("-1") && form.skins.includes("1024") && form.skins.length > 60);
    assert.equal(form.chosen, "1024");
    assert.equal(readSkinForm(page("MFL")), null);
    // a field v2 wouldn't know to send: MFL's form has changed
    assert.equal(readSkinForm(doc(fixture.replace("</form>", '<input type="checkbox" name="ALL_LEAGUES" value="1"></form>'))), null);
});

test("saving reads the form for its token, sends it with the look's skin, and checks MFL chose it", async (t) => {
    const chosen = (skin) => fixture.replace(' checked="checked"', "").replace(`value="${skin}"`, `value="${skin}" checked="checked"`);
    let sent = [];
    let answers = [];
    globalThis.window = {location: new URL("https://www44.myfantasyleague.com/2026/home/48571"), localStorage: {getItem: () => null, setItem: () => {}}};
    globalThis.DOMParser = DOMParser;
    globalThis.fetch = async (url, init = {}) => {
        sent.push({url: String(url), init});
        return new Response(answers.shift(), {status: 200});
    };
    t.after(() => {
        delete globalThis.window;
        delete globalThis.fetch;
        delete globalThis.DOMParser;
    });
    const save = (look, ...pages) => {
        sent = [];
        answers = pages;
        return saveLook({season: 2026, leagueId: "48571"}, look);
    };
    await save(red, fixture, chosen("1031"));
    assert.equal(sent[0].url, "https://www44.myfantasyleague.com/2026/csetup?L=48571&C=SKIN");
    assert.equal(sent[1].url, "https://www44.myfantasyleague.com/2026/csetup");
    assert.equal(sent[1].init.method, "POST");
    assert.deepEqual(Object.fromEntries(sent[1].init.body), {form_name: "skin", LEAGUE_ID: "48571", C: "SKIN", input_expires: "1793152827", USE_SKIN: "1031", SUBMIT: "Save Skin"});
    assert.equal(readSkinForm(doc(fixture)).submit, "Save Skin");
    assert.equal(sent.length, 2);

    // an answer that isn't the form: the form is read again, and decides
    await save(night, fixture, "<html><body>Saved</body></html>", chosen("-1"));
    assert.equal(sent.length, 3);
    await assert.rejects(save(night, fixture, page("MFL").documentElement.outerHTML, fixture), /didn't save the new skin/);
    await assert.rejects(save(red, fixture, fixture), /didn't save the new skin/);
    await assert.rejects(save({...red, skin: "9999"}, fixture), /doesn't offer skin 9999/);
    // sent, but the check can't be read: MFL may have saved it
    globalThis.fetch = async (url, init = {}) => {
        sent.push({url: String(url), init});
        return answers.length ? new Response(answers.shift(), {status: 200}) : new Response("", {status: 500});
    };
    await assert.rejects(save(red, fixture, "<html><body>Saved</body></html>"), (error) => error.unconfirmed === true);
    // the save's own request failing on the way back
    globalThis.fetch = async (url, init = {}) => {
        sent.push({url: String(url), init});
        if (init.method === "POST") {
            throw new TypeError("Load failed");
        }
        return new Response(answers.shift(), {status: 200});
    };
    await assert.rejects(save(red, fixture), (error) => error.unconfirmed === true);
    globalThis.fetch = async (url, init = {}) => {
        sent.push({url: String(url), init});
        return new Response(answers.shift(), {status: 200});
    };
    await assert.rejects(save(red, doc("<html><body>Log in</body></html>").documentElement.outerHTML), (error) => error.noForm === true);
    // the form in the answer without the new skin chosen: read again
    await save(red, fixture, fixture, chosen("1031"));
    assert.equal(sent.length, 3);
    // before anything is sent, MFL's wait holds the first read
    globalThis.window.localStorage = {getItem: () => String(Date.now() + 60000), setItem: () => {}};
    await assert.rejects(save(red, fixture), (error) => error.status === 429);
    globalThis.window.localStorage = {getItem: () => null, setItem: () => {}};
});

test("the team sheet offers the looks only once there's more than one", () => {
    assert.equal(looksMarkup([night], night), "");
    const html = looksMarkup(looks, red);
    assert.match(html, /<button type="button" data-look="night" aria-pressed="false"><span class="fuad-look-swatch" data-fuad-look="night" aria-hidden="true"><\/span><span>Night Game<\/span><\/button>/);
    assert.match(html, /data-look="red" aria-pressed="true"/);
});

// A look's colors, Night Game's with its own block over them: every look's text and marks stand out
// from its backgrounds as Night Game's do (WCAG contrast; faint text is for what's least needed)
const css = readFileSync(new URL("../site/v2/fuad.css", import.meta.url), "utf8");
const colors = (id) => {
    const block = (name) => {
        const found = css.match(new RegExp(`\\[data-fuad-look="${name}"\\] \\{([\\s\\S]*?)\\n\\}`));
        return found && Object.fromEntries([...found[1].matchAll(/--fuad-([a-z0-9-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
    };
    const base = css.match(/:root,\n\[data-fuad-look\] \{([\s\S]*?)\n\}/)[1];
    const night = Object.fromEntries([...base.matchAll(/--fuad-([a-z0-9-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
    if (id === LOOKS[0].id) {
        return night;
    }
    const own = block(id);
    return own && {...night, ...own};
};
const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
        .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (one, two) => {
    const [light, dark] = [luminance(one), luminance(two)].sort((a, b) => b - a);
    return (light + 0.05) / (dark + 0.05);
};

test("every look has its colors, and they stand out from its backgrounds", () => {
    for (const look of LOOKS) {
        const set = colors(look.id);
        assert.ok(set, `${look.id}: no [data-fuad-look] block in fuad.css`);
        const hex = (name) => {
            assert.match(set[name] || "", /^#[0-9A-Fa-f]{6}$/, `${look.id}: --fuad-${name}`);
            return set[name];
        };
        // a tint, drawn over the panel
        const over = (name, under) => {
            const [r, g, b, alpha] = (set[name].match(/rgba\(([^)]+)\)/) || [])[1].split(",").map(Number);
            const base = [1, 3, 5].map((at) => parseInt(under.slice(at, at + 2), 16));
            return `#${[r, g, b].map((value, at) => Math.round(value * alpha + base[at] * (1 - alpha)).toString(16).padStart(2, "0")).join("")}`;
        };
        const ratio = contrast(hex("on-bad-tint"), over("bad-tint", hex("panel")));
        assert.ok(ratio >= 4.5, `${look.id}: --fuad-on-bad-tint on --fuad-bad-tint is ${ratio.toFixed(2)}, under 4.5`);
        const pairs = [
            ...["text", "soft", "muted", "accent", "good", "bad", "caution"].flatMap((fg) =>
                ["page", "panel", "raised", "quiet", "band"].map((bg) => [fg, bg, 4.5])),
            ["faint", "page", 3], ["faint", "panel", 3],
            ["on-accent", "accent", 4.5], ["on-accent", "accent-hover", 4.5]
        ];
        for (const [fg, bg, least] of pairs) {
            const ratio = contrast(hex(fg), hex(bg));
            assert.ok(ratio >= least, `${look.id}: --fuad-${fg} on --fuad-${bg} is ${ratio.toFixed(2)}, under ${least}`);
        }
    }
});
