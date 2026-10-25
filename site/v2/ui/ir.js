// Moves › IR: MFL's Injured Reserve page with v2's lists over it. Boxes pick moves to IR and
// activations, Pick a drop shows while activating needs one, and Save posts MFL's one form for them
// together, then reads the roster back before the page reloads to show it. MFL's form stays in the
// page underneath; anything v2 can't read leaves MFL's page.

import {API_BASE, exportUrl, fetchExport} from "../lib/mfl.js";
import {esc} from "./html.js";
import {pageFetch, waitLeft} from "./page-fetch.js";
import {placeholders} from "./panel.js";
import {Refused, WIDE, failedLine, leaveFlash, limitsApply, loadData, refusal, rosterStatuses, send, takeFlash} from "./moves.js";
import {teamState} from "./add-model.js";
import {checkIR, dropChoices, injuryReport, irBlockText, irFields, irGroups, movesText, readIRPage, rosterFromPage, savedMoves} from "./ir-model.js";
import {controlSelector, irMarkup, loadingMarkup, moveCount} from "./ir-view.js";
import {replaceEntry} from "./dialog.js";

const FLASH_KEY = "fuad.irFlash";
// reading the roster back after a save: how many times, and how far apart (MFL asks for about a
// second between requests)
const READS = 3;
const READ_GAP = 1500;

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

    // ---- drawing ----

    function render() {
        const active = document.activeElement;
        const acted = active && mount.contains(active) && active.dataset && active.dataset.act ? controlSelector(active.dataset) : null;
        if (!state.data) {
            mount.innerHTML = loadingMarkup(state);
            return;
        }
        mount.innerHTML = irMarkup({state, result: check(), groups: groups(), musts: musts(), team: team(), page, limits: limits(), wide: wide.matches, dropHref});
        const again = acted && mount.querySelector(acted);
        if (again && !again.disabled) {
            again.focus();
        }
    }

    // ---- saving ----

    // Shows the result after MFL's page reloads
    function reloadWith(next) {
        leaveFlash(FLASH_KEY, next);
        replaceEntry(window.location.pathname + window.location.search);
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
        if (state.busy || irBlockText(result) || !moveCount(result)) {
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

    // what each control does (its data-act)
    const onClick = {
        retry: () => load(),
        mfl: () => standAside(),
        save: () => save(),
        player: (target) => {
            if (window.fuadOpenPlayer) {
                window.fuadOpenPlayer(target.dataset.id, {opener: target});
            }
        }
    };

    mount.addEventListener("click", (event) => {
        const target = event.target.closest("[data-act]");
        if (!target || target.disabled || !mount.contains(target) || !onClick[target.dataset.act]) {
            return;
        }
        onClick[target.dataset.act](target);
    });

    // the boxes and Pick a drop's choices; none while a save is in flight
    const tick = (set) => (target) => {
        if (target.checked) {
            set.add(target.dataset.id);
        } else {
            set.delete(target.dataset.id);
        }
    };
    const onChange = {
        toIR: tick(state.toIR),
        activate: tick(state.activate),
        drop: (target) => {
            state.drop = target.dataset.id;
        }
    };

    mount.addEventListener("change", (event) => {
        const target = event.target;
        const act = target.dataset && target.dataset.act;
        if (state.busy || !onChange[act]) {
            return;
        }
        onChange[act](target);
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
