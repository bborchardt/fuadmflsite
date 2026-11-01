// Looks read the member's MFL skin from the page and save one through MFL's Franchise setup › Skin
// form (the league's, saved 27 Oct 2026, cut to its stylesheets and the form, and the clone's answer
// to a save): if MFL changes them, these say where.

import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DOMParser, parseHTML} from "linkedom";
import {LOOKS, applyLook, keepResponsive, lookOf, looksMarkup, commishLook, keepTeamSkin, markCommish, readSkinForm, saveLook, skinFolder} from "../site/v2/ui/looks.js";

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

test("a page without Responsive View gets the viewport tag and the skin's responsive.css back, where MFL puts them", () => {
    const off = doc(`<html><head><link rel="stylesheet" id="default" href="a.css"><link rel="stylesheet" id="skin" href="https://www44.myfantasyleague.com/skins17/OceanBlue/OceanBlue.css" type="text/css"><link rel="apple-touch-icon" href="i.png"></head><body></body></html>`);
    keepResponsive(off);
    assert.equal(off.querySelector('meta[name="viewport"]').getAttribute("content"), "initial-scale=1.0, width=device-width");
    const added = off.querySelector("link#skin").nextElementSibling;
    assert.equal(added.id, "responsive");
    assert.equal(added.getAttribute("rel"), "stylesheet");
    assert.equal(added.getAttribute("href"), "https://www44.myfantasyleague.com/skins17/OceanBlue/responsive.css");
    const on = doc(readFileSync(new URL("./fixtures/pages/member/home.html", import.meta.url), "utf8"));
    const before = on.head.innerHTML;
    keepResponsive(on);
    assert.equal(on.head.innerHTML, before);
    const bare = doc("<html><head></head><body></body></html>");
    keepResponsive(bare);
    assert.ok(bare.querySelector('meta[name="viewport"]'));
    assert.equal(bare.querySelector("link#responsive"), null);
});

test("an iPhone asking for the desktop site gets the desktop width; an iPad, a Mac or a phone as itself doesn't", () => {
    const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
    const viewport = (userAgent, maxTouchPoints, width, height) => {
        const shown = doc(readFileSync(new URL("./fixtures/pages/member/home.html", import.meta.url), "utf8"));
        keepResponsive(shown, {navigator: {userAgent, maxTouchPoints}, screen: {width, height}});
        return shown.querySelector('meta[name="viewport"]').getAttribute("content");
    };
    assert.equal(viewport(mac, 5, 390, 844), "width=980");
    assert.equal(viewport(mac, 5, 932, 430), "width=980");
    assert.equal(viewport(mac, 5, 744, 1133), "initial-scale=1.0, width=device-width");
    assert.equal(viewport(mac, 0, 390, 844), "initial-scale=1.0, width=device-width");
    assert.equal(viewport(iphone, 5, 390, 844), "initial-scale=1.0, width=device-width");
    const off = doc("<html><head></head><body></body></html>");
    keepResponsive(off, {navigator: {userAgent: mac, maxTouchPoints: 5}, screen: {width: 390, height: 844}});
    assert.equal(off.querySelectorAll('meta[name="viewport"]').length, 1);
    assert.equal(off.querySelector('meta[name="viewport"]').getAttribute("content"), "width=980");
});

test("the commissioner's view is marked, whatever the look; a member's isn't", () => {
    const shown = page("BlueMesh");
    applyLook(shown, lookOf(shown, looks));
    markCommish(shown, "0000");
    assert.ok(shown.documentElement.classList.contains("fuad-commish"));
    assert.equal(shown.documentElement.getAttribute("data-fuad-look"), "night");
    markCommish(shown, "0001");
    assert.ok(!shown.documentElement.classList.contains("fuad-commish"));
    markCommish(shown, null);
    assert.ok(!shown.documentElement.classList.contains("fuad-commish"));
});

test("the commissioner's view follows their team's look, per league, and only their team's", () => {
    const items = new Map();
    const before = globalThis.window;
    globalThis.window = {localStorage: {getItem: (key) => (items.has(key) ? items.get(key) : null), setItem: (key, value) => items.set(key, value)}};
    try {
        const pageIn = (folder, link = "") => {
            const shown = page(folder);
            shown.body.innerHTML = link;
            return shown;
        };
        const become = '<div class="welcome"><a href="/2026/logout?L=1&BECOME=0000">Become Commissioner</a></div>';
        const id = (shown, league) => commishLook(shown, league).id;
        // nothing known yet: the league skin's look
        assert.equal(id(pageIn("NeonBlue"), "1"), "night");
        assert.equal(id(pageIn("OceanBlue"), "1"), "day");
        // another team keeps nothing, even with such a link in a post
        keepTeamSkin(pageIn("Norseman", '<p><a href="/2026/logout?L=1&BECOME=0000">x</a></p>'), "0002", "1");
        assert.equal(items.size, 0);
        keepTeamSkin(pageIn("Norseman", become), "0000", "1");
        assert.equal(items.size, 0);
        // the commissioner's own team
        keepTeamSkin(pageIn("Norseman", become), "0001", "1");
        assert.equal(id(pageIn("NeonBlue"), "1"), "purple");
        // another league's is its own
        keepTeamSkin(pageIn("OceanBlue", become), "0001", "2");
        assert.equal(id(pageIn("NeonBlue"), "1"), "purple");
        assert.equal(id(pageIn("NeonBlue"), "2"), "day");
        // a skin no look names is the default, and a page with no readable skin leaves it
        keepTeamSkin(pageIn("BlueMesh", become), "0001", "1");
        assert.equal(id(pageIn("OceanBlue"), "1"), "night");
        const none = parseHTML(`<html><body>${become}</body></html>`).document;
        keepTeamSkin(none, "0001", "1");
        assert.equal(items.get("fuad.teamSkin.1"), "BlueMesh");
    } finally {
        globalThis.window = before;
    }
});

test("each look's commissioner accent differs from its own", () => {
    const css = readFileSync(new URL("../site/v2/fuad.css", import.meta.url), "utf8");
    const accent = (selector) => (css.slice(css.indexOf(`${selector} {`)).match(/--fuad-accent: (#[0-9A-F]+)/) || [])[1];
    const base = accent("html.fuad-commish");
    assert.ok(base);
    for (const {id} of LOOKS.slice(1)) {
        const commish = css.includes(`html.fuad-commish[data-fuad-look="${id}"]`) ? accent(`html.fuad-commish[data-fuad-look="${id}"]`) : base;
        assert.notEqual(commish, accent(`[data-fuad-look="${id}"]`), id);
    }
});

test("the default is saved as the commissioner's choice of skin", () => {
    assert.equal(night.id, "night");
    assert.equal(night.skin, "-1");
    assert.equal(night.folder, null);
    assert.equal(new Set(LOOKS.map((look) => look.id)).size, LOOKS.length);
    // the league's own skin (its pages logged out, 27 Oct 2026): a look on it would show for every
    // member on Commish Choice
    assert.ok(LOOKS.every((look) => look.folder !== "BlueMesh"));
    // MFL's Seasons skin draws from these in turn: a member on it would be shown a look for a season
    assert.ok(LOOKS.every((look) => !["Spring", "Summer", "Autumn", "Winter"].includes(look.folder)));
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

test("saving reads the form for its token, sends it with the look's skin, and takes MFL's word or its form", async (t) => {
    const chosen = (skin) => fixture.replace(' checked="checked"', "").replace(`value="${skin}"`, `value="${skin}" checked="checked"`);
    // MFL's answer to a save (the clone, 27 Oct 2026), drawn in the skin before it
    const saved = readFileSync(new URL("./fixtures/skin-saved.html", import.meta.url), "utf8");
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
    const save = (look, ...pages) => {
        sent = [];
        answers = pages;
        return saveLook({season: 2026, leagueId: "48571"}, look, looks);
    };
    await save(red, fixture, saved);
    assert.equal(sent[0].url, "https://www44.myfantasyleague.com/2026/csetup?L=48571&C=SKIN");
    assert.equal(sent[1].url, "https://www44.myfantasyleague.com/2026/csetup");
    assert.equal(sent[1].init.method, "POST");
    assert.deepEqual(Object.fromEntries(sent[1].init.body), {form_name: "skin", LEAGUE_ID: "48571", C: "SKIN", input_expires: "1793152827", USE_SKIN: "1031", SUBMIT: "Save Skin"});
    assert.equal(readSkinForm(doc(fixture)).submit, "Save Skin");
    assert.equal(sent.length, 2);

    // MFL's words elsewhere on a page aren't its answer
    await assert.rejects(save(red, fixture, "<html><body><p>Skin Selection Saved</p></body></html>", fixture), /didn't save the new skin/);
    // without MFL's word, the form is read again and decides
    await save(red, fixture, other, chosen("1031"));
    assert.equal(sent.length, 3);
    await assert.rejects(save(red, fixture, other, fixture), /didn't save the new skin/);
    // Commish Choice shows on the form as the league's own skin (Neon Blue in the clone)
    await save(night, fixture, other, chosen("1007"));
    await assert.rejects(save(night, fixture, other, chosen("1031")), /didn't save the new skin/);
    // the member's own skin (MFL, in the fixture) still chosen: nothing was saved
    await assert.rejects(save(night, fixture, other, fixture), /didn't save the new skin/);
    await assert.rejects(save(night, fixture, other, fixture.replace(' checked="checked"', "")), /didn't save the new skin/);
    await assert.rejects(save({...red, skin: "9999"}, fixture), /doesn't offer skin 9999/);
    await assert.rejects(save(red, other), (error) => error.noForm === true);
    // sent, but the check can't be read: MFL may have saved it
    await assert.rejects(save(red, fixture, other), (error) => error.unconfirmed === true);
    // the save's own request failing on the way back
    answering(() => {
        throw new TypeError("Load failed");
    });
    await assert.rejects(save(red, fixture), (error) => error.unconfirmed === true);
    answering();
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

// The header's cover (mfl/message-header.html, pasted by the commissioner) is drawn before v2 loads,
// in the look's colours from the skin's folder: it must match every look, or a member sees a flash
test("the header's cover is each look's page and muted colours", () => {
    const header = readFileSync(new URL("../mfl/message-header.html", import.meta.url), "utf8");
    const covers = Object.fromEntries([...header.match(/var COVERS = \{([\s\S]*?)\};/)[1]
        .matchAll(/(\w+): \["(#[0-9A-F]{6})", "(#[0-9A-F]{6})"\]/g)].map((match) => [match[1], [match[2], match[3]]]));
    const night = colors(LOOKS[0].id);
    assert.match(header, new RegExp(`background: var\\(--fuad-cover, ${night.page}\\)`));
    for (const look of LOOKS.slice(1)) {
        const set = colors(look.id);
        assert.deepEqual(covers[look.folder.toLowerCase()], [set.page, set.muted], `${look.id}: the header's cover`);
    }
    assert.equal(Object.keys(covers).length, LOOKS.length - 1);
});
