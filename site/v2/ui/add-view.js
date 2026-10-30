// What Moves › Add draws, as HTML, from `v`: the screen's state and what add.js reads for it.
//   state       add.js's state (data, compose, q, pos, watching, sort, open, flash, done, error, busy)
//   team        teamState; phase: the checks' phase; banner: banner()'s answer
//   groups      groupViews; rounds: the groups' rounds; nextRound: the round a new group takes;
//               maxGroups: how many groups MFL allows; positions: the league's, in MFL's order
//   lists       MFL's player lists (readPlayerLists); names(id): {mflName, name}
//   wide        the desktop layout; watched: the watch list (a Set) once loaded, else null
//   runsLeft    whether a bid placed now has a run left; now: seconds; franchiseId
//   canMove(action, key)  whether MFL's claims table has that link (MOVE_UP, MOVE_DOWN) for a claim

import {ROSTER_MAX} from "../lib/rules.js";
import {esc} from "./html.js";
import {placeholders} from "./panel.js";
import {CHECK, alertLine, failedBox} from "./moves.js";
import {STAR} from "./watch.js";
import {contractYears} from "./rosters-model.js";
import {
    LENGTHS, addBlock, blockedText, changeTone, composeCheck, copyTargets, cutLater, dropCheck, dropGroups, droppedByTeam,
    findClaim, freeAgentRows, injuryText, lengthLine, projection, signed, surname, usedDrops, usedTone
} from "./add-model.js";
import {money} from "./format.js";

const NOTICE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 8v5M12 16.5v.5"></path></svg>';
const PLUS = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>';
const ARROW = '<svg class="fuad-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="to"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>';
const CHEVRON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>';
const UP = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"></path></svg>';
const DOWN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>';
const SEARCH = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path></svg>';
const CLOSE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>';

const tone = (name) => (name ? ` fuad-${name}` : "");

export const freeAgent = (v, id) => v.lists.add.find((player) => player.id === id);

// the composed move's checks (composeCheck)
export const moveChecks = (v) => composeCheck(v.team, v.state.compose, {phase: v.phase, freeAgent: freeAgent(v, v.state.compose.add)});

// the free agents listed, as filtered and sorted
export const freeAgentList = (v) => freeAgentRows(v.lists.add, {blocked: droppedByTeam(v.team.players, v.franchiseId, v.now), text: v.state.q, pos: v.state.pos,
    sort: v.state.sort, bids: v.runsLeft, watched: v.state.watching ? v.watched : null});

function fmtProj(value) {
    return value === null || value === undefined ? "—" : String(Math.round(value * 10) / 10);
}

function faMeta(player, {showBidOnly}) {
    const where = /^bye$/i.test(player.opp) ? "bye week" : [player.opp, player.bye ? `bye ${player.bye}` : ""].filter(Boolean).join(" · ");
    const injury = injuryText(player.inj);
    return `${esc([player.nfl, player.pos, where].filter(Boolean).join(" · "))}${injury ? ` · <span class="fuad-caution">${esc(injury)}</span>` : ""}${showBidOnly ? ' · <span class="fuad-bid-only">bid only</span>' : ""}`;
}

// cap used, now → after
export function capLine(label, sub, from, to) {
    return `<div class="fuad-add-cap">
    <span class="fuad-add-cap-label"><span>${esc(label)}</span>${sub ? `<span class="fuad-meta">${esc(sub)}</span>` : ""}</span>
    <span class="fuad-add-cap-value"><span>${esc(money(from))}</span>${ARROW}<span class="${tone(usedTone(from, to))}">${esc(money(to))}</span></span>
</div>`;
}

// no adds at all over 30 active in season (10.5), Home's words for it
const overLimitText = (team) => `Over the roster limit: ${team.franchise.numPlayers} active of ${ROSTER_MAX}. Drop a player or move one to IR first.`;

export function bannerMarkup(banner) {
    return `<div class="fuad-add-banner fuad-add-banner-${banner.kind}"><span class="fuad-dot" aria-hidden="true"></span>${esc(banner.text)}</div>`;
}

// what the last move left, and a failure not shown beside a move being composed
export function statusMarkup(state) {
    const parts = [];
    if (state.done) {
        const failed = state.done.failed;
        parts.push(`<div class="fuad-add-status${failed ? " fuad-add-status-warn" : ""}" role="status"><span class="fuad-add-status-line">${failed ? NOTICE : CHECK}<span>${esc(state.done.text)}</span></span>${failed && state.done.line ? `<button type="button" class="fuad-cta" data-act="post-now"${state.busy ? " disabled" : ""}>Post it now</button>` : ""}</div>`);
    }
    if (state.error && !state.compose) {
        parts.push(alertLine(state.error));
    }
    return parts.join("");
}

// before the data loads, or when it couldn't
export function loadingMarkup(state) {
    return state.failed
        ? `${statusMarkup(state)}${failedBox("your cap", state.failed)}
    <button type="button" class="fuad-add-start" disabled>${PLUS}Add a player</button>`
        : `<section class="fuad-panel">${placeholders(8)}</section>`;
}

function rosterLine(team, p, cls) {
    return `<div class="${cls}"><span class="fuad-add-cap-label"><span>Projected roster</span></span><span class="fuad-add-cap-value"><span>${team.franchise.numPlayers}</span>${ARROW}<span class="${p.overRoster ? "fuad-bad" : ""}">${p.roster}</span></span></div>`;
}

function projectionMarkup(team, groupsShown) {
    const p = projection(team);
    const invalid = groupsShown.length && (p.overCap || p.overRoster);
    const rosterChanges = p.roster !== team.franchise.numPlayers;
    return `${invalid ? '<p class="fuad-move-alert" role="alert">Current bids invalid</p>' : ""}
    <section class="fuad-panel fuad-add-projected" aria-label="Projected">
        ${capLine("Projected cap", "If all high bids win", team.franchise.capTotal, p.cap)}
        ${rosterChanges ? rosterLine(team, p, "fuad-add-cap fuad-add-roster") : ""}
    </section>`;
}

function claimDetail(claim) {
    return `${claim.dropName ? `drop ${esc(claim.dropName)}` : "no drop"}${claim.line ? ` · “${esc(claim.line)}”` : ""}`;
}

// whether a claim's move (`act`, and for a copy its group) is the one under way
const acting = (state, act, key, round = null) => Boolean(state.busy && state.acting && state.acting.act === act && state.acting.key === key
    && (round === null || state.acting.round === round));

function copyChips(v, group, claim) {
    const targets = copyTargets(v.team, {round: group.round, claim, rounds: v.rounds, maxGroups: v.maxGroups, phase: v.phase});
    return `<span class="fuad-meta">Copy to</span>${targets.map((target) => `<button type="button" class="fuad-add-chip" data-act="copy" data-key="${esc(claim.key)}" data-round="${target.round}"${target.off || v.state.busy ? " disabled" : ""}>${acting(v.state, "copy", claim.key, target.round) ? "Copying…" : `${target.isNew ? "new group" : "group"} ${target.round}${target.why ? ` · ${esc(target.why)}` : ""}`}</button>`).join("")}`;
}

const removeButton = (state, claim) => `<button type="button" class="fuad-add-remove" data-act="remove" data-key="${esc(claim.key)}"${state.busy ? " disabled" : ""}>${acting(state, "remove", claim.key) ? "Removing…" : "Remove"}</button>`;

function arrows(v, claim, i, count) {
    const up = i > 0 && v.canMove("MOVE_UP", claim.key) && !v.state.busy;
    const down = i < count - 1 && v.canMove("MOVE_DOWN", claim.key) && !v.state.busy;
    return `<span class="fuad-add-order">
        <button type="button" class="fuad-add-arrow" data-act="up" data-key="${esc(claim.key)}" aria-label="Move ${esc(claim.addName)} up"${up ? "" : " disabled"}>${UP}</button>
        <button type="button" class="fuad-add-arrow" data-act="down" data-key="${esc(claim.key)}" aria-label="Move ${esc(claim.addName)} down"${down ? "" : " disabled"}>${DOWN}</button>
    </span>`;
}

// the phone's Add: the banner, the pending groups as cards, and the buttons that start a move
export function phoneHome(v) {
    const {state, banner} = v;
    const block = addBlock(v.team, {phase: v.phase});
    const shown = v.groups;
    const bidsPeriod = banner.kind === "bids";
    const canStart = v.rounds.length < v.maxGroups && !block && !state.busy;
    const groupCards = shown.map((group) => `<section class="fuad-panel fuad-add-group" aria-label="Group ${group.round}">
        <div class="fuad-add-group-head"><h2>Group ${group.round}</h2><span class="fuad-meta">max cap change <strong class="${tone(changeTone(group.max))}">${esc(signed(group.max))}</strong></span></div>
        ${group.claims.map((claim, i) => `<div class="fuad-add-claim${state.flash === claim.key ? " fuad-add-flash" : ""}">
            <span class="fuad-add-rank">#${claim.rank}</span>
            <button type="button" class="fuad-add-claim-who" data-act="toggle" data-key="${esc(claim.key)}" aria-expanded="${state.open === claim.key}">
                <span class="fuad-add-name">${esc(claim.addName)}</span><span class="fuad-meta">${claimDetail(claim)}</span>
            </button>
            <span class="fuad-add-bid"><span>$${claim.bid}</span><span class="fuad-add-change${tone(changeTone(claim.change))}">${esc(signed(claim.change))}</span></span>
            ${arrows(v, claim, i, group.claims.length)}
        </div>
        ${state.open === claim.key ? `<div class="fuad-add-claim-tools">
            <div class="fuad-add-claim-buttons"><button type="button" class="fuad-add-quiet" data-act="edit" data-key="${esc(claim.key)}">Edit bid</button>${removeButton(state, claim)}</div>
            <div class="fuad-add-copies">${copyChips(v, group, claim)}</div>
        </div>` : ""}`).join("")}
        ${bidsPeriod && !block ? `<button type="button" class="fuad-add-more" data-act="start" data-round="${group.round}">+ Add a claim to group ${group.round}</button>` : ""}
    </section>`).join("");
    return `${bannerMarkup(banner)}${statusMarkup(state)}
    ${block ? `<p class="fuad-move-alert" role="alert">${esc(overLimitText(v.team))}</p>` : ""}
    ${banner.kind === "window" ? `<button type="button" class="fuad-add-start" data-act="start"${block ? " disabled" : ""}>${PLUS}Add a player</button>` : ""}
    ${bidsPeriod || shown.length ? `${projectionMarkup(v.team, shown)}${groupCards}` : ""}
    ${bidsPeriod && canStart ? `<button type="button" class="fuad-add-new-group" data-act="start" data-round="${v.nextRound}">+ Start group ${v.nextRound}</button>` : ""}`;
}

function chipsMarkup(v) {
    return `<div class="fuad-add-chips" role="group" aria-label="Position">${["ALL"].concat(v.positions).map((pos) => `<button type="button" class="fuad-add-pos" data-act="pos" data-pos="${pos}" aria-pressed="${v.state.pos === pos}">${pos === "ALL" ? "All" : pos}</button>`).join("")}${
        v.watched ? `<button type="button" class="fuad-add-pos fuad-star-chip" data-act="watching" aria-pressed="${v.state.watching}" aria-label="Watching" title="Watching">${STAR}</button>` : ""}</div>`;
}

function searchMarkup(state) {
    return `<label class="fuad-add-search">${SEARCH}<input type="search" data-focus="q" value="${esc(state.q)}" placeholder="Search free agents" aria-label="Search free agents" autocomplete="off"></label>`;
}

// the phone's list of free agents to pick from
export function phonePlayers(v) {
    const window_ = v.banner.kind === "window";
    const list = freeAgentList(v);
    return `${searchMarkup(v.state)}${chipsMarkup(v)}
    <div class="fuad-add-sorted fuad-meta"><span>Proj ↓</span></div>
    <ul class="fuad-add-fas">${list.map((row) => `<li><button type="button" class="fuad-add-fa" data-act="pick-fa" data-id="${esc(row.player.id)}"${row.off ? " disabled" : ""}>
        <span class="fuad-add-name">${esc(row.player.name)}</span>
        <span class="fuad-add-proj${row.player.proj ? "" : " fuad-muted"}">${esc(fmtProj(row.player.proj || 0))}</span>
        <span class="fuad-meta">${faMeta(row.player, {showBidOnly: window_ && row.bid})}${row.why ? ` · <strong>${esc(row.why)}</strong>` : ""}</span>
    </button></li>`).join("")}</ul>
    ${list.length ? "" : '<p class="fuad-meta">No free agents match.</p>'}`;
}

// the team's players to drop for the composed move, by position, and No drop
export function dropList(v) {
    const c = v.state.compose;
    const fa = freeAgent(v, c.add);
    const check = (id) => dropCheck(v.team, c, id, {phase: v.phase, freeAgent: fa});
    const noDrop = check(null);
    const marks = new Map(v.lists.drop.map((player) => [player.id, player]));
    const groups = dropGroups(v.team, {marks, check, immediate: c.kind === "add", usedIn: c.kind === "bid" ? usedDrops(v.team, c.round) : new Map(), positions: v.positions});
    return `<button type="button" class="fuad-add-nodrop" data-act="pick-drop" data-id=""${noDrop.fits ? "" : " disabled"} aria-pressed="${c.drop === null}">
        <span>No drop</span><span class="fuad-meta">${esc(noDrop.fits ? "adds a player" : noDrop.why)}</span>
    </button>
    ${groups.map((group) => `<div class="fuad-add-drop-head"><span><strong>${esc(group.pos)}</strong> · ${group.players.length}</span><span>penalty · cap change</span></div>
        ${group.players.map((row) => {
            const listed = row.listed;
            const where = listed.opp && !/^bye$/i.test(listed.opp) ? `${fmtProj(listed.proj || 0)} proj` : listed.opp ? "bye" : "";
            const meta = [row.player.rfa ? "" : money(row.player.salary), contractYears(row.player), row.player.status === "INJURED_RESERVE" ? "IR" : "", where].filter(Boolean).join(" · ")
                + (row.usedIn ? ` · also dropped in group ${row.usedIn}` : "");
            return `<button type="button" class="fuad-add-drop" data-act="pick-drop" data-id="${esc(row.player.playerId)}"${row.off ? " disabled" : ""} aria-pressed="${c.drop === row.player.playerId}">
            <span class="fuad-add-name">${esc(row.player.fullName)}</span>
            <span class="fuad-add-drop-cost">${row.off ? `<span class="fuad-muted">${esc(row.why)}</span>` : `<span>${money(row.penalty)}</span><span class="fuad-faint"> · </span><span class="fuad-add-change${tone(changeTone(row.capChange))}">${esc(signed(row.capChange))}</span>`}</span>
            <span class="fuad-meta">${esc(meta)}</span>
        </button>`;
        }).join("")}`).join("")}`;
}

// the right side of a move: group, bid, length, cap, submit. `withPicks`: the phone's rows that
// change the add and the drop.
export function reviewForm(v, {withPicks}) {
    const {state, team} = v;
    const c = state.compose;
    const fa = freeAgent(v, c.add) || {name: v.names(c.add).name, mflName: v.names(c.add).mflName, salary: 1};
    const check = moveChecks(v);
    const bids = c.kind === "bid";
    const groupHere = v.groups.find((group) => group.round === c.round);
    const otherNames = groupHere ? groupHere.claims.filter((claim) => claim.key !== c.editing).map((claim) => claim.addMfl) : [];
    const editingLine = c.editing ? (findClaim(v.groups, c.editing) || {claim: {}}).claim.line : null;
    // an edit keeps a length it can't read until the member picks one
    const line = c.years ? lengthLine(fa.mflName, c.years, otherNames) : editingLine || "";
    const dropName = c.drop ? (team.players.get(c.drop) || {fullName: v.names(c.drop).name}).fullName : "No drop";
    const dropPicked = c.drop !== undefined;
    const dropped = c.drop && team.players.get(c.drop);
    const dropChange = dropped ? dropped.capPenalty - dropped.salary : 0;
    const salary = bids ? check.bid : fa.salary || 1;
    // with one group allowed there's nothing to choose
    const groupChips = bids && !c.editing && v.maxGroups > 1 && (v.wide || v.banner.kind === "window")
        ? `<div class="fuad-add-field"><span class="fuad-add-label">Group</span><div class="fuad-add-chips" role="group" aria-label="Group">${v.rounds.concat(v.rounds.length < v.maxGroups ? [v.nextRound] : []).map((round) => `<button type="button" class="fuad-add-chip" data-act="group" data-round="${round}" aria-pressed="${c.round === round}">${round === v.nextRound ? "New group" : "Group"} ${round}</button>`).join("")}</div></div>`
        : "";
    const groupSummary = bids && !v.wide ? `<section class="fuad-panel fuad-add-group-summary"><span class="fuad-add-group-title">Group ${c.round}</span>
        ${groupChips}
        ${c.editing ? "" : (groupHere ? groupHere.claims : []).map((claim) => `<div class="fuad-add-summary-row"><span class="fuad-muted">#${claim.rank} ${esc(claim.addName)}</span><span>$${claim.bid} · <strong class="${tone(changeTone(claim.change))}">${esc(signed(claim.change))}</strong></span></div>`).join("")}
        ${c.editing ? "" : `<div class="fuad-add-summary-row fuad-add-this"><span>#${(groupHere ? groupHere.claims.length : 0) + 1} ${esc(fa.name)}</span><span>this claim</span></div>`}
    </section>` : "";
    const picks = withPicks ? `<section class="fuad-panel fuad-add-picks">
        ${c.editing ? `<div class="fuad-add-pickrow"><span class="fuad-meta">Add</span><span class="fuad-add-name">${esc(fa.name)}</span></div>`
            : `<button type="button" class="fuad-add-pickrow" data-act="change-add" aria-label="Change the player to add"><span><span class="fuad-meta">Add</span><span class="fuad-add-name">${esc(fa.name)}</span></span>${CHEVRON}</button>`}
        <button type="button" class="fuad-add-pickrow" data-act="change-drop" aria-label="Change the player to drop"><span><span class="fuad-meta">Drop</span><span class="fuad-add-name">${esc(dropName)}${c.drop ? ` · ${esc(signed(dropChange))}` : ""}</span></span>${CHEVRON}</button>
    </section>` : "";
    const bidField = bids ? `<div class="fuad-add-field">
        <span class="fuad-add-label-row"><span class="fuad-add-label">Bid</span><span class="fuad-meta">${dropPicked ? `max $${check.max}` : ""}</span></span>
        <div class="fuad-add-stepper">
            <button type="button" class="fuad-add-step" data-act="bid-minus" aria-label="Lower bid by $1">−</button>
            <label class="fuad-add-amount${dropPicked && (check.tooHigh || check.bid < 1) ? " fuad-add-amount-bad" : ""}"><span>$</span><input type="text" inputmode="numeric" data-focus="bid" value="${esc(c.bid)}" aria-label="Bid amount"></label>
            <button type="button" class="fuad-add-step" data-act="bid-plus" aria-label="Raise bid by $1">+</button>
        </div>
        ${!dropPicked ? "" : check.bid < 1 ? '<span class="fuad-add-error">Bids start at $1.</span>' : check.tooHigh ? `<span class="fuad-add-error">Over the max: with your other groups’ max bids, $${check.bid} would exceed the cap.</span>` : ""}
    </div>` : "";
    const lengthNote = !c.years ? (line ? `keeps “${line}”` : "") : bids ? `written as “${line}”` : `posted as “${line}” once the add goes through`;
    const lengths = `<div class="fuad-add-field">
        <span class="fuad-add-label-row"><span class="fuad-add-label">Contract length</span><span class="fuad-meta">${esc(lengthNote)}</span></span>
        <div class="fuad-add-years" role="group" aria-label="Contract years">${LENGTHS.map((n) => `<button type="button" class="fuad-add-year" data-act="year" data-n="${n}" aria-pressed="${c.years === n}">
            <span class="fuad-add-year-n">${n}</span><span>${n === 1 ? "year" : "years"}</span><span class="fuad-add-year-cut">cut $${cutLater(salary, n)}</span>
        </button>`).join("")}</div>
    </div>`;
    // until the drop is picked the move's cost isn't known
    const cap = capLine(bids || state.data.groups.length ? "Projected cap" : "Cap used", "", check.cap.from, dropPicked ? check.cap.to : check.cap.from);
    const blocked = dropPicked && !check.fits && check.why && check.why !== "Bids start at $1." && !check.tooHigh;
    const blockText = check.why === "already in this group" ? `Blocked: group ${c.round} already has this claim.` : blockedText(check.why, bids);
    const ready = dropPicked && check.fits && !state.busy;
    const label = !dropPicked ? "Pick a drop" : state.busy ? "Sending…"
        : bids && c.editing ? `Save $${check.bid} bid`
            : bids ? `Submit $${check.bid} bid to group ${c.round}`
                : `Add ${surname(fa.mflName)} now · posts “${line}”`;
    return `${groupSummary}${picks}${v.wide ? groupChips : ""}${bidField}${lengths}
    <section class="fuad-add-total">${cap}</section>
    ${blocked ? `<p class="fuad-move-alert" role="alert">${esc(blockText)}</p>` : ""}
    ${state.error ? alertLine(state.error) : ""}
    <button type="button" class="fuad-add-submit" data-act="submit"${ready ? "" : " disabled"}>${esc(label)}</button>`;
}

function bidsTable(v) {
    const {state, team} = v;
    const shown = v.groups;
    const p = projection(team);
    const invalid = shown.length && (p.overCap || p.overRoster);
    const rosterChanges = p.roster !== team.franchise.numPlayers;
    return `<section class="fuad-panel fuad-add-bids" aria-labelledby="fuad-add-bids">
        <div class="fuad-add-bids-head">
            <h2 id="fuad-add-bids">Pending bids</h2>
            <div class="fuad-add-bids-totals">
                ${invalid ? '<span class="fuad-move-alert fuad-add-alert-inline" role="alert">Current bids invalid</span>' : ""}
                ${capLine("Projected cap", "If all high bids win", team.franchise.capTotal, p.cap)}
                ${rosterChanges ? rosterLine(team, p, "fuad-add-cap") : ""}
            </div>
        </div>
        ${shown.length ? `<div class="fuad-table-scroll"><div class="fuad-add-claims" role="table" aria-label="Pending bids">
            <div class="fuad-add-claim-line fuad-add-columns" role="row"><span role="columnheader"></span><span role="columnheader">Add</span><span role="columnheader">Drop</span><span role="columnheader">Comment</span><span role="columnheader" class="fuad-num">Bid</span><span role="columnheader" class="fuad-num">Cap change</span><span role="columnheader">Order</span><span role="columnheader"></span></div>
            ${shown.map((group) => `<div class="fuad-add-group-line" role="row"><span role="cell"><strong>Group ${group.round}</strong></span><span role="cell" class="fuad-meta">max cap change <strong class="${tone(changeTone(group.max))}">${esc(signed(group.max))}</strong></span></div>
                ${group.claims.map((claim, i) => `<div class="fuad-add-claim-line${state.flash === claim.key ? " fuad-add-flash" : ""}" role="row">
                    <span role="cell" class="fuad-add-rank">#${claim.rank}</span>
                    <span role="cell"><button type="button" class="fuad-name" data-act="popup" data-id="${esc(claim.add)}">${esc(claim.addName)}</button></span>
                    <span role="cell" class="fuad-soft">${esc(claim.dropName || "None")}</span>
                    <span role="cell" class="fuad-muted">${claim.line ? `“${esc(claim.line)}”` : "—"}</span>
                    <span role="cell" class="fuad-num fuad-add-bid-num">$${claim.bid}</span>
                    <span role="cell" class="fuad-num${tone(changeTone(claim.change))}">${esc(signed(claim.change))}</span>
                    <span role="cell">${arrows(v, claim, i, group.claims.length)}</span>
                    <span role="cell" class="fuad-add-claim-actions">
                        <button type="button" class="fuad-add-quiet" data-act="edit" data-key="${esc(claim.key)}">Edit</button>
                        <button type="button" class="fuad-add-quiet" data-act="toggle" data-key="${esc(claim.key)}" aria-expanded="${state.open === claim.key}">Copy</button>
                        ${removeButton(state, claim)}
                    </span>
                </div>
                ${state.open === claim.key ? `<div class="fuad-add-copies fuad-add-copies-wide" role="row"><span role="cell">${copyChips(v, group, claim)}</span></div>` : ""}`).join("")}`).join("")}
        </div></div>` : ""}
    </section>`;
}

function freeAgentLine(row, {window_, block}) {
    const action = row.bid ? "Bid" : "Add";
    const injury = injuryText(row.player.inj);
    const injuryTone = /^(Out|IR|Suspended)$/.test(injury) ? "bad" : "caution";
    return `<div class="fuad-add-fa-line" role="row">
    <span role="cell" class="fuad-add-fa-name"><button type="button" class="fuad-name" data-act="popup" data-id="${esc(row.player.id)}">${esc(row.player.name)}</button>${injury ? `<span class="fuad-tag fuad-tag-${injuryTone}">${esc(injury)}</span>` : ""}${window_ && row.bid ? '<span class="fuad-bid-only">bid only</span>' : ""}${row.why ? `<span class="fuad-muted fuad-add-why">${esc(row.why)}</span>` : ""}</span>
    <span role="cell" class="fuad-mid fuad-muted">${esc(row.player.pos)}</span>
    <span role="cell" class="fuad-num fuad-add-proj-num${row.player.proj ? "" : " fuad-muted"}">${esc(fmtProj(row.player.proj || 0))}</span>
    <span role="cell" class="fuad-num">${esc(fmtProj(row.player.pts))}</span>
    <span role="cell" class="fuad-mid fuad-muted">${esc(row.player.nfl)}</span>
    <span role="cell" class="fuad-mid fuad-muted">${esc(/^bye$/i.test(row.player.opp) ? "Bye" : row.player.opp)}</span>
    <span role="cell" class="fuad-mid fuad-muted">${esc(row.player.bye || "—")}</span>
    <span role="cell"><button type="button" class="fuad-add-row-action" data-act="pick-fa" data-id="${esc(row.player.id)}" aria-label="${action} ${esc(row.player.name)}"${row.off || block ? " disabled" : ""}>${action}</button></span>
</div>`;
}

// the desktop's Add: the pending bids table over the free agents table
export function deskHome(v) {
    const {state, banner} = v;
    const block = addBlock(v.team, {phase: v.phase});
    const list = freeAgentList(v);
    const window_ = banner.kind === "window";
    const head = (key, label, cls = "") => `<button type="button" class="fuad-add-sort${cls}" data-act="sort" data-sort="${key}" aria-pressed="${state.sort === key}">${label}${state.sort === key ? (key === "name" ? " ↑" : " ↓") : ""}</button>`;
    return `<div class="fuad-add-desk-top">${bannerMarkup(banner)}</div>${statusMarkup(state)}
    ${block ? `<p class="fuad-move-alert" role="alert">${esc(overLimitText(v.team))}</p>` : ""}
    ${banner.kind === "bids" || v.groups.length ? bidsTable(v) : ""}
    <section class="fuad-panel fuad-add-free" aria-labelledby="fuad-add-free">
        <div class="fuad-add-free-head"><h2 id="fuad-add-free">Free agents</h2>${searchMarkup(state)}${chipsMarkup(v)}</div>
        <div class="fuad-table-scroll"><div class="fuad-add-fa-table" role="table" aria-label="Free agents">
            <div class="fuad-add-fa-line fuad-add-columns" role="row"><span role="columnheader">${head("name", "Player")}</span><span role="columnheader" class="fuad-mid">Pos</span><span role="columnheader" class="fuad-num">${head("proj", "Proj", " fuad-num")}</span><span role="columnheader" class="fuad-num">${head("pts", "Pts", " fuad-num")}</span><span role="columnheader" class="fuad-mid">NFL</span><span role="columnheader" class="fuad-mid">Opp</span><span role="columnheader" class="fuad-mid">Bye</span><span role="columnheader"></span></div>
            ${list.map((row) => freeAgentLine(row, {window_, block})).join("")}
        </div></div>
        ${list.length ? "" : '<p class="fuad-meta">No free agents match.</p>'}
    </section>`;
}

// the desktop dialog's content for the composed move
export function dialogMarkup(v) {
    const c = v.state.compose;
    const fa = freeAgent(v, c.add) || {name: v.names(c.add).name, nfl: "", pos: "", opp: "", proj: null};
    const kicker = c.editing ? `Edit claim · group ${c.round}` : c.kind === "bid" ? "Blind bid" : "Add now";
    const sub = [fa.nfl, fa.pos, /^bye$/i.test(fa.opp) ? "bye week" : fa.opp, fa.proj ? `${fmtProj(fa.proj)} proj` : ""].filter(Boolean).join(" · ");
    return `<div class="fuad-add-dialog-head">
        <div><span class="fuad-add-kicker">${esc(kicker)}</span><h2 id="fuad-add-dialog-title">${esc(fa.name)}</h2><span class="fuad-meta">${esc(sub)}</span></div>
        <button type="button" class="fuad-close" data-close aria-label="Close">${CLOSE}</button>
    </div>
    <div class="fuad-add-dialog-cols">
        <div class="fuad-add-dialog-drops"><span class="fuad-add-label">Drop</span><div class="fuad-add-drop-box">${dropList(v)}</div></div>
        <div class="fuad-add-dialog-form">${reviewForm(v, {withPicks: false})}</div>
    </div>`;
}

// the phone's screen titles while a move is composed
export function phoneTitle(v, screen) {
    const c = v.state.compose;
    const fa = c && (freeAgent(v, c.add) || {name: v.names(c.add).name});
    return {players: "Add a player", drops: fa ? `Adding ${fa.name}` : "", review: c && c.editing ? "Edit bid" : "Review"}[screen];
}

// the control a redraw gives focus back to: what it does and the data it acts on
const NAMED_BY = ["key", "n", "round", "pos", "sort"];
export function controlSelector(dataset) {
    return `[data-act="${dataset.act}"]${dataset.id !== undefined ? `[data-id="${dataset.id}"]` : ""}${NAMED_BY.filter((name) => dataset[name]).map((name) => `[data-${name}="${dataset[name]}"]`).join("")}`;
}
