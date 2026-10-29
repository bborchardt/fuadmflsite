// Moves › Drop: MFL's Drop Players page with v2's roster over it. A row opens its cut in place; Drop
// posts MFL's own form for that one player, then reads the roster back before the page reloads to
// show it. MFL's form stays in the page underneath; anything v2 can't read leaves MFL's page.

import {ROSTER_MAX, SALARY_CAP} from "../lib/rules.js";
import {esc} from "./html.js";
import {waitLeft} from "./page-fetch.js";
import {placeholders} from "./panel.js";
import {
    READS, READ_GAP, Refused, WIDE, alertLine, capTone, doneLine, failedBox, failedLine, leaveFlash, limitsApply, loadData, movesPhase, refusal,
    rosterIds, send, takeFlash
} from "./moves.js";
import {changeTone, signed, surname, teamState, usedTone} from "./add-model.js";
import {checkDrop, dropRows, readRoster} from "./drop-model.js";
import {money} from "./format.js";
import {contractYears} from "./rosters-model.js";
import {replaceEntry} from "./dialog.js";

const FLASH_KEY = "fuad.dropFlash";

const CHEVRON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>';

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

export async function drawDrop({context, franchiseId}) {
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
    // logged out MFL shows its login screen instead (and its page, should it ever be served); the
    // commissioner's view stays MFL's
    if (!franchiseId || franchiseId === "0000") {
        standAside();
        return;
    }
    const form = dropForm();
    const roster = readRoster(scriptText());
    // not the page v2 knows (MFL changed it), or another team's: MFL's own page, restyled
    if (!form || !roster.length || !form.elements.FRANCHISE || form.elements.FRANCHISE.value !== franchiseId) {
        standAside();
        return;
    }
    mount.innerHTML = `<section class="fuad-panel">${placeholders(8)}</section>`;
    show();

    const wide = window.matchMedia(WIDE);
    const flash = takeFlash(FLASH_KEY);
    const state = {data: null, failed: false, open: null, done: flash.done, error: flash.error || "", busy: false};

    const team = () => teamState(state.data.league, franchiseId, state.data.groups);
    // in season once the roster limits hold, from the cut-down date (2.5)
    const phase = () => (limitsApply(state.data) ? "season" : movesPhase(state.data.facts));
    const rows = () => dropRows(team(), {roster, phase: phase(), positions: state.data.positions});

    // ---- markup ----

    function statusMarkup() {
        const parts = [];
        if (state.done) {
            parts.push(doneLine(state.done));
        }
        // a cut being reviewed shows its failure beside it
        if (state.error && !state.open) {
            parts.push(alertLine(state.error));
        }
        return parts.join("");
    }

    function capBar() {
        const franchise = team().franchise;
        // no roster limits before the season (2.5)
        const season = phase() === "season";
        const figure = (label, value, tone, most) => `<span class="fuad-drop-figure"><span class="fuad-muted">${label}</span> <strong class="${tone}">${esc(value)}</strong>${most ? ` <span class="fuad-muted">of ${esc(most)}</span>` : ""}</span>`;
        return `<div class="fuad-drop-bar">${figure("Active", String(franchise.numPlayers), season && franchise.numPlayers > ROSTER_MAX ? "fuad-bad" : "", season ? String(ROSTER_MAX) : "")}${figure("Cap used", money(franchise.capTotal), capTone(franchise.capTotal), `$${SALARY_CAP}`)}</div>`;
    }

    function review(row) {
        const from = team().franchise.capTotal;
        const to = checkDrop(team(), {drop: row.player.playerId, phase: phase()}).cap.to;
        return `<div class="fuad-drop-review" id="fuad-drop-review-${esc(row.player.playerId)}">
            <span class="fuad-drop-cut">Cut now: <strong>${esc(money(row.penalty))} penalty</strong> · cap used ${esc(money(from))} → <strong class="${tone(usedTone(from, to)).trim()}">${esc(money(to))}</strong></span>
            ${state.error ? alertLine(state.error) : ""}
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

    const band = (group, end = "") => `<div class="fuad-band"><span class="fuad-band-pos">${esc(group.pos)}</span><span>${group.players.length} ${group.players.length === 1 ? "player" : "players"}</span>${end}</div>`;

    function phoneRows(groups) {
        return groups.map((group) => `${band(group, '<span class="fuad-band-end">penalty · cap change</span>')}
            ${group.players.map((row) => {
                const meta = [group.pos, row.player.team, row.player.rfa ? "" : money(row.player.salary), contractYears(row.player), row.player.status === "INJURED_RESERVE" ? "IR" : "", usedNote(row)].filter(Boolean).join(" · ");
                return rowButton(row, `<span class="fuad-drop-who"><span class="fuad-drop-name">${esc(row.player.fullName)}</span><span class="fuad-meta">${esc(meta)}</span></span>
                    <span class="fuad-drop-cost">${row.off ? `<span class="fuad-muted">${esc(row.why)}</span>` : `<span>${esc(money(row.penalty))}</span><span class="fuad-drop-change${tone(changeTone(row.capChange))}">${esc(signed(row.capChange))}</span>`}</span>`);
            }).join("")}`).join("");
    }

    function deskRows(groups) {
        return `<div class="fuad-drop-line fuad-drop-columns" aria-hidden="true"><span>Player</span><span class="fuad-mid">NFL</span><span class="fuad-num">Salary</span><span class="fuad-num">Years</span><span class="fuad-num">Cut penalty</span><span class="fuad-num">Cap change</span><span></span></div>
        ${groups.map((group) => `${band(group)}
            ${group.players.map((row) => rowButton(row, `<span class="fuad-drop-line">
                <span class="fuad-drop-who"><span class="fuad-drop-name">${esc(row.player.fullName)}</span>${row.player.status === "INJURED_RESERVE" ? '<span class="fuad-tag">IR</span>' : ""}${row.usedIn ? `<span class="fuad-meta">${esc(usedNote(row))}</span>` : ""}</span>
                <span class="fuad-mid fuad-muted">${esc(row.player.team || "")}</span>
                <span class="fuad-num">${row.player.rfa ? "—" : esc(money(row.player.salary))}</span>
                <span class="fuad-num fuad-muted">${esc(contractYears(row.player))}</span>
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
                ? `${statusMarkup()}${failedBox("your cap", state.failed)}`
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
        leaveFlash(FLASH_KEY, next);
        replaceEntry(window.location.pathname + window.location.search);
    }

    const mine = () => [...state.data.league.players.values()].filter((player) => player.franchise && player.franchise.franchiseId === franchiseId)
        .map((player) => player.playerId).sort();

    // the team's player ids, fresh; null when the answer leaves the team out, which isn't a roster
    // with no one on it
    const teamIds = async () => {
        const ids = await rosterIds(context, franchiseId);
        return ids.length ? ids : null;
    };

    // the roster after a drop, read again a few times while it still has him; null if never read
    async function readBack(playerId) {
        let ids = null;
        for (let tries = 0; tries < READS; tries += 1) {
            if (tries) {
                await new Promise((resolve) => setTimeout(resolve, READ_GAP));
            }
            ids = (await teamIds().catch(() => null)) || ids;
            if (ids && !ids.includes(playerId)) {
                break;
            }
        }
        return ids;
    }

    async function drop(playerId) {
        const row = rows().flatMap((group) => group.players).find((entry) => entry.player.playerId === playerId);
        if (!row || row.off || state.busy) {
            return;
        }
        const name = surname(state.data.mflNames.get(playerId) || row.player.fullName);
        state.busy = true;
        state.error = "";
        render();
        let answer = "";
        let failed = null;
        try {
            answer = await send(form.action, {method: "POST", body: formFields(form, playerId)});
        } catch (error) {
            console.warn("[fuad] couldn't drop:", error);
            failed = error;
        }
        // MFL may have made it even when its answer failed: the page reloads to show what it has
        const ids = await readBack(playerId);
        if (ids && !ids.includes(playerId)) {
            reloadWith({done: `${name} dropped.`});
            return;
        }
        const error = failed || new Refused(refusal(answer));
        if (ids && JSON.stringify(ids) !== JSON.stringify(mine())) {
            reloadWith({error: failedLine(`drop ${name}`, error, {changed: true})});
        } else {
            // with the roster unread, MFL's reason if it refused, else no telling whether it made it
            state.error = ids || error.reason ? failedLine(`drop ${name}`, error) : "Couldn't check whether MFL made it. Reload the page to see your roster.";
            state.busy = false;
            render();
            // the button was off while sending, so focus fell away from it
            const again = mount.querySelector(`[data-act="drop"][data-id="${playerId}"]`);
            if (again) {
                again.focus();
            }
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
