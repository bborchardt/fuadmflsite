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
        </nav>`;
    nav.replaceWith(head);
    if (screen === "FRANCHISE") {
        const foot = doc.createElement("p");
        foot.className = "fuad-side-foot fuad-setup-foot";
        foot.innerHTML = [
            // MFL's account page, where the login's password changes (the access code is only for linking)
            [`/${context.season}/public?O=03`, "Change your login password"],
            [hrefs.FACCESS, "Change franchise access code"],
            [hrefs.FUNLINK, "Unlink this team from your login"]
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
    doc.documentElement.classList.add("fuad-setup", "fuad-side");
    return true;
}
