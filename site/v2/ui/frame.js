// v2's frame on every league page: the header (site menu, wordmark and context line, team button),
// the five sections, the current section's views, the team sheet and the player popup. MFL's own
// menus are hidden only once the frame is drawn, so if this fails the page keeps MFL's navigation.

import {esc} from "./html.js";
import {REBUILT, locate, pageOf, sections, storedTabs} from "./nav.js";
import {loadContext} from "./context.js";
import {openDialog} from "./dialog.js";
import {installPopup} from "./popup.js";

export {locate, pageOf, sections};

const ICONS = {
    Home: '<path d="M3 11l9-7 9 7"></path><path d="M5 10v10h14V10"></path>',
    Lineup: '<path d="M8 6h12M8 12h12M8 18h12"></path><circle cx="4" cy="6" r="1"></circle><circle cx="4" cy="12" r="1"></circle><circle cx="4" cy="18" r="1"></circle>',
    Moves: '<path d="M7 4L3 8l4 4"></path><path d="M3 8h14"></path><path d="M17 20l4-4-4-4"></path><path d="M21 16H7"></path>',
    League: '<path d="M8 21h8M12 17v4"></path><path d="M7 4h10v5a5 5 0 0 1-10 0z"></path><path d="M17 6h3a3 3 0 0 1-3 4M7 6H4a3 3 0 0 0 3 4"></path>',
    Rosters: '<circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"></path><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.6.8 2.7 2.6 3 5.2"></path>'
};

const icon = (name) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
const MENU_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"></path></svg>';
const CLOSE_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>';
const SEARCH_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path></svg>';

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();

// MFL's own league menu, in its groups, for the site menu
export function mflMenu(doc = document) {
    return [...doc.querySelectorAll(".myfantasyleague_menu > ul > li.has-sub")].map((li) => ({
        name: clean((li.querySelector(":scope > a") || {}).textContent),
        links: [...li.querySelectorAll("ul a[href]")].map((a) => ({text: clean(a.textContent), href: a.getAttribute("href")}))
    })).filter((group) => group.name && group.links.length);
}

function mflLink(test) {
    return [...document.querySelectorAll(".myfantasyleague_menu a[href], .pageheader a[href]")].find(test) || null;
}

// "All Hands on Beck" → "AH"
export function initials(name) {
    return String(name || "").split(/\s+/).filter((word) => /^[A-Za-z0-9]/.test(word)).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function siteMenu(groups) {
    return `
    <section class="fuad-drawer" role="dialog" aria-modal="true" aria-labelledby="fuad-menu-title">
        <div class="fuad-dialog-head">
            <h2 id="fuad-menu-title">Menu</h2>
            <button type="button" class="fuad-close" data-close aria-label="Close menu">${CLOSE_ICON}</button>
        </div>
        <div class="fuad-drawer-body">
            <h3 class="fuad-label">More pages</h3>
            <label class="fuad-search">${SEARCH_ICON}<input type="search" placeholder="Filter" aria-label="Filter pages" autocomplete="off"></label>
            ${groups.map((group, index) => `
            <div class="fuad-menu-group">
                <button type="button" class="fuad-menu-toggle" aria-expanded="false" aria-controls="fuad-menu-${index}"><span>${esc(group.name)}</span><span class="fuad-meta"><span class="fuad-menu-count">${group.links.length}</span> <span class="fuad-chev" aria-hidden="true">▾</span></span></button>
                <ul class="fuad-menu-links" id="fuad-menu-${index}" hidden>
                    ${group.links.map((link) => `<li><a href="${esc(link.href)}">${esc(link.text)}</a></li>`).join("")}
                </ul>
            </div>`).join("")}
            <p class="fuad-muted fuad-menu-none" hidden>No page matches.</p>
        </div>
    </section>`;
}

function teamSheet({team, member, myTeam, logout, become, franchiseId}) {
    const switchTo = become && become.getAttribute("href");
    return `
    <section class="fuad-sheet" role="dialog" aria-modal="true" aria-labelledby="fuad-sheet-title">
        <span class="fuad-grabber" aria-hidden="true"></span>
        <div class="fuad-dialog-head">
            <h2 id="fuad-sheet-title">${esc(team ? team.name : "Commissioner")}</h2>
            <button type="button" class="fuad-close" data-close aria-label="Close">${CLOSE_ICON}</button>
        </div>
        <div class="fuad-sheet-actions">
            ${member && myTeam ? `<a class="fuad-button" href="${esc(myTeam)}">My team</a>` : ""}
            ${logout ? `<a class="fuad-button fuad-button-quiet" href="${esc(logout.getAttribute("href"))}">Log out</a>` : ""}
        </div>
        ${switchTo ? `
        <div class="fuad-switch" role="group" aria-label="Viewing as">
            <span class="fuad-muted">Viewing as</span>
            <div class="fuad-switch-options">
                ${franchiseId === "0000"
                    ? `<a href="${esc(switchTo)}">Member</a><span aria-current="true">Commissioner</span>`
                    : `<span aria-current="true">Member</span><a href="${esc(switchTo)}">Commissioner</a>`}
            </div>
        </div>` : ""}
    </section>`;
}

function wireMenu(layer) {
    const filter = layer.querySelector("input[type=search]");
    const groups = [...layer.querySelectorAll(".fuad-menu-group")];
    const show = (group, open) => {
        const toggle = group.querySelector(".fuad-menu-toggle");
        toggle.setAttribute("aria-expanded", String(open));
        toggle.querySelector(".fuad-chev").textContent = open ? "▴" : "▾";
        group.querySelector("ul").hidden = !open;
    };
    groups.forEach((group) => group.querySelector(".fuad-menu-toggle").addEventListener("click", () =>
        show(group, group.querySelector(".fuad-menu-toggle").getAttribute("aria-expanded") !== "true")));
    // a filter opens every group with a match
    filter.addEventListener("input", () => {
        const term = filter.value.trim().toLowerCase();
        let any = false;
        groups.forEach((group) => {
            let shown = 0;
            group.querySelectorAll("li").forEach((item) => {
                const hit = !term || item.textContent.toLowerCase().includes(term);
                item.hidden = !hit;
                shown += hit ? 1 : 0;
            });
            group.hidden = !shown;
            group.querySelector(".fuad-menu-count").textContent = String(shown);
            show(group, Boolean(term) && shown > 0);
            any = any || shown > 0;
        });
        layer.querySelector(".fuad-menu-none").hidden = any;
    });
}

export function drawFrame({context, storage}) {
    const {season, leagueId} = context;
    const base = `${window.location.origin}/${season}`;
    const franchiseId = window.franchise_id || null;
    const member = Boolean(franchiseId && franchiseId !== "0000");
    const tabs = storedTabs(storage);
    const all = sections({base, leagueId, franchiseId, tabs, rebuilt: REBUILT});
    const database = window.franchiseDatabase || {};
    const team = franchiseId && database[`fid_${franchiseId}`] ? database[`fid_${franchiseId}`] : null;
    const logout = mflLink((a) => /^log\s*out$/i.test(clean(a.textContent)));
    const login = mflLink((a) => /^log\s*in$/i.test(clean(a.textContent)));
    const become = mflLink((a) => /[?&]BECOME=/.test(a.getAttribute("href")));
    const loggedIn = Boolean(franchiseId);
    const rosters = all.find((section) => section.name === "Rosters");
    const myTeam = member ? rosters.views[0].href : null;
    const mflTitle = clean((document.querySelector(".pagetitle h1") || {}).textContent);

    const root = document.createElement("div");
    root.id = "fuad-frame";
    root.innerHTML = `
    <header class="fuad-top">
        <button type="button" class="fuad-menu-button" aria-label="Menu" aria-expanded="false" aria-haspopup="dialog">${MENU_ICON}<span class="fuad-menu-word" aria-hidden="true">Menu</span></button>
        <a class="fuad-brand" href="${esc(all[0].href)}"><span class="fuad-wordmark">FUAD</span><span class="fuad-context"></span></a>
        <nav class="fuad-sections fuad-sections-top" aria-label="Sections"></nav>
        ${loggedIn
            ? `<button type="button" class="fuad-team" aria-label="${esc(team ? `${team.name}: your team` : "Commissioner")}" aria-haspopup="dialog">${esc(initials(team ? team.name : "Commissioner"))}</button>`
            : `<a class="fuad-login" href="${esc(login ? login.getAttribute("href") : `${base}/login?L=${leagueId}`)}">Log in</a>`}
    </header>
    <h1 class="fuad-hidden"></h1>
    <nav class="fuad-views" hidden></nav>
    <nav class="fuad-sections fuad-sections-bottom" aria-label="Sections"></nav>
    <div class="fuad-layer fuad-menu-layer" hidden>${siteMenu(mflMenu())}</div>
    ${loggedIn ? `<div class="fuad-layer fuad-sheet-layer" hidden>${teamSheet({team, member, myTeam, logout, become, franchiseId})}</div>` : ""}`;

    const render = () => {
        const page = pageOf(window.location, tabs);
        const here = locate(all, page, franchiseId);
        const current = here && here.section.name;
        // v2's Home replaces the home page's Main tab; its other tabs are still MFL's
        document.documentElement.classList.toggle("fuad-home-on", page.path === "home" && current === "Home");
        const sectionLinks = all.map((section) => `<a href="${esc(section.href)}"${section.name === current ? ' aria-current="page"' : ""}>${icon(section.name)}<span>${esc(section.name)}</span></a>`).join("");
        root.querySelectorAll(".fuad-sections").forEach((nav) => {
            nav.innerHTML = sectionLinks;
        });
        root.querySelector("h1").textContent = here ? (here.view ? `${current}: ${here.view.name}` : current) : mflTitle;
        const views = root.querySelector(".fuad-views");
        const list = here && here.section.views;
        views.hidden = !list;
        if (list) {
            views.setAttribute("aria-label", `${current} views`);
            views.innerHTML = list.map((view) => `<a href="${esc(view.href)}"${here.view === view ? ' aria-current="page"' : ""}>${esc(view.name)}</a>`).join("");
        }
    };
    render();
    document.body.prepend(root);
    document.documentElement.classList.add("fuad-framed");

    const menuButton = root.querySelector(".fuad-menu-button");
    const menuLayer = root.querySelector(".fuad-menu-layer");
    wireMenu(menuLayer);
    menuButton.addEventListener("click", () => {
        menuButton.setAttribute("aria-expanded", "true");
        openDialog(menuLayer, {onClose: () => menuButton.setAttribute("aria-expanded", "false")});
    });
    const teamButton = root.querySelector(".fuad-team");
    if (teamButton) {
        const sheetLayer = root.querySelector(".fuad-sheet-layer");
        teamButton.addEventListener("click", () => {
            teamButton.setAttribute("aria-expanded", "true");
            openDialog(sheetLayer, {onClose: () => teamButton.setAttribute("aria-expanded", "false")});
        });
    }

    // links to another home page tab only change the #, which MFL doesn't follow on its own
    window.addEventListener("hashchange", () => {
        const index = (window.location.hash.match(/^#(\d+)$/) || [])[1];
        if (index !== undefined && typeof window.show_tab === "function" && document.getElementById(`tabcontent${index}`)) {
            window.show_tab(index);
        }
        render();
    });

    loadContext(context)
        .then((line) => {
            root.querySelector(".fuad-context").textContent = line;
        })
        .catch((error) => console.warn("[fuad] couldn't tell the week:", error));

    installPopup({context, franchiseId});
}
