// The looks a member can pick in the team sheet. Each is saved as one of MFL's skins (Franchise setup
// › Skin), which MFL keeps with the franchise and names in every page's `link#skin`, so a look
// follows the member to any device and reading it asks MFL nothing. A look's colors are its
// `[data-fuad-look]` block in fuad.css; `skin` is the skin's value on MFL's form and `folder` the
// one its stylesheet is in. The first look is the default, saved as the commissioner's choice of
// skin, and shown for any skin no look names. A look can't be the league's own skin: its members on
// the commissioner's choice would be shown it.

import {esc} from "./html.js";
import {mflFetch, mflSend} from "./page-fetch.js";
import {storage} from "./store.js";

export const LOOKS = [
    {id: "night", name: "Night Game", skin: "-1", folder: null},
    {id: "day", name: "Day Game", skin: "1032", folder: "OceanBlue"},
    {id: "purple", name: "Purple Reign", skin: "1029", folder: "Norseman"},
    {id: "tundra", name: "Frozen Tundra", skin: "1011", folder: "Cheeseheads"},
    {id: "cowboys", name: "America’s Team", skin: "1022", folder: "LoneStar"},
    {id: "paper", name: "Sunday Paper", skin: "1021", folder: "LeatherHelmet"}
];

// "BlueMesh" from `…/skins17/BlueMesh/BlueMesh.css`
export function skinFolder(doc) {
    const link = doc.querySelector("link#skin[href]");
    const match = link && /\/skins\d*\/([^/]+)\/[^/]+\.css(?:[?#]|$)/i.exec(link.getAttribute("href"));
    return match ? match[1] : null;
}

// A member who turns off Franchise setup › Customize › Use Responsive View gets pages without the
// viewport tag and the skin's responsive.css. v2 lays itself out by the window's width, so a phone
// would get its desktop layout, shrunk; both go back as MFL would have written them.
export function keepResponsive(doc = document, browser = globalThis) {
    let meta = doc.querySelector('meta[name="viewport"]');
    if (!meta) {
        meta = doc.createElement("meta");
        meta.setAttribute("name", "viewport");
        meta.setAttribute("content", "initial-scale=1.0, width=device-width");
        doc.head.appendChild(meta);
    }
    if (desktopOnPhone(browser)) {
        meta.setAttribute("content", "width=980");
    }
    const skin = doc.querySelector("link#skin[href]");
    if (skinFolder(doc) && !doc.querySelector("link#responsive")) {
        const link = doc.createElement("link");
        link.setAttribute("rel", "stylesheet");
        link.setAttribute("id", "responsive");
        link.setAttribute("href", skin.getAttribute("href").replace(/[^/]+\.css(?=[?#]|$)/i, "responsive.css"));
        skin.parentNode.insertBefore(link, skin.nextSibling);
    }
}

// An iPhone's Request Desktop Website: Safari says it's a Mac (with a touch screen, which no Mac has),
// but MFL sends the same page with its viewport tag, which keeps the phone layout. The width is what
// Safari gives a page without the tag. An iPad, whose screen fits the desktop layout, is left alone.
function desktopOnPhone({navigator, screen}) {
    return Boolean(navigator && screen) && /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1
        && Math.min(screen.width, screen.height) < 600;
}

const lookOfFolder = (folder, looks) => looks.find((look) => look.folder && folder && look.folder.toLowerCase() === folder.toLowerCase()) || looks[0];

export function lookOf(doc, looks = LOOKS) {
    return lookOfFolder(skinFolder(doc), looks);
}

export function applyLook(doc = document, look = lookOf(doc)) {
    doc.documentElement.setAttribute("data-fuad-look", look.id);
    return look;
}

// The commissioner (MFL's team 0000) has no skin of their own: theirs is the league's, and saving one
// would change every member on the default look. MFL offers no other place for it and shows a team's
// skin only to that team, so the commissioner's view follows the skin their own team was last seen in,
// in this browser, per league. Only that team's pages have MFL's Become Commissioner link. The header
// reads it too (mfl/message-header.html), for the loading cover.
const TEAM_SKIN = "fuad.teamSkin.";
const skinKey = (leagueId) => `${TEAM_SKIN}${leagueId}`;
const isTeamOfCommish = (doc) => Boolean(doc.querySelector('.myfantasyleague_menu a[href*="BECOME=0000"], .welcome a[href*="BECOME=0000"]'));

// as the commissioner's own team, the skin it's in; a page whose skin can't be read leaves what's kept
export function keepTeamSkin(doc = document, franchiseId = window.franchise_id, leagueId = window.league_id) {
    const folder = skinFolder(doc);
    if (folder && franchiseId !== "0000" && isTeamOfCommish(doc)) {
        storage.set(skinKey(leagueId), folder);
    }
}

// the skin their team was last seen in here, or null
export const teamSkin = (leagueId = window.league_id) => storage.get(skinKey(leagueId));

// the commissioner's look: their team's, or until it's known, the league skin's, as for a member on
// Commish Choice
export function commishLook(doc = document, leagueId = window.league_id, looks = LOOKS) {
    const folder = teamSkin(leagueId);
    return folder === null ? lookOf(doc, looks) : lookOfFolder(folder, looks);
}

// The commissioner's view is marked in v2's colours (fuad.css), whichever look it's in
export function markCommish(doc = document, franchiseId = window.franchise_id) {
    doc.documentElement.classList.toggle("fuad-commish", franchiseId === "0000");
}

// the looks, once there's more than one; a member's own choice, saved with their franchise. `id` names
// the label, as a page can have two pickers
export function looksMarkup(looks, current, id = "fuad-looks-label") {
    return looks.length > 1 ? `
        <div class="fuad-looks" role="group" aria-labelledby="${esc(id)}">
            <span class="fuad-muted" id="${esc(id)}">Look</span>
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

const SAVED = "fuad-look-saved";

// A look shows as soon as it's picked and stays if MFL saves it; if MFL doesn't, the one before comes
// back and the picker says so. Picks are taken one at a time. The default is shown for skins no look
// names too, so picking it saves it even when it's the one shown. A page with two pickers (the team
// sheet's and Franchise setup's Look) keeps both on the look saved.
export function wireLooks(group, context, current) {
    if (!group) {
        return;
    }
    const doc = group.ownerDocument;
    const buttons = [...group.querySelectorAll("button[data-look]")];
    const status = group.querySelector(".fuad-looks-status");
    let shown = current;
    let saved = current === LOOKS[0] ? null : current;
    const show = (look) => {
        applyLook(doc, look);
        buttons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.look === look.id)));
    };
    doc.addEventListener(SAVED, (event) => {
        if (event.detail.from !== group) {
            shown = event.detail.look;
            saved = event.detail.look;
            show(event.detail.look);
        }
    });
    const settle = (look) => {
        saved = look;
        doc.dispatchEvent(new doc.defaultView.CustomEvent(SAVED, {detail: {look, from: group}}));
    };
    buttons.forEach((button) => button.addEventListener("click", async () => {
        const look = LOOKS.find((entry) => entry.id === button.dataset.look);
        if (!look || look === saved) {
            return;
        }
        const before = shown;
        shown = look;
        show(look);
        buttons.forEach((each) => {
            each.disabled = true;
        });
        status.classList.remove("fuad-looks-failed");
        status.textContent = "Saving…";
        try {
            await saveLook(context, look);
            settle(look);
            // the page's skin is still the one before, until the next page; the default look is the
            // league's skin, which no look names
            if (isTeamOfCommish(doc)) {
                storage.set(skinKey(context.leagueId), look.folder || "");
            }
            status.textContent = "";
        } catch (error) {
            if (error.unconfirmed) {
                settle(look);
                status.textContent = "Sent, but MFL didn’t confirm it. Reload the page to check.";
                return;
            }
            console.warn("[fuad] couldn't save the look:", error);
            shown = before;
            show(before);
            status.classList.add("fuad-looks-failed");
            status.textContent = error.status === 429 ? "MFL asked us to wait. Try again in a few seconds."
                : error.noForm ? "Couldn’t open MFL’s skin page. Reload and try again." : "Couldn’t save your look. Try again.";
        } finally {
            buttons.forEach((each) => {
                each.disabled = false;
            });
        }
    }));
}

const failure = (message, status) => Object.assign(new Error(message), {status});

// the look a skin on MFL's form is: Commish Choice shows there as the league's own skin, which no
// look names, so the default
const lookOfSkin = (skin, looks) => looks.find((look) => look !== looks[0] && look.skin === skin) || looks[0];

// Saves `look` as the member's skin: MFL's form is read first for its token (`input_expires`, good
// for about a day), then sent as MFL's own page sends it. MFL answers "Skin Selection Saved" (on a
// page still in the old skin); without that, the form is read again and must show the look, and for
// the default a change, since a skin no look names shows as the default before the save too. Only
// the first read waits out MFL's refusal (page-fetch.js); a check that can't be read after the save
// is sent throws `unconfirmed`, since MFL may have made it.
export async function saveLook({season, leagueId}, look, looks = LOOKS) {
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
    const text = await sent.text().catch((error) => {
        throw unconfirmed(error);
    });
    const said = new DOMParser().parseFromString(text, "text/html").querySelectorAll("h3");
    if ([...said].some((heading) => /^\s*Skin Selection Saved\s*$/i.test(heading.textContent))) {
        return;
    }
    const answer = await readForm().catch((error) => {
        throw unconfirmed(error);
    });
    if (!answer || !answer.chosen || lookOfSkin(answer.chosen, looks) !== look || (look === looks[0] && answer.chosen === form.chosen)) {
        throw failure("MFL didn't save the new skin");
    }
}
