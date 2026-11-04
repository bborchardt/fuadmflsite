// Home's contract lengths form, before the season (lib/lengths.js): one length for each player still
// due one, posted to the board as the member, where the daily job reads it the next morning. Every
// player kept needs a length (bylaw 12.4), so it can't be sent with more than the roster limit.

import {exportUrl, fetchExport} from "../lib/mfl.js";
import {formPost} from "../lib/lengths.js";
import {ROSTER_MAX} from "../lib/rules.js";
import settings from "../lib/settings.js";
import {openDialog} from "./dialog.js";
import {contractTopic} from "./home-model.js";
import {money} from "./format.js";
import {esc} from "./html.js";
import {send} from "./moves.js";

// the board topic a length post starts when the league has none with "contract" in its name
const NEW_TOPIC = "Contract lengths";

const CLOSE_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>';

// Posts `body` to the board (messageBoard import): a reply in the newest contract topic, or a new one
export async function postToContractTopic(context, body) {
    const {season, leagueId} = context;
    const board = await fetchExport(exportUrl(window.location.origin, season, "messageBoard", {L: leagueId, COUNT: 100}), "messageBoard", {init: {cache: "no-store"}});
    const topic = contractTopic(board);
    const fields = new URLSearchParams(topic ? {THREAD: topic.id, BODY: body} : {SUBJECT: NEW_TOPIC, BODY: body});
    const answer = await send(`${window.location.origin}/${season}/import?TYPE=messageBoard&L=${encodeURIComponent(leagueId)}`, {method: "POST", body: fields});
    if (/<error/i.test(answer) || !/OK/i.test(answer)) {
        throw new Error((answer.match(/<error[^>]*>([^<]*)/i) || [])[1] || "MFL didn't take the post");
    }
}

const firstLast = (name) => String(name).split(",").reverse().map((part) => part.trim()).join(" ");

// `players`: [{player, salary}], player as MFL's players export has him; `active` the team's active
// players; `due` when they're due ("by Mon Sep 7"), or null past it; `unread` the day of a post made
// by hand that couldn't be read, if any
export function lengthsFormMarkup({players, active, due, unread = null, dropHref}) {
    const over = active - ROSTER_MAX;
    const years = Array.from({length: settings.contracts.maxYears}, (_, i) => i + 1);
    return `
    <section class="fuad-popup fuad-lengths" role="dialog" aria-modal="true" aria-labelledby="fuad-lengths-title" tabindex="-1">
        <div class="fuad-popup-head">
            <div class="fuad-popup-title">
                <h2 id="fuad-lengths-title">Contract lengths</h2>
                <span class="fuad-meta fuad-popup-meta">${due ? `Due ${esc(due)}` : "Past the cut-down date: $5 a day until they’re in"}</span>
            </div>
            <button type="button" class="fuad-close" data-close aria-label="Close">${CLOSE_ICON}</button>
        </div>
        ${unread ? `<p class="fuad-lengths-note">Your post on ${esc(unread)} couldn’t be read. Set these here instead.</p>` : ""}
        ${over > 0 ? `<p class="fuad-lengths-note fuad-lengths-over">You have ${active} active of ${ROSTER_MAX}: drop ${over} first, since every player kept needs a length. Drafted rookies drop free until their length is set. <a href="${esc(dropHref)}">Drop</a></p>` : ""}
        <form class="fuad-lengths-form">
            <ul class="fuad-rows">
                ${players.map(({player, salary}) => `
                <li class="fuad-lengths-row">
                    <label for="fuad-length-${esc(player.id)}" class="fuad-row-text">
                        <span class="fuad-row-title">${esc(firstLast(player.name))}</span>
                        <span class="fuad-meta">${esc(player.position)} ${esc(player.team)} · ${esc(money(salary))}</span>
                    </label>
                    <select id="fuad-length-${esc(player.id)}" name="${esc(player.id)}" required>
                        <option value="">Years</option>
                        ${years.map((count) => `<option value="${count}">${count} year${count === 1 ? "" : "s"}</option>`).join("")}
                    </select>
                </li>`).join("")}
            </ul>
            <p class="fuad-meta">They’re posted to the message board for you, and set on MFL by the next morning.</p>
            <p class="fuad-lengths-error" role="alert" hidden></p>
            <button type="submit" class="fuad-cta" disabled>Post lengths</button>
        </form>
    </section>`;
}

// Opens the form; `onSent` once the post is made
export function openLengthsForm({context, layer, players, active, due, unread, dropHref, opener, onSent}) {
    layer.innerHTML = lengthsFormMarkup({players, active, due, unread, dropHref});
    openDialog(layer, {opener, history: true});
    const form = layer.querySelector("form");
    const button = form.querySelector("button[type=submit]");
    const error = form.querySelector(".fuad-lengths-error");
    const selects = [...form.querySelectorAll("select")];
    const ready = () => active <= ROSTER_MAX && selects.every((select) => select.value);
    form.addEventListener("change", () => {
        button.disabled = !ready();
    });
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!ready() || button.disabled) {
            return;
        }
        button.disabled = true;
        error.hidden = true;
        // a name that's a number is read as an index by form.elements
        const lines = players.map(({player}, i) => ({player, years: Number(selects[i].value)}));
        try {
            await postToContractTopic(context, formPost(lines));
            // the reload drops the dialog's history entry (dialog.js); closing first would race it
            onSent();
        } catch (failure) {
            error.textContent = `Couldn’t post them: ${failure.message}. Try again.`;
            error.hidden = false;
            button.disabled = false;
        }
    });
}
