// Lineup: MFL's Submit Lineup page, drawn over its own form. A tap sets MFL's checkbox; Save posts
// MFL's form in place, then reads MFL's page back to confirm what it kept. MFL's form stays in the
// page underneath, so its hidden fields go with every save.

import {API_BASE, asArray, exportUrl, fetchExport} from "../lib/mfl.js";
import settings from "../lib/settings.js";
import {TIME_ZONE} from "../lib/zone.js";
import {esc} from "./html.js";
import {oneLineTimes, plural} from "./format.js";
import {clock} from "./home-model.js";
import {openDialog} from "./dialog.js";
import {allAtOnce, forget, mflFetch, pageFetch} from "./page-fetch.js";
import {placeholders} from "./panel.js";
import {draftPicked, seasonFacts} from "./context.js";
import {
    applyInjuries, lineupForm, lineupStatus, lineupWarnings, positionName, rangeText, readLineupPage, sameLineup, tagOf
} from "./lineup-model.js";
import {backupMessage, backupOffered, choices, heldPairs, keptPairs, kickoffsOf, lockedStarters, pairProblems, pendingPairs, samePairs, teamBackups, weekFacts} from "./lineup-backups.js";
import {readLineups, readThreads, weekKickoffs} from "./lineup-board.js";

const CHECK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"></path></svg>';

const LOCK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-label="Locked" role="img"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>';
const CLOSE_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>';

const now = () => Date.now() / 1000;
// "Sun 11:55 a.m."
const lockText = (seconds) => `${new Date(seconds * 1000).toLocaleDateString("en-US", {weekday: "short", timeZone: TIME_ZONE})} ${clock(seconds)}`;

const pts = (value) => (value === null ? "—" : value.toFixed(1));

function tag(player) {
    const found = tagOf(player);
    return found ? `<span class="fuad-tag fuad-tag-${found.tone}">${esc(found.text)}</span>` : "";
}

const oppText = (player) => (player.onBye ? "bye week" : oneLineTimes(player.opp));

// a starter's backup (16.5): set, locked, or a button to pick one; "" when backups are off or none can be
function backupCell(player, state) {
    const {backups, on} = state;
    if (!backups || !on.has(player.id)) {
        return "";
    }
    const name = (id) => esc(backups.facts.byId.get(id).name);
    if (backups.locked.has(player.id)) {
        return `<span class="fuad-backup fuad-backup-locked">${LOCK}If out → <b>${name(backups.locked.get(player.id))}</b></span>`;
    }
    const backup = keptPairs(backups.open, on).get(player.id);
    if (backup) {
        return `<button type="button" class="fuad-backup fuad-backup-set" data-backup="${esc(player.id)}" aria-haspopup="dialog" aria-label="Backup for ${esc(player.name)}: ${name(backup)}">If out → <b>${name(backup)}</b></button>`;
    }
    // asked once a render, for the phone row and the desktop table both
    if (!state.offered.has(player.id)) {
        state.offered.set(player.id, backupOffered(state.page, {starter: player, on, pairs: new Map([...backups.locked, ...backups.open]), facts: backups.facts, now: now(), locked: lockedStarters(backups.team, now())}));
    }
    return state.offered.get(player.id)
        ? `<button type="button" class="fuad-backup" data-backup="${esc(player.id)}" aria-haspopup="dialog" aria-label="Backup for ${esc(player.name)}">+ Backup</button>` : "";
}

// whose backup a bench player is
function backupTag(player, state) {
    const {backups} = state;
    if (!backups) {
        return "";
    }
    const of = (pairs) => [...pairs].find(([, backup]) => backup === player.id);
    const locked = of(backups.locked);
    const found = locked || of(keptPairs(backups.open, state.on));
    return found ? `<span class="fuad-tag fuad-tag-backup">${locked ? LOCK : ""}${esc(backups.facts.byId.get(found[0]).name)}'s backup</span>` : "";
}

// a locked pair's players can't be moved here (16.5.5): the job would put them back
function pairLocked(player, state) {
    const {backups} = state;
    return Boolean(backups) && (backups.locked.has(player.id) || [...backups.locked.values()].includes(player.id));
}

function phoneRow(player, state) {
    const {on} = state;
    const starting = on.has(player.id);
    const cell = backupCell(player, state);
    return `<div class="fuad-lineup-row${cell ? " fuad-lineup-row-backup" : ""}">
        <button type="button" class="fuad-lineup-toggle" data-toggle="${esc(player.id)}" aria-pressed="${starting}" aria-label="Start ${esc(player.name)}"${player.locked || pairLocked(player, state) ? " disabled" : ""}>
            <span class="fuad-check" aria-hidden="true">${CHECK}</span>
        </button>
        <button type="button" class="fuad-lineup-open" data-player="${esc(player.id)}" aria-haspopup="dialog">
            <span class="fuad-lineup-who">
                <span class="fuad-lineup-name"><span>${esc(player.name)}</span>${tag(player)}${backupTag(player, state)}</span>
                <span class="fuad-meta">${esc([player.nfl, oppText(player)].filter(Boolean).join(" · "))}</span>
            </span>
        </button>
        <span class="fuad-lineup-proj"><span class="${player.proj ? "" : "fuad-muted"}">${esc(pts(player.proj || 0))}</span><span class="fuad-meta">proj</span></span>
        ${cell}
    </div>`;
}

function deskRow(player, state) {
    const {on} = state;
    const starting = on.has(player.id);
    return `<div class="fuad-lineup-line${starting ? " fuad-lineup-starting" : ""}" role="row">
        <span role="cell"><button type="button" class="fuad-check" data-toggle="${esc(player.id)}" aria-pressed="${starting}" aria-label="Start ${esc(player.name)}"${player.locked || pairLocked(player, state) ? " disabled" : ""}>${CHECK}</button></span>
        <span role="cell" class="fuad-lineup-name"><button type="button" class="fuad-name" data-player="${esc(player.id)}">${esc(player.name)}</button>${tag(player)}${backupTag(player, state)}</span>
        ${state.backups ? `<span role="cell" class="fuad-lineup-backup">${backupCell(player, state)}</span>` : ""}
        <span role="cell" class="fuad-num fuad-lineup-projected${player.proj ? "" : " fuad-muted"}">${esc(pts(player.proj || 0))}</span>
        <span role="cell" class="fuad-mid fuad-muted">${esc(player.nfl)}</span>
        <span role="cell" class="fuad-muted">${esc(player.onBye ? "Bye week" : oneLineTimes(player.opp))}</span>
        <span role="cell" class="fuad-num fuad-muted">${esc(player.oppRank || "—")}</span>
        <span role="cell" class="fuad-num">${esc(pts(player.ytd))}</span>
        <span role="cell" class="fuad-num fuad-muted">${esc(pts(player.avg))}</span>
    </div>`;
}

// a dot per slot up to the most a position may start, filled per starter; over the limit, the extras
// too, all red
function slots(count, most, bad) {
    const dots = Array.from({length: Math.max(count, most)}, (_, i) => `<span class="fuad-slot${i < count ? " fuad-slot-on" : ""}"></span>`).join("");
    return `<span class="fuad-slots${bad ? " fuad-slots-bad" : ""}" role="img" aria-label="${count} starting">${dots}</span>`;
}

function groups(page, on, status) {
    return Object.keys(page.limits).map((pos) => ({
        pos,
        head: `<span class="fuad-band-pos">${pos}</span>${slots(status.counts[pos], page.limits[pos][1], status.broken.includes(pos))}<span class="fuad-band-note${status.broken.includes(pos) ? " fuad-bad" : ""}">start ${rangeText(page.limits[pos])}</span>`,
        players: page.players.filter((player) => player.pos === pos)
    }));
}

// what the save bar says of the backups the member changed, or "" for none
function backupLine(state) {
    const {backups} = state;
    if (!backups) {
        return "";
    }
    const {set, dropped} = pendingPairs(backups.open, backups.standing);
    const locks = set.map(([starter, backup]) => backups.facts.deadline(starter, backup));
    return [
        set.length ? `${plural(set.length, "backup")} to save · locks ${lockText(Math.min(...locks))}` : "",
        dropped.length ? `${plural(dropped.length, "backup")} removed` : ""
    ].filter(Boolean).join(" · ");
}

function draw(mount, state) {
    const {page, on, base, irHref, addHref} = state;
    state.offered = new Map();
    const status = lineupStatus(page, on);
    const warnings = lineupWarnings(page.players, on);
    const changed = !sameLineup(on, base);
    const backupsChanged = backupLine(state);
    const canSave = status.ok && (changed || backupsChanged) && !state.saving && !state.stale;
    const saveLine = !status.ok || !backupsChanged ? status.line : `${changed ? "Lineup changed · " : ""}${backupsChanged}`;
    const byPos = groups(page, on, status);
    const week = (href, label, arrow) => (href
        ? `<a class="fuad-week-step" href="${esc(href)}" aria-label="${label}">${arrow}</a>`
        : `<span class="fuad-week-step" aria-hidden="true">${arrow}</span>`);
    mount.innerHTML = `
    <div class="fuad-week-picker">${week(page.prev, "Previous week", "‹")}<span class="fuad-week-now">Week ${page.week}</span>${week(page.next, "Next week", "›")}</div>
    ${state.saved && !changed && !backupsChanged ? `<p class="fuad-lineup-saved" role="status">${CHECK}${{backups: "Backups saved.", both: "Lineup and backups saved."}[state.saved] || "Lineup saved."}</p>` : ""}
    ${state.error ? `<p class="fuad-lineup-problems" role="alert">${esc(state.error)}</p>` : ""}
    ${state.backupError ? `<p class="fuad-lineup-problems" role="alert">${esc(state.backupError)}</p>` : ""}
    ${warnings.length ? `<section class="fuad-lineup-problems" role="alert" aria-label="Lineup problems">${warnings.map((w) => `<span><strong>${esc(w.name)}</strong> ${esc(w.why)}</span>`).join("")}</section>` : ""}
    <section class="fuad-panel fuad-lineup-list" aria-label="Your roster">
        ${byPos.map((group) => `<div class="fuad-band">${group.head}</div>${group.players.map((player) => phoneRow(player, state)).join("")}`).join("")}
    </section>
    <section class="fuad-panel fuad-lineup-table" aria-label="Your roster">
        <div class="fuad-table-scroll"><div class="fuad-lineup-grid${state.backups ? " fuad-lineup-grid-backups" : ""}" role="table" aria-label="Your roster">
            <div class="fuad-lineup-line fuad-lineup-columns" role="row"><span role="columnheader">Start</span><span role="columnheader">Player</span>${state.backups ? '<span role="columnheader">Backup</span>' : ""}<span role="columnheader" class="fuad-num">Proj</span><span role="columnheader" class="fuad-mid">NFL</span><span role="columnheader">Opponent</span><span role="columnheader" class="fuad-num">Opp rank</span><span role="columnheader" class="fuad-num">YTD</span><span role="columnheader" class="fuad-num">Avg</span></div>
            ${byPos.map((group) => `<div class="fuad-lineup-band" role="row"><span role="cell" class="fuad-band">${group.head}</span></div>${group.players.map((player) => deskRow(player, state)).join("")}`).join("")}
        </div></div>
    </section>
    ${page.ir.length ? `<p class="fuad-lineup-ir fuad-meta">On IR: ${esc(page.ir.join(", "))} · <a href="${esc(irHref)}">Manage IR</a></p>` : ""}
    <section class="fuad-save-bar" aria-label="Save">
        <span class="fuad-save-count${status.starting === page.total ? "" : " fuad-bad"}">${status.starting} of ${page.total} starting</span>
        <span class="fuad-save-line${status.ok ? " fuad-muted" : " fuad-bad"}">${esc(saveLine)}${status.stuck.length && addHref ? ` · <a href="${esc(addHref)}">Add a ${esc(positionName(status.stuck[0].pos))}</a>` : ""}</span>
        <button type="button" class="fuad-save"${canSave ? "" : " disabled"}>${state.saving ? "Saving…" : changed && !backupsChanged ? "Save lineup" : changed || backupsChanged ? "Save" : "Saved"}</button>
    </section>`;
}

const startersOf = (page) => new Set(page.players.filter((player) => player.starter).map((player) => player.id));

// MFL's lineup form in `html` for `week`, or null
function formIn(html, week) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const found = readLineupPage(doc);
    return found && found.week === week ? lineupForm(doc) : null;
}

// Posts MFL's form, with `message` in its Optional Message unless null, and resolves to MFL's form as
// it then stands, from the answer when that's the week's lineup page, else read back. A failed post
// rejects with `sent: false`; a post that went but couldn't be checked, with `sent: true`.
async function save(context, form, state, message = null) {
    for (const player of state.page.players) {
        if (!player.locked) {
            player.box.checked = state.on.has(player.id);
        }
    }
    // the same fields MFL's own Submit Lineup sends, a started starter's hidden input among them
    const fields = new URLSearchParams(new FormData(form));
    fields.set("SUBMIT", "Submit Lineup");
    if (message !== null) {
        const box = [...fields.keys()].find((name) => /^MESSAGE/.test(name));
        if (!box) {
            throw Object.assign(new Error("MFL's lineup form has no message box"), {sent: false});
        }
        fields.set(box, message);
    }
    let response;
    forget();
    try {
        response = await fetch(form.action, {method: "POST", body: fields, credentials: "include"}).finally(forget);
    } catch (error) {
        throw Object.assign(error, {sent: false});
    }
    if (!response.ok) {
        throw Object.assign(new Error(`MFL answered HTTP ${response.status}`), {sent: false});
    }
    try {
        const answered = formIn(await response.text(), state.page.week);
        if (answered) {
            return answered;
        }
        const url = `${window.location.origin}/${context.season}/lineup?L=${encodeURIComponent(context.leagueId)}&WEEK=${state.page.week}&F=${encodeURIComponent(state.page.team)}`;
        const again = await fetch(url, {credentials: "include", cache: "no-store"});
        if (!again.ok) {
            throw new Error(`MFL answered HTTP ${again.status}`);
        }
        const read = formIn(await again.text(), state.page.week);
        if (!read) {
            throw new Error("MFL's lineup page couldn't be read back");
        }
        return read;
    } catch (error) {
        throw Object.assign(error, {sent: true});
    }
}

// the draft's picks, asked fresh: a day-old "not drafted" may be out of date on draft day
async function stillBeforeDraft(context) {
    if (Number(window.liveScoringWeek) > 1) {
        return false;
    }
    const facts = await seasonFacts(context).catch(() => null);
    // `draftKnown` false: the draft results failed to load; missing: cached before it was recorded
    if (!facts || facts.draftKnown === false || facts.drafted || (facts.week1 && Date.now() >= facts.week1)) {
        return false;
    }
    const results = await fetchExport(exportUrl(window.location.origin, context.season, "draftResults", {L: context.leagueId}), "draftResults", {fetchImpl: mflFetch, init: {cache: "no-store"}}).catch(() => null);
    return Boolean(results) && !draftPicked(results);
}

// The picker for `starter`'s backup: a tap picks and closes it
function sheetMarkup(starter, state) {
    const {backups, on, page} = state;
    const {can, cant} = choices(page, {starter, on, pairs: new Map([...backups.locked, ...backups.open]), facts: backups.facts, now: now()});
    const current = backups.open.get(starter.id) || "";
    const choice = (id, name, meta, proj, disabled = false) => `<button type="button" class="fuad-backup-choice${id === current ? " fuad-backup-chosen" : ""}" data-choose="${esc(id)}" aria-pressed="${id === current}"${disabled ? " disabled" : ""}>
            <span class="fuad-backup-mark">${id === current ? CHECK : ""}</span>
            <span class="fuad-backup-who"><span class="fuad-backup-name">${name}</span>${meta}</span>
            ${proj}
        </button>`;
    const proj = (player) => `<span class="fuad-backup-proj">${esc(pts(player.proj || 0))}</span>`;
    const line = (player, ...rest) => esc([player.pos, player.nfl, ...rest].filter(Boolean).join(" · "));
    return `<section class="fuad-popup fuad-backup-sheet" role="dialog" aria-modal="true" aria-labelledby="fuad-backup-title" tabindex="-1">
        <div class="fuad-popup-head">
            <div class="fuad-popup-title">
                <h2 id="fuad-backup-title">Backup for ${esc(starter.name)}</h2>
                <span class="fuad-meta fuad-popup-meta">${line(starter, oppText(starter))} ${tag(starter)}</span>
            </div>
            <button type="button" class="fuad-close" data-close aria-label="Close">${CLOSE_ICON}</button>
        </div>
        <div class="fuad-backup-choices">
            ${choice("", "No backup", "", "")}
            ${can.length ? `<h3 class="fuad-backup-group">Can back him up</h3>` : ""}
            ${can.map(({player, deadline}) => choice(player.id, `${esc(player.name)} ${tag(player)}`,
                `<span class="fuad-meta">${line(player, oppText(player))} · locks ${esc(lockText(deadline))}</span>`, proj(player))).join("")}
            ${cant.length ? `<h3 class="fuad-backup-group">Can’t</h3>` : ""}
            ${cant.map(({player, why}) => choice(player.id, esc(player.name), `<span class="fuad-backup-why">${esc(`${player.pos} · ${why}`)}</span>`, proj(player), true)).join("")}
        </div>
    </section>`;
}

export async function drawLineup({context, franchiseId, irHref, addHref}) {
    const body = document.querySelector(".pagebody");
    if (!body) {
        return;
    }
    const mount = document.createElement("div");
    mount.id = "fuad-lineup";
    const show = () => {
        body.prepend(mount);
        document.documentElement.classList.add("fuad-lineup-on");
    };
    // logged out MFL shows its login screen instead (and its page, should it ever be served); the
    // commissioner's view stays MFL's
    if (!franchiseId || franchiseId === "0000") {
        document.documentElement.classList.remove("fuad-lineup-on");
        return;
    }
    // drawn at once, so MFL's form doesn't show while the season's phase is read
    mount.innerHTML = `<section class="fuad-panel">${placeholders(8)}</section>`;
    show();
    if (await stillBeforeDraft(context)) {
        mount.innerHTML = '<section class="fuad-panel fuad-lineup-note"><span>Lineups open for week 1 after the draft.</span></section>';
        return;
    }
    let form = lineupForm(document);
    const page = readLineupPage(document);
    // not the form v2 knows (MFL changed it, or a page without one): MFL's own page, restyled
    if (!form || !page || !page.players.length) {
        mount.remove();
        document.documentElement.classList.remove("fuad-lineup-on");
        return;
    }
    // `stale`: a save went but couldn't be checked, so the form underneath may be out of date;
    // `backups`: the week's pairs once read, with the backups setting on (lineup-backups.js)
    const state = {page, on: startersOf(page), base: startersOf(page), irHref, addHref, report: null, saved: false, saving: false, stale: false, error: "",
        backups: null, backupError: ""};
    const render = () => {
        const focused = document.activeElement && mount.contains(document.activeElement) ? document.activeElement : null;
        const key = focused && ["toggle", "player", "backup"].find((name) => focused.dataset[name]);
        const again = key ? `[data-${key}="${CSS.escape(focused.dataset[key])}"].${focused.classList[0]}` : focused && focused.classList.contains("fuad-save") ? ".fuad-save" : null;
        draw(mount, state);
        // the phone row's and the desktop table's buttons share their names: the one showing
        const target = again && [...mount.querySelectorAll(again)].find((node) => node.getClientRects().length);
        if (target) {
            target.focus();
        }
    };
    render();

    // the team's pairs for the week, from its lineups' messages and the thread, against the lineup MFL
    // has (state.base); the week before's schedule dates a post that names no week, as the job dates it
    async function loadBackups() {
        const {week} = state.page;
        const [schedule, previous, posts, lineups] = await allAtOnce([
            state.backups ? null : weekKickoffs(context.season, week),
            state.backups || week === 1 ? null : weekKickoffs(context.season, week - 1, {keep: true}),
            readThreads(context),
            readLineups(context, state.page.team, week)
        ]);
        const [kickoffs, lastWeek] = state.backups ? [state.backups.kickoffs, state.backups.lastWeek] : [kickoffsOf(schedule), kickoffsOf(previous)];
        const facts = weekFacts(state.page, kickoffs, lastWeek);
        const team = teamBackups(posts, lineups, {team: state.page.team, week, page: state.page, facts});
        const held = heldPairs(team.pairs, state.base, now());
        state.backups = {kickoffs, lastWeek, facts, team, standing: held.unlocked, open: new Map(held.unlocked), locked: held.locked};
        lockAtDeadlines();
    }

    // At each pair's deadline while the page is open, the pair locks here too (16.5.5); a change the
    // member made to it and didn't save stays, for Save to refuse
    let lockTimer = null;
    function lockAtDeadlines() {
        clearTimeout(lockTimer);
        const backups = state.backups;
        const next = Math.min(...backups.team.pairs.map((pair) => pair.deadline).filter((deadline) => deadline > now()));
        if (next === Infinity) {
            return;
        }
        // setTimeout takes at most about 24 days
        lockTimer = setTimeout(() => {
            if (state.backups !== backups) {
                return;
            }
            const held = heldPairs(backups.team.pairs, state.base, now());
            for (const [starter, backup] of backups.standing) {
                if (!held.unlocked.has(starter) && backups.open.get(starter) === backup) {
                    backups.open.delete(starter);
                }
            }
            backups.standing = held.unlocked;
            backups.locked = held.locked;
            lockAtDeadlines();
            render();
        }, Math.min((next - now()) * 1000 + 500, 2 ** 31 - 1));
    }

    const layer = document.createElement("div");
    layer.className = "fuad-layer fuad-popup-layer";
    layer.hidden = true;
    let closeSheet = null;
    layer.addEventListener("click", (event) => {
        const pick = event.target.closest("[data-choose]");
        if (!pick || pick.disabled || !closeSheet) {
            return;
        }
        const starter = layer.dataset.starter;
        if (pick.dataset.choose) {
            state.backups.open.set(starter, pick.dataset.choose);
        } else {
            state.backups.open.delete(starter);
        }
        state.saved = false;
        state.error = "";
        closeSheet();
        render();
    });
    const openSheet = (starterId, opener) => {
        const starter = state.page.players.find((player) => player.id === starterId);
        if (!starter) {
            return;
        }
        if (!layer.isConnected) {
            document.body.append(layer);
        }
        layer.dataset.starter = starterId;
        layer.innerHTML = sheetMarkup(starter, state);
        closeSheet = openDialog(layer, {opener, onClose: () => {
            closeSheet = null;
        }});
    };

    // Posts MFL's form, with `message` as its Optional Message unless null: "kept" once MFL keeps the
    // lineup asked for, "other" when it kept another (its message may have gone in), else false
    async function saveLineup(message) {
        let fresh;
        try {
            fresh = await save(context, form, state, message);
        } catch (error) {
            console.warn("[fuad] couldn't save the lineup:", error);
            state.stale = error.sent;
            state.error = error.sent ? `Sent, but couldn't check what MFL kept (${error.message}). Reload to see it.` : `Not saved: ${error.message}.`;
            return false;
        }
        try {
            // MFL's form as it now stands takes the old one's place: its starters, its locks (a game
            // that kicked off since the page loaded gets MFL's hidden input) and its new expiry
            const adopted = document.importNode(fresh, true);
            form.replaceWith(adopted);
            form = adopted;
            const read = readLineupPage(document);
            if (!read) {
                throw new Error("the saved lineup couldn't be read");
            }
            const before = state.base;
            state.page = read;
            applyInjuries(state.page.players, state.report);
            const kept = startersOf(state.page);
            state.base = kept;
            if (sameLineup(kept, state.on)) {
                state.saved = true;
                return "kept";
            }
            state.on = new Set(kept);
            state.error = sameLineup(kept, before) ? "Not saved: MFL kept the lineup below." : "Saved, but MFL kept the lineup below.";
            return "other";
        } catch (error) {
            console.warn("[fuad] couldn't show the saved lineup:", error);
            state.stale = true;
            state.error = "Sent, but couldn't show what MFL kept. Reload to see it.";
        }
        return false;
    }

    // The message for the backups the member changed, null for none, or false when they can't be saved
    // (the error says why): a change to a pair whose deadline passed while the page was open goes back
    // to what stands, for Save to be pressed again
    function backupsToSave() {
        const backups = state.backups;
        // a lineup change alone isn't held up by backups it didn't touch; the job flags what doesn't fit
        if (samePairs(backups.open, backups.standing)) {
            return null;
        }
        const at = now();
        backups.facts = weekFacts(state.page, backups.kickoffs, backups.lastWeek);
        const problems = pairProblems(state.page, {open: backups.open, standing: backups.standing, on: state.on, team: backups.team, facts: backups.facts, now: at});
        if (problems.length) {
            const name = (id) => backups.facts.byId.get(id).name;
            state.error = `Not saved: ${problems.map((problem) => (problem.lockedAt ? `${name(problem.starter)}’s backup locked at ${lockText(problem.lockedAt)}`
                : problem.starter ? `${name(problem.starter)}’s backup ${problem.why}` : problem.why)).join("; ")}.`;
            for (const problem of problems.filter((each) => each.lockedAt)) {
                if (backups.standing.has(problem.starter)) {
                    backups.open.set(problem.starter, backups.standing.get(problem.starter));
                } else {
                    backups.open.delete(problem.starter);
                }
            }
            return false;
        }
        return backupMessage(backups.team, {open: backups.open, before: backups.standing, week: state.page.week, facts: backups.facts, now: at});
    }

    // Reads the backups back after a save that sent them: to check MFL kept them, or, when it kept
    // another lineup (`kept` false), to show what stands
    async function checkBackups(lineupChanged, kept) {
        const wanted = new Map(state.backups.open);
        try {
            await loadBackups();
        } catch (error) {
            // what stands is unknown, so backups wait for a reload; the lineup doesn't
            console.warn("[fuad] couldn't read the backups back:", error);
            clearTimeout(lockTimer);
            state.backups = null;
            if (kept) {
                state.saved = lineupChanged;
                state.error = "Saved, but the backups couldn’t be read back. Reload to see them.";
            }
            return;
        }
        if (!kept) {
            return;
        }
        if (!samePairs(state.backups.open, wanted)) {
            state.saved = lineupChanged;
            state.error = "Saved, but MFL doesn’t show the backups as sent. Reload to see them.";
            return;
        }
        state.saved = lineupChanged ? "both" : "backups";
    }

    mount.addEventListener("click", (event) => {
        const toggle = event.target.closest("[data-toggle]");
        if (toggle && !toggle.disabled && !state.saving && !state.stale) {
            const id = toggle.dataset.toggle;
            if (state.on.has(id)) {
                state.on.delete(id);
            } else {
                state.on.add(id);
            }
            state.saved = false;
            state.error = "";
            render();
            return;
        }
        const backup = event.target.closest("[data-backup]");
        if (backup && state.backups && !state.saving && !state.stale) {
            openSheet(backup.dataset.backup, backup);
            return;
        }
        const name = event.target.closest("[data-player]");
        if (name && typeof window.fuadOpenPlayer === "function") {
            window.fuadOpenPlayer(name.dataset.player, {opener: name});
            return;
        }
        if (event.target.closest(".fuad-save") && !state.saving && !state.stale) {
            state.saving = true;
            state.error = "";
            render();
            const lineupChanged = !sameLineup(state.on, state.base);
            (async () => {
                const message = state.backups ? backupsToSave() : null;
                if (message === false || (message === null && !lineupChanged)) {
                    return;
                }
                const kept = await saveLineup(message);
                if (kept && message !== null) {
                    await checkBackups(lineupChanged, kept === "kept");
                }
            })().catch((error) => {
                console.warn("[fuad] couldn't save:", error);
                state.error = `Not saved: ${error.message}.`;
            }).then(() => {
                state.saving = false;
                render();
            });
        }
    });

    // the week's injury report, for IR and suspensions MFL's one-letter column doesn't tell apart
    fetchExport(exportUrl(API_BASE, context.season, "injuries", {W: page.week}), "injuries", {fetchImpl: pageFetch})
        .then((report) => {
            state.report = asArray(report.injury);
            applyInjuries(state.page.players, state.report);
            render();
        })
        .catch((error) => console.warn("[fuad] couldn't read the injury report:", error));

    if (settings.backupStarters) {
        loadBackups().then(render, (error) => {
            console.warn("[fuad] couldn't read the backups:", error);
            state.backupError = `Backups couldn’t be read: ${error.message}.`;
            render();
        });
    }
}
