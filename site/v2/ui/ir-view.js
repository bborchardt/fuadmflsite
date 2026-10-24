// What Moves › IR draws, as HTML, from `v`: the screen's state and what ir.js reads for it.
//   state      ir.js's state (data, failed, busy, done, error)
//   result     the ticked moves' checks (ir.js's check(): checkIR's answer with toIR, activate,
//              drop and needsDrop)
//   groups     irGroups' {canGo, onIR}; musts: the rows that must come off IR
//   team       teamState; page: MFL's IR page as readIRPage reads it; limits: whether the roster
//              limits hold
//   wide       the desktop layout; dropHref: Moves › Drop's page, or null

import {ROSTER_MAX, SALARY_CAP} from "../lib/rules.js";
import {esc} from "./html.js";
import {placeholders} from "./panel.js";
import {alertLine, capTone, doneLine, failedBox, money} from "./moves.js";
import {changeTone, signed} from "./add-model.js";
import {contractYears} from "./rosters-model.js";
import {dropChoices, irBlockText} from "./ir-model.js";

const tone = (name) => (name ? ` fuad-${name}` : "");

// how many moves Save would make
export const moveCount = (result) => result.toIR.length + result.activate.length + (result.drop ? 1 : 0);

export function statusMarkup(state) {
    const parts = [];
    if (state.done) {
        parts.push(doneLine(state.done));
    }
    if (state.error) {
        parts.push(alertLine(state.error));
    }
    return parts.join("");
}

// before the data loads, or when it couldn't
export function loadingMarkup(state) {
    return state.failed ? `${statusMarkup(state)}${failedBox("your roster and cap", state.failed)}` : `<section class="fuad-panel">${placeholders(8)}</section>`;
}

function mustMarkup(musts, dropHref) {
    return musts.map((row) => `<p class="fuad-move-alert fuad-ir-must" role="alert"><strong>${esc(row.player.fullName)} must come off IR:</strong> the NFL no longer lists him.${row.off && row.entry.locked ? " His game has started, so he can be activated once it clears." : ""}${dropHref ? ` <a href="${esc(`${dropHref}#player-${row.player.playerId}`)}">Drop him instead</a>` : ""}</p>`).join("");
}

// where the team stands, and with a move ticked, where it would stand; Save
function barMarkup(v) {
    const {result} = v;
    const blocked = irBlockText(result);
    const count = moveCount(result);
    const off = Boolean(blocked) || !count || v.state.busy;
    const activeTone = (active) => (v.limits && active > ROSTER_MAX ? "fuad-bad" : "");
    // each number in its own tone
    const figure = (label, {from, to}, toneOf, show, most) => `<span class="fuad-ir-figure"><span class="fuad-muted">${label}</span> <strong><span class="${toneOf(from)}">${esc(show(from))}</span>${from === to ? "" : ` → <span class="${toneOf(to)}">${esc(show(to))}</span>`}</strong>${most === null ? "" : ` <span class="fuad-muted">of ${esc(show(most))}</span>`}</span>`;
    return `<section class="fuad-ir-bar${blocked ? " fuad-ir-bar-blocked" : ""}" aria-label="Result">
    ${figure("Active", result.active, activeTone, String, v.limits ? ROSTER_MAX : null)}
    ${figure("Cap used", result.cap, capTone, money, SALARY_CAP)}
    <span class="fuad-ir-why">${blocked ? `<strong class="fuad-bad">Blocked:</strong> ${esc(blocked)}` : ""}</span>
    <button type="button" class="fuad-ir-save" data-act="save"${off ? " disabled" : ""}>${v.state.busy ? "Saving…" : count ? "Save IR moves" : "Nothing to save"}</button>
</section>`;
}

// a row's box: Move to IR or Activate, ticked or not; off with its reason
function box(v, row, kind) {
    const id = row.player.playerId;
    const on = kind === "toIR" ? v.result.toIR.includes(id) : v.result.activate.includes(id);
    const label = row.off ? row.why : row.must ? "Must activate" : kind === "toIR" ? "Move to IR" : "Activate";
    const disabled = row.off || row.must || v.state.busy;
    return {on, html: `<input type="checkbox" data-act="${kind}" data-id="${esc(id)}"${on ? " checked" : ""}${disabled ? " disabled" : ""}><span>${esc(label)}</span>`};
}

function meta(row) {
    const player = row.player;
    return [player.nflPosition, player.team, money(player.salary), row.status, row.back && `expected back ${row.back}`].filter(Boolean).join(" · ");
}

function phoneGroup(v, {id, title, rows, kind, empty}) {
    const items = rows.map((row) => {
        const {on, html} = box(v, row, kind);
        // the whole row ticks its box: no popup here, so a tap can't miss
        return `<label class="fuad-ir-row${on ? " fuad-ir-on-row" : ""}${row.off ? " fuad-ir-off" : ""}">
        <span class="fuad-ir-who"><span class="fuad-ir-name">${esc(row.player.fullName)}</span><span class="fuad-meta${row.must ? " fuad-bad" : ""}">${esc(meta(row))}</span></span>
        <span class="fuad-ir-act">${html}</span>
    </label>`;
    }).join("");
    return `<section class="fuad-panel fuad-ir-group" aria-labelledby="${id}"><h2 id="${id}">${esc(title)}</h2>${items || `<p class="fuad-ir-empty">${esc(empty)}</p>`}</section>`;
}

function deskTable(v, lists) {
    return `<section class="fuad-panel fuad-ir-table" aria-label="Injured reserve"><div class="fuad-ir-wide">
    <div class="fuad-ir-line fuad-ir-columns" aria-hidden="true"><span>Player</span><span class="fuad-mid">Pos</span><span class="fuad-mid">NFL</span><span class="fuad-num">Salary</span><span>NFL status</span><span class="fuad-mid">Expected back</span><span></span></div>
    ${lists.map(({id, title, rows, kind, empty}) => `<h2 class="fuad-ir-group-head" id="${id}">${esc(title)}</h2>
        ${rows.map((row) => {
            const {on, html} = box(v, row, kind);
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

// Pick a drop, while activating needs one
function dropMarkup(v) {
    const {result} = v;
    if (!result.needsDrop) {
        return "";
    }
    const choices = dropChoices(v.team, v.page, {toIR: result.toIR, activate: result.activate, limits: v.limits});
    const radio = (choice) => `<input type="radio" name="fuad-ir-drop" data-act="drop" data-id="${esc(choice.player.playerId)}"${result.drop === choice.player.playerId ? " checked" : ""}${choice.off || v.state.busy ? " disabled" : ""}>`;
    const rows = choices.map((choice) => {
        const player = choice.player;
        const on = result.drop === player.playerId;
        const cost = choice.off
            ? `<span class="fuad-muted">${esc(choice.why)}</span>`
            : `<span>${esc(money(choice.penalty))} penalty</span><span class="fuad-ir-change${tone(changeTone(choice.capChange))}">${esc(signed(choice.capChange))} cap</span>`;
        if (v.wide) {
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
    const head = v.wide
        ? '<div class="fuad-ir-dline fuad-ir-columns" aria-hidden="true"><span></span><span>Player</span><span class="fuad-mid">Pos</span><span class="fuad-mid">NFL</span><span class="fuad-num">Salary</span><span class="fuad-num">Years</span><span class="fuad-num">Cut penalty</span><span class="fuad-num">Cap change</span></div>'
        : "";
    return `<section class="fuad-panel fuad-ir-drops${result.drop ? "" : " fuad-ir-drops-needed"}" aria-labelledby="fuad-ir-drop-head">
    <h2 id="fuad-ir-drop-head">Pick a drop</h2>
    <div class="fuad-ir-wide">${head}<div class="fuad-ir-drop-list" role="radiogroup" aria-labelledby="fuad-ir-drop-head">${rows}</div></div>
</section>`;
}

// the screen: on desktop the bar above the table, sticky; on phones below the lists, sticky above
// the tabs
export function irMarkup(v) {
    const lists = [
        {id: "fuad-ir-can-go", title: "Can go on IR", rows: v.groups.canGo, kind: "toIR", empty: "None of your active players is on the NFL’s IR."},
        {id: "fuad-ir-on-ir", title: "On your IR", rows: v.groups.onIR, kind: "activate", empty: "No one is on your IR."}
    ];
    const top = `${statusMarkup(v.state)}${mustMarkup(v.musts, v.dropHref)}`;
    return v.wide
        ? `${top}${barMarkup(v)}${deskTable(v, lists)}${dropMarkup(v)}`
        : `${top}${lists.map((list) => phoneGroup(v, list)).join("")}${dropMarkup(v)}${barMarkup(v)}`;
}

// the control a redraw gives focus back to
export const controlSelector = (dataset) => `[data-act="${dataset.act}"][data-id="${dataset.id || ""}"]`;
