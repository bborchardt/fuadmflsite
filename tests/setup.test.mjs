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

// What a form sends, read from its markup as a browser would on Save: each named field with its value
// (a checkbox or radio only when checked, a select its chosen option), the button pressed apart
function sent(form) {
    const fields = [];
    for (const control of form.querySelectorAll("input[name], select[name], textarea[name]")) {
        const type = (control.getAttribute("type") || "text").toLowerCase();
        if (type === "submit" || ((type === "checkbox" || type === "radio") && !control.hasAttribute("checked"))) {
            continue;
        }
        const value = control.tagName === "SELECT" ? (control.querySelector("option[selected]") || control.querySelector("option"))?.getAttribute("value") ?? ""
            : control.tagName === "TEXTAREA" ? control.textContent
                : type === "file" ? "(file)" : control.getAttribute("value") ?? (type === "checkbox" ? "on" : "");
        fields.push(`${control.getAttribute("name")}=${value}`);
    }
    return fields.sort();
}
const pressed = (form) => [...form.querySelectorAll('[type="submit"]')].map((button) => `${button.getAttribute("name")}=${button.getAttribute("value")}`);

const FORMS = {FRANCHISE: "franchise", FCUSTOM: "customize", FCONTACT: "contact", FMOBILE: "mobile", FACCESS: "faccess"};

test("each form sends what MFL's would, with one Save sending MFL's button", () => {
    for (const [screen, name] of Object.entries(FORMS)) {
        const before = page("member", screen).querySelector(`form[name="${name}"]`);
        const doc = page("member", screen);
        restyleSetup(doc, {context, franchiseId: "0001"});
        const form = doc.querySelector(`form[name="${name}"]`);
        assert.ok(form.querySelector(".fuad-setup-form"), screen);
        assert.equal(form.querySelector("table"), null, screen);
        assert.deepEqual(sent(form), sent(before), screen);
        assert.deepEqual(pressed(form), pressed(before), screen);
        assert.equal(form.querySelector('[type="submit"]').textContent, "Save", screen);
    }
});

const labels = (root) => [...root.querySelectorAll(":scope > .fuad-setup-field > .fuad-setup-label, :scope > .fuad-setup-field > .fuad-setup-check > span")].map((label) => label.textContent);
const restyled = (screen) => {
    const doc = page("member", screen);
    restyleSetup(doc, {context, franchiseId: "0001"});
    const sections = [...doc.querySelectorAll(".fuad-setup-form > .fuad-setup-section")];
    return {doc, shown: sections.find((section) => section.tagName === "DIV"), details: sections.filter((section) => section.tagName === "DETAILS")};
};
const inside = (details) => details.querySelector(":scope > .fuad-setup-more-body");

test("Basic shows the team and owner names; its email is Contact's, kept but hidden", () => {
    const {doc, shown, details} = restyled("FRANCHISE");
    assert.deepEqual(labels(shown), ["Team name", "Owner name"]);
    assert.deepEqual(details, []);
    assert.ok(doc.querySelector('.fuad-setup-kept[hidden] input[name="FRANCHISE_EMAIL0001"]'));
});

test("Customize shows Full width; what reaches only MFL's pages is under More settings, closed", () => {
    const {doc, shown, details} = restyled("FCUSTOM");
    assert.deepEqual(labels(shown), ["Full width on wide screens"]);
    assert.equal(details.length, 1);
    assert.equal(details[0].querySelector("summary").textContent, "More settings");
    assert.equal(details[0].hasAttribute("open"), false);
    assert.match(inside(details[0]).querySelector(":scope > .fuad-setup-hint").textContent, /only affect MFL's original pages in the site menu/);
    assert.deepEqual(labels(inside(details[0])), ["Time zone", "Abbreviation", "Icon URL", "Or upload an icon", "Logo URL", "Or upload a logo",
        "Home page URL", "Stadium", "Notes", "Advanced editor for comments", "Play audio clips"]);
    for (const name of ["FRANCHISE_SOUND0001", "FRANCHISE_SOUND_FILE0001", "USE_RESPONSIVE_SITE0001", "DISPLAY_FRANCHISE_REMINDERS0001"]) {
        assert.ok(doc.querySelector(`.fuad-setup-kept[hidden] [name="${name}"]`), name);
    }
    // Yes/No as a switch of MFL's own radios
    const yesNo = shown.querySelector(".fuad-setup-yn");
    assert.deepEqual([...yesNo.querySelectorAll("label")].map((label) => label.textContent), ["Yes", "No"]);
    assert.equal(yesNo.querySelectorAll('input[name="USE_FULL_WIDTH0001"]').length, 2);
    // the icon pickers write to the field by its name in the form MFL names
    assert.ok(doc.querySelector('form[name="customize"] input[name="FRANCHISE_ICON0001"]'));
});

test("Contact: email and who sees it first, then the alerts, the rarer ones and the rest of the details closed", () => {
    const {doc, shown, details} = restyled("FCONTACT");
    assert.deepEqual(labels(shown), ["Email", "Let leaguemates see my email", "Email me about"]);
    const alerts = (root) => [...root.querySelectorAll(":scope > .fuad-setup-check > span")].map((span) => span.textContent);
    const field = shown.querySelector(".fuad-setup-checks").parentElement;
    assert.deepEqual(alerts(field.querySelector(":scope > .fuad-setup-checks")), [
        "Lineups set (mine and my opponent's)", "Lineup reminder (Thursdays 6 a.m. ET, if I haven't set one)", "Trade offers and results",
        "Waiver and free agent moves", "IR moves", "Weekly results", "Injury report", "New message board topics",
        "News on my players (daily, 3 a.m. ET)"
    ]);
    // the draft's (once a year), MFL's own, and those for what the league doesn't have: closed, under Other emails
    const others = field.querySelector(":scope > details.fuad-setup-other-alerts");
    assert.equal(others.querySelector("summary").textContent, "Other emails");
    assert.equal(others.hasAttribute("open"), false);
    assert.deepEqual(alerts(others.querySelector(".fuad-setup-checks")), ["Draft updates", "I'm on the clock in the draft", "Auction updates",
        "Trade bait updates", "Taxi squad moves", "New polls", "New articles and videos", "MFL site news", "Promotions from MFL's partners"]);
    assert.deepEqual(details.map((section) => section.querySelector("summary").textContent), ["Other contact details"]);
    assert.deepEqual(labels(inside(details[0])), ["Phone", "Street address", "City, state, zip, country"]);
    assert.ok(doc.querySelector('.fuad-setup-kept[hidden] input[name="TWITTER_USERNAME0001"]'));
});

test("Mobile shows both phones, each with its validation as a switch, and who sees them", () => {
    const {shown, details} = restyled("FMOBILE");
    assert.deepEqual(labels(shown), ["Mobile phone", "Send a validation code to this number", "Co-owner's mobile phone",
        "Send a validation code to this number", "Let leaguemates see these numbers"]);
    assert.deepEqual(details, []);
    assert.ok(shown.querySelector('.fuad-setup-check input[type="checkbox"][name="SEND_TEXT_VALIDATION0001"]'));
    assert.match(shown.querySelector(".fuad-setup-hint").textContent, /^Opt in to receive timely text alerts/);
});

test("a form of rows v2 doesn't know stays MFL's, under v2's heading", () => {
    const doc = page("member", "FRANCHISE");
    const odd = doc.createElement("tr");
    odd.innerHTML = "<td>one cell</td>";
    doc.querySelector('form[name="franchise"] tbody').append(odd);
    assert.equal(restyleSetup(doc, {context, franchiseId: "0001"}), true);
    assert.ok(doc.querySelector('form[name="franchise"] table.report'));
    assert.equal(doc.querySelector(".fuad-setup-form"), null);
});

test("a restyle that fails partway leaves every field in the form, with MFL's Save", () => {
    const before = page("member", "FCONTACT").querySelector('form[name="contact"]');
    const doc = page("member", "FCONTACT");
    // an id the alerts' label lookup can't take
    doc.querySelector('input[value="TRADE"]').id = 'odd"id';
    assert.throws(() => restyleSetup(doc, {context, franchiseId: "0001"}));
    const form = doc.querySelector('form[name="contact"]');
    assert.deepEqual(sent(form), sent(before));
    assert.deepEqual(pressed(form), pressed(before));
});
