// Moves › IR: MFL's Injured Reserve page with v2's lists over it. Boxes pick moves to IR and
// activations, Pick a drop shows while activating needs one, and Save posts MFL's one form for them
// together, then reads the roster back before the page reloads to show it. MFL's form stays in the
// page underneath; anything v2 can't read leaves MFL's page.

import {API_BASE, exportUrl, fetchExport} from "../lib/mfl.js";
import {ROSTER_MAX, SALARY_CAP} from "../lib/rules.js";
import {esc} from "./html.js";
import {pageFetch, waitLeft} from "./page-fetch.js";
import {placeholders} from "./panel.js";
import {
    Refused, WIDE, alertLine, capTone, doneLine, failedBox, failedLine, leaveFlash, limitsApply, loadData, money, refusal, rosterStatuses,
    send, takeFlash
} from "./moves.js";
import {changeTone, signed, teamState} from "./add-model.js";
import {contractYears} from "./rosters-model.js";
import {checkIR, dropChoices, injuryReport, irBlockText, irFields, irGroups, movesText, readIRPage, rosterFromPage, savedMoves} from "./ir-model.js";

const FLASH_KEY = "fuad.irFlash";
// reading the roster back after a save: how many times, and how far apart (MFL asks for about a
// second between requests)
const READS = 3;
const READ_GAP = 1500;

const tone = (name) => (name ? ` fuad-${name}` : "");

export async function drawIR({context, franchiseId, loginHref, dropHref}) {
    const body = document.querySelector(".pagebody");
    if (!body) {
        return;
    }
    const mount = document.createElement("div");
    mount.id = "fuad-ir";
    const show = () => {
        body.prepend(mount);
        document.documentElement.classList.add("fuad-ir-on");
    };
    const standAside = () => {
        mount.remove();
        document.documentElement.classList.remove("fuad-ir-on");
    };
    if (!franchiseId) {
        mount.innerHTML = `<section class="fuad-panel fuad-ir-note"><span>Log in to make moves</span><a class="fuad-button" href="${esc(loginHref)}">Log in</a></section>`;
        show();
        return;
    }
    // the commissioner's view stays MFL's
    if (franchiseId === "0000") {
        return;
    }
    const page = readIRPage(document, franchiseId);
    // not the page v2 knows (MFL changed it), or another team's: MFL's own page, restyled
    if (!page) {
        standAside();
        return;
    }
    mount.innerHTML = `<section class="fuad-panel">${placeholders(8)}</section>`;
    show();

    const wide = window.matchMedia(WIDE);
    const flash = takeFlash(FLASH_KEY);
    const state = {
        data: null, report: null, failed: false, busy: false,
        toIR: new Set(), activate: new Set(), drop: null,
        done: flash.done, error: flash.error || ""
    };

    const team = () => teamState(state.data.league, franchiseId, state.data.groups);
    const limits = () => limitsApply(state.data.facts, state.data.calendar);
    const groups = () => irGroups(state.data.league, page, state.report);
    // a player who must come off IR is in every save while his box is open (bylaw 11.1; MFL takes no
    // lineup until he is)
    const musts = () => groups().onIR.filter((row) => row.must);
    const moves = () => {
        const activate = new Set(state.activate);
        musts().filter((row) => !row.off).forEach((row) => activate.add(row.player.playerId));
        return {toIR: [...state.toIR], activate: [...activate]};
    };
    const check = () => {
        const {toIR, activate} = moves();
        const needsDrop = checkIR(team(), {toIR, activate, limits: limits()}).needsDrop;
        // Pick a drop shows only while activating needs one; a drop picked earlier is let go when
        // not, or once it isn't a choice (he's moving to IR, or his penalty no longer fits)
        if (state.drop && (!needsDrop || !dropChoices(team(), page, {toIR, activate, limits: limits()})
            .some((choice) => choice.player.playerId === state.drop && !choice.off))) {
            state.drop = null;
        }
        const drop = state.drop;
        return {...checkIR(team(), {toIR, activate, drop, limits: limits()}), needsDrop, toIR, activate, drop};
    };
    const nameOf = (id) => {
        const player = state.data.league.players.get(id);
        return player ? player.fullName : id;
    };

    // ---- markup ----

    function statusMarkup() {
        const parts = [];
        if (state.done) {
            parts.push(doneLine(state.done));
        }
        if (state.error) {
            parts.push(alertLine(state.error));
        }
        return parts.join("");
    }

    function mustMarkup() {
        return musts().map((row) => `<p class="fuad-move-alert fuad-ir-must" role="alert"><strong>${esc(row.player.fullName)} must come off IR:</strong> the NFL no longer lists him.${row.off && row.entry.locked ? " His game has started, so he can be activated once it clears." : ""}${dropHref ? ` <a href="${esc(`${dropHref}#player-${row.player.playerId}`)}">Drop him instead</a>` : ""}</p>`).join("");
    }

    function barMarkup(result) {
        const blocked = irBlockText(result);
        const count = result.toIR.length + result.activate.length + (result.drop ? 1 : 0);
        const off = Boolean(blocked) || !count || state.busy;
        const activeTone = (active) => (limits() && active > ROSTER_MAX ? "fuad-bad" : "");
        // where the team stands, and with a move ticked, where it would stand: each number in its own tone
        const figure = (label, {from, to}, tone, show, most) => `<span class="fuad-ir-figure"><span class="fuad-muted">${label}</span> <strong><span class="${tone(from)}">${esc(show(from))}</span>${from === to ? "" : ` → <span class="${tone(to)}">${esc(show(to))}</span>`}</strong>${most === null ? "" : ` <span class="fuad-muted">of ${esc(show(most))}</span>`}</span>`;
        return `<section class="fuad-ir-bar${blocked ? " fuad-ir-bar-blocked" : ""}" aria-label="Result">
            ${figure("Active", result.active, activeTone, String, limits() ? ROSTER_MAX : null)}
            ${figure("Cap used", result.cap, capTone, money, SALARY_CAP)}
            <span class="fuad-ir-why">${blocked ? `<strong class="fuad-bad">Blocked:</strong> ${esc(blocked)}` : ""}</span>
            <button type="button" class="fuad-ir-save" data-act="save"${off ? " disabled" : ""}>${state.busy ? "Saving…" : count ? "Save IR moves" : "Nothing to save"}</button>
        </section>`;
    }

    // a row's box: Move to IR or Activate, ticked or not; off with its reason
    function box(row, kind, result) {
        const id = row.player.playerId;
        const on = kind === "toIR" ? result.toIR.includes(id) : result.activate.includes(id);
        const label = row.off ? row.why : row.must ? "Must activate" : kind === "toIR" ? "Move to IR" : "Activate";
        const disabled = row.off || row.must || state.busy;
        return {on, html: `<input type="checkbox" data-act="${kind}" data-id="${esc(id)}"${on ? " checked" : ""}${disabled ? " disabled" : ""}><span>${esc(label)}</span>`};
    }

    function meta(row) {
        const player = row.player;
        return [player.nflPosition, player.team, money(player.salary), row.status, row.back && `expected back ${row.back}`].filter(Boolean).join(" · ");
    }

    function phoneGroup(id, title, rows, kind, empty, result) {
        const items = rows.map((row) => {
            const {on, html} = box(row, kind, result);
            // the whole row ticks its box: no popup here, so a tap can't miss
            return `<label class="fuad-ir-row${on ? " fuad-ir-on-row" : ""}${row.off ? " fuad-ir-off" : ""}">
                <span class="fuad-ir-who"><span class="fuad-ir-name">${esc(row.player.fullName)}</span><span class="fuad-meta${row.must ? " fuad-bad" : ""}">${esc(meta(row))}</span></span>
                <span class="fuad-ir-act">${html}</span>
            </label>`;
        }).join("");
        return `<section class="fuad-panel fuad-ir-group" aria-labelledby="${id}"><h2 id="${id}">${esc(title)}</h2>${items || `<p class="fuad-ir-empty">${esc(empty)}</p>`}</section>`;
    }

    function deskTable(groupList, result) {
        return `<section class="fuad-panel fuad-ir-table" aria-label="Injured reserve"><div class="fuad-ir-wide">
            <div class="fuad-ir-line fuad-ir-columns" aria-hidden="true"><span>Player</span><span class="fuad-mid">Pos</span><span class="fuad-mid">NFL</span><span class="fuad-num">Salary</span><span>NFL status</span><span class="fuad-mid">Expected back</span><span></span></div>
            ${groupList.map(({id, title, rows, kind, empty}) => `<h2 class="fuad-ir-group-head" id="${id}">${esc(title)}</h2>
                ${rows.map((row) => {
                    const {on, html} = box(row, kind, result);
                    return `<div class="fuad-ir-line fuad-ir-item${on ? " fuad-ir-on-row" : ""}">
                        <span><button type="button" class="fuad-ir-name fuad-ir-link" data-act="player" data-id="${esc(row.player.playerId)}">${esc(row.player.fullName)}</button></span>
                        <span class="fuad-mid fuad-muted">${esc(row.player.nflPosition || "")}</span>
                        <span class="fuad-mid fuad-muted">${esc(row.player.team || "")}</span>
                        <span class="fuad-num"><strong>${esc(money(row.player.salary))}</strong></span>
                        <span class="${row.must ? "fuad-bad" : "fuad-muted"}">${esc(row.status)}</span>
                        <span class="fuad-mid fuad-muted">${esc(row.back)}</span>
                        <label class="fuad-ir-act">${html}</label>
                    </div>`;
                }).join("") || `<p class="fuad-ir-empty">${esc(empty)}</p>`}`).join("")}
        </div></section>`;
    }

    function dropMarkup(result) {
        if (!result.needsDrop) {
            return "";
        }
        const choices = dropChoices(team(), page, {toIR: result.toIR, activate: result.activate, limits: limits()});
        const radio = (choice) => `<input type="radio" name="fuad-ir-drop" data-act="drop" data-id="${esc(choice.player.playerId)}"${result.drop === choice.player.playerId ? " checked" : ""}${choice.off || state.busy ? " disabled" : ""}>`;
        const rows = choices.map((choice) => {
            const player = choice.player;
            const on = result.drop === player.playerId;
            const cost = choice.off
                ? `<span class="fuad-muted">${esc(choice.why)}</span>`
                : `<span>${esc(money(choice.penalty))} penalty</span><span class="fuad-ir-change${tone(changeTone(choice.capChange))}">${esc(signed(choice.capChange))} cap</span>`;
            if (wide.matches) {
                return `<label class="fuad-ir-dline fuad-ir-drow${on ? " fuad-ir-on-row" : ""}${choice.off ? " fuad-ir-off" : ""}">${radio(choice)}
                    <span class="fuad-ir-name">${esc(player.fullName)}</span>
                    <span class="fuad-mid fuad-muted">${esc(player.nflPosition || "")}</span>
                    <span class="fuad-mid fuad-muted">${esc(player.team || "")}</span>
                    <span class="fuad-num">${player.rfa ? "—" : esc(money(player.salary))}</span>
                    <span class="fuad-num fuad-muted">${esc(contractYears(player))}</span>
                    <span class="fuad-num">${choice.off ? `<span class="fuad-muted">${esc(choice.why)}</span>` : esc(money(choice.penalty))}</span>
                    <span class="fuad-num fuad-ir-change${choice.off ? " fuad-muted" : tone(changeTone(choice.capChange))}">${esc(signed(choice.capChange))}</span>
                </label>`;
            }
            return `<label class="fuad-ir-drow${on ? " fuad-ir-on-row" : ""}${choice.off ? " fuad-ir-off" : ""}">${radio(choice)}
                <span class="fuad-ir-who"><span class="fuad-ir-name">${esc(player.fullName)}</span><span class="fuad-meta">${esc([player.nflPosition, player.team, player.rfa ? "" : money(player.salary), contractYears(player)].filter(Boolean).join(" · "))}</span></span>
                <span class="fuad-ir-cost">${cost}</span>
            </label>`;
        }).join("");
        const head = wide.matches
            ? '<div class="fuad-ir-dline fuad-ir-columns" aria-hidden="true"><span></span><span>Player</span><span class="fuad-mid">Pos</span><span class="fuad-mid">NFL</span><span class="fuad-num">Salary</span><span class="fuad-num">Years</span><span class="fuad-num">Cut penalty</span><span class="fuad-num">Cap change</span></div>'
            : "";
        return `<section class="fuad-panel fuad-ir-drops${result.drop ? "" : " fuad-ir-drops-needed"}" aria-labelledby="fuad-ir-drop-head">
            <h2 id="fuad-ir-drop-head">Pick a drop</h2>
            <div class="fuad-ir-wide">${head}<div class="fuad-ir-drop-list" role="radiogroup" aria-labelledby="fuad-ir-drop-head">${rows}</div></div>
        </section>`;
    }

    function render() {
        const active = document.activeElement;
        const acted = active && mount.contains(active) && active.dataset && active.dataset.act
            ? `[data-act="${active.dataset.act}"][data-id="${active.dataset.id || ""}"]` : null;
        if (!state.data) {
            mount.innerHTML = state.failed
                ? `${statusMarkup()}${failedBox("your roster and cap", state.failed)}`
                : `<section class="fuad-panel">${placeholders(8)}</section>`;
            return;
        }
        const result = check();
        const {canGo, onIR} = groups();
        const lists = [
            {id: "fuad-ir-can-go", title: "Can go on IR", rows: canGo, kind: "toIR", empty: "None of your active players is on the NFL’s IR."},
            {id: "fuad-ir-on-ir", title: "On your IR", rows: onIR, kind: "activate", empty: "No one is on your IR."}
        ];
        // desktop: the bar above the table, sticky; phones: below the lists, sticky above the tabs
        mount.innerHTML = wide.matches
            ? `${statusMarkup()}${mustMarkup()}${barMarkup(result)}${deskTable(lists, result)}${dropMarkup(result)}`
            : `${statusMarkup()}${mustMarkup()}${lists.map((list) => phoneGroup(list.id, list.title, list.rows, list.kind, list.empty, result)).join("")}${dropMarkup(result)}${barMarkup(result)}`;
        const again = acted && mount.querySelector(acted);
        if (again && !again.disabled) {
            again.focus();
        }
    }

    // ---- saving ----

    // Shows the result after MFL's page reloads
    function reloadWith(next) {
        leaveFlash(FLASH_KEY, next);
        window.location.replace(window.location.pathname + window.location.search);
    }

    // What MFL made of a save: the IR page it answered with, as the roster now stands, else the
    // rosters export, read again a few times while it shows nothing done, since it can lag a move
    // (seen live: a move to IR made, the export read just after still had him active)
    async function readBack(asked, answered) {
        if (answered) {
            const roster = rosterFromPage(answered);
            if (savedMoves(roster, asked).done.length) {
                return roster;
            }
        }
        let roster = null;
        for (let tries = 0; tries < READS; tries += 1) {
            if (tries) {
                await new Promise((resolve) => setTimeout(resolve, READ_GAP));
            }
            roster = (await rosterStatuses(context, franchiseId).catch(() => null)) || roster;
            if (roster && !savedMoves(roster, asked).missed.length) {
                break;
            }
        }
        return roster;
    }

    async function save() {
        const result = check();
        if (state.busy || irBlockText(result) || !(result.toIR.length + result.activate.length + (result.drop ? 1 : 0))) {
            return;
        }
        const asked = {toIR: result.toIR, activate: result.activate, drop: result.drop};
        state.busy = true;
        state.error = "";
        state.done = null;
        render();
        let answer = "";
        let sent = false;
        try {
            answer = await send(page.form.action, {method: "POST", body: irFields(page.form, {franchiseId, ...asked})});
            sent = true;
        } catch (error) {
            console.warn("[fuad] couldn't save IR moves:", error);
        }
        const answered = sent ? readIRPage(new DOMParser().parseFromString(answer, "text/html"), franchiseId) : null;
        // MFL's reason, unless it answered with the IR page itself, whose marks aren't one
        const refused = new Refused(sent && !answered ? refusal(answer) : null);
        const roster = await readBack(asked, answered);
        if (roster) {
            const {done, missed} = savedMoves(roster, asked);
            if (done.length) {
                reloadWith({
                    done: `Saved: ${movesText(done, nameOf)}.`,
                    error: missed.length ? failedLine(movesText(missed, nameOf, {undone: true}), refused) : ""
                });
                return;
            }
        }
        state.error = !roster && sent ? "Couldn't check whether MFL made it. Reload the page to see your roster." : failedLine("save your IR moves", refused);
        state.busy = false;
        render();
        const again = mount.querySelector("[data-act=save]");
        if (again && !again.disabled) {
            again.focus();
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
        } else if (act === "save") {
            save();
        } else if (act === "player" && window.fuadOpenPlayer) {
            window.fuadOpenPlayer(target.dataset.id, {opener: target});
        }
    });

    mount.addEventListener("change", (event) => {
        const target = event.target;
        const act = target.dataset && target.dataset.act;
        if (state.busy || !act) {
            return;
        }
        if (act === "toIR" || act === "activate") {
            const set = act === "toIR" ? state.toIR : state.activate;
            if (target.checked) {
                set.add(target.dataset.id);
            } else {
                set.delete(target.dataset.id);
            }
        } else if (act === "drop") {
            state.drop = target.dataset.id;
        }
        state.error = "";
        state.done = null;
        render();
    });
    wide.addEventListener("change", () => state.data && render());

    async function load() {
        state.failed = false;
        render();
        try {
            const [data, injuries] = await Promise.all([
                loadData(context, franchiseId),
                // today's report: who the NFL lists on IR, and when he's expected back
                fetchExport(exportUrl(API_BASE, context.season, "injuries"), "injuries", {fetchImpl: pageFetch}).catch(() => null)
            ]);
            if (!data.league.franchises.get(franchiseId)) {
                throw new Error("your team isn't in the rosters");
            }
            state.data = data;
            state.report = injuryReport(injuries);
        } catch (error) {
            console.warn("[fuad] couldn't load IR:", error);
            state.data = null;
            state.failed = error && error.status === 429 ? "busy" : true;
            // Retry comes back on when MFL's wait is over
            if (state.failed === "busy" && waitLeft()) {
                setTimeout(render, waitLeft());
            }
        }
        // Rosters' popup IR opens with him ticked (`#player-<id>`)
        const asked = (window.location.hash.match(/^#player-(\d+)$/) || [])[1];
        if (asked && state.data) {
            window.history.replaceState(null, "", window.location.pathname + window.location.search);
            const row = groups().canGo.find((entry) => entry.player.playerId === asked);
            if (row && !row.off) {
                state.toIR.add(asked);
            }
        }
        render();
        const ticked = asked && mount.querySelector(`[data-id="${asked}"][data-act=toIR]`);
        if (ticked) {
            ticked.scrollIntoView({block: "center"});
            ticked.focus({preventScroll: true});
        }
    }
    load();
    return {standAside};
}
