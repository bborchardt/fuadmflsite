// Full width, a member's own setting (Franchise setup › Customize, `USE_FULL_WIDTH<team>`), which
// MFL keeps with the franchise and marks on every page as `body.full-width`. v2's column fills the
// window then (fuad.css); that only shows on a window wider than the column, so the team sheet
// offers the switch only there.

import {mflFetch, mflSend} from "./page-fetch.js";

const TEXT = new Set(["hidden", "text", "password", "email", "url", "tel", "number", "search"]);

// MFL's Customize form: its fields as the browser would send them, in order, a file field as null
// (sent empty); null if it's not there, has no Full width, or has a field v2 wouldn't know to send
export function readCustomizeForm(doc) {
    const form = doc.querySelector('form[name="customize"]');
    if (!form) {
        return null;
    }
    const fields = [];
    let submit = null;
    let fullWidth = null;
    for (const field of form.querySelectorAll("input[name], select[name], textarea[name], button[name]")) {
        const name = field.getAttribute("name");
        const tag = field.tagName.toLowerCase();
        const type = (field.getAttribute("type") || "text").toLowerCase();
        if (/^USE_FULL_WIDTH/.test(name)) {
            if (tag !== "input" || type !== "radio") {
                return null;
            }
            fullWidth = name;
        }
        if (field.hasAttribute("disabled")) {
            continue;
        }
        if (tag === "select") {
            if (field.hasAttribute("multiple")) {
                return null;
            }
            const options = [...field.querySelectorAll("option")];
            const option = options.find((each) => each.hasAttribute("selected")) || options[0];
            if (option) {
                fields.push([name, option.hasAttribute("value") ? option.getAttribute("value") : option.textContent.trim()]);
            }
        } else if (tag === "textarea") {
            fields.push([name, field.textContent]);
        } else if (tag === "button") {
            return null;
        } else if (TEXT.has(type)) {
            fields.push([name, field.getAttribute("value") || ""]);
        } else if (type === "radio" || type === "checkbox") {
            if (field.hasAttribute("checked")) {
                fields.push([name, field.hasAttribute("value") ? field.getAttribute("value") : "on"]);
            }
        } else if (type === "file") {
            fields.push([name, null]);
        } else if (type === "submit" && name === "SUBMIT") {
            submit = field.getAttribute("value") || "";
        } else {
            return null;
        }
    }
    if (!fullWidth) {
        return null;
    }
    const on = fields.find(([name]) => name === fullWidth);
    return {action: form.getAttribute("action") || "", fields, submit, fullWidth, on: Boolean(on) && on[1] === "Yes"};
}

const failure = (message, status) => Object.assign(new Error(message), {status});

// Saves Full width on or off: MFL's form is read first, for its token and everything else on it,
// then sent as MFL's own page sends it with only Full width changed. MFL's answer, or failing that
// the form read again, must show it saved. Only the first read waits out MFL's refusal
// (page-fetch.js); a check that can't be read after the save is sent throws `unconfirmed`, since
// MFL may have made it.
export async function saveFullWidth({season, leagueId}, on) {
    const page = `${window.location.origin}/${season}/csetup?L=${encodeURIComponent(leagueId)}&C=FCUSTOM`;
    const readForm = async (get = mflSend) => {
        const read = await get(page, {credentials: "include", cache: "no-store"});
        if (!read.ok) {
            throw failure(`HTTP ${read.status}`, read.status);
        }
        return readCustomizeForm(new DOMParser().parseFromString(await read.text(), "text/html"));
    };
    const form = await readForm(mflFetch);
    if (!form) {
        throw Object.assign(failure("MFL's Customize page didn't open, or has changed"), {noForm: true});
    }
    const value = on ? "Yes" : "No";
    const body = new FormData();
    let set = false;
    for (const [name, sent] of form.fields) {
        if (name === form.fullWidth) {
            body.append(name, value);
            set = true;
        } else if (sent === null) {
            body.append(name, new Blob([], {type: "application/octet-stream"}), "");
        } else {
            body.append(name, sent);
        }
    }
    if (!set) {
        body.append(form.fullWidth, value);
    }
    if (form.submit !== null) {
        body.append("SUBMIT", form.submit);
    }
    const unconfirmed = (error) => Object.assign(failure(`MFL didn't confirm Full width: ${error.message}`, error.status), {unconfirmed: true});
    // a request that fails on the way back may still have reached MFL
    const sent = await mflSend(new URL(form.action, page).href, {method: "POST", credentials: "include", body}).catch((error) => {
        throw unconfirmed(error);
    });
    if (!sent.ok) {
        throw failure(`HTTP ${sent.status}`, sent.status);
    }
    const text = await sent.text().catch((error) => {
        throw unconfirmed(error);
    });
    const answer = readCustomizeForm(new DOMParser().parseFromString(text, "text/html")) || await readForm().catch((error) => {
        throw unconfirmed(error);
    });
    if (!answer || answer.on !== on) {
        throw failure("MFL didn't save Full width");
    }
}

export function widthMarkup(on) {
    return `
        <div class="fuad-width">
            <label class="fuad-width-switch"><span>Full width</span><input type="checkbox" role="switch"${on ? " checked" : ""}></label>
            <p class="fuad-looks-status fuad-muted" role="status"></p>
        </div>`;
}

// The page widens or narrows as soon as the switch is flipped and stays so if MFL saves it; if MFL
// doesn't, it goes back and the sheet says so. Customize's form on the page, which sends Full width
// as it was when the page loaded, is kept on the one saved.
export function wireWidth(group, context) {
    if (!group) {
        return;
    }
    const doc = group.ownerDocument;
    const input = group.querySelector("input");
    const status = group.querySelector(".fuad-looks-status");
    const show = (on) => {
        input.checked = on;
        doc.body.classList.toggle("full-width", on);
    };
    input.addEventListener("change", async () => {
        const on = input.checked;
        show(on);
        input.disabled = true;
        status.classList.remove("fuad-looks-failed");
        status.textContent = "Saving…";
        const keep = () => doc.querySelectorAll('form[name="customize"] input[name^="USE_FULL_WIDTH"]').forEach((radio) => {
            radio.checked = radio.value === (on ? "Yes" : "No");
        });
        try {
            await saveFullWidth(context, on);
            keep();
            status.textContent = "";
        } catch (error) {
            if (error.unconfirmed) {
                keep();
                status.textContent = "Sent, but MFL didn’t confirm it. Reload the page to check.";
                return;
            }
            console.warn("[fuad] couldn't save Full width:", error);
            show(!on);
            status.classList.add("fuad-looks-failed");
            status.textContent = error.status === 429 ? "MFL asked us to wait. Try again in a few seconds."
                : error.noForm ? "Couldn’t open MFL’s Customize page. Reload and try again." : "Couldn’t save Full width. Try again.";
        } finally {
            input.disabled = false;
        }
    });
}
