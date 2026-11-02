// Franchise setup, MFL's `csetup` screens for a member's own team, restyled: v2's heading and tabs in
// place of MFL's row of links, MFL's form left to send itself. Basic, Customize, Look (MFL's Skin,
// as v2's looks), Contact and Mobile are tabs; Change Access Code and Unlink Franchise are links at
// Basic's foot, as a linked member needs neither. The commissioner's screens (every team at once)
// stay MFL's, as does a page v2 can't read.

import {esc} from "./html.js";
import {LOOKS, lookOf, looksMarkup, wireLooks} from "./looks.js";

// MFL's screen (its `C=`) by the name its link row gives it
const SCREENS = {
    "Basic": "FRANCHISE", "Unlink Franchise": "FUNLINK", "Change Access Code": "FACCESS", "Customize": "FCUSTOM",
    "Contact Info": "FCONTACT", "Mobile": "FMOBILE", "Home Page Modules": "HMPGMOD", "Skin": "SKIN"
};
const TABS = [["FRANCHISE", "Basic"], ["FCUSTOM", "Customize"], ["SKIN", "Look"], ["FCONTACT", "Contact"], ["FMOBILE", "Mobile"]];
// Home Page Modules arranges MFL's home page modules, which v2's Home doesn't show: MFL's, as it is
const RESTYLED = ["FRANCHISE", "FCUSTOM", "SKIN", "FCONTACT", "FMOBILE", "FACCESS", "FUNLINK"];
// Basic's foot links, and the name a screen reached from one goes by, as no tab is lit there
const FOOT = {FACCESS: "Change franchise access code", FUNLINK: "Unlink this team from your login"};

// Each form's fields by MFL's name (its row's id, less the franchise): shown (with `note` under them),
// under More settings (those that only reach MFL's own pages), or hidden (MFL's own way to do what v2
// does, or nothing v2 has), the hidden still sent as they are. A field MFL adds is shown under MFL's label.
const FORMS = {
    FRANCHISE: {shown: {FRANCHISE_NAME: "Team name", FRANCHISE_OWNER_NAME: "Owner name"}, hidden: ["FRANCHISE_EMAIL"]},
    FCUSTOM: {
        shown: {FRANCHISE_ICON: "Icon URL", FRANCHISE_ICON_FILE: "Or upload an icon", FRANCHISE_LOGO: "Logo URL", FRANCHISE_LOGO_FILE: "Or upload a logo"},
        // lists show the daily job's still of the icon (team-pictures.js)
        note: "Logo shows on your team page. Icon shows next to your team name on other pages. Icons may take up to 24 hours to refresh.",
        more: {
            TIME_ZONE: "Time zone", FRANCHISE_ABBREV: "Abbreviation", FRANCHISE_URL: "Home page URL", FRANCHISE_STADIUM: "Stadium",
            NOTES: "Notes", USE_ADVANCED_EDITOR: "Advanced editor for comments", PLAY_AUDIO: "Play audio clips"
        },
        // Full width is the team sheet's (width.js)
        hidden: ["USE_FULL_WIDTH", "FRANCHISE_SOUND", "FRANCHISE_SOUND_FILE", "USE_RESPONSIVE_SITE", "DISPLAY_FRANCHISE_REMINDERS"]
    },
    FCONTACT: {
        shown: {FRANCHISE_EMAIL: "Email", FRANCHISE_EMAIL_VISIBLE: "Let leaguemates see my email", FRANCHISE_MAIL_EVENT: "Email me about"},
        other: {FRANCHISE_PHONE: "Phone", FRANCHISE_ADDRESS: "Street address", FRANCHISE_CITY: "City, state, zip, country"},
        hidden: ["TWITTER_USERNAME"]
    },
    FMOBILE: {shown: {
        FRANCHISE_CELL: "Mobile phone", SEND_TEXT_VALIDATION: "Send a validation code to this number",
        FRANCHISE_CELL2: "Co-owner's mobile phone", SEND_TEXT_VALIDATION2: "Send a validation code to this number",
        FRANCHISE_CELL_VISIBLE: "Let leaguemates see these numbers"
    }},
    FACCESS: {shown: {FRANCHISE_NAME: "Team", ACCESS_CODE: "New access code", ACCESS_CODE2: "The new code again"}}
};
const MORE_NOTE = "These don't change the main pages (Home, Lineup, League, Moves, Rosters). They only affect MFL's original pages in the site menu.";
// Contact's email alerts by MFL's value for each. The draft's (once a year), MFL's own, and those for
// what v2's league doesn't have (an auction, a taxi squad, trade bait, polls, articles) are under Other emails.
const ALERTS = {
    DRAFT: "Draft updates", ONTHECLOCK: "I'm on the clock in the draft", AUCTION: "Auction updates", TAXI: "Taxi squad moves",
    TBAIT: "Trade bait updates", POLL: "New polls", ARTICLE: "New articles and videos", LINEUP: "Lineups set (mine and my opponent's)",
    LREMINDER: "Lineup reminder (Thursdays 6 a.m. ET, if I haven't set one)", TRADE: "Trade offers and results",
    WAIVER: "Waiver and free agent moves", IR: "IR moves", RESULT: "Weekly results", INJURY: "Injury report",
    MSG_BOARD: "New message board topics", PLAYER_NEWS: "News on my players (daily, 3 a.m. ET)", MFL_NEWS: "MFL site news",
    PROMO_MESSAGES: "Promotions from MFL's partners"
};
const OTHER_ALERTS = ["DRAFT", "ONTHECLOCK", "AUCTION", "TAXI", "TBAIT", "POLL", "ARTICLE", "MFL_NEWS", "PROMO_MESSAGES"];

// MFL's link row, "Franchise Setup: Basic | Unlink Franchise | …", the screen shown unlinked: the
// screen shown and each screen's address, or null
export function readSetupNav(nav) {
    const header = nav && nav.querySelector(".reportnavigationheader");
    const current = nav && nav.querySelector(".currentweek");
    if (!header || !/^\s*Franchise Setup:\s*$/i.test(header.textContent) || !current || !SCREENS[current.textContent.trim()]) {
        return null;
    }
    const hrefs = {};
    nav.querySelectorAll("a[href]").forEach((link) => {
        const screen = SCREENS[link.textContent.trim()];
        if (screen && /[?&]C=\w+/.test(link.getAttribute("href"))) {
            hrefs[screen] = link.getAttribute("href");
        }
    });
    const any = Object.values(hrefs)[0];
    if (!any) {
        return null;
    }
    const screen = SCREENS[current.textContent.trim()];
    hrefs[screen] = any.replace(/([?&]C=)\w+/, `$1${screen}`);
    return {screen, hrefs};
}

// `context` ({season, leagueId}) is for saving a look. Returns whether the page was restyled.
export function restyleSetup(doc, {context, franchiseId}) {
    const nav = doc.querySelector("#withmenus > span.reportnavigation");
    const read = readSetupNav(nav);
    if (!read || !franchiseId || franchiseId === "0000" || !RESTYLED.includes(read.screen)) {
        return false;
    }
    const {screen, hrefs} = read;
    const skinForm = screen === "SKIN" ? doc.querySelector('#withmenus > form[name="skin"]') : null;
    if (screen === "SKIN" && !skinForm) {
        return false;
    }
    const head = doc.createElement("div");
    head.className = "fuad-setup-head";
    head.innerHTML = `
        <h2>Franchise setup</h2>
        <nav class="fuad-setup-tabs" aria-label="Franchise setup">
            ${TABS.map(([tab, name]) => `<a href="${esc(hrefs[tab] || "")}"${tab === screen ? ' aria-current="page"' : ""}>${esc(name)}</a>`).join("")}
        </nav>
        ${FOOT[screen] ? `<h3 class="fuad-setup-screen">${esc(FOOT[screen])}</h3>` : ""}`;
    nav.replaceWith(head);
    if (screen === "FRANCHISE") {
        const foot = doc.createElement("p");
        foot.className = "fuad-side-foot fuad-setup-foot";
        foot.innerHTML = [
            // MFL's account page, where the login's password changes (the access code is only for linking)
            [`/${context.season}/public?O=03`, "Change your login password"],
            [hrefs.FACCESS, FOOT.FACCESS],
            [hrefs.FUNLINK, FOOT.FUNLINK]
        ].filter(([href]) => href).map(([href, text]) => `<a href="${esc(href)}">${esc(text)}</a>`).join("");
        head.parentElement.append(foot);
    }
    if (skinForm) {
        // MFL's skins, the form kept for saveLook to read afresh
        skinForm.hidden = true;
        const picker = doc.createElement("div");
        picker.className = "fuad-setup-looks";
        picker.innerHTML = looksMarkup(LOOKS, lookOf(doc), "fuad-setup-looks-label");
        skinForm.before(picker);
        wireLooks(picker.querySelector(".fuad-looks"), context, lookOf(doc));
    }
    if (FORMS[screen]) {
        restyleForm(doc, FORMS[screen], franchiseId);
    }
    doc.documentElement.classList.add("fuad-setup", "fuad-side");
    return true;
}

// MFL's form table as rows: a field (its label and its cell), a hint for one, or Save. Null for a row
// of any other shape, so a form MFL has changed stays as it is.
function readRows(table, franchiseId) {
    const named = (id) => (id.endsWith(franchiseId) ? id.slice(0, -franchiseId.length) : id);
    const rows = [];
    for (const tr of table.querySelectorAll("tr")) {
        const cells = [...tr.children].filter((cell) => cell.tagName === "TD");
        if (tr.id === "row_SUBMIT") {
            const submit = tr.querySelector('input[type="submit"][name]');
            if (!submit) {
                return null;
            }
            rows.push({submit});
        } else if (tr.id.startsWith("row_hint_") && tr.querySelector("td.hint")) {
            rows.push({hint: named(tr.id.slice(9)), cell: tr.querySelector("td.hint")});
        } else if (tr.id.startsWith("row_") && cells.length >= 2) {
            rows.push({name: named(tr.id.slice(4)), label: cells[0], cell: cells[1]});
        } else {
            return null;
        }
    }
    return rows.some((row) => row.submit) ? rows : null;
}

const make = (doc, tag, className, text) => {
    const element = doc.createElement(tag);
    if (className) {
        element.className = className;
    }
    if (text !== undefined) {
        element.textContent = text;
    }
    return element;
};

// A field's cell moved under v2's label: MFL's own inputs, so what the form sends doesn't change. Each
// box is in the form (in `parent`) before an input moves into it, so a throw midway loses none.
function field(doc, row, label, parent) {
    const block = make(doc, "div", "fuad-setup-field");
    parent.append(block);
    const radios = [...row.cell.querySelectorAll('input[type="radio"]')];
    const checks = [...row.cell.querySelectorAll('input[type="checkbox"]')];
    if (radios.length === 2 && radios.every((radio) => /^(Yes|No)$/.test(radio.getAttribute("value")))) {
        // Yes/No as a two-part switch: the radios hidden, their labels its parts
        block.classList.add("fuad-setup-yesno");
        const parts = make(doc, "div", "fuad-setup-yn");
        parts.setAttribute("role", "radiogroup");
        parts.setAttribute("aria-label", label);
        block.append(make(doc, "span", "fuad-setup-label", label), parts);
        parts.append(...row.cell.childNodes);
    } else if (checks.length === 1 && !row.cell.querySelector("label")) {
        // a checkbox MFL labels with the text beside it
        const line = make(doc, "label", "fuad-setup-check");
        block.append(line);
        line.append(make(doc, "span", "", label), checks[0]);
    } else if (checks.length) {
        // Contact's email alerts: a switch each, the rarer ones under Other emails, closed
        const list = make(doc, "div", "fuad-setup-checks");
        const others = make(doc, "div", "fuad-setup-checks");
        const details = make(doc, "details", "fuad-setup-more fuad-setup-other-alerts");
        details.append(make(doc, "summary", "", "Other emails"), others);
        block.append(make(doc, "span", "fuad-setup-label", label), list, details);
        for (const check of checks) {
            const value = check.getAttribute("value");
            const mfls = check.id ? row.cell.querySelector(`label[for="${check.id}"]`) : null;
            const line = make(doc, "label", "fuad-setup-check");
            (OTHER_ALERTS.includes(value) ? others : list).append(line);
            line.append(make(doc, "span", "", ALERTS[value] || (mfls ? mfls.textContent.replace(/\u00a0/g, " ").trim() : value)), check);
        }
        if (!others.firstChild) {
            details.remove();
        }
    } else {
        const control = row.cell.querySelector("input, select, textarea");
        const name = make(doc, control ? "label" : "span", "fuad-setup-label", label);
        if (control && control.id) {
            name.setAttribute("for", control.id);
        }
        const value = make(doc, "div", "fuad-setup-control");
        block.append(name, value);
        value.append(...row.cell.childNodes);
    }
    return block;
}

function hint(doc, cell, parent) {
    const text = make(doc, "p", "fuad-setup-hint");
    parent.append(text);
    text.append(...cell.childNodes);
    const first = text.firstElementChild;
    if (first && first.tagName === "B" && /^\s*Hint:\s*$/.test(first.textContent)) {
        first.remove();
        if (text.firstChild && text.firstChild.nodeType === 3) {
            text.firstChild.textContent = text.firstChild.textContent.replace(/^\s+/, "");
        }
    }
    while (text.lastChild && (text.lastChild.nodeName === "BR" || (text.lastChild.nodeType === 3 && !text.lastChild.textContent.trim()))) {
        text.lastChild.remove();
    }
    return text;
}

// MFL's table of fields as v2's: labels over fields, switches, More settings closed, one Save. MFL's
// inputs are moved, never remade, so the form sends what MFL's would.
function restyleForm(doc, spec, franchiseId) {
    const form = doc.querySelector('#withmenus > form[action="csetup"]');
    const table = form && [...form.children].find((child) => child.matches("table.report"));
    const rows = table && readRows(table, franchiseId);
    if (!rows) {
        return false;
    }
    const kept = make(doc, "div", "fuad-setup-kept");
    kept.setAttribute("hidden", "");
    const shown = make(doc, "div", "fuad-setup-section");
    // its fields in a box of their own, as Safari doesn't lay out a details element as flex
    const disclosure = (title, note) => {
        const details = make(doc, "details", "fuad-setup-section fuad-setup-more");
        const body = make(doc, "div", "fuad-setup-more-body");
        if (note) {
            body.append(make(doc, "p", "fuad-setup-hint", note));
        }
        details.append(make(doc, "summary", "", title), body);
        return body;
    };
    const more = disclosure("More settings", MORE_NOTE);
    const other = disclosure("Other contact details");
    // in the form before a field moves, so whatever happens, every field stays in it and is sent
    const body = make(doc, "div", "fuad-setup-form");
    body.append(shown, more.parentElement, other.parentElement, kept);
    table.before(body);
    const blocks = {};
    const order = (names) => Object.keys(names || {});
    const home = (name) => (spec.more && name in spec.more ? more : spec.other && name in spec.other ? other : shown);
    const fields = rows.filter((row) => row.name);
    // the spec's order first, then any field MFL has added, in MFL's order
    const named = [...order(spec.shown), ...order(spec.more), ...order(spec.other)];
    fields.sort((a, b) => (named.includes(a.name) ? named.indexOf(a.name) : named.length) - (named.includes(b.name) ? named.indexOf(b.name) : named.length));
    for (const row of fields) {
        if ((spec.hidden || []).includes(row.name)) {
            kept.append(...row.cell.childNodes);
            continue;
        }
        const label = {...spec.shown, ...spec.more, ...spec.other}[row.name] || row.label.textContent.replace(/\u00a0/g, " ").trim().replace(/:$/, "");
        blocks[row.name] = field(doc, row, label, home(row.name));
    }
    if (spec.note) {
        shown.append(make(doc, "p", "fuad-setup-hint", spec.note));
    }
    for (const row of rows.filter((each) => each.hint)) {
        if (blocks[row.hint]) {
            hint(doc, row.cell, blocks[row.hint]);
        }
    }
    const {submit} = rows.find((row) => row.submit);
    const save = make(doc, "button", "", "Save");
    // MFL's own button's name and value, which the form sends
    save.setAttribute("type", "submit");
    save.setAttribute("name", submit.getAttribute("name"));
    save.setAttribute("value", submit.getAttribute("value") || "");
    // as MFL's does, it can't be pressed twice; back to this page, it can again
    form.addEventListener("submit", () => save.classList.add("fuad-saving"));
    doc.defaultView.addEventListener("pageshow", () => save.classList.remove("fuad-saving"));
    const foot = make(doc, "div", "fuad-setup-save");
    foot.append(save);
    body.append(foot);
    [shown, more.parentElement, other.parentElement].filter((section) => !section.querySelector(".fuad-setup-field")).forEach((section) => section.remove());
    submit.remove();
    // whatever input is left (in a hint, or a cell v2 doesn't read) is still sent
    kept.append(...table.querySelectorAll("input, select, textarea"));
    table.remove();
    return true;
}
