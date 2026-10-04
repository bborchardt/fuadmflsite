// Which version of the league code a page runs, decided by the entry point (fuad.js) that the
// header message loads. No DOM and no storage, so it can be tested.
//
// Two ways to run another version than the header's, both remembered per browser:
// - a developer preview, from ?fuadPreview= (a published version or a local one);
// - the beta the commissioner offers in the header message:
//     <script>window.fuadBeta = {version: "v2", feedback: "<link>", teams: ["0001"]};</script>
//   `teams` limits the offer to those franchise ids (leave it out for everyone), and `feedback`
//   is where the beta's bar links. Members opt in and out with ?fuadBeta=on and ?fuadBeta=off.
//   A choice is kept only while the header offers that version, so removing the line ends the
//   beta, and making it the header's version promotes it, for everyone at their next page load.

export const PAGES_BASE = "https://bborchardt.github.io/fuadmflsite/";
export const LOCAL_BASE = "http://localhost:8000/";

/** Turn a ?fuadPreview= value into a base URL. Only this repo's versions and localhost are allowed. */
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

/**
 * The beta the header offers this viewer, as {version, base, feedback}, or null: none offered,
 * a malformed offer, the header's own version, or a viewer `teams` leaves out. `teamId` is MFL's
 * franchise_id for the viewer.
 */
export function betaOffer(config, {versionHere, teamId}) {
    if (!config || typeof config !== "object" || !/^v\d+$/.test(String(config.version)) || config.version === versionHere) {
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

/**
 * What the header's entry point does with this page. `params` are the address bar's
 * URLSearchParams; `preview` and `beta` what this browser remembers (a preview base URL and a
 * beta version); `offer` the betaOffer. Returns {preview, beta}: what to remember now (null to
 * forget), and {load: base, mode: "preview" | "beta"} to hand the page to another version, or
 * {load: null} to run this one. A developer preview wins over the beta.
 */
export function decide({here, versionHere, params, preview, beta, offer}) {
    if (params.has("fuadPreview")) {
        const choice = params.get("fuadPreview");
        preview = choice === "off" ? null : previewBase(choice, versionHere);
    }
    if (params.has("fuadBeta")) {
        beta = params.get("fuadBeta") === "on" && offer ? offer.version : null;
    }
    // a preview of the header's own version (say, after it was promoted) is no preview
    if (preview && (!allowed(preview) || preview === here)) {
        preview = null;
    }
    // a beta that's over, promoted or replaced by another is forgotten
    if (beta && (!offer || offer.version !== beta)) {
        beta = null;
    }
    if (preview) {
        return {preview, beta, load: preview, mode: "preview"};
    }
    if (beta) {
        return {preview, beta, load: offer.base, mode: "beta"};
    }
    return {preview, beta, load: null};
}

/** The address of this page with one parameter set, for the bar's and the offer's links. */
export function withParam(href, name, value) {
    const url = new URL(href);
    url.searchParams.set(name, value);
    return url.href;
}
