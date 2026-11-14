// Which version a page runs, kept apart from fuad.js so it can be tested. A beta choice holds only
// while the header offers that version, so ending or promoting a beta needs no member action.

export const PAGES_BASE = "https://bborchardt.github.io/fuadmflsite/";
export const LOCAL_BASE = "http://localhost:8000/";

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
    return /^https:\/\/bborchardt\.github\.io\/fuadmflsite\/v\d+\/$/.test(base)
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
    // MFL's franchise ids are four digits ("0001"); a team written as 1 means the same. A visitor
    // who isn't logged in has no team: "guest" in `teams`.
    const id = (team) => String(team).padStart(4, "0");
    const viewer = teamId ? id(teamId) : "guest";
    if (Array.isArray(config.teams) && !config.teams.map(id).includes(viewer)) {
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
