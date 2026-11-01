// Franchise setup, restyled over MFL's screens as saved from the clone (tests/fixtures/pages): if MFL
// changes its link row or the Skin form, these say where.

import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseHTML} from "linkedom";
import {restyleSetup} from "../site/v2/ui/setup.js";

const page = (viewer, name) => parseHTML(readFileSync(new URL(`./fixtures/pages/${viewer}/csetup-${name}.html`, import.meta.url), "utf8")).document;
const context = {season: 2026, leagueId: "50965"};
const tabs = (doc) => [...doc.querySelectorAll(".fuad-setup-tabs a")].map((a) => [a.textContent, a.getAttribute("href"), a.getAttribute("aria-current")]);

test("a member's Basic: v2's heading and five tabs in place of MFL's link row, and the rarer screens at its foot", () => {
    const doc = page("member", "FRANCHISE");
    assert.equal(restyleSetup(doc, {context, franchiseId: "0001"}), true);
    assert.equal(doc.querySelector("span.reportnavigation"), null);
    assert.deepEqual(tabs(doc), [
        ["Basic", "csetup?L=50965&FRANCHISES=0001&C=FRANCHISE", "page"],
        ["Customize", "csetup?L=50965&FRANCHISES=0001&C=FCUSTOM", null],
        ["Look", "csetup?L=50965&FRANCHISES=0001&C=SKIN", null],
        ["Contact", "csetup?L=50965&FRANCHISES=0001&C=FCONTACT", null],
        ["Mobile", "csetup?L=50965&FRANCHISES=0001&C=FMOBILE", null]
    ]);
    assert.deepEqual([...doc.querySelectorAll(".fuad-setup-foot a")].map((a) => [a.textContent, a.getAttribute("href")]), [
        ["Change your login password", "/2026/public?O=03"],
        ["Change franchise access code", "csetup?L=50965&FRANCHISES=0001&C=FACCESS"],
        ["Unlink this team from your login", "csetup?L=50965&FRANCHISES=0001&C=FUNLINK"]
    ]);
    // MFL's form, untouched, before the foot
    const form = doc.querySelector('form[name="franchise"]');
    assert.ok(form && !form.hidden);
    assert.equal(form.nextElementSibling, doc.querySelector(".fuad-setup-foot"));
    assert.ok(doc.documentElement.classList.contains("fuad-setup"));
});

test("each tab lights its own screen; Change Access Code lights none and names itself", () => {
    for (const [name, lit] of [["FCUSTOM", "Customize"], ["FCONTACT", "Contact"], ["FMOBILE", "Mobile"], ["SKIN", "Look"], ["FACCESS", null]]) {
        const doc = page("member", name);
        assert.equal(restyleSetup(doc, {context, franchiseId: "0001"}), true, name);
        assert.deepEqual(tabs(doc).filter(([, , current]) => current).map(([text]) => text), lit ? [lit] : [], name);
        assert.equal(doc.querySelector(".fuad-setup-foot"), null, name);
        assert.equal(doc.querySelector(".fuad-setup-screen")?.textContent ?? null, lit ? null : "Change franchise access code", name);
    }
});

test("Look is v2's looks, MFL's skins hidden but kept for the save to read", () => {
    const doc = page("member", "SKIN");
    restyleSetup(doc, {context, franchiseId: "0001"});
    assert.equal(doc.querySelector('form[name="skin"]').hidden, true);
    const picker = doc.querySelector(".fuad-setup-looks .fuad-looks");
    assert.equal(picker.getAttribute("aria-labelledby"), "fuad-setup-looks-label");
    assert.ok(picker.querySelectorAll("button[data-look]").length > 1);
    assert.equal(picker.querySelectorAll('button[aria-pressed="true"]').length, 1);
});

test("Home Page Modules, the commissioner's screens and a page without the link row stay MFL's", () => {
    const modules = page("member", "HMPGMOD");
    assert.equal(restyleSetup(modules, {context, franchiseId: "0001"}), false);
    assert.ok(modules.querySelector("span.reportnavigation"));
    for (const name of ["FRANCHISE", "FCUSTOM", "SKIN"]) {
        const doc = page("commish", name);
        assert.equal(restyleSetup(doc, {context, franchiseId: "0000"}), false, name);
        assert.ok(!doc.documentElement.classList.contains("fuad-setup"), name);
    }
    const bare = parseHTML("<html><body><div id=\"withmenus\"><form name=\"skin\"></form></div></body></html>").document;
    assert.equal(restyleSetup(bare, {context, franchiseId: "0001"}), false);
});
