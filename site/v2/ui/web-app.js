// The league site as an app on a phone's home screen (docs/design.md). MFL serves the pages, so no
// service worker can be ours: only the manifest, which the page links as a blob, since the address
// the icon opens must be the page's own host, and names the season, which a file on Pages can't know.
// A browser reads it only to add the icon; a page in the browser looks the same.

import {exportUrl} from "../lib/mfl.js";
import {save, saved} from "./store.js";
import {mflFetch} from "./page-fetch.js";

// on the address the icon opens, so a launch can be told from a visit
export const LAUNCH = "fuadApp";
const DAY = 24 * 60 * 60 * 1000;
const YEAR = 365 * DAY;

// `id` names no season, so Android takes next season's manifest as this app's, with its new address
export function webAppManifest({origin, season, leagueId, name, shortName, iconBase}) {
    const icon = (file, size, purpose) => ({src: `${iconBase}${file}`, sizes: `${size}x${size}`, type: "image/png", purpose});
    return {
        id: `${origin}/fuad-app/${leagueId}`,
        name,
        short_name: shortName,
        start_url: `${origin}/${season}/home/${leagueId}?${LAUNCH}=1`,
        scope: `${origin}/`,
        display: "standalone",
        background_color: "#0D1117",
        theme_color: "#0D1117",
        // the wordmark stays inside the middle circle, so one picture serves as both
        icons: [icon("icon-192.png", 192, "any"), icon("icon-512.png", 512, "any"), icon("icon-512.png", 512, "maskable")]
    };
}

function meta(doc, name, content) {
    const tag = doc.querySelector(`meta[name="${name}"]`) || doc.head.appendChild(doc.createElement("meta"));
    tag.setAttribute("name", name);
    tag.setAttribute("content", content);
}

export function linkWebApp(doc, {context, wordmark, iconBase, browser = globalThis}) {
    const manifest = webAppManifest({
        origin: browser.location.origin, season: context.season, leagueId: context.leagueId,
        // not MFL's page title, which names the page too, so each page would offer another name
        name: wordmark, shortName: wordmark, iconBase
    });
    // browsers take the first: one already there is made ours
    const link = doc.querySelector('link[rel="manifest"]') || doc.head.appendChild(doc.createElement("link"));
    link.setAttribute("rel", "manifest");
    link.setAttribute("href", browser.URL.createObjectURL(new browser.Blob([JSON.stringify(manifest)], {type: "application/manifest+json"})));
    // an iPhone takes the icon and name from these before the manifest, and MFL's page has its own icon
    let touch = doc.querySelector('link[rel="apple-touch-icon"]');
    if (!touch) {
        touch = doc.head.appendChild(doc.createElement("link"));
        touch.setAttribute("rel", "apple-touch-icon");
    }
    touch.setAttribute("href", `${iconBase}apple-touch-icon.png`);
    meta(doc, "apple-mobile-web-app-title", wordmark);
    // full screen on iPhones before iOS 26, which may not read the manifest
    meta(doc, "apple-mobile-web-app-capable", "yes");
    meta(doc, "mobile-web-app-capable", "yes");
    // Chrome's own install bar on Android; its menu still installs
    browser.addEventListener("beforeinstallprompt", (event) => event.preventDefault());
}

// MFL answers a season with no site with a 404 or an error document, as the daily job reads it
async function hasSite({origin, season, leagueId, fetchImpl}) {
    const response = await fetchImpl(exportUrl(origin, season, "league", {L: leagueId}), {cache: "no-store"});
    if (!response.ok) {
        return false;
    }
    const body = await response.json();
    return Boolean(body && body.league);
}

// MFL keeps each season's site, so a newer one found is kept a year; none, a day, as the new one
// appears at renewal, after the new year. A failed request counts as none, so a launch asks MFL at
// most once a day, and a renewal is seen a day late at worst.
const seasonKey = (season) => `fuad.appSeason.${season}`;

function knownNewest(season) {
    const entry = saved(seasonKey(season));
    const age = entry ? Date.now() - entry.storedAt : Infinity;
    return entry && age < (entry.value > season ? YEAR : DAY) ? entry.value : null;
}

export async function newestSeason({origin, season, leagueId, year, fetchImpl}) {
    const known = knownNewest(season);
    if (known !== null) {
        return known;
    }
    let newest = season;
    try {
        while (newest < year && await hasSite({origin, season: newest + 1, leagueId, fetchImpl})) {
            newest += 1;
        }
    } catch (error) {
        console.warn("[fuad] couldn't look for a newer season:", error);
    }
    save(seasonKey(season), newest);
    return newest;
}

// An icon keeps the address it was added with (an iPhone never reads the manifest again), so a launch
// onto a past season's site goes on to the newest one, as a launch, so a later year's goes on again.
// True when it's going there at once, as already known, so the page reads nothing more; otherwise MFL
// is asked behind the page, which moves on if there's a newer season. The marker is taken off, so a
// reload or a shared link isn't a launch.
export function launchedApp({context, browser = globalThis, fetchImpl = mflFetch}) {
    const url = new URL(browser.location.href);
    if (!url.searchParams.has(LAUNCH)) {
        return false;
    }
    url.searchParams.delete(LAUNCH);
    browser.history.replaceState(browser.history.state, "", url.pathname + url.search + url.hash);
    const year = new Date().getFullYear();
    if (context.season >= year) {
        return false;
    }
    const goTo = (newest) => {
        if (newest <= context.season) {
            return false;
        }
        browser.location.replace(`${url.origin}/${newest}/home/${context.leagueId}?${LAUNCH}=1`);
        return true;
    };
    const known = knownNewest(context.season);
    if (known !== null) {
        return goTo(known);
    }
    newestSeason({origin: url.origin, season: context.season, leagueId: context.leagueId, year, fetchImpl}).then(goTo);
    return false;
}
