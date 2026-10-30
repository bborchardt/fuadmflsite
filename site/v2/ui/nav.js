// The five sections and their views: where each goes, and which pages belong to it. A view that v2
// has rebuilt lives on the home page under its own # (`#league-standings`); until then it's the
// nearest MFL page or home page tab.

const TABS_KEY = "fuad.homeTabs";
// MFL picks a home page tab by its position in the URL's #; positions are learned from the home
// page and remembered, these until then
export const DEFAULT_TABS = {Main: 0, Standings: 1, Transactions: 2, Contracts: 3, Calendar: 4, Commish: 5, Links: 6};

// the views v2 draws itself, on the home page
export const REBUILT = ["Home", "League/Scores", "League/Standings", "League/Power", "League/Winners", "Rosters/My team", "Rosters/Teams", "Rosters/Players", "Rosters/Draft"];

// MFL sends anyone logged out from these to its login screen; v2 draws its own page for each instead,
// saying what logging in is for
export const NEEDS_LOGIN = {
    "Lineup": "set your lineup",
    "Moves/Add": "make moves",
    "Moves/Drop": "make moves",
    "Moves/Trades": "make moves",
    "Moves/IR": "make moves",
    "Rosters/My team": "see your team"
};

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

// Home isn't `#home`: that's the id of MFL's page body on the home page, and browsers scroll to it,
// past the frame (Safari even with a scroll margin)
export function viewHash(section, view) {
    return section === "Home" && !view ? "#home-page" : `#${slug(section)}${view ? `-${slug(view)}` : ""}`;
}

// `rebuilt` lists the "Section" or "Section/View" names v2 draws itself
export function sections({base, leagueId, franchiseId, tabs = DEFAULT_TABS, rebuilt = []}) {
    const page = (path) => `${base}/${path}${path.includes("?") ? "&" : "?"}L=${leagueId}`;
    const option = (code, extra = "") => `${base}/options?L=${leagueId}&O=${code}${extra}`;
    const tab = (name) => `${base}/home/${leagueId}#${tabs[name] === undefined ? DEFAULT_TABS[name] : tabs[name]}`;
    const member = franchiseId && franchiseId !== "0000";
    // `after` is where a view's login page leads once logged in
    const own = (href, sectionName, viewName) => {
        const name = viewName ? `${sectionName}/${viewName}` : sectionName;
        const home = `${base}/home/${leagueId}${viewHash(sectionName, viewName)}`;
        const after = rebuilt.includes(name) ? home : href;
        return !franchiseId && NEEDS_LOGIN[name] ? {href: home, after, login: NEEDS_LOGIN[name]} : {href: after};
    };
    const all = [
        // the message board's pages (`mb/…`), All moves (Transactions), All bids (Processed Waivers) and
        // Rules (League Rules, League Settings) are reached from Home
        {name: "Home", href: tab("Main"), match: {tabs: ["Main"], paths: ["mb", "processed_waivers"], options: ["03", "76", "09", "26"]}},
        {name: "Lineup", href: page("lineup"), match: {paths: ["lineup"], options: ["02"]}},
        {name: "League", views: [
            {name: "Scores", href: page("ajax_ls"), match: {paths: ["ajax_ls"], options: ["22", "15"]}},
            {name: "Standings", href: tab("Standings"), match: {paths: ["standings"], tabs: ["Standings"]}},
            {name: "Power", href: option("101"), match: {options: ["101"]}},
            // MFL has no page for it, so it shows once v2 draws it
            {name: "Winners", href: null, match: {}}
        ]},
        {name: "Moves", views: [
            {name: "Add", href: page("add_drop"), match: {paths: ["add_drop"], options: ["255"]}},
            {name: "Drop", href: option("257"), match: {options: ["257"]}},
            {name: "Trades", href: option("05"), match: {paths: ["trade_offer", "trade_response"], options: ["05"]}},
            {name: "IR", href: option("18"), match: {paths: ["ir"], options: ["18"]}}
        ]},
        {name: "Rosters", views: [
            // the commissioner has no team of their own
            ...(member || !franchiseId ? [{name: "My team", href: option("07", `&F=${franchiseId}`), match: {options: ["07"], mine: true}}] : []),
            {name: "Teams", href: option("07"), match: {options: ["07"]}},
            {name: "Players", href: tab("Contracts"), match: {tabs: ["Contracts"]}},
            {name: "Draft", href: option("17"), match: {options: ["17", "100"]}}
        ]}
    ];
    return all.map((section) => {
        if (!section.views) {
            return {...section, ...own(section.href, section.name), hash: viewHash(section.name)};
        }
        const views = section.views
            .map((view) => ({...view, ...own(view.href, section.name, view.name), hash: viewHash(section.name, view.name)}))
            .filter((view) => view.href);
        // logged out, Rosters opens on Teams rather than My team's login page
        return {...section, views, href: (views.find((view) => !view.login) || views[0]).href};
    });
}

// where a section's link goes: the view last seen in it (`lastViews`, view names by section), so
// leaving a page by another section returns there; the section you're in goes to its first view
export function sectionHref(section, current, lastViews = {}) {
    // a login page isn't kept to: logged out, Rosters still opens on Teams
    const view = section.views && section.name !== current && section.views.find((entry) => entry.name === lastViews[section.name] && !entry.login);
    return view ? view.href : section.href;
}

// a team's page under Teams (`teams`, Rosters › Teams' href), rebuilt or MFL's: id → href
export function teamLinks(teams) {
    return (id) => (teams.includes("#") ? `${teams}/${encodeURIComponent(id)}` : `${teams}&F=${encodeURIComponent(id)}`);
}

// whether following `href` loads another page, rather than changing this one's #
export function leavesPage(href, here = window.location) {
    const to = new URL(href, here.href);
    return `${to.origin}${to.pathname}${to.search}` !== `${here.origin}${here.pathname}${here.search}`;
}

// {path, option, team, tab, hash} for a page: the MFL page name, its O= report, its F= team, and on
// the home page the name of the tab a numeric # picks, or v2's own view #
export function pageOf(location, tabs = DEFAULT_TABS) {
    const path = (location.pathname.match(/^\/\d{4}\/([a-z_]+)/) || [])[1] || "";
    const params = new URLSearchParams(location.search);
    let tab = null;
    let hash = null;
    if (path === "home") {
        const number = location.hash.match(/^#(\d+)/);
        if (number) {
            tab = Object.keys(tabs).find((name) => tabs[name] === Number(number[1])) || null;
        } else if (/^#[a-z]/.test(location.hash)) {
            hash = location.hash;
        } else {
            tab = Object.keys(tabs).find((name) => tabs[name] === 0) || null;
        }
    }
    return {path, option: params.get("O"), team: params.get("F"), tab, hash};
}

function matches(item, page, franchiseId) {
    const {match} = item;
    // a view's own page under it (`#rosters-teams/0004`, one team) belongs to the view
    if (page.hash) {
        return item.href.endsWith(page.hash.split("/")[0]) && item.href.includes("/home/");
    }
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

// the section and view a page belongs to; null for pages left to the site menu
export function locate(all, page, franchiseId) {
    const found = find(all, page, franchiseId);
    // a home page # that isn't one of v2's views (MFL's own anchors) is the Main tab
    return found || !page.hash ? found : find(all, {...page, hash: null, tab: "Main"}, franchiseId);
}

function find(all, page, franchiseId) {
    for (const section of all) {
        if (section.match && matches(section, page, franchiseId)) {
            return {section, view: null};
        }
        for (const view of section.views || []) {
            if (matches(view, page, franchiseId)) {
                return {section, view};
            }
        }
    }
    return null;
}

export function storedTabs(storage, doc = document) {
    const names = [...doc.querySelectorAll("#homepagetabs > li")].map((li) => li.textContent.trim());
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
