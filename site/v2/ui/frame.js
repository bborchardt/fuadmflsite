// v2's frame on every league page: the header (site menu, wordmark and context line, team button),
// the five sections, the current section's views, the team sheet (with the looks and Full width) and the player
// popup. MFL's own menus are hidden only once the frame is drawn, so if this fails the page keeps
// MFL's navigation.

import settings, {league} from "../lib/settings.js";
import {clean, esc, initials} from "./html.js";
import {testLeagueNote} from "./test-league.js";
import {REBUILT, leavesPage, locate, pageOf, sections, teamLinks} from "./nav.js";
import {loadContext} from "./context.js";
import {openDialog} from "./dialog.js";
import {installPopup} from "./popup.js";
import {LOOKS, looksMarkup, teamSkin, wireLooks} from "./looks.js";
import {widthMarkup, wireWidth} from "./width.js";

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
const BACK_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"></path></svg>';
const CLOSE_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>';
const SEARCH_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path></svg>';

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

// why the commissioner's view is in this look, since it can differ by device
function commishLookNote(look, followed) {
    return followed ? `Look: ${look.name}, from your team on this device` : "Visit as your team to use your look here";
}

function teamSheet({team, member, setup, logout, become, franchiseId, look, wide}) {
    const switchTo = become && become.getAttribute("href");
    return `
    <section class="fuad-sheet" role="dialog" aria-modal="true" aria-labelledby="fuad-sheet-title">
        <div class="fuad-dialog-head">
            <h2 id="fuad-sheet-title">${esc(team ? team.name : "Commissioner")}</h2>
            <button type="button" class="fuad-close" data-close aria-label="Close">${CLOSE_ICON}</button>
        </div>
        <div class="fuad-sheet-actions">
            ${member && setup ? `<a class="fuad-button fuad-button-quiet" href="${esc(setup.getAttribute("href"))}">Franchise setup</a>` : ""}
            ${logout ? `<a class="fuad-button fuad-button-quiet" href="${esc(logout.getAttribute("href"))}">Log out</a>` : ""}
        </div>
        ${member ? looksMarkup(LOOKS, look) : ""}
        ${member ? widthMarkup(wide) : ""}
        ${franchiseId === "0000" && switchTo ? `<p class="fuad-sheet-note fuad-muted">${esc(commishLookNote(look, teamSkin() !== null))}</p>` : ""}
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

// logged out, a view that needs a login (nav.js) is one line, whose link comes back to the view
function loginPage(view, loginHref) {
    let mount = document.getElementById("fuad-login-page");
    if (view && !mount) {
        mount = document.createElement("main");
        mount.id = "fuad-login-page";
        (document.querySelector(".pagebody") || document.body).prepend(mount);
    }
    if (view) {
        mount.innerHTML = `<section class="fuad-panel"><p class="fuad-muted"><a href="${esc(`${loginHref}&URL=${encodeURIComponent(view.after)}`)}">Log in</a> to ${esc(view.login)}.</p></section>`;
    }
    document.documentElement.classList.toggle("fuad-login-page-on", Boolean(view));
}

export function drawFrame({context}) {
    const {season, leagueId} = context;
    const base = `${window.location.origin}/${season}`;
    const franchiseId = window.franchise_id || null;
    const member = Boolean(franchiseId && franchiseId !== "0000");
    const all = sections({base, leagueId, franchiseId, rebuilt: REBUILT});
    const database = window.franchiseDatabase || {};
    const team = franchiseId && database[`fid_${franchiseId}`] ? database[`fid_${franchiseId}`] : null;
    const logout = mflLink((a) => /^log\s*out$/i.test(clean(a.textContent)));
    const login = mflLink((a) => /^log\s*in$/i.test(clean(a.textContent)));
    const become = mflLink((a) => /[?&]BECOME=/.test(a.getAttribute("href")));
    const setup = mflLink((a) => /\/csetup\?.*\bC=FRANCHISE\b/.test(a.getAttribute("href")));
    const loggedIn = Boolean(franchiseId);
    const mflTitle = clean((document.querySelector(".pagetitle h1") || {}).textContent);
    // as boot applied it
    const look = LOOKS.find((entry) => entry.id === document.documentElement.getAttribute("data-fuad-look")) || LOOKS[0];

    const root = document.createElement("div");
    root.id = "fuad-frame";
    root.innerHTML = `
    <header class="fuad-top">
        <button type="button" class="fuad-back" aria-label="Back" hidden>${BACK_ICON}</button>
        <button type="button" class="fuad-menu-button" aria-label="Menu" aria-expanded="false" aria-haspopup="dialog">${MENU_ICON}<span class="fuad-menu-word" aria-hidden="true">Menu</span></button>
        <a class="fuad-brand" href="${esc(all[0].href)}"><span class="fuad-wordmark">${esc(settings.wordmark)}${franchiseId === "0000" ? '<span class="fuad-commish-tag"><span class="fuad-commish-long">Commissioner</span><span class="fuad-commish-short">Commish</span></span>' : ""}</span><span class="fuad-context"></span></a>
        <span class="fuad-detour" hidden><span class="fuad-wordmark">${esc(settings.wordmark)}</span><span class="fuad-detour-title"></span></span>
        <nav class="fuad-sections fuad-sections-top" aria-label="Sections"></nav>
        ${loggedIn
            ? `<button type="button" class="fuad-team" aria-label="${esc(team ? `${team.name}: your team` : "Commissioner")}" aria-haspopup="dialog">${esc(initials(team ? team.name : "Commissioner"))}</button>`
            : `<a class="fuad-login" href="${esc(login ? login.getAttribute("href") : `${base}/login?L=${leagueId}`)}">Log in</a>`}
    </header>
    ${testLeagueNote(league, settings, franchiseId === "0000")}
    <h1 class="fuad-hidden"></h1>
    <nav class="fuad-views" hidden></nav>
    <nav class="fuad-sections fuad-sections-bottom" aria-label="Sections"></nav>
    <div class="fuad-layer fuad-menu-layer" hidden>${siteMenu(mflMenu())}</div>
    ${loggedIn ? `<div class="fuad-layer fuad-sheet-layer" hidden>${teamSheet({team, member, setup, logout, become, franchiseId, look, wide: document.body.classList.contains("full-width")})}</div>` : ""}`;

    const render = () => {
        const page = pageOf(window.location);
        const here = locate(all, page, franchiseId);
        const current = here && here.section.name;
        const gated = page.path === "home" && page.hash && here && (here.view || here.section).login ? here.view || here.section : null;
        // v2's Home replaces the home page's Main tab; its other tabs are still MFL's
        document.documentElement.classList.toggle("fuad-home-on", page.path === "home" && current === "Home");
        document.documentElement.classList.toggle("fuad-league-on", page.path === "home" && Boolean(page.hash) && current === "League");
        document.documentElement.classList.toggle("fuad-rosters-on", page.path === "home" && Boolean(page.hash) && current === "Rosters" && !gated);
        loginPage(gated, `${base}/login?L=${encodeURIComponent(leagueId)}`);
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

    // A section or view on another page is lit at once, with a bar along the top, so a tap shows
    // while MFL sends the page; one on this page (a home page view) is drawn by the hashchange
    root.addEventListener("click", (event) => {
        const link = event.target.closest(".fuad-sections a, .fuad-views a");
        if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !leavesPage(link.href)) {
            return;
        }
        const nav = link.parentElement;
        const at = [...nav.children].indexOf(link);
        const lit = nav.classList.contains("fuad-sections") ? root.querySelectorAll(".fuad-sections") : [nav];
        root.querySelectorAll(".fuad-views a").forEach((a) => a.removeAttribute("aria-current"));
        lit.forEach((each) => [...each.children].forEach((a, index) => {
            if (index === at) {
                a.setAttribute("aria-current", "page");
            } else {
                a.removeAttribute("aria-current");
            }
        }));
        document.documentElement.classList.add("fuad-leaving");
        // a load stopped or swiped back from leaves this page up: as it was, before the header's cover would give up
        clearTimeout(leftAt);
        leftAt = setTimeout(stay, 30000);
    });
    let leftAt;
    const stay = () => {
        clearTimeout(leftAt);
        document.documentElement.classList.remove("fuad-leaving");
        render();
    };
    // Back to this page from the browser's cache: as it was
    window.addEventListener("pageshow", (event) => {
        if (event.persisted) {
            stay();
        }
    });

    const menuButton = root.querySelector(".fuad-menu-button");
    const menuLayer = root.querySelector(".fuad-menu-layer");
    wireMenu(menuLayer);
    // with a mouse, the filter takes focus so typing finds a page; on a touch screen that would raise
    // the keyboard over the menu
    const filter = menuLayer.querySelector(".fuad-search input");
    menuButton.addEventListener("click", () => {
        menuButton.setAttribute("aria-expanded", "true");
        filter.toggleAttribute("autofocus", window.matchMedia("(hover: hover) and (pointer: fine)").matches);
        openDialog(menuLayer, {history: true, onClose: () => menuButton.setAttribute("aria-expanded", "false")});
    });
    const teamButton = root.querySelector(".fuad-team");
    if (teamButton) {
        const sheetLayer = root.querySelector(".fuad-sheet-layer");
        if (member) {
            wireLooks(sheetLayer.querySelector(".fuad-looks"), context, look);
            wireWidth(sheetLayer.querySelector(".fuad-width"), context);
        }
        teamButton.addEventListener("click", () => {
            // the phone header's height varies with its context line; a short screen (landscape) scrolls the sheet
            const top = Math.round(teamButton.getBoundingClientRect().bottom) + 8;
            sheetLayer.firstElementChild.style.top = `${top}px`;
            sheetLayer.firstElementChild.style.maxHeight = `calc(100% - ${top + 16}px)`;
            teamButton.setAttribute("aria-expanded", "true");
            openDialog(sheetLayer, {history: true, onClose: () => teamButton.setAttribute("aria-expanded", "false")});
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

    // A detour's screen (Moves › Add's drop step and review, a trade's steps): on phones its name takes the context
    // line's place and Back the menu's: the browser's Back, since each screen is a history entry.
    // `onTitle` makes the name a button (the player popup).
    const back = root.querySelector(".fuad-back");
    const detour = root.querySelector(".fuad-detour");
    back.addEventListener("click", () => window.history.back());
    window.fuadDetour = (screen) => {
        document.documentElement.classList.toggle("fuad-detouring", Boolean(screen));
        back.hidden = !screen;
        detour.hidden = !screen;
        const title = detour.querySelector(".fuad-detour-title");
        if (!screen) {
            title.innerHTML = "";
        } else if (screen.onTitle) {
            title.innerHTML = `<button type="button" class="fuad-detour-link">${esc(screen.title)} ›</button>`;
            title.firstChild.addEventListener("click", (event) => screen.onTitle(event.currentTarget));
        } else {
            title.textContent = screen.title;
        }
    };

    loadContext(context)
        .then((line) => {
            root.querySelector(".fuad-context").textContent = line;
        })
        .catch((error) => console.warn("[fuad] couldn't tell the week:", error));

    const rosters = all.find((section) => section.name === "Rosters");
    const teamHref = teamLinks(rosters.views.find((view) => view.name === "Teams").href);
    installPopup({context, franchiseId, teamHref});
    toOwnTeamPages({season, leagueId, teamHref});
}

// MFL's links to a team's page this season (the message board's posters, MFL's own reports) lead to
// v2's instead, set as the link is used, so a new tab or a copied link gets it too
function toOwnTeamPages({season, leagueId, teamHref}) {
    const ours = (link) => {
        let url;
        try {
            url = new URL(link.href);
        } catch (error) {
            return null;
        }
        const params = url.searchParams;
        const team = params.get("F") || "";
        const only = [...params.keys()].every((key) => ["L", "F", "O"].includes(key));
        return url.origin === window.location.origin && url.pathname === `/${season}/options` && only && params.get("L") === String(leagueId)
            && ["01", "07"].includes(params.get("O")) && /^\d{4}$/.test(team) && team !== "0000" ? teamHref(team) : null;
    };
    ["click", "auxclick", "contextmenu"].forEach((type) => document.addEventListener(type, (event) => {
        const link = event.target.closest && event.target.closest("a[href]");
        const href = link && ours(link);
        if (href) {
            link.href = href;
        }
    }, true));
}
