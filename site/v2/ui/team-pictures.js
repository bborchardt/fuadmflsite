// Each team's pictures (Franchise setup › Customize: icon and logo), as MFL's page lists them
// (`franchiseDatabase`). Lists show the still of the icon the daily job publishes
// (jobs/team-icons.mjs), as an owner's upload can be hundreds of KB and animated; a team's own page
// shows the upload itself, the logo on desktop. A picture that doesn't load leaves the name alone.

import {esc} from "./html.js";

let pictures = new Map();
let stills = null;

const web = (value) => (typeof value === "string" && /^https?:\/\//i.test(value.trim()) ? value.trim() : "");

// once per page, before anything draws: `dataBase` is where the job's files are published
export function useTeamPictures({dataBase, database = window.franchiseDatabase, doc = document}) {
    stills = new URL("icons/", dataBase).href;
    pictures = new Map(Object.values(database || {}).filter((team) => team && team.id && team.id !== "0000")
        .map((team) => [team.id, {icon: web(team.icon), logo: web(team.logo)}]));
    doc.addEventListener("error", (event) => {
        const image = event.target;
        // a still that won't load (not published yet) gives way to the upload it stands for
        const upload = image && image.getAttribute && image.getAttribute("data-fuad-upload");
        if (upload) {
            image.removeAttribute("data-fuad-upload");
            image.src = upload;
            return;
        }
        const spot = image && image.closest && image.closest(".fuad-team-pic, .fuad-team-banner");
        if (!spot || /^data:/.test(image.currentSrc || "")) {
            return;
        }
        // a logo that won't load gives way to the icon
        if (spot.classList.contains("fuad-team-banner")) {
            const icon = spot.parentNode && spot.parentNode.querySelector(".fuad-team-pic-xl");
            if (icon) {
                icon.classList.remove("fuad-phone-only");
                // the browser picks the icon again once its stand-in is gone
                icon.querySelectorAll("source").forEach((source) => source.remove());
            }
        }
        spot.remove();
    }, true);
}

export const pictureOf = (team) => pictures.get(team) || {icon: "", logo: ""};

// the icon's still in a list, or nothing for a team without one
export function iconMarkup(team) {
    return stills && pictureOf(team).icon
        ? `<span class="fuad-team-pic" aria-hidden="true"><img src="${esc(`${stills}${encodeURIComponent(team)}.webp`)}" alt="" loading="lazy" decoding="async"></span>`
        : "";
}

// a name with its icon beside it (after it, on a card's right side), so a name that wraps stays
// clear of the icon
export function withIcon(team, html, {after = false} = {}) {
    const icon = iconMarkup(team);
    return icon ? `<span class="fuad-with-pic${after ? " fuad-pic-after" : ""}">${icon}<span>${html}</span></span>` : html;
}

export const stillOf = (team) => (stills && pictureOf(team).icon ? `${stills}${encodeURIComponent(team)}.webp` : "");

// the widths fuad.css's fuad-phone-only and fuad-desktop-only show at
const DESKTOP = "(min-width: 48.01em)";
const PHONE = "(max-width: 48em)";
// an empty picture in place of one at a width where it's hidden, so it isn't downloaded there
const NOTHING = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const only = (media, url) => `<picture><source media="${media === DESKTOP ? PHONE : DESKTOP}" srcset="${NOTHING}"><img src="${esc(url)}" alt="" decoding="async"></picture>`;

// a team's page: the icon as uploaded, moving if it moves, and on desktop the logo above, if any
export function teamPicturesMarkup(team) {
    const {icon, logo} = pictureOf(team);
    const banner = logo ? `<div class="fuad-team-banner fuad-desktop-only" aria-hidden="true">${only(DESKTOP, logo)}</div>` : "";
    const big = !icon ? ""
        : `<span class="fuad-team-pic fuad-team-pic-xl${logo ? " fuad-phone-only" : ""}" aria-hidden="true">${logo ? only(PHONE, icon) : `<img src="${esc(icon)}" alt="" decoding="async">`}</span>`;
    return {banner, icon: big};
}
