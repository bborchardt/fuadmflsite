// The looks a member can pick in the team sheet. Each is saved as one of MFL's skins (Franchise setup
// › Skin), which MFL keeps with the franchise and names in every page's `link#skin`, so a look
// follows the member to any device and reading it asks MFL nothing. A look's colors are its
// `[data-fuad-look]` block in fuad.css; `skin` is the skin's value on MFL's form and `folder` the
// one its stylesheet is in. The first look is the default, saved as the commissioner's choice of
// skin, and shown for any skin no look names. A look can't be the league's own skin: its members on
// the commissioner's choice would be shown it.

import {esc} from "./html.js";
import {mflFetch, mflSend} from "./page-fetch.js";

export const LOOKS = [
    {id: "night", name: "Night Game", skin: "-1", folder: null}
];

// "BlueMesh" from `…/skins17/BlueMesh/BlueMesh.css`
export function skinFolder(doc) {
    const link = doc.querySelector("link#skin[href]");
    const match = link && /\/skins\d*\/([^/]+)\/[^/]+\.css(?:[?#]|$)/i.exec(link.getAttribute("href"));
    return match ? match[1] : null;
}

export function lookOf(doc, looks = LOOKS) {
    const folder = skinFolder(doc);
    return looks.find((look) => look.folder && folder && look.folder.toLowerCase() === folder.toLowerCase()) || looks[0];
}

export function applyLook(doc = document, look = lookOf(doc)) {
    doc.documentElement.setAttribute("data-fuad-look", look.id);
    return look;
}

// the looks, once there's more than one; a member's own choice, saved with their franchise
export function looksMarkup(looks, current) {
    return looks.length > 1 ? `
        <div class="fuad-looks" role="group" aria-labelledby="fuad-looks-label">
            <span class="fuad-muted" id="fuad-looks-label">Look</span>
            <div class="fuad-looks-options">
                ${looks.map((look) => `<button type="button" data-look="${esc(look.id)}" aria-pressed="${look === current}"><span class="fuad-look-swatch" data-fuad-look="${esc(look.id)}" aria-hidden="true"></span><span>${esc(look.name)}</span></button>`).join("")}
            </div>
            <p class="fuad-looks-status fuad-muted" role="status"></p>
        </div>` : "";
}

// MFL's skin form: its fields as it would send them, and the skins it offers; null if it's not there,
// or has a field v2 wouldn't know to send
export function readSkinForm(doc) {
    const form = doc.querySelector('form[name="skin"]');
    const known = (field) => field.matches('input[type="hidden"], input[type="radio"][name="USE_SKIN"], input[type="submit"][name="SUBMIT"]');
    if (!form || [...form.querySelectorAll("input[name], select[name], textarea[name], button[name]")].some((field) => !known(field))) {
        return null;
    }
    const fields = new URLSearchParams();
    form.querySelectorAll('input[type="hidden"][name]').forEach((input) => fields.append(input.getAttribute("name"), input.getAttribute("value") || ""));
    const radios = [...form.querySelectorAll('input[type="radio"][name="USE_SKIN"]')];
    const checked = radios.find((radio) => radio.hasAttribute("checked"));
    const submit = form.querySelector('input[type="submit"][name="SUBMIT"]');
    return {
        action: form.getAttribute("action") || "",
        submit: submit ? submit.getAttribute("value") || "" : null,
        fields,
        skins: radios.map((radio) => radio.getAttribute("value")),
        chosen: checked ? checked.getAttribute("value") : null
    };
}

const failure = (message, status) => Object.assign(new Error(message), {status});

// Saves `look` as the member's skin: MFL's form is read first for its token (`input_expires`, good
// for about a day), then sent as MFL's own page sends it. Throws unless MFL's form then has the new
// skin chosen: in its answer, or else read again. Only the first read waits out MFL's refusal
// (page-fetch.js); a check that can't be read after the save is sent throws `unconfirmed`, since MFL
// may have made it.
export async function saveLook({season, leagueId}, look) {
    const page = `${window.location.origin}/${season}/csetup?L=${encodeURIComponent(leagueId)}&C=SKIN`;
    const readForm = async (get = mflSend) => {
        const read = await get(page, {credentials: "include", cache: "no-store"});
        if (!read.ok) {
            throw failure(`HTTP ${read.status}`, read.status);
        }
        return readSkinForm(new DOMParser().parseFromString(await read.text(), "text/html"));
    };
    const form = await readForm(mflFetch);
    if (!form || !form.skins.includes(look.skin)) {
        throw Object.assign(failure(form ? `MFL doesn't offer skin ${look.skin}` : "MFL's skin page didn't open, or has changed"), {noForm: !form});
    }
    const body = new URLSearchParams(form.fields);
    body.set("USE_SKIN", look.skin);
    if (form.submit !== null) {
        body.set("SUBMIT", form.submit);
    }
    const unconfirmed = (error) => Object.assign(failure(`MFL didn't confirm the new skin: ${error.message}`, error.status), {unconfirmed: true});
    // a request that fails on the way back may still have reached MFL
    const sent = await mflSend(new URL(form.action, page).href, {
        method: "POST",
        credentials: "include",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body
    }).catch((error) => {
        throw unconfirmed(error);
    });
    if (!sent.ok) {
        throw failure(`HTTP ${sent.status}`, sent.status);
    }
    let answer = readSkinForm(new DOMParser().parseFromString(await sent.text(), "text/html"));
    if (!answer || answer.chosen !== look.skin) {
        answer = await readForm().catch((error) => {
            throw unconfirmed(error);
        });
    }
    if (!answer || answer.chosen !== look.skin) {
        throw failure("MFL didn't save the new skin");
    }
}
