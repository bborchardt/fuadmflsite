// Which version a page runs, kept apart from fuad.js so it can be tested. A beta choice holds only
// while the header offers that version, so ending or promoting a beta needs no member action.

export const LOCAL_BASE = "http://localhost:8000/";
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)[:/]/;

// the repo's GitHub Pages address, above this version's folder. A local preview runs from
// tools/dev-server.py, so it takes the address of the published fuad.js that handed it the page.
export function pagesBase(url, doc) {
    const above = new URL("../", url).href;
    if (!LOCAL.test(above) || !doc) {
        return above;
    }
    const published = [...doc.querySelectorAll("script[src]")].map((script) => script.src)
        .find((src) => !LOCAL.test(src) && /\/v\d+\/fuad\.js$/.test(src));
    return published ? published.replace(/v\d+\/fuad\.js$/, "") : above;
}
export const PAGES_BASE = pagesBase(import.meta.url, typeof document === "undefined" ? null : document);

// only this repo's versions and localhost
export function previewBase(choice, versionHere) {
    let match;
    if ((match = /^(v\d+)$/.exec(choice))) {
        return `${PAGES_BASE}${match[1]}/`;
    }
    if ((match = /^local(?::(v\d+))?$/.exec(choice))) {
        return `${LOCAL_BASE}${match[1] || versionHere}/`;
    }
    return null;
}

export function allowed(base) {
    return (base.startsWith(PAGES_BASE) && /^v\d+\/$/.test(base.slice(PAGES_BASE.length)))
        || /^http:\/\/(localhost|127\.0\.0\.1):\d+\/v\d+\/$/.test(base);
}

// the version the header offers as the beta, to anyone: null for no offer, a malformed one, or the
// header's own version
export function offeredVersion(config, versionHere) {
    if (!config || typeof config !== "object" || !/^v\d+$/.test(String(config.version)) || config.version === versionHere) {
        return null;
    }
    return config.version;
}

// the offer to this viewer: null as for offeredVersion, or for a viewer `teams` leaves out
export function betaOffer(config, {versionHere, teamId}) {
    if (!offeredVersion(config, versionHere)) {
        return null;
    }
    // MFL's franchise ids are four digits ("0001"); a team written as 1 means the same
    const id = (team) => String(team).padStart(4, "0");
    if (Array.isArray(config.teams) && !config.teams.map(id).includes(id(teamId))) {
        return null;
    }
    const feedback = /^https:\/\//.test(String(config.feedback || "")) ? String(config.feedback) : null;
    return {version: config.version, base: `${PAGES_BASE}${config.version}/`, feedback};
}

// Returns what to remember ({preview, beta}, null to forget) and `load`: the base to hand the page
// to, or null to run this one. A developer preview wins over the beta. `offered` is the version
// offered to anyone, `offer` the offer to this viewer.
export function decide({here, versionHere, params, preview, beta, offer, offered}) {
    if (params.has("fuadPreview")) {
        const choice = params.get("fuadPreview");
        preview = choice === "off" ? null : previewBase(choice, versionHere);
    }
    if (params.has("fuadBeta")) {
        beta = params.get("fuadBeta") === "on" && offer ? offer.version : null;
    }
    // a stored preview of the header's own version (after a promotion) is no preview
    if (preview && (!allowed(preview) || preview === here)) {
        preview = null;
    }
    // a beta that's over, promoted or replaced by another is forgotten; one offered only to other
    // teams is kept, so the commissioner can switch to 0000 and back without opting in again.
    // `offered` is undefined from an older fuad.js still cached: judge by this viewer's offer.
    const kept = offered === undefined ? offer && offer.version : offered;
    if (beta && beta !== kept) {
        beta = null;
    }
    if (preview) {
        return {preview, beta, load: preview, mode: "preview"};
    }
    if (beta && offer) {
        return {preview, beta, load: offer.base, mode: "beta"};
    }
    return {preview, beta, load: null};
}

export function withParam(href, name, value) {
    const url = new URL(href);
    url.searchParams.set(name, value);
    return url.href;
}
