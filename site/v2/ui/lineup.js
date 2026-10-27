// Lineup: MFL's Submit Lineup page, drawn over its own form. A tap sets MFL's checkbox; Save posts
// MFL's form in place, then reads MFL's page back to confirm what it kept. MFL's form stays in the
// page underneath, so its hidden fields go with every save.

import {API_BASE, asArray, exportUrl, fetchExport} from "../lib/mfl.js";
import {esc} from "./html.js";
import {forget, mflFetch, pageFetch} from "./page-fetch.js";
import {placeholders} from "./panel.js";
import {draftPicked, seasonFacts} from "./context.js";
import {
    applyInjuries, lineupForm, lineupStatus, lineupWarnings, rangeText, readLineupPage, sameLineup, tagOf
} from "./lineup-model.js";

const CHECK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"></path></svg>';

const pts = (value) => (value === null ? "—" : value.toFixed(1));

function tag(player) {
    const found = tagOf(player);
    return found ? `<span class="fuad-tag fuad-tag-${found.tone}">${esc(found.text)}</span>` : "";
}

const oppText = (player) => (player.onBye ? "bye week" : player.opp);

function phoneRow(player, on) {
    const starting = on.has(player.id);
    return `<div class="fuad-lineup-row">
        <button type="button" class="fuad-lineup-toggle" data-toggle="${esc(player.id)}" aria-pressed="${starting}" aria-label="Start ${esc(player.name)}"${player.locked ? " disabled" : ""}>
            <span class="fuad-check" aria-hidden="true">${CHECK}</span>
        </button>
        <button type="button" class="fuad-lineup-open" data-player="${esc(player.id)}" aria-haspopup="dialog">
            <span class="fuad-lineup-who">
                <span class="fuad-lineup-name"><span>${esc(player.name)}</span>${tag(player)}</span>
                <span class="fuad-meta">${esc([player.nfl, oppText(player)].filter(Boolean).join(" · "))}</span>
            </span>
        </button>
        <span class="fuad-lineup-proj"><span class="${player.proj ? "" : "fuad-muted"}">${esc(pts(player.proj || 0))}</span><span class="fuad-meta">proj</span></span>
    </div>`;
}

function deskRow(player, on) {
    const starting = on.has(player.id);
    return `<div class="fuad-lineup-line${starting ? " fuad-lineup-starting" : ""}" role="row">
        <span role="cell"><button type="button" class="fuad-check" data-toggle="${esc(player.id)}" aria-pressed="${starting}" aria-label="Start ${esc(player.name)}"${player.locked ? " disabled" : ""}>${CHECK}</button></span>
        <span role="cell" class="fuad-lineup-name"><button type="button" class="fuad-name" data-player="${esc(player.id)}">${esc(player.name)}</button>${tag(player)}</span>
        <span role="cell" class="fuad-num fuad-lineup-projected${player.proj ? "" : " fuad-muted"}">${esc(pts(player.proj || 0))}</span>
        <span role="cell" class="fuad-mid fuad-muted">${esc(player.nfl)}</span>
        <span role="cell" class="fuad-muted">${esc(player.onBye ? "Bye week" : player.opp)}</span>
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

function draw(mount, state) {
    const {page, on, base, irHref} = state;
    const status = lineupStatus(page, on);
    const warnings = lineupWarnings(page.players, on);
    const changed = !sameLineup(on, base);
    const canSave = status.ok && changed && !state.saving && !state.stale;
    const byPos = groups(page, on, status);
    const week = (href, label, arrow) => (href
        ? `<a class="fuad-week-step" href="${esc(href)}" aria-label="${label}">${arrow}</a>`
        : `<span class="fuad-week-step" aria-hidden="true">${arrow}</span>`);
    mount.innerHTML = `
    <div class="fuad-week-picker">${week(page.prev, "Previous week", "‹")}<span class="fuad-week-now">Week ${page.week}</span>${week(page.next, "Next week", "›")}</div>
    ${state.saved && !changed ? `<p class="fuad-lineup-saved" role="status">${CHECK}Lineup saved.</p>` : ""}
    ${state.error ? `<p class="fuad-lineup-problems" role="alert">${esc(state.error)}</p>` : ""}
    ${warnings.length ? `<section class="fuad-lineup-problems" role="alert" aria-label="Lineup problems">${warnings.map((w) => `<span><strong>${esc(w.name)}</strong> ${esc(w.why)}</span>`).join("")}</section>` : ""}
    <section class="fuad-panel fuad-lineup-list" aria-label="Your roster">
        ${byPos.map((group) => `<div class="fuad-band">${group.head}</div>${group.players.map((player) => phoneRow(player, on)).join("")}`).join("")}
    </section>
    <section class="fuad-panel fuad-lineup-table" aria-label="Your roster">
        <div class="fuad-table-scroll"><div class="fuad-lineup-grid" role="table" aria-label="Your roster">
            <div class="fuad-lineup-line fuad-lineup-columns" role="row"><span role="columnheader">Start</span><span role="columnheader">Player</span><span role="columnheader" class="fuad-num">Proj</span><span role="columnheader" class="fuad-mid">NFL</span><span role="columnheader">Opponent</span><span role="columnheader" class="fuad-num">Opp rank</span><span role="columnheader" class="fuad-num">YTD</span><span role="columnheader" class="fuad-num">Avg</span></div>
            ${byPos.map((group) => `<div class="fuad-lineup-band" role="row"><span role="cell" class="fuad-band">${group.head}</span></div>${group.players.map((player) => deskRow(player, on)).join("")}`).join("")}
        </div></div>
    </section>
    ${page.ir.length ? `<p class="fuad-lineup-ir fuad-meta">On IR: ${esc(page.ir.join(", "))} · <a href="${esc(irHref)}">Manage IR</a></p>` : ""}
    <section class="fuad-save-bar" aria-label="Save">
        <span class="fuad-save-count${status.starting === page.total ? "" : " fuad-bad"}">${status.starting} of ${page.total} starting</span>
        <span class="fuad-save-line${status.ok ? " fuad-muted" : " fuad-bad"}">${esc(status.line)}</span>
        <button type="button" class="fuad-save"${canSave ? "" : " disabled"}>${state.saving ? "Saving…" : changed ? "Save lineup" : "Saved"}</button>
    </section>`;
}

const startersOf = (page) => new Set(page.players.filter((player) => player.starter).map((player) => player.id));

// MFL's lineup form in `html` for `week`, or null
function formIn(html, week) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const found = readLineupPage(doc);
    return found && found.week === week ? lineupForm(doc) : null;
}

// Posts MFL's form and resolves to MFL's form as it then stands, from the answer when that's the
// week's lineup page, else read back. A failed post rejects with `sent: false`; a post that went but
// couldn't be checked, with `sent: true`.
async function save(context, form, state) {
    for (const player of state.page.players) {
        if (!player.locked) {
            player.box.checked = state.on.has(player.id);
        }
    }
    // the same fields MFL's own Submit Lineup sends, a started starter's hidden input among them
    const fields = new URLSearchParams(new FormData(form));
    fields.set("SUBMIT", "Submit Lineup");
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

export async function drawLineup({context, franchiseId, irHref}) {
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
    // `stale`: a save went but couldn't be checked, so the form underneath may be out of date
    const state = {page, on: startersOf(page), base: startersOf(page), irHref, report: null, saved: false, saving: false, stale: false, error: ""};
    const render = () => {
        const focused = document.activeElement && mount.contains(document.activeElement) ? document.activeElement : null;
        const key = focused && ["toggle", "player"].find((name) => focused.dataset[name]);
        const again = key ? `[data-${key}="${CSS.escape(focused.dataset[key])}"].${focused.classList[0]}` : focused && focused.classList.contains("fuad-save") ? ".fuad-save" : null;
        draw(mount, state);
        const target = again && mount.querySelector(again);
        if (target) {
            target.focus();
        }
    };
    render();

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
        const name = event.target.closest("[data-player]");
        if (name && typeof window.fuadOpenPlayer === "function") {
            window.fuadOpenPlayer(name.dataset.player, {opener: name});
            return;
        }
        if (event.target.closest(".fuad-save") && !state.saving && !state.stale) {
            state.saving = true;
            state.error = "";
            render();
            save(context, form, state).then((fresh) => {
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
                } else {
                    state.on = new Set(kept);
                    state.error = sameLineup(kept, before) ? "Not saved: MFL kept the lineup below." : "Saved, but MFL kept the lineup below.";
                }
            }, (error) => {
                console.warn("[fuad] couldn't save the lineup:", error);
                state.stale = error.sent;
                state.error = error.sent ? `Sent, but couldn't check what MFL kept (${error.message}). Reload to see it.` : `Not saved: ${error.message}.`;
            }).catch((error) => {
                console.warn("[fuad] couldn't show the saved lineup:", error);
                state.stale = true;
                state.error = "Sent, but couldn't show what MFL kept. Reload to see it.";
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
}
