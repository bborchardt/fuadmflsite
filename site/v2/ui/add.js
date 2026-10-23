// Moves › Add: MFL's Add/Drop page with v2's controls over it. A move is picked through MFL's own
// picker rows and fields and MFL's form is posted in place, then read back from MFL (the pending
// claims, or the roster) before the page reloads to show it. Claims are reordered and removed with
// MFL's own links and edited through MFL's edit page; a copy is a new claim through the same form,
// so its comment line goes with it. An immediate add's length is posted to the board once MFL has
// made the add. MFL's form stays in the page underneath; anything v2 can't read leaves MFL's page.

import {exportUrl, fetchExport} from "../lib/mfl.js";
import {ROSTER_MAX} from "../lib/rules.js";
import {esc} from "./html.js";
import {waitLeft} from "./page-fetch.js";
import {placeholders} from "./panel.js";
import {openDialog} from "./dialog.js";
import {Refused, failedLine, freshPending, limitsApply, loadData, movesPhase, refusal, rosterIds, send} from "./moves.js";
import {contractTopic} from "./home-model.js";
import {contractYears} from "./rosters-model.js";
import {
    LENGTHS, MAX_GROUPS, POSITIONS, addBlock, addsClosed, banner, bidsLeft, blockedText, changeTone, checkAdd, checkBid, claimKey,
    commentLines, copyTargets, cutLater, fullNameLines, isLengthLine, dropGroups, droppedByTeam, freeAgencyOver, freeAgentRows, groupViews, injuryText, lengthLine, lineFor, maxBid,
    firstLast, projection, readPlayerLists, rewriteComment, signed, surname, teamState, usedTone, yearsIn
} from "./add-model.js";

const FLASH_KEY = "fuad.addFlash";
const WIDE = "(min-width: 48.01em)";
// the board topic a length post starts when the league has none with "contract" in its name
const NEW_TOPIC = "Contract lengths";

const CHECK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"></path></svg>';
const NOTICE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 8v5M12 16.5v.5"></path></svg>';
const PLUS = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>';
const ARROW = '<svg class="fuad-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="to"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>';
const CHEVRON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>';
const UP = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"></path></svg>';
const DOWN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>';
const SEARCH = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path></svg>';
const CLOSE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>';

const money = (amount) => `$${Math.round(amount * 100) / 100}`;
const tone = (name) => (name ? ` fuad-${name}` : "");

// ---- MFL's page ----

// MFL opens the form between a table's rows, so its fields belong to it without being inside it
function addForm(doc = document) {
    const add = doc.getElementById("add_pid_field_id");
    const drop = doc.getElementById("drop_pid_field_id");
    return add && drop && add.form && add.form === drop.form ? add.form : null;
}

const scriptText = (doc = document) => [...doc.querySelectorAll("script")].map((script) => script.textContent).join("\n");

// MFL's own links in its claims table, by what they do and the claim they name (ROUND_ADD_BID_DROP)
function claimLink(action, key) {
    return [...document.querySelectorAll("#waiver_request_list a[href]")].find((a) => {
        const value = new URL(a.href, window.location.href).searchParams.get(action);
        return value === key;
    }) || null;
}

// Picks a row of MFL's picker (or none) the way a click on it would; MFL's picker toggles a row
// that's already picked, so it's only called for a change
function pick(list, index) {
    // a member's saved filter on MFL's page could hide the row; picks need every row drawn
    if (window.picker_filter_pos && typeof window.update_picker === "function"
        && (window.picker_filter_pos[list] !== "ALL" || window.picker_filter_nfl[list] !== "ALL" || window.picker_filter_name[list])) {
        window.picker_filter_pos[list] = "ALL";
        window.picker_filter_nfl[list] = "ALL";
        window.picker_filter_name[list] = "";
        window.update_picker(list);
    }
    const current = window.picker_cur_sel ? window.picker_cur_sel[list] : -1;
    if (index === null) {
        if (current >= 0) {
            window.picker_select(list, current, 0);
        }
    } else if (current !== index) {
        window.picker_select(list, index, 0);
    }
}

const text = (id) => (document.getElementById(id) || {textContent: ""}).textContent.replace(/\s+/g, " ").trim();

// Fills MFL's form for a claim or an add, through its picker, and checks it holds what was chosen:
// the hidden ids, MFL's "To Add"/"To Drop" lines, and whether MFL takes it as a bid
function fillForm(form, lists, {add, drop, bid = null, round = null, comment = ""}) {
    const addEntry = lists.add.find((player) => player.id === add);
    const dropEntry = drop ? lists.drop.find((player) => player.id === drop) : null;
    if (!addEntry || (drop && !dropEntry)) {
        throw new Error("MFL's page doesn't list that player");
    }
    pick("add", addEntry.index);
    pick("drop", dropEntry ? dropEntry.index : null);
    const shows = (entry) => `${entry.rawName} ${entry.nfl} ${entry.pos}`;
    const submit = document.getElementById("add_drop_submit");
    const asBid = /request/i.test(submit ? submit.value : "");
    if (form.elements.add_pid.value !== add || form.elements.drop_pid.value !== (drop || "")
        || text("add_name_field_id") !== shows(addEntry) || text("drop_name_field_id") !== (dropEntry ? shows(dropEntry) : "")) {
        throw new Error("MFL's form didn't take the pick");
    }
    if (asBid !== (bid !== null)) {
        throw new Error(asBid ? "MFL would take it as a blind bid" : "MFL would make it at once");
    }
    if (form.elements.FORCE_WAIVER) {
        form.elements.FORCE_WAIVER.checked = false;
    }
    if (bid !== null) {
        if (![...form.elements.ROUND.options].some((option) => Number(option.value) === round)) {
            throw new Error(`MFL's page has no group ${round}`);
        }
        form.elements.BBID_AMT.value = String(bid);
        form.elements.ROUND.value = String(round);
        form.elements.COMMENTS.value = comment;
    }
    const fields = new URLSearchParams(new FormData(form));
    fields.set("SUBMIT", submit.value);
    return fields;
}

// ---- data ----

const hasClaim = (groups, round, claim) => groups.some((group) => group.round === round
    && group.claims.some((other) => other.add === claim.add && other.bid === claim.bid && (other.drop || null) === (claim.drop || null)));

const onRoster = async (context, franchiseId, playerId) => (await rosterIds(context, franchiseId)).includes(playerId);

// Posts the length to the board (messageBoard import): a reply in the contract topic, or a new one
async function postLength(context, line) {
    const {season, leagueId} = context;
    const board = await fetchExport(exportUrl(window.location.origin, season, "messageBoard", {L: leagueId, COUNT: 100}), "messageBoard", {init: {cache: "no-store"}});
    const topic = contractTopic(board);
    const fields = new URLSearchParams(topic ? {THREAD: topic.id, BODY: line} : {SUBJECT: NEW_TOPIC, BODY: line});
    const answer = await send(`${window.location.origin}/${season}/import?TYPE=messageBoard&L=${encodeURIComponent(leagueId)}`, {method: "POST", body: fields});
    if (/<error/i.test(answer) || !/OK/i.test(answer)) {
        throw new Error((answer.match(/<error[^>]*>([^<]*)/i) || [])[1] || "MFL didn't take the post");
    }
}

// MFL's edit page for a group, read and posted with one claim's bid and drop and the group's comment
async function saveGroup(context, franchiseId, round, change) {
    const {season, leagueId} = context;
    const url = `${window.location.origin}/${season}/options?L=${encodeURIComponent(leagueId)}&O=255&F=${encodeURIComponent(franchiseId)}&ROUND=${round}`;
    const doc = new DOMParser().parseFromString(await send(url, {cache: "no-store"}), "text/html");
    const form = doc.querySelector("form[name=editwr]");
    const comment = form && form.querySelector("textarea[name=comment]");
    if (!form || !comment) {
        throw new Error("MFL's edit page couldn't be read");
    }
    const fields = new URLSearchParams(new FormData(form));
    if (change.claim) {
        // the claims in MFL's order, each row headed with the player to add ("Fehoko, Simi ARI WR")
        const rows = [...form.querySelectorAll("tr[id^=row_amount_]")];
        const at = rows.findIndex((row) => row.cells[0] && `${row.cells[0].textContent.trim()} `.startsWith(`${change.claim.mflName} `)
            && Number((row.querySelector("input[name^=amount_]") || {}).value) === change.claim.bid);
        const drop = at >= 0 && form.querySelector(`select[name=drop_${at}]`);
        if (!drop || ![...drop.options].some((option) => option.value === (change.drop || "0000"))) {
            throw new Error("MFL's edit page doesn't list that claim");
        }
        fields.set(`amount_${at}`, String(change.bid));
        fields.set(`drop_${at}`, change.drop || "0000");
    }
    fields.set("comment", change.comment(comment.value));
    fields.set("SAVE", (form.querySelector("input[name=SAVE]") || {value: "Save Waiver Request"}).value);
    await send(new URL(form.getAttribute("action") || "options", url).href, {method: "POST", body: fields});
}

// ---- drawing ----

function fmtProj(value) {
    return value === null || value === undefined ? "—" : String(Math.round(value * 10) / 10);
}

function faMeta(player, {showBidOnly}) {
    const where = /^bye$/i.test(player.opp) ? "bye week" : [player.opp, player.bye ? `bye ${player.bye}` : ""].filter(Boolean).join(" · ");
    const injury = injuryText(player.inj);
    return `${esc([player.nfl, player.pos, where].filter(Boolean).join(" · "))}${injury ? ` · <span class="fuad-caution">${esc(injury)}</span>` : ""}${showBidOnly ? ' · <span class="fuad-bid-only">bid only</span>' : ""}`;
}

// cap used, now → after
function capLine(label, sub, from, to) {
    return `<div class="fuad-add-cap">
        <span class="fuad-add-cap-label"><span>${esc(label)}</span>${sub ? `<span class="fuad-meta">${esc(sub)}</span>` : ""}</span>
        <span class="fuad-add-cap-value"><span>${esc(money(from))}</span>${ARROW}<span class="${tone(usedTone(from, to))}">${esc(money(to))}</span></span>
    </div>`;
}

export async function drawAdd({context, franchiseId, loginHref}) {
    const body = document.querySelector(".pagebody");
    if (!body) {
        return;
    }
    const mount = document.createElement("div");
    mount.id = "fuad-add";
    const show = () => {
        body.prepend(mount);
        document.documentElement.classList.add("fuad-add-on");
    };
    const standAside = () => {
        mount.remove();
        document.documentElement.classList.remove("fuad-add-on");
    };
    if (!franchiseId) {
        mount.innerHTML = `<section class="fuad-panel fuad-add-note"><span>Log in to make moves</span><a class="fuad-button" href="${esc(loginHref)}">Log in</a></section>`;
        show();
        return;
    }
    // the commissioner's view stays MFL's
    if (franchiseId === "0000") {
        return;
    }
    const form = addForm();
    const lists = readPlayerLists(scriptText());
    // not the page v2 knows (MFL changed it): MFL's own page, restyled
    if (!form || !lists.add.length || typeof window.picker_select !== "function" || !form.elements.ROUND || !form.elements.COMMENTS) {
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

    const state = {
        data: null, failed: false, screen: "home", compose: null, q: "", pos: "ALL", sort: "proj",
        open: null, flash: flash && flash.highlight, done: flash && flash.done, error: (flash && flash.error) || "", busy: false
    };
    const layer = document.createElement("div");
    layer.className = "fuad-layer fuad-add-layer";
    layer.hidden = true;
    document.body.append(layer);
    let closeDialog = null;

    // ---- the model for what's drawn ----

    const team = () => teamState(state.data.league, franchiseId, state.data.groups);
    // adds close with free agency, though the season runs to week 17's end
    const phase = () => {
        const season = movesPhase(state.data.facts);
        return freeAgencyOver({phase: season, calendar: state.data.calendar, now: now()}) ? "over" : season;
    };
    // whether a bid placed now still has a run to process it
    const runsLeft = () => bidsLeft(movesPhase(state.data.facts), state.data.calendar, now());
    // the checks' phase: in season once the roster limits hold, from the cut-down date (2.5)
    const checks = () => (limitsApply(state.data.facts, state.data.calendar) ? "season" : phase());
    const now = () => Date.now() / 1000;
    const names = (id) => {
        const listed = lists.add.find((player) => player.id === id) || lists.drop.find((player) => player.id === id);
        const mflName = state.data.mflNames.get(id) || (listed && listed.mflName) || id;
        return {mflName, name: firstLast(mflName)};
    };
    const views = () => groupViews(team(), state.data.pending, names);
    const rounds = () => state.data.groups.map((group) => group.round);
    const nextRound = () => Math.max(0, ...rounds()) + 1;
    const theBanner = () => banner({phase: phase(), freeAgents: lists.add, calendar: state.data.calendar, now: now()});
    const freeAgent = (id) => lists.add.find((player) => player.id === id);
    const marks = new Map(lists.drop.map((player) => [player.id, player]));

    // the compose state: {add, drop (undefined until picked, null for none), round, bid, years, editing, kind}
    function composeChecks() {
        const c = state.compose;
        const t = team();
        const ph = checks();
        if (c.kind === "bid") {
            const bid = Math.max(0, parseInt(c.bid, 10) || 0);
            const result = checkBid(t, {round: c.round, claim: {add: c.add, bid, drop: c.drop || null}, without: c.editing, phase: ph});
            const max = maxBid(t, {round: c.round, drop: c.drop || null, without: c.editing});
            // the same claim twice in a group would read back as made even if MFL refused it
            const twice = !c.editing && c.drop !== undefined && state.data.groups.some((group) => group.round === c.round
                && group.claims.some((claim) => claim.add === c.add && (claim.drop || null) === (c.drop || null)));
            const why = twice ? "already in this group" : result.why;
            return {...result, why, bid, max, tooHigh: bid > max, fits: result.fits && !twice && bid <= max && bid >= 1};
        }
        const fa = freeAgent(c.add);
        return {...checkAdd(t, {cost: fa ? fa.salary || 1 : 1, drop: c.drop || null, phase: ph}), bid: null};
    }

    function dropCheck(id) {
        const c = state.compose;
        const t = team();
        if (c.kind === "bid") {
            const result = checkBid(t, {round: c.round, claim: {add: c.add, bid: 1, drop: id}, without: c.editing, phase: checks()});
            return result;
        }
        const fa = freeAgent(c.add);
        return checkAdd(t, {cost: fa ? fa.salary || 1 : 1, drop: id, phase: checks()});
    }

    // where each player is already dropped in another group
    function usedDrops(round) {
        const used = new Map();
        for (const group of state.data.groups) {
            if (group.round !== round) {
                group.claims.filter((claim) => claim.drop).forEach((claim) => used.set(claim.drop, group.round));
            }
        }
        return used;
    }

    // ---- markup ----

    // no adds at all over 30 active in season (10.5), Home's words for it
    const overLimitText = () => `Over the roster limit: ${team().franchise.numPlayers} active of ${ROSTER_MAX}. Drop a player or move one to IR first.`;

    function bannerMarkup() {
        const b = theBanner();
        return `<div class="fuad-add-banner fuad-add-banner-${b.kind}"><span class="fuad-dot" aria-hidden="true"></span>${esc(b.text)}</div>`;
    }

    function statusMarkup() {
        const parts = [];
        if (state.done) {
            const failed = state.done.failed;
            parts.push(`<div class="fuad-add-status${failed ? " fuad-add-status-warn" : ""}" role="status"><span class="fuad-add-status-line">${failed ? NOTICE : CHECK}<span>${esc(state.done.text)}</span></span>${failed && state.done.line ? `<button type="button" class="fuad-cta" data-act="post-now"${state.busy ? " disabled" : ""}>Post it now</button>` : ""}</div>`);
        }
        // a move being composed shows its failure beside it
        if (state.error && !state.compose) {
            parts.push(`<p class="fuad-add-alert" role="alert">${esc(state.error)}</p>`);
        }
        return parts.join("");
    }

    function projectionMarkup(groupsShown) {
        const t = team();
        const p = projection(t);
        const invalid = groupsShown.length && (p.overCap || p.overRoster);
        const rosterChanges = p.roster !== t.franchise.numPlayers;
        return `${invalid ? '<p class="fuad-add-alert" role="alert">Current bids invalid</p>' : ""}
        <section class="fuad-panel fuad-add-projected" aria-label="Projected">
            ${capLine("Projected cap", "If all high bids win", t.franchise.capTotal, p.cap)}
            ${rosterChanges ? `<div class="fuad-add-cap fuad-add-roster"><span class="fuad-add-cap-label"><span>Projected roster</span></span><span class="fuad-add-cap-value"><span>${t.franchise.numPlayers}</span>${ARROW}<span class="${p.overRoster ? "fuad-bad" : ""}">${p.roster}</span></span></div>` : ""}
        </section>`;
    }

    function claimDetail(claim) {
        return `${claim.dropName ? `drop ${esc(claim.dropName)}` : "no drop"}${claim.line ? ` · “${esc(claim.line)}”` : ""}`;
    }

    function copyChips(group, claim) {
        const targets = copyTargets(team(), {round: group.round, claim, rounds: rounds(), phase: checks()});
        return `<span class="fuad-meta">Copy to</span>${targets.map((target) => `<button type="button" class="fuad-add-chip" data-act="copy" data-key="${esc(claim.key)}" data-round="${target.round}"${target.off ? " disabled" : ""}>${target.isNew ? "new group" : "group"} ${target.round}${target.why ? ` · ${esc(target.why)}` : ""}</button>`).join("")}`;
    }

    function arrows(claim, i, count) {
        const up = i > 0 && claimLink("MOVE_UP", claim.key);
        const down = i < count - 1 && claimLink("MOVE_DOWN", claim.key);
        return `<span class="fuad-add-order">
            <button type="button" class="fuad-add-arrow" data-act="up" data-key="${esc(claim.key)}" aria-label="Move ${esc(claim.addName)} up"${up ? "" : " disabled"}>${UP}</button>
            <button type="button" class="fuad-add-arrow" data-act="down" data-key="${esc(claim.key)}" aria-label="Move ${esc(claim.addName)} down"${down ? "" : " disabled"}>${DOWN}</button>
        </span>`;
    }

    function phoneHome() {
        const b = theBanner();
        const block = addBlock(team(), {phase: checks()});
        const shown = views();
        const bidsPeriod = b.kind === "bids";
        const canStart = rounds().length < MAX_GROUPS && !block && !state.busy;
        const groupCards = shown.map((group) => `<section class="fuad-panel fuad-add-group" aria-label="Group ${group.round}">
            <div class="fuad-add-group-head"><h2>Group ${group.round}</h2><span class="fuad-meta">max cap change <strong class="${tone(changeTone(group.max))}">${esc(signed(group.max))}</strong></span></div>
            ${group.claims.map((claim, i) => `<div class="fuad-add-claim${state.flash === claim.key ? " fuad-add-flash" : ""}">
                <span class="fuad-add-rank">#${claim.rank}</span>
                <button type="button" class="fuad-add-claim-who" data-act="toggle" data-key="${esc(claim.key)}" aria-expanded="${state.open === claim.key}">
                    <span class="fuad-add-name">${esc(claim.addName)}</span><span class="fuad-meta">${claimDetail(claim)}</span>
                </button>
                <span class="fuad-add-bid"><span>$${claim.bid}</span><span class="fuad-add-change${tone(changeTone(claim.change))}">${esc(signed(claim.change))}</span></span>
                ${arrows(claim, i, group.claims.length)}
            </div>
            ${state.open === claim.key ? `<div class="fuad-add-claim-tools">
                <div class="fuad-add-claim-buttons"><button type="button" class="fuad-add-quiet" data-act="edit" data-key="${esc(claim.key)}">Edit bid</button><button type="button" class="fuad-add-remove" data-act="remove" data-key="${esc(claim.key)}">Remove</button></div>
                <div class="fuad-add-copies">${copyChips(group, claim)}</div>
            </div>` : ""}`).join("")}
            ${bidsPeriod && !block ? `<button type="button" class="fuad-add-more" data-act="start" data-round="${group.round}">+ Add a claim to group ${group.round}</button>` : ""}
        </section>`).join("");
        return `${bannerMarkup()}${statusMarkup()}
        ${block ? `<p class="fuad-add-alert" role="alert">${esc(overLimitText())}</p>` : ""}
        ${b.kind === "window" ? `<button type="button" class="fuad-add-start" data-act="start"${block ? " disabled" : ""}>${PLUS}Add a player</button>` : ""}
        ${bidsPeriod || shown.length ? `${projectionMarkup(shown)}${groupCards}` : ""}
        ${bidsPeriod && canStart ? `<button type="button" class="fuad-add-new-group" data-act="start" data-round="${nextRound()}">+ Start group ${nextRound()}</button>` : ""}`;
    }

    function chipsMarkup() {
        return `<div class="fuad-add-chips" role="group" aria-label="Position">${["ALL"].concat(POSITIONS).map((pos) => `<button type="button" class="fuad-add-pos" data-act="pos" data-pos="${pos}" aria-pressed="${state.pos === pos}">${pos === "ALL" ? "All" : pos}</button>`).join("")}</div>`;
    }

    function searchMarkup() {
        return `<label class="fuad-add-search">${SEARCH}<input type="search" data-focus="q" value="${esc(state.q)}" placeholder="Search free agents" aria-label="Search free agents" autocomplete="off"></label>`;
    }

    function rows() {
        return freeAgentRows(lists.add, {blocked: droppedByTeam(state.data.league.players, franchiseId, now()), text: state.q, pos: state.pos, sort: state.sort,
            bids: runsLeft()});
    }

    function phonePlayers() {
        const window_ = theBanner().kind === "window";
        const list = rows();
        return `${searchMarkup()}${chipsMarkup()}
        <div class="fuad-add-sorted fuad-meta"><span>Proj ↓</span></div>
        <ul class="fuad-add-fas">${list.map((row) => `<li><button type="button" class="fuad-add-fa" data-act="pick-fa" data-id="${esc(row.player.id)}"${row.off ? " disabled" : ""}>
            <span class="fuad-add-name">${esc(row.player.name)}</span>
            <span class="fuad-add-proj${row.player.proj ? "" : " fuad-muted"}">${esc(fmtProj(row.player.proj || 0))}</span>
            <span class="fuad-meta">${faMeta(row.player, {showBidOnly: window_ && row.bid})}${row.why ? ` · <strong>${esc(row.why)}</strong>` : ""}</span>
        </button></li>`).join("")}</ul>
        ${list.length ? "" : '<p class="fuad-meta">No free agents match.</p>'}`;
    }

    function dropList() {
        const c = state.compose;
        const t = team();
        const immediate = c.kind === "add";
        const noDrop = dropCheck(null);
        const groups = dropGroups(t, {marks, check: dropCheck, immediate, usedIn: c.kind === "bid" ? usedDrops(c.round) : new Map()});
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

    // the right side of a move: group, bid, length, cap, submit
    function reviewForm({withPicks}) {
        const c = state.compose;
        const t = team();
        const fa = freeAgent(c.add) || {name: names(c.add).name, mflName: names(c.add).mflName, salary: 1};
        const checks = composeChecks();
        const bids = c.kind === "bid";
        const view = views();
        const groupHere = view.find((group) => group.round === c.round);
        const otherNames = groupHere ? groupHere.claims.filter((claim) => claim.key !== c.editing).map((claim) => claim.addMfl) : [];
        const editingLine = c.editing ? (claimOf(c.editing) || {claim: {}}).claim.line : null;
        // an edit keeps a length it can't read until the member picks one
        const line = c.years ? lengthLine(fa.mflName, c.years, otherNames) : editingLine || "";
        const dropName = c.drop ? (t.players.get(c.drop) || {fullName: names(c.drop).name}).fullName : "No drop";
        const dropPicked = c.drop !== undefined;
        const dropped = c.drop && t.players.get(c.drop);
        const dropChange = dropped ? dropped.capPenalty - dropped.salary : 0;
        const salary = bids ? checks.bid : fa.salary || 1;
        const groupChips = bids && !c.editing && (wide.matches || theBanner().kind === "window")
            ? `<div class="fuad-add-field"><span class="fuad-add-label">Group</span><div class="fuad-add-chips" role="group" aria-label="Group">${rounds().concat(rounds().length < MAX_GROUPS ? [nextRound()] : []).map((round) => `<button type="button" class="fuad-add-chip" data-act="group" data-round="${round}" aria-pressed="${c.round === round}">${round === nextRound() ? "New group" : "Group"} ${round}</button>`).join("")}</div></div>`
            : "";
        const groupSummary = bids && !wide.matches ? `<section class="fuad-panel fuad-add-group-summary"><span class="fuad-add-group-title">Group ${c.round}</span>
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
            <span class="fuad-add-label-row"><span class="fuad-add-label">Bid</span><span class="fuad-meta">${dropPicked ? `max $${checks.max}` : ""}</span></span>
            <div class="fuad-add-stepper">
                <button type="button" class="fuad-add-step" data-act="bid-minus" aria-label="Lower bid by $1">−</button>
                <label class="fuad-add-amount${dropPicked && (checks.tooHigh || checks.bid < 1) ? " fuad-add-amount-bad" : ""}"><span>$</span><input type="text" inputmode="numeric" data-focus="bid" value="${esc(c.bid)}" aria-label="Bid amount"></label>
                <button type="button" class="fuad-add-step" data-act="bid-plus" aria-label="Raise bid by $1">+</button>
            </div>
            ${!dropPicked ? "" : checks.bid < 1 ? '<span class="fuad-add-error">Bids start at $1.</span>' : checks.tooHigh ? `<span class="fuad-add-error">Over the max: with your other groups’ max bids, $${checks.bid} would exceed the cap.</span>` : ""}
        </div>` : "";
        const lengthNote = !c.years ? (line ? `keeps “${line}”` : "") : bids ? `written as “${line}”` : `posted as “${line}” once the add goes through`;
        const lengths = `<div class="fuad-add-field">
            <span class="fuad-add-label-row"><span class="fuad-add-label">Contract length</span><span class="fuad-meta">${esc(lengthNote)}</span></span>
            <div class="fuad-add-years" role="group" aria-label="Contract years">${LENGTHS.map((n) => `<button type="button" class="fuad-add-year" data-act="year" data-n="${n}" aria-pressed="${c.years === n}">
                <span class="fuad-add-year-n">${n}</span><span>${n === 1 ? "year" : "years"}</span><span class="fuad-add-year-cut">cut $${cutLater(salary, n)}</span>
            </button>`).join("")}</div>
        </div>`;
        // until the drop is picked the move's cost isn't known
        const cap = capLine(bids || state.data.groups.length ? "Projected cap" : "Cap used", "", checks.cap.from, dropPicked ? checks.cap.to : checks.cap.from);
        const blocked = dropPicked && !checks.fits && checks.why && checks.why !== "Bids start at $1." && !checks.tooHigh;
        const blockText = checks.why === "already in this group" ? `Blocked: group ${c.round} already has this claim.` : blockedText(checks.why, bids);
        const ready = dropPicked && checks.fits && !state.busy;
        const label = !dropPicked ? "Pick a drop" : state.busy ? "Sending…"
            : bids && c.editing ? `Save $${checks.bid} bid`
                : bids ? `Submit $${checks.bid} bid to group ${c.round}`
                    : `Add ${surname(fa.mflName)} now · posts “${line}”`;
        return `${groupSummary}${picks}${wide.matches ? groupChips : ""}${bidField}${lengths}
        <section class="fuad-add-total">${cap}</section>
        ${blocked ? `<p class="fuad-add-alert" role="alert">${esc(blockText)}</p>` : ""}
        ${state.error ? `<p class="fuad-add-alert" role="alert">${esc(state.error)}</p>` : ""}
        <button type="button" class="fuad-add-submit" data-act="submit"${ready ? "" : " disabled"}>${esc(label)}</button>`;
    }

    function deskHome() {
        const t = team();
        const b = theBanner();
        const block = addBlock(t, {phase: checks()});
        const shown = views();
        const p = projection(t);
        const invalid = shown.length && (p.overCap || p.overRoster);
        const rosterChanges = p.roster !== t.franchise.numPlayers;
        const bidsTable = b.kind === "bids" || shown.length ? `<section class="fuad-panel fuad-add-bids" aria-labelledby="fuad-add-bids">
            <div class="fuad-add-bids-head">
                <h2 id="fuad-add-bids">Pending bids</h2>
                <div class="fuad-add-bids-totals">
                    ${invalid ? '<span class="fuad-add-alert fuad-add-alert-inline" role="alert">Current bids invalid</span>' : ""}
                    ${capLine("Projected cap", "If all high bids win", t.franchise.capTotal, p.cap)}
                    ${rosterChanges ? `<div class="fuad-add-cap"><span class="fuad-add-cap-label"><span>Projected roster</span></span><span class="fuad-add-cap-value"><span>${t.franchise.numPlayers}</span>${ARROW}<span class="${p.overRoster ? "fuad-bad" : ""}">${p.roster}</span></span></div>` : ""}
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
                        <span role="cell">${arrows(claim, i, group.claims.length)}</span>
                        <span role="cell" class="fuad-add-claim-actions">
                            <button type="button" class="fuad-add-quiet" data-act="edit" data-key="${esc(claim.key)}">Edit</button>
                            <button type="button" class="fuad-add-quiet" data-act="toggle" data-key="${esc(claim.key)}" aria-expanded="${state.open === claim.key}">Copy</button>
                            <button type="button" class="fuad-add-remove" data-act="remove" data-key="${esc(claim.key)}">Remove</button>
                        </span>
                    </div>
                    ${state.open === claim.key ? `<div class="fuad-add-copies fuad-add-copies-wide" role="row"><span role="cell">${copyChips(group, claim)}</span></div>` : ""}`).join("")}`).join("")}
            </div></div>` : ""}
        </section>` : "";
        const list = rows();
        const window_ = b.kind === "window";
        const head = (key, label, cls = "") => `<button type="button" class="fuad-add-sort${cls}" data-act="sort" data-sort="${key}" aria-pressed="${state.sort === key}">${label}${state.sort === key ? (key === "name" ? " ↑" : " ↓") : ""}</button>`;
        return `<div class="fuad-add-desk-top">${bannerMarkup()}</div>${statusMarkup()}
        ${block ? `<p class="fuad-add-alert" role="alert">${esc(overLimitText())}</p>` : ""}
        ${bidsTable}
        <section class="fuad-panel fuad-add-free" aria-labelledby="fuad-add-free">
            <div class="fuad-add-free-head"><h2 id="fuad-add-free">Free agents</h2>${searchMarkup()}${chipsMarkup()}</div>
            <div class="fuad-table-scroll"><div class="fuad-add-fa-table" role="table" aria-label="Free agents">
                <div class="fuad-add-fa-line fuad-add-columns" role="row"><span role="columnheader">${head("name", "Player")}</span><span role="columnheader" class="fuad-mid">Pos</span><span role="columnheader" class="fuad-num">${head("proj", "Proj", " fuad-num")}</span><span role="columnheader" class="fuad-num">${head("pts", "Pts", " fuad-num")}</span><span role="columnheader" class="fuad-mid">NFL</span><span role="columnheader" class="fuad-mid">Opp</span><span role="columnheader" class="fuad-mid">Bye</span><span role="columnheader"></span></div>
                ${list.map((row) => {
                    const action = row.bid ? "Bid" : "Add";
                    const injury = injuryText(row.player.inj);
                    const tone = /^(Out|IR|Suspended)$/.test(injury) ? "bad" : "caution";
                    return `<div class="fuad-add-fa-line" role="row">
                    <span role="cell" class="fuad-add-fa-name"><button type="button" class="fuad-name" data-act="popup" data-id="${esc(row.player.id)}">${esc(row.player.name)}</button>${injury ? `<span class="fuad-tag fuad-tag-${tone}">${esc(injury)}</span>` : ""}${window_ && row.bid ? '<span class="fuad-bid-only">bid only</span>' : ""}${row.why ? `<span class="fuad-muted fuad-add-why">${esc(row.why)}</span>` : ""}</span>
                    <span role="cell" class="fuad-mid fuad-muted">${esc(row.player.pos)}</span>
                    <span role="cell" class="fuad-num fuad-add-proj-num${row.player.proj ? "" : " fuad-muted"}">${esc(fmtProj(row.player.proj || 0))}</span>
                    <span role="cell" class="fuad-num">${esc(fmtProj(row.player.pts))}</span>
                    <span role="cell" class="fuad-mid fuad-muted">${esc(row.player.nfl)}</span>
                    <span role="cell" class="fuad-mid fuad-muted">${esc(/^bye$/i.test(row.player.opp) ? "Bye" : row.player.opp)}</span>
                    <span role="cell" class="fuad-mid fuad-muted">${esc(row.player.bye || "—")}</span>
                    <span role="cell"><button type="button" class="fuad-add-row-action" data-act="pick-fa" data-id="${esc(row.player.id)}" aria-label="${action} ${esc(row.player.name)}"${row.off || block ? " disabled" : ""}>${action}</button></span>
                </div>`;
                }).join("")}
            </div></div>
            ${list.length ? "" : '<p class="fuad-meta">No free agents match.</p>'}
        </section>`;
    }

    // the dialog's content; its section stays, so the focus trap keeps working across redraws
    function dialogMarkup() {
        const c = state.compose;
        const fa = freeAgent(c.add) || {name: names(c.add).name, nfl: "", pos: "", opp: "", proj: null};
        const kicker = c.editing ? `Edit claim · group ${c.round}` : c.kind === "bid" ? "Blind bid" : "Add now";
        const sub = [fa.nfl, fa.pos, /^bye$/i.test(fa.opp) ? "bye week" : fa.opp, fa.proj ? `${fmtProj(fa.proj)} proj` : ""].filter(Boolean).join(" · ");
        return `<div class="fuad-add-dialog-head">
                <div><span class="fuad-add-kicker">${esc(kicker)}</span><h2 id="fuad-add-dialog-title">${esc(fa.name)}</h2><span class="fuad-meta">${esc(sub)}</span></div>
                <button type="button" class="fuad-close" data-close aria-label="Close">${CLOSE}</button>
            </div>
            <div class="fuad-add-dialog-cols">
                <div class="fuad-add-dialog-drops"><span class="fuad-add-label">Drop</span><div class="fuad-add-drop-box">${dropList()}</div></div>
                <div class="fuad-add-dialog-form">${reviewForm({withPicks: false})}</div>
            </div>`;
    }

    // ---- render ----

    let opened = false;
    let keepCompose = false;

    function render() {
        // a field being typed in keeps its focus and caret
        const active = document.activeElement;
        const focus = active && (mount.contains(active) || layer.contains(active)) && active.dataset && active.dataset.focus
            ? {key: active.dataset.focus, start: active.selectionStart, end: active.selectionEnd} : null;
        const acted = active && (mount.contains(active) || layer.contains(active)) && active.dataset && active.dataset.act
            ? `[data-act="${active.dataset.act}"]${active.dataset.id !== undefined ? `[data-id="${active.dataset.id}"]` : ""}${active.dataset.key ? `[data-key="${active.dataset.key}"]` : ""}${active.dataset.n ? `[data-n="${active.dataset.n}"]` : ""}${active.dataset.round ? `[data-round="${active.dataset.round}"]` : ""}${active.dataset.pos ? `[data-pos="${active.dataset.pos}"]` : ""}${active.dataset.sort ? `[data-sort="${active.dataset.sort}"]` : ""}`
            : null;
        if (!state.data) {
            mount.innerHTML = state.failed
                ? `${statusMarkup()}<div class="fuad-add-alert fuad-add-failed" role="alert"><span>Couldn’t check your cap.${state.failed === "busy" ? " MFL asked us to wait. Retry in a few seconds." : ""}</span><span class="fuad-add-failed-buttons"><button type="button" class="fuad-add-retry" data-act="retry"${state.failed === "busy" && waitLeft() ? " disabled" : ""}>Retry</button><button type="button" class="fuad-add-retry" data-act="mfl">MFL’s page</button></span></div>
                    <button type="button" class="fuad-add-start" disabled>${PLUS}Add a player</button>`
                : `<section class="fuad-panel">${placeholders(8)}</section>`;
            return;
        }
        if (addsClosed(phase())) {
            mount.innerHTML = bannerMarkup();
            return;
        }
        if (wide.matches) {
            if (window.fuadDetour) {
                window.fuadDetour(null);
            }
            mount.innerHTML = deskHome();
            if (state.compose) {
                if (!layer.firstElementChild) {
                    layer.innerHTML = '<section class="fuad-add-dialog" role="dialog" aria-modal="true" aria-labelledby="fuad-add-dialog-title"></section>';
                }
                layer.firstElementChild.innerHTML = dialogMarkup();
                if (layer.hidden) {
                    // the control that opened it is drawn again behind the dialog: focus goes back to
                    // its new copy on close
                    const opener = acted;
                    opened = true;
                    closeDialog = openDialog(layer, {panel: layer.firstElementChild, opener: null, onClose: () => {
                        closeDialog = null;
                        if (state.compose && !state.busy && !keepCompose) {
                            state.compose = null;
                            state.error = "";
                            render();
                        }
                        const again = opener && mount.querySelector(opener);
                        if (again && !keepCompose) {
                            again.focus();
                        }
                    }});
                }
            } else if (closeDialog) {
                closeDialog();
            }
        } else {
            if (closeDialog) {
                closeDialog({restore: false});
            }
            const screen = state.compose || state.screen === "players" ? state.screen : "home";
            const c = state.compose;
            const fa = c && (freeAgent(c.add) || {name: names(c.add).name});
            const titles = {players: "Add a player", drops: fa ? `Adding ${fa.name}` : "", review: c && c.editing ? "Edit bid" : "Review"};
            if (window.fuadDetour) {
                window.fuadDetour(screen === "home" ? null : {
                    title: titles[screen],
                    onTitle: screen === "drops" && c ? (opener) => window.fuadOpenPlayer && window.fuadOpenPlayer(c.add, {opener}) : null
                });
            }
            mount.innerHTML = screen === "players" ? phonePlayers() : screen === "drops" ? dropList() : screen === "review" ? reviewForm({withPicks: true}) : phoneHome();
            mount.dataset.screen = screen;
        }
        const root = wide.matches && state.compose ? layer : mount;
        // a dialog just opened has its own focus; nothing behind it takes it back
        if (opened) {
            opened = false;
        } else if (focus) {
            const field = root.querySelector(`[data-focus="${focus.key}"]`) || mount.querySelector(`[data-focus="${focus.key}"]`);
            if (field) {
                field.focus();
                try {
                    field.setSelectionRange(focus.start, focus.end);
                } catch (error) {
                    // a field type without a caret
                }
            }
        } else if (acted) {
            const again = root.querySelector(acted);
            if (again && !again.disabled) {
                again.focus();
            }
        }
    }

    // ---- moving between the phone's screens: each a history entry, so Back returns ----

    let depth = 0;
    // `replace`: Rosters' Add lands on the drop step, so Back returns to Rosters
    function go(screen, {replace = false} = {}) {
        if (wide.matches) {
            render();
            return;
        }
        if (screen === state.screen) {
            render();
            return;
        }
        state.screen = screen;
        if (replace) {
            window.history.replaceState({fuadAdd: screen, depth}, "", `#${screen}`);
        } else {
            depth++;
            window.history.pushState({fuadAdd: screen, depth}, "", `#${screen}`);
        }
        render();
        window.scrollTo(0, 0);
    }

    window.addEventListener("popstate", (event) => {
        const entry = event.state && event.state.fuadAdd ? event.state : null;
        depth = entry ? entry.depth : 0;
        state.screen = entry ? entry.fuadAdd : "home";
        if (state.screen === "home" || state.screen === "players") {
            if (!state.busy) {
                state.compose = state.screen === "players" ? state.compose : null;
            }
        }
        state.error = "";
        render();
    });

    // a reload on one of the phone's screens starts over at Add
    if (/^#(players|drops|review)$/.test(window.location.hash)) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }

    // Shows the result after MFL's page reloads: back to Add's own entry first, so Back from it
    // leaves the page rather than landing on a finished move's screens
    function reloadWith(next) {
        try {
            window.sessionStorage.setItem(FLASH_KEY, JSON.stringify(next));
        } catch (error) {
            // storage is blocked: the reload just shows the page as MFL has it
        }
        const url = `${window.location.origin}/${context.season}/add_drop?L=${encodeURIComponent(context.leagueId)}`;
        if (depth > 0 && !wide.matches) {
            window.addEventListener("popstate", () => window.location.replace(url), {once: true});
            window.history.go(-depth);
        } else {
            window.location.replace(url);
        }
    }

    // ---- composing ----

    function startCompose(add, {round = null, replace = false} = {}) {
        const fa = freeAgent(add);
        if (!fa) {
            return;
        }
        const kind = fa.mark || theBanner().kind === "bids" ? "bid" : "add";
        state.compose = {add, drop: undefined, round: kind === "bid" ? round || nextRound() : null, bid: "1", years: 1, editing: null, kind};
        state.error = "";
        state.done = null;
        go("drops", {replace});
    }

    function claimOf(key) {
        for (const group of views()) {
            const found = group.claims.find((claim) => claim.key === key);
            if (found) {
                return {group, claim: found};
            }
        }
        return null;
    }

    // `what` names the move for its failure line: "place your bid on Higbee"
    async function run(what, task) {
        state.busy = true;
        state.error = "";
        render();
        try {
            await task();
        } catch (error) {
            console.warn("[fuad] couldn't make the move:", error);
            // MFL may have made something anyway (a bid where an add was asked, a move whose answer
            // failed): then the page reloads to show what it holds
            if (await mflChanged().catch(() => false)) {
                reloadWith({error: failedLine(what, error, {changed: true})});
                return;
            }
            state.error = failedLine(what, error);
            state.busy = false;
            if (state.screen === "home" && !wide.matches) {
                state.compose = null;
            }
            render();
        }
    }

    async function mflChanged() {
        const [fresh, ids] = await Promise.all([freshPending(context), rosterIds(context, franchiseId)]);
        const mine = [...state.data.league.players.values()].filter((player) => player.franchise && player.franchise.franchiseId === franchiseId)
            .map((player) => player.playerId).sort();
        return JSON.stringify(fresh.groups) !== JSON.stringify(state.data.groups) || JSON.stringify(ids) !== JSON.stringify(mine);
    }

    // A group's one comment after a claim joins it: the lines it had and the claim's own, checked
    // once MFL has the claim and written through the edit page if MFL didn't keep them all (it may
    // add the new comment as a line, or let it replace the group's). Resolves to whether it holds.
    // `line` may be empty (a copied claim with no line): the group's own lines still have to survive.
    async function ensureLine(round, mflName, line, otherNames) {
        const group = state.data.pending.find((entry) => entry.round === round);
        const before = fullNameLines(commentLines(group ? group.comment : ""), mflName, otherNames).join("\n");
        const expected = commentLines(line ? rewriteComment(before, mflName, line, otherNames) : before);
        const holds = (comment) => expected.every((entry) => commentLines(comment).includes(entry));
        if (!expected.length || holds((await freshPending(context)).comments.get(round))) {
            return true;
        }
        await saveGroup(context, franchiseId, round, {comment: () => expected.join("\n")});
        return holds((await freshPending(context)).comments.get(round));
    }

    async function submit() {
        const c = state.compose;
        const checks = composeChecks();
        if (!checks.fits || c.drop === undefined) {
            return;
        }
        // free agency may have closed, or the last bid run passed, while the move was being made
        if (addsClosed(phase()) || (c.kind === "bid" && !runsLeft())) {
            state.error = addsClosed(phase()) ? "Free agency has closed for the season." : "No blind bid runs are left this season.";
            render();
            return;
        }
        const fa = freeAgent(c.add) || {mflName: names(c.add).mflName};
        const who = surname(fa.mflName);
        await run(c.editing ? `change your bid on ${who}` : c.kind === "bid" ? `place your bid on ${who}` : `add ${who}`, async () => {
            if (c.editing) {
                const found = claimOf(c.editing);
                const others = found.group.claims.filter((claim) => claim.key !== c.editing).map((claim) => claim.addMfl);
                const line = c.years ? lengthLine(fa.mflName, c.years, others) : null;
                await saveGroup(context, franchiseId, c.round, {
                    claim: {mflName: fa.mflName, bid: found.claim.bid}, bid: checks.bid, drop: c.drop || null,
                    comment: (comment) => (line ? rewriteComment(comment, fa.mflName, line, others) : comment)
                });
                const claim = {add: c.add, bid: checks.bid, drop: c.drop || null};
                const fresh = await freshPending(context);
                if (!hasClaim(fresh.groups, c.round, claim) || (line && lineFor(commentLines(fresh.comments.get(c.round)), fa.mflName, others) !== line)) {
                    throw new Refused("MFL kept only part of it");
                }
                reloadWith({highlight: claimKey(c.round, claim)});
                return;
            }
            if (c.kind === "bid") {
                const view = views().find((group) => group.round === c.round);
                const others = view ? view.claims.map((claim) => claim.addMfl) : [];
                const line = lengthLine(fa.mflName, c.years, others);
                const claim = {add: c.add, bid: checks.bid, drop: c.drop || null};
                const answer = await send(form.action, {method: "POST", body: fillForm(form, lists, {...claim, round: c.round, comment: line})});
                if (!hasClaim((await freshPending(context)).groups, c.round, claim)) {
                    throw new Refused(refusal(answer));
                }
                const kept = await ensureLine(c.round, fa.mflName, line, others).catch(() => false);
                reloadWith({highlight: claimKey(c.round, claim), done: kept ? null : {text: `Bid made, but MFL didn’t keep group ${c.round}’s comment as it was: check its lengths with Edit.`, failed: true}});
                return;
            }
            const answer = await send(form.action, {method: "POST", body: fillForm(form, lists, {add: c.add, drop: c.drop || null})});
            if (!(await onRoster(context, franchiseId, c.add))) {
                throw new Refused(refusal(answer));
            }
            const line = lengthLine(fa.mflName, c.years);
            const dropped = c.drop ? surname(names(c.drop).mflName) : null;
            const made = `${surname(fa.mflName)} added${dropped ? `, ${dropped} dropped.` : "."}`;
            let done;
            try {
                await postLength(context, line);
                done = {text: `${made} Posted “${line}”.`};
            } catch (error) {
                console.warn("[fuad] couldn't post the length:", error);
                done = {text: `${made} Couldn’t post the length “${line}”; it’s due within the hour.`, failed: true, line};
            }
            reloadWith({done});
        });
    }

    async function claimAction(act, key, round) {
        const found = claimOf(key);
        if (!found) {
            return;
        }
        const {group, claim} = found;
        const who = surname(claim.addMfl);
        // a copied or moved bid would wait for a run that won't come; removing one is always fine
        if (act !== "remove" && !runsLeft()) {
            state.error = "No blind bid runs are left this season.";
            render();
            return;
        }
        await run(act === "remove" ? `remove your bid on ${who}` : act === "copy" ? `copy your bid on ${who} to group ${round}` : `move your bid on ${who}`, async () => {
            if (act === "up" || act === "down") {
                const link = claimLink(act === "up" ? "MOVE_UP" : "MOVE_DOWN", key);
                if (!link) {
                    throw new Error("MFL's page has no link for that");
                }
                await send(link.href, {cache: "no-store"});
                reloadWith({highlight: key});
            } else if (act === "remove") {
                const link = claimLink("DELETE", key);
                if (!link) {
                    throw new Error("MFL's page has no link for that");
                }
                await send(link.href, {cache: "no-store"});
                const rest = group.claims.filter((other) => other.key !== key);
                // the group's one comment keeps a line per claim: the removed one's goes, unless another
                // claim in the group goes by the same name
                if (rest.length && isLengthLine(claim.line) && !rest.some((other) => surname(other.addMfl).toLowerCase() === surname(claim.addMfl).toLowerCase())) {
                    await saveGroup(context, franchiseId, group.round, {comment: (comment) => rewriteComment(comment, claim.addMfl, null)})
                        .catch((error) => console.warn("[fuad] couldn't tidy the group's comment:", error));
                }
                reloadWith({});
            } else if (act === "copy") {
                const target = views().find((other) => other.round === round);
                const others = target ? target.claims.map((other) => other.addMfl) : [];
                const years = yearsIn(claim.line);
                const line = years ? lengthLine(claim.addMfl, years, others) : claim.line || "";
                const copy = {add: claim.add, bid: claim.bid, drop: claim.drop || null};
                const answer = await send(form.action, {method: "POST", body: fillForm(form, lists, {...copy, round, comment: line})});
                if (!hasClaim((await freshPending(context)).groups, round, copy)) {
                    throw new Refused(refusal(answer));
                }
                const kept = await ensureLine(round, claim.addMfl, line, others).catch(() => false);
                reloadWith({highlight: claimKey(round, copy), done: kept ? null : {text: `Copied, but MFL didn’t keep group ${round}’s comment as it was: check its lengths with Edit.`, failed: true}});
            }
        });
    }

    // ---- events ----

    async function postNow() {
        const line = state.done && state.done.line;
        if (!line || state.busy) {
            return;
        }
        state.busy = true;
        render();
        try {
            await postLength(context, line);
            state.done = {text: `Posted “${line}”.`};
        } catch (error) {
            console.warn("[fuad] couldn't post the length:", error);
            state.done = {...state.done, text: `Couldn’t post the length “${line}”; it’s due within the hour.`};
        }
        state.busy = false;
        render();
    }

    function onClick(event) {
        const target = event.target.closest("[data-act]");
        if (!target || target.disabled || (!mount.contains(target) && !layer.contains(target))) {
            return;
        }
        const act = target.dataset.act;
        if (act === "retry") {
            load();
            return;
        }
        if (act === "mfl") {
            standAside();
            layer.remove();
            return;
        }
        if (act === "popup") {
            if (window.fuadOpenPlayer && !(wide.matches && state.compose)) {
                window.fuadOpenPlayer(target.dataset.id, {opener: target});
            }
            return;
        }
        if (act === "post-now") {
            postNow();
            return;
        }
        if (state.busy || !state.data) {
            return;
        }
        const c = state.compose;
        switch (act) {
        case "start": {
            state.done = null;
            state.error = "";
            state.pendingRound = target.dataset.round ? Number(target.dataset.round) : null;
            state.compose = null;
            go("players");
            break;
        }
        case "pick-fa": {
            const id = target.dataset.id;
            if (c && c.changing === "add") {
                const fa = freeAgent(id);
                const kind = fa && (fa.mark || theBanner().kind === "bids") ? "bid" : "add";
                state.compose = {...c, add: id, kind, changing: null, round: kind === "bid" ? c.round || state.pendingRound || nextRound() : null};
                window.history.back();
                break;
            }
            const round = state.pendingRound || null;
            startCompose(id, {round});
            break;
        }
        case "pick-drop": {
            const id = target.dataset.id || null;
            const back = c.changing === "drop";
            state.compose = {...c, drop: id, changing: null};
            if (wide.matches) {
                render();
            } else if (back) {
                window.history.back();
            } else {
                go("review");
            }
            break;
        }
        case "change-add":
            state.compose = {...c, changing: "add"};
            go("players");
            break;
        case "change-drop":
            state.compose = {...c, changing: "drop"};
            go("drops");
            break;
        case "group":
            state.compose = {...c, round: Number(target.dataset.round)};
            render();
            break;
        case "year":
            state.compose = {...c, years: Number(target.dataset.n)};
            render();
            break;
        case "bid-minus":
        case "bid-plus": {
            const bid = Math.max(0, parseInt(c.bid, 10) || 0);
            const max = maxBid(team(), {round: c.round, drop: c.drop || null, without: c.editing});
            state.compose = {...c, bid: String(act === "bid-minus" ? Math.max(1, bid - 1) : Math.min(Math.max(1, max), bid + 1))};
            render();
            break;
        }
        case "submit":
            submit();
            break;
        case "pos":
            state.pos = target.dataset.pos;
            render();
            break;
        case "sort":
            state.sort = target.dataset.sort;
            render();
            break;
        case "toggle":
            state.open = state.open === target.dataset.key ? null : target.dataset.key;
            state.flash = null;
            render();
            break;
        case "edit": {
            const found = claimOf(target.dataset.key);
            if (found) {
                state.done = null;
                state.compose = {add: found.claim.add, drop: found.claim.drop || null, round: found.group.round, bid: String(found.claim.bid),
                    years: yearsIn(found.claim.line), editing: found.claim.key, kind: "bid"};
                state.open = null;
                go("review");
            }
            break;
        }
        case "up":
        case "down":
        case "remove":
            claimAction(act, target.dataset.key);
            break;
        case "copy":
            claimAction("copy", target.dataset.key, Number(target.dataset.round));
            break;
        default:
            break;
        }
    }

    function onInput(event) {
        const field = event.target;
        if (!field.dataset || !field.dataset.focus) {
            return;
        }
        if (field.dataset.focus === "q") {
            state.q = field.value;
        } else if (field.dataset.focus === "bid" && state.compose) {
            state.compose = {...state.compose, bid: field.value.replace(/[^0-9]/g, "")};
        }
        render();
    }

    mount.addEventListener("click", onClick);
    layer.addEventListener("click", onClick);
    mount.addEventListener("input", onInput);
    layer.addEventListener("input", onInput);
    wide.addEventListener("change", () => {
        if (!wide.matches && state.compose && state.screen === "home") {
            // a history entry, so Back returns to Add rather than leaving it
            depth++;
            state.screen = "review";
            window.history.pushState({fuadAdd: "review", depth}, "", "#review");
        }
        // the dialog closes for the phone's screens without dropping the move
        keepCompose = true;
        render();
        keepCompose = false;
    });

    async function load() {
        state.failed = false;
        render();
        try {
            state.data = await loadData(context, franchiseId);
            if (!state.data.league.franchises.get(franchiseId)) {
                throw new Error("your team isn't in the rosters");
            }
        } catch (error) {
            console.warn("[fuad] couldn't load Add:", error);
            state.data = null;
            state.failed = error && error.status === 429 ? "busy" : true;
            // Retry comes back on when MFL's wait is over
            if (state.failed === "busy" && waitLeft()) {
                setTimeout(render, waitLeft());
            }
        }
        render();
        // Rosters' Add opens with its player chosen (`#player-<id>`)
        const asked = (window.location.hash.match(/^#player-(\d+)$/) || [])[1];
        if (asked && state.data && !addsClosed(phase())) {
            window.history.replaceState(null, "", window.location.pathname + window.location.search);
            if (freeAgent(asked) && !rows().find((row) => row.player.id === asked).off && !addBlock(team(), {phase: checks()})) {
                startCompose(asked, {replace: true});
            }
        }
    }
    load();
    return {standAside};
}
