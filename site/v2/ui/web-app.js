// The league site as an app on a phone's home screen (docs/design.md). MFL serves the pages, so no
// service worker can be ours: only the manifest, which the page links as a blob, since the address
// the icon opens must be the page's own host, and names the season, which a file on Pages can't know.
// A browser reads it only to add the icon; a page in the browser looks the same.

import {cached, saved} from "./store.js";
import {mflFetch} from "./page-fetch.js";

// on the address the icon opens, so a launch can be told from a visit
export const LAUNCH = "fuadApp";
const DAY = 24 * 60 * 60 * 1000;

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
    const link = doc.createElement("link");
    link.setAttribute("rel", "manifest");
    link.setAttribute("href", browser.URL.createObjectURL(new browser.Blob([JSON.stringify(manifest)], {type: "application/manifest+json"})));
    doc.head.appendChild(link);
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

// the newest season's site, from `season` on: MFL keeps each season's site, and a new one appears at
// renewal, after the new year. Any answer is kept a day, a failed one as none, so each launch asks MFL
// at most once a day: a renewal is seen a day late at worst.
const seasonKey = (season) => `fuad.appSeason.${season}`;

export function newestSeason({origin, season, leagueId, year, fetchImpl}) {
    return cached(seasonKey(season), DAY, async () => {
        let newest = season;
        try {
            while (newest < year && (await fetchImpl(`${origin}/${newest + 1}/home/${leagueId}`, {method: "HEAD", cache: "no-store"})).ok) {
                newest += 1;
            }
        } catch (error) {
            console.warn("[fuad] couldn't look for a newer season:", error);
        }
        return newest;
    });
}

// An icon keeps the address it was added with (an iPhone never reads the manifest again), so a launch
// onto a past season's site goes on to the newest one. True when it's going there at once, as already
// known, so the page reads nothing more; otherwise MFL is asked behind the page, which moves on if
// there's a newer season. The marker is taken off, so a reload or a shared link isn't a launch.
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
        browser.location.replace(`${url.origin}/${newest}/home/${context.leagueId}`);
        return true;
    };
    const known = saved(seasonKey(context.season));
    if (known && Date.now() - known.storedAt < DAY) {
        return goTo(known.value);
    }
    newestSeason({origin: url.origin, season: context.season, leagueId: context.leagueId, year, fetchImpl}).then(goTo);
    return false;
}
