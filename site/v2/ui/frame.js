// v2's frame on every league page: the five sections, the current section's views, and the team
// sheet with everything else. MFL's own menus are hidden only once the frame is drawn, so if this
// fails the page keeps MFL's navigation.

import {esc} from "./html.js";

const TABS_KEY = "fuad.homeTabs";
// MFL picks a home page tab by its position in the URL's #; positions are learned from the home
// page and remembered, these until then
const DEFAULT_TABS = {Main: 0, Standings: 1, Transactions: 2, Contracts: 3, Calendar: 4, Commish: 5, Links: 6};

const ICONS = {
    Home: '<path d="M3 11l9-7 9 7"></path><path d="M5 10v10h14V10"></path>',
    Lineup: '<path d="M8 6h12M8 12h12M8 18h12"></path><circle cx="4" cy="6" r="1"></circle><circle cx="4" cy="12" r="1"></circle><circle cx="4" cy="18" r="1"></circle>',
    Moves: '<path d="M7 4L3 8l4 4"></path><path d="M3 8h14"></path><path d="M17 20l4-4-4-4"></path><path d="M21 16H7"></path>',
    League: '<path d="M8 21h8M12 17v4"></path><path d="M7 4h10v5a5 5 0 0 1-10 0z"></path><path d="M17 6h3a3 3 0 0 1-3 4M7 6H4a3 3 0 0 0 3 4"></path>',
    Rosters: '<circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"></path><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.6.8 2.7 2.6 3 5.2"></path>'
};

const icon = (name) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

// Where each section and view goes, and which pages belong to it. Until a section is rebuilt, its
// views are today's MFL pages and home page tabs.
export function sections({base, leagueId, franchiseId, tabs = DEFAULT_TABS}) {
    const page = (path) => `${base}/${path}${path.includes("?") ? "&" : "?"}L=${leagueId}`;
    const option = (code, extra = "") => `${base}/options?L=${leagueId}&O=${code}${extra}`;
    const tab = (name) => `${base}/home/${leagueId}#${tabs[name] === undefined ? DEFAULT_TABS[name] : tabs[name]}`;
    const myTeam = franchiseId && franchiseId !== "0000" ? `&F=${franchiseId}` : "";
    return [
        {name: "Home", href: tab("Main"), match: {tabs: ["Main"]}},
        {name: "Lineup", href: page("lineup"), match: {paths: ["lineup"], options: ["02"]}},
        {name: "Moves", views: [
            {name: "Add/Drop", href: page("add_drop"), match: {paths: ["add_drop"], options: ["255"]}},
            {name: "Trades", href: option("05"), match: {paths: ["trade_offer", "trade_response"], options: ["05"]}},
            {name: "IR", href: option("18"), match: {paths: ["ir"], options: ["18"]}},
            {name: "Recent", href: option("03"), match: {paths: ["processed_waivers"], options: ["03"]}}
        ]},
        {name: "League", views: [
            {name: "Scores", href: page("ajax_ls"), match: {paths: ["ajax_ls"], options: ["22", "15"]}},
            {name: "Standings", href: tab("Standings"), match: {paths: ["standings"], tabs: ["Standings"]}},
            {name: "Power", href: option("101"), match: {options: ["101"]}}
        ]},
        {name: "Rosters", views: [
            {name: "My team", href: option("07", myTeam), match: {options: ["07"], mine: true}},
            {name: "Teams", href: option("07"), match: {options: ["07"]}},
            {name: "All players", href: tab("Contracts"), match: {tabs: ["Contracts"]}},
            {name: "Draft", href: option("17"), match: {options: ["17", "100"]}}
        ]}
    ].map((section) => section.views ? {...section, href: section.views[0].href} : section);
}

// {path, option, team, tab} for a page: the MFL page name, its O= report, its F= team, and on the
// home page the name of the tab the # picks
export function pageOf(location, tabs = DEFAULT_TABS) {
    const path = (location.pathname.match(/^\/\d{4}\/([a-z_]+)/) || [])[1] || "";
    const params = new URLSearchParams(location.search);
    let tab = null;
    if (path === "home") {
        const index = Number((location.hash.match(/^#(\d+)/) || [])[1] || 0);
        tab = Object.keys(tabs).find((name) => tabs[name] === index) || null;
    }
    return {path, option: params.get("O"), team: params.get("F"), tab};
}

function matches(match, page, franchiseId) {
    if (match.tabs && page.tab && match.tabs.includes(page.tab)) {
        return true;
    }
    if (match.paths && match.paths.includes(page.path)) {
        return true;
    }
    if (match.options && page.path === "options" && match.options.includes(page.option)) {
        return match.mine === undefined || match.mine === Boolean(franchiseId && page.team === franchiseId);
    }
    return false;
}

// the section and view a page belongs to; null for pages left to the team sheet
export function locate(all, page, franchiseId) {
    for (const section of all) {
        if (section.match && matches(section.match, page, franchiseId)) {
            return {section, view: null};
        }
        for (const view of section.views || []) {
            if (matches(view.match, page, franchiseId)) {
                return {section, view};
            }
        }
    }
    return null;
}

function storedTabs(storage) {
    const names = [...document.querySelectorAll("#homepagetabs > li")].map((li) => li.textContent.trim());
    if (names.length) {
        const tabs = {};
        names.forEach((name, index) => {
            tabs[name] = index;
        });
        storage.set(TABS_KEY, JSON.stringify(tabs));
        return tabs;
    }
    try {
        return JSON.parse(storage.get(TABS_KEY)) || DEFAULT_TABS;
    } catch (error) {
        return DEFAULT_TABS;
    }
}

// MFL's own league menu, in its groups, for the sheet's "All MFL pages"
function mflMenu() {
    return [...document.querySelectorAll(".myfantasyleague_menu > ul > li.has-sub")].map((li) => ({
        name: (li.querySelector(":scope > a") || {}).textContent || "",
        links: [...li.querySelectorAll("ul a[href]")].map((a) => ({text: a.textContent.trim(), href: a.getAttribute("href")}))
    })).filter((group) => group.links.length);
}

function mflLink(test) {
    return [...document.querySelectorAll(".myfantasyleague_menu a[href]")].find(test) || null;
}

function teamButton(team) {
    if (team && team.icon) {
        return `<img src="${esc(team.icon)}" alt="">`;
    }
    const initials = team ? team.name.split(/\s+/).filter((word) => /^[A-Za-z]/.test(word)).slice(0, 2).map((word) => word[0]).join("").toUpperCase() : "";
    return initials ? esc(initials) : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"></circle><path d="M4 21c1-4.5 4-7 8-7s7 2.5 8 7"></path></svg>';
}

function sheet({base, leagueId, franchiseId, team, all, homeUrl}) {
    const option = (code, extra = "") => `${base}/options?L=${leagueId}&O=${code}${extra}`;
    const league = [
        ["League bylaws", option("26")],
        ["Scoring system", option("09")],
        ["League history", option("156")],
        ["Player stats", option("08")],
        ["Playoff bracket", option("79")],
        ["Calendar", homeUrl("Calendar")],
        ["Accounting", `${base}/accounting_report?L=${leagueId}`]
    ];
    const commish = franchiseId === "0000" ? [
        ["Commish tools", homeUrl("Commish")],
        ["Cap penalties", `${base}/csetup?L=${leagueId}&C=SALADJ`],
        ["Set contracts", `${base}/csetup?L=${leagueId}&C=SALARIES`]
    ] : [];
    const login = mflLink((a) => /^log\s*(in|out)$/i.test(a.textContent.replace(/\s+/g, " ").trim()));
    const become = mflLink((a) => /[?&]BECOME=/.test(a.getAttribute("href")));
    const links = (items) => `<ul class="fuad-sheet-links">${items.map(([text, href]) => `<li><a href="${esc(href)}">${esc(text)}</a></li>`).join("")}</ul>`;
    const myTeam = all[4].views[0].href;
    return `
    <div class="fuad-sheet-panel" role="dialog" aria-modal="true" aria-labelledby="fuad-sheet-title">
        <div class="fuad-sheet-head">
            <h2 id="fuad-sheet-title">${esc(team ? team.name : "Guest")}</h2>
            <button type="button" class="fuad-sheet-close" aria-label="Close">&#x2715;</button>
        </div>
        <div class="fuad-sheet-actions">
            ${team && franchiseId !== "0000" ? `<a class="fuad-button" href="${esc(myTeam)}">My team</a>` : ""}
            ${login ? `<a class="fuad-button fuad-button-quiet" href="${esc(login.getAttribute("href"))}">${esc(login.textContent.trim())}</a>` : ""}
        </div>
        ${become ? `
        <div class="fuad-switch" role="group" aria-label="Viewing as">
            <span>Viewing as</span>
            ${franchiseId === "0000"
                ? `<a href="${esc(become.getAttribute("href"))}">Member</a><span aria-current="true">Commissioner</span>`
                : `<span aria-current="true">Member</span><a href="${esc(become.getAttribute("href"))}">Commissioner</a>`}
        </div>` : ""}
        <h3>League</h3>
        ${links(league)}
        ${commish.length ? `<h3>Commish</h3>${links(commish)}` : ""}
        <h3>All MFL pages</h3>
        <input type="search" class="fuad-sheet-filter" placeholder="Filter" aria-label="Filter MFL pages">
        <div class="fuad-sheet-menu">
            ${mflMenu().map((group) => `
            <details>
                <summary>${esc(group.name)}</summary>
                ${links(group.links.map((link) => [link.text, link.href]))}
            </details>`).join("")}
        </div>
    </div>`;
}

function wireSheet(root) {
    const panel = root.querySelector(".fuad-sheet");
    const open = () => {
        panel.hidden = false;
        document.documentElement.classList.add("fuad-sheet-open");
        panel.querySelector(".fuad-sheet-close").focus();
    };
    const close = () => {
        panel.hidden = true;
        document.documentElement.classList.remove("fuad-sheet-open");
    };
    root.querySelectorAll(".fuad-team").forEach((button) => button.addEventListener("click", open));
    panel.addEventListener("click", (event) => {
        if (event.target === panel || event.target.closest(".fuad-sheet-close")) {
            close();
        }
    });
    panel.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            close();
        }
    });
    const filter = panel.querySelector(".fuad-sheet-filter");
    filter.addEventListener("input", () => {
        const term = filter.value.trim().toLowerCase();
        panel.querySelectorAll(".fuad-sheet-menu details").forEach((group) => {
            let shown = 0;
            group.querySelectorAll("li").forEach((item) => {
                const hit = !term || item.textContent.toLowerCase().includes(term);
                item.hidden = !hit;
                shown += hit ? 1 : 0;
            });
            group.hidden = !shown;
            group.open = Boolean(term) && shown > 0;
        });
    });
}

export function drawFrame({context, storage}) {
    const {season, leagueId} = context;
    const base = `${window.location.origin}/${season}`;
    const franchiseId = window.franchise_id || null;
    const tabs = storedTabs(storage);
    const all = sections({base, leagueId, franchiseId, tabs});
    const database = window.franchiseDatabase || {};
    const team = franchiseId && database[`fid_${franchiseId}`] ? database[`fid_${franchiseId}`] : null;
    const homeUrl = (name) => `${base}/home/${leagueId}#${tabs[name] === undefined ? DEFAULT_TABS[name] : tabs[name]}`;

    const root = document.createElement("div");
    root.id = "fuad-frame";
    const render = () => {
        const here = locate(all, pageOf(window.location, tabs), franchiseId);
        const current = here && here.section.name;
        const sectionLinks = all.map((section) => `<a href="${esc(section.href)}"${section.name === current ? ' aria-current="page"' : ""}>${icon(section.name)}<span>${esc(section.name)}</span></a>`).join("");
        const views = here && here.section.views ? here.section.views : null;
        root.innerHTML = `
        <header class="fuad-top">
            <a class="fuad-brand" href="${esc(all[0].href)}">FUAD</a>
            <span class="fuad-title">${esc(current || "League site")}</span>
            <nav class="fuad-sections fuad-sections-top" aria-label="Sections">${sectionLinks}</nav>
            <button type="button" class="fuad-team" aria-label="${esc(team ? `${team.name}: menu` : "Menu")}">${teamButton(team)}</button>
        </header>
        ${views ? `<nav class="fuad-views" aria-label="${esc(current)}">${views.map((view) => `<a href="${esc(view.href)}"${here.view === view ? ' aria-current="page"' : ""}>${esc(view.name)}</a>`).join("")}</nav>` : ""}
        <nav class="fuad-sections fuad-sections-bottom" aria-label="Sections">${sectionLinks}</nav>
        <div class="fuad-sheet" hidden>${sheet({base, leagueId, franchiseId, team, all, homeUrl})}</div>`;
        wireSheet(root);
    };
    render();
    document.body.prepend(root);
    document.documentElement.classList.add("fuad-framed");

    // links to another home page tab only change the #, which MFL doesn't follow on its own
    window.addEventListener("hashchange", () => {
        const index = (window.location.hash.match(/^#(\d+)$/) || [])[1];
        if (index !== undefined && typeof window.show_tab === "function" && document.getElementById(`tabcontent${index}`)) {
            window.show_tab(index);
        }
        render();
    });
}
