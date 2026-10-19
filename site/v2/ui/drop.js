// Moves › Drop: MFL's Drop Players page with v2's roster over it. A row opens its cut in place; Drop
// posts MFL's own form for that one player, then reads the roster back before the page reloads to
// show it. MFL's form stays in the page underneath; anything v2 can't read leaves MFL's page.

import {ROSTER_MAX, SALARY_CAP} from "../lib/rules.js";
import {esc} from "./html.js";
import {waitLeft} from "./page-fetch.js";
import {placeholders} from "./panel.js";
import {loadData, movesPhase, refusal, rosterIds, send} from "./moves.js";
import {changeTone, signed, surname, teamState, usedTone} from "./add-model.js";
import {checkDrop, dropRows, readRoster} from "./drop-model.js";

const FLASH_KEY = "fuad.dropFlash";
const WIDE = "(min-width: 48.01em)";

const CHECK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"></path></svg>';
const CHEVRON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>';

const money = (amount) => `$${Math.round(amount * 100) / 100}`;
const yearsShort = (years) => `${years} yr${years === 1 ? "" : "s"}`;
const tone = (name) => (name ? ` fuad-${name}` : "");

// MFL's Drop Players form: one player at a time is posted in place
function dropForm(doc = document) {
    const select = doc.querySelector("select[name=drop_pid]");
    const form = select && select.form;
    return form && form.elements.OPTION && form.elements.OPTION.value === "257" ? form : null;
}

const scriptText = (doc = document) => [...doc.querySelectorAll("script")].map((script) => script.textContent).join("\n");

function formFields(form, playerId) {
    const fields = new URLSearchParams(new FormData(form));
    fields.delete("drop_pid");
    fields.append("drop_pid", playerId);
    const submit = form.querySelector("input[type=submit][name=SUBMIT]");
    fields.set("SUBMIT", submit ? submit.value : "Drop Players");
    return fields;
}

export async function drawDrop({context, franchiseId, loginHref}) {
    const body = document.querySelector(".pagebody");
    if (!body) {
        return;
    }
    const mount = document.createElement("div");
    mount.id = "fuad-drop";
    const show = () => {
        body.prepend(mount);
        document.documentElement.classList.add("fuad-drop-on");
    };
    const standAside = () => {
        mount.remove();
        document.documentElement.classList.remove("fuad-drop-on");
    };
    if (!franchiseId) {
        mount.innerHTML = `<section class="fuad-panel fuad-drop-note"><span>Log in to make moves</span><a class="fuad-button" href="${esc(loginHref)}">Log in</a></section>`;
        show();
        return;
    }
    // the commissioner's view stays MFL's
    if (franchiseId === "0000") {
        return;
    }
    const form = dropForm();
    const roster = readRoster(scriptText());
    // not the page v2 knows (MFL changed it), or another team's: MFL's own page, restyled
    if (!form || !form.elements.FRANCHISE || form.elements.FRANCHISE.value !== franchiseId) {
        standAside();
        return;
    }
    mount.innerHTML = `<section class="fuad-panel">${placeholders(8)}</section>`;
    show();

    const wide = window.matchMedia(WIDE);
    let flash = null;
    try {
        flash = JSON.parse(window.sessionStorage.getItem(FLASH_KEY) || "null");
        window.sessionStorage.removeItem(FLASH_KEY);
    } catch (error) {
        // storage is blocked: no line after the reload
    }
    const state = {data: null, failed: false, open: null, done: flash && flash.done, error: (flash && flash.error) || "", busy: false};

    const team = () => teamState(state.data.league, franchiseId, state.data.groups);
    const phase = () => movesPhase(state.data.facts);
    const rows = () => dropRows(team(), {roster, phase: phase()});

    // ---- markup ----

    function statusMarkup() {
        const parts = [];
        if (state.done) {
            parts.push(`<p class="fuad-drop-status" role="status">${CHECK}<span>${esc(state.done)}</span></p>`);
        }
        // a cut being reviewed shows its failure beside it
        if (state.error && !state.open) {
            parts.push(`<p class="fuad-drop-alert" role="alert"><strong>Not made:</strong> ${esc(state.error)}</p>`);
        }
        return parts.join("");
    }

    function capBar() {
        const franchise = team().franchise;
        const capTone = franchise.capTotal > SALARY_CAP ? " fuad-bad" : franchise.capTotal > SALARY_CAP - 10 ? " fuad-caution" : "";
        // no roster limits before the season (2.5)
        const active = phase() === "season" ? `${franchise.numPlayers} of ${ROSTER_MAX}` : String(franchise.numPlayers);
        return `<div class="fuad-drop-bar"><span><span class="fuad-muted">Cap used</span> <strong class="${capTone.trim()}">${esc(money(franchise.capTotal))}</strong> <span class="fuad-muted">of $${SALARY_CAP}</span></span><span><span class="fuad-muted">Active</span> <strong>${esc(active)}</strong></span></div>`;
    }

    function review(row) {
        const from = team().franchise.capTotal;
        const to = checkDrop(team(), {drop: row.player.playerId, phase: phase()}).cap.to;
        return `<div class="fuad-drop-review" id="fuad-drop-review-${esc(row.player.playerId)}">
            <span class="fuad-drop-cut">Cut now: <strong>${esc(money(row.penalty))} penalty</strong> · cap used ${esc(money(from))} → <strong class="${tone(usedTone(from, to)).trim()}">${esc(money(to))}</strong></span>
            ${state.error ? `<p class="fuad-drop-alert" role="alert"><strong>Not made:</strong> ${esc(state.error)}</p>` : ""}
            <button type="button" class="fuad-drop-go" data-act="drop" data-id="${esc(row.player.playerId)}"${state.busy ? " disabled" : ""}>${state.busy ? "Dropping…" : `Drop ${esc(surname(state.data.mflNames.get(row.player.playerId) || row.player.fullName))}`}</button>
        </div>`;
    }

    const usedNote = (row) => (row.usedIn ? `dropped in your group ${row.usedIn} bid` : "");

    function rowButton(row, inner) {
        const id = row.player.playerId;
        const open = state.open === id;
        return `<div class="fuad-drop-item${open ? " fuad-drop-open" : ""}">
            <button type="button" class="fuad-drop-row" data-act="toggle" data-id="${esc(id)}"${row.off ? " disabled" : ` aria-expanded="${open}" aria-controls="fuad-drop-review-${esc(id)}"`}>${inner}</button>
            ${open ? review(row) : ""}
        </div>`;
    }

    function phoneRows(groups) {
        return groups.map((group) => `<div class="fuad-drop-head"><span><strong>${esc(group.pos)}</strong> · ${group.players.length}</span><span>penalty · cap change</span></div>
            ${group.players.map((row) => {
                const meta = [group.pos, row.player.team, money(row.player.salary), yearsShort(row.player.years), row.player.status === "INJURED_RESERVE" ? "IR" : "", usedNote(row)].filter(Boolean).join(" · ");
                return rowButton(row, `<span class="fuad-drop-who"><span class="fuad-drop-name">${esc(row.player.fullName)}</span><span class="fuad-meta">${esc(meta)}</span></span>
                    <span class="fuad-drop-cost">${row.off ? `<span class="fuad-muted">${esc(row.why)}</span>` : `<span>${esc(money(row.penalty))}</span><span class="fuad-drop-change${tone(changeTone(row.capChange))}">${esc(signed(row.capChange))}</span>`}</span>`);
            }).join("")}`).join("");
    }

    function deskRows(groups) {
        return `<div class="fuad-drop-line fuad-drop-columns" aria-hidden="true"><span>Player</span><span>NFL</span><span class="fuad-num">Salary</span><span class="fuad-num">Years</span><span class="fuad-num">Cut penalty</span><span class="fuad-num">Cap change</span><span></span></div>
        ${groups.map((group) => `<div class="fuad-drop-group"><strong>${esc(group.pos)}</strong> · ${group.players.length}</div>
            ${group.players.map((row) => rowButton(row, `<span class="fuad-drop-line">
                <span class="fuad-drop-who"><span class="fuad-drop-name">${esc(row.player.fullName)}</span>${row.player.status === "INJURED_RESERVE" ? '<span class="fuad-tag">IR</span>' : ""}${row.usedIn ? `<span class="fuad-meta">${esc(usedNote(row))}</span>` : ""}</span>
                <span class="fuad-muted">${esc(row.player.team || "")}</span>
                <span class="fuad-num">${esc(money(row.player.salary))}</span>
                <span class="fuad-num fuad-muted">${esc(yearsShort(row.player.years))}</span>
                <span class="fuad-num">${row.off ? `<span class="fuad-muted">${esc(row.why)}</span>` : esc(money(row.penalty))}</span>
                <span class="fuad-num fuad-drop-change${row.off ? " fuad-muted" : tone(changeTone(row.capChange))}">${esc(signed(row.capChange))}</span>
                <span class="fuad-drop-chev">${row.off ? "" : CHEVRON}</span>
            </span>`)).join("")}`).join("")}`;
    }

    function render() {
        const active = document.activeElement;
        const acted = active && mount.contains(active) && active.dataset && active.dataset.act
            ? `[data-act="${active.dataset.act}"][data-id="${active.dataset.id}"]` : null;
        if (!state.data) {
            mount.innerHTML = state.failed
                ? `${statusMarkup()}<div class="fuad-drop-alert fuad-drop-failed" role="alert"><span>Couldn’t check your cap.${state.failed === "busy" ? " MFL asked us to wait. Retry in a few seconds." : ""}</span><span class="fuad-drop-failed-buttons"><button type="button" class="fuad-drop-retry" data-act="retry"${state.failed === "busy" && waitLeft() ? " disabled" : ""}>Retry</button><button type="button" class="fuad-drop-retry" data-act="mfl">MFL’s page</button></span></div>`
                : `<section class="fuad-panel">${placeholders(8)}</section>`;
            return;
        }
        const groups = rows();
        mount.innerHTML = `${statusMarkup()}${capBar()}
            <section class="fuad-panel fuad-drop-roster" aria-label="Your roster">${wide.matches ? deskRows(groups) : phoneRows(groups)}</section>`;
        const again = acted && mount.querySelector(acted);
        if (again && !again.disabled) {
            again.focus();
        }
    }

    // ---- dropping ----

    // Shows the result after MFL's page reloads
    function reloadWith(next) {
        try {
            window.sessionStorage.setItem(FLASH_KEY, JSON.stringify(next));
        } catch (error) {
            // storage is blocked: the reload just shows the page as MFL has it
        }
        window.location.replace(window.location.pathname + window.location.search);
    }

    const mine = () => [...state.data.league.players.values()].filter((player) => player.franchise && player.franchise.franchiseId === franchiseId)
        .map((player) => player.playerId).sort();

    async function drop(playerId) {
        const row = rows().flatMap((group) => group.players).find((entry) => entry.player.playerId === playerId);
        if (!row || row.off || state.busy) {
            return;
        }
        const name = surname(state.data.mflNames.get(playerId) || row.player.fullName);
        state.busy = true;
        state.error = "";
        render();
        try {
            const answer = await send(form.action, {method: "POST", body: formFields(form, playerId)});
            if ((await rosterIds(context, franchiseId)).includes(playerId)) {
                throw new Error(refusal(answer));
            }
            reloadWith({done: `${name} dropped.`});
        } catch (error) {
            console.warn("[fuad] couldn't drop:", error);
            const message = `${error.message.replace(/\.$/, "")}.`;
            // MFL may have changed the roster anyway (an answer that failed): the page reloads to show it
            const ids = await rosterIds(context, franchiseId).catch(() => null);
            if (ids && JSON.stringify(ids) !== JSON.stringify(mine())) {
                reloadWith({error: `${message} MFL's page has changed: this is how it stands.`});
                return;
            }
            state.error = message;
            state.busy = false;
            render();
        }
    }

    // ---- events ----

    mount.addEventListener("click", (event) => {
        const target = event.target.closest("[data-act]");
        if (!target || target.disabled || !mount.contains(target)) {
            return;
        }
        const act = target.dataset.act;
        if (act === "retry") {
            load();
        } else if (act === "mfl") {
            standAside();
        } else if (act === "toggle" && !state.busy) {
            state.open = state.open === target.dataset.id ? null : target.dataset.id;
            state.error = "";
            state.done = null;
            render();
        } else if (act === "drop") {
            drop(target.dataset.id);
        }
    });
    wide.addEventListener("change", () => state.data && render());

    async function load() {
        state.failed = false;
        render();
        try {
            state.data = await loadData(context, franchiseId);
            if (!state.data.league.franchises.get(franchiseId)) {
                throw new Error("your team isn't in the rosters");
            }
        } catch (error) {
            console.warn("[fuad] couldn't load Drop:", error);
            state.data = null;
            state.failed = error && error.status === 429 ? "busy" : true;
            // Retry comes back on when MFL's wait is over
            if (state.failed === "busy" && waitLeft()) {
                setTimeout(render, waitLeft());
            }
        }
        // Rosters' popup Drop opens with his row open (`#player-<id>`)
        const asked = (window.location.hash.match(/^#player-(\d+)$/) || [])[1];
        if (asked && state.data) {
            window.history.replaceState(null, "", window.location.pathname + window.location.search);
            const row = rows().flatMap((group) => group.players).find((entry) => entry.player.playerId === asked);
            if (row && !row.off) {
                state.open = asked;
            }
        }
        render();
        const opened = state.open && mount.querySelector(`[data-act="toggle"][data-id="${state.open}"]`);
        if (opened) {
            opened.scrollIntoView({block: "center"});
            opened.focus({preventScroll: true});
        }
    }
    load();
    return {standAside};
}
