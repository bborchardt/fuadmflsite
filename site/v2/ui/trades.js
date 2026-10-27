// Moves › Trades: MFL's Trades page (`options?O=05`) and its proposal page (`O=05&FRANCHISE=<mine>,
// <theirs>`) with v2's screens over them. Answers post MFL's own answer form, Withdraw follows its
// revoke link, and a proposal posts its proposal form, each in place, then `pendingTrades` is read
// back before the page shows the result. MFL's forms stay in the page underneath; anything v2
// can't read leaves MFL's page.

import {API_BASE, exportUrl, fetchExport} from "../lib/mfl.js";
import {TRADE_DEADLINE_WEEK} from "../lib/rules.js";
import {kickoffAt} from "./context.js";
import {esc} from "./html.js";
import {pageFetch, waitLeft} from "./page-fetch.js";
import {placeholders} from "./panel.js";
import {
    Refused, WIDE, failedLine, freshTrades, leaveFlash, limitsApply, loadData, movesPhase, refusal, rosterIds, send, takeFlash
} from "./moves.js";
import {
    answerFields, zoneSeconds, deadlineWeek, findOffer, offersOf, proposalFields, readProposal, readTradesPage, teamKickoffs
} from "./trades-model.js";
import {
    closedMarkup, controlSelector, deskProposal, expiryOptions, listMarkup, loadingMarkup, phoneProposal, proposalCheck, stepTitle
} from "./trades-view.js";
import {replaceEntry} from "./dialog.js";

const FLASH_KEY = "fuad.tradesFlash";

const now = () => Math.floor(Date.now() / 1000);
// a line ending in a team's name: "Offer sent to Smooth City Styles!" takes no second stop
const stop = (text) => (/[.!?]$/.test(text) ? text : `${text}.`);

// The week's games and the deadline, from the NFL schedule (kept a day): the kickoffs of this week
// and next, each NFL team's this week, and the deadline's kickoff
async function loadGames(context, calendar) {
    const week = Number(window.liveScoringWeek) || 0;
    const schedule = (w) => fetchExport(exportUrl(API_BASE, context.season, "nflSchedule", {W: w}), "nflSchedule", {fetchImpl: pageFetch}).catch(() => null);
    const [thisWeek, nextWeek, deadline] = await Promise.all([
        week ? schedule(week) : null,
        week ? schedule(week + 1) : null,
        kickoffAt(context.season, deadlineWeek(calendar, TRADE_DEADLINE_WEEK)).catch(() => null)
    ]);
    const teams = teamKickoffs(thisWeek);
    return {teams, all: [...teams.values(), ...teamKickoffs(nextWeek).values()], deadline};
}

export async function drawTrades({context, franchiseId, loginHref, addHref, teamHref}) {
    const body = document.querySelector(".pagebody");
    if (!body) {
        return;
    }
    const mount = document.createElement("div");
    mount.id = "fuad-trades";
    const show = () => {
        body.prepend(mount);
        document.documentElement.classList.add("fuad-trades-on");
    };
    const standAside = () => {
        mount.remove();
        document.documentElement.classList.remove("fuad-trades-on", "fuad-trades-barred");
        if (window.fuadDetour) {
            window.fuadDetour(null);
        }
    };
    if (!franchiseId) {
        mount.innerHTML = `<section class="fuad-panel fuad-trades-note"><span>Log in to make moves</span><a class="fuad-button" href="${esc(loginHref)}">Log in</a></section>`;
        show();
        return;
    }
    // the commissioner's view stays MFL's
    if (franchiseId === "0000") {
        return;
    }
    const proposal = readProposal(document, franchiseId);
    const page = readTradesPage(document);
    const asked = new URLSearchParams(window.location.search).get("FRANCHISE");
    // not the page v2 knows (MFL changed it, or another team's): MFL's own page, restyled
    if (asked ? !proposal : !page.partners.length) {
        standAside();
        return;
    }
    mount.innerHTML = `<section class="fuad-panel">${placeholders(8)}</section>`;
    show();

    const wide = window.matchMedia(WIDE);
    const flash = takeFlash(FLASH_KEY);
    const listUrl = `${window.location.origin}/${context.season}/options?L=${encodeURIComponent(context.leagueId)}&O=05`;
    const proposeUrl = (partner) => `${listUrl}&FRANCHISE=${franchiseId},${partner}`;
    const state = {
        data: null, games: null, failed: false, busy: null,
        done: flash.done || "", error: flash.error || "", note: flash.note || "", stillOpen: flash.stillOpen || null,
        // the list: each offer's answer, comment and failure; which offer asks "Withdraw?"
        answer: {}, comment: {}, failure: {}, asking: null,
        // the proposal
        give: new Set(), get: new Set(), step: "give", editing: false, depth: 0, expires: null, expKey: null, message: "", counter: null
    };

    const names = () => new Map([...state.data.league.franchises.values()].map((team) => [team.franchiseId, String(team.teamName || "").trim()]));
    const phase = () => movesPhase(state.data.facts);
    const closed = () => phase() === "season" && state.games.deadline && now() >= state.games.deadline;

    // ---- what's drawn: the state, and what trades-view.js reads with it ----

    function view() {
        return {
            state, franchiseId, season: context.season, names: names(), positions: state.data.positions, proposal, partners: page.partners, now: now(), phase: phase(),
            limits: limitsApply(state.data, now() * 1000), closed: closed(), wide: wide.matches, addHref, listUrl, proposeUrl, teamHref
        };
    }
    const nameOf = (id) => names().get(id) || "another team";
    const offers = () => offersOf(state.data.fresh.pendingTrades, franchiseId);

    function render() {
        const active = document.activeElement;
        const acted = active && mount.contains(active) && active.dataset && active.dataset.act ? controlSelector(active.dataset) : null;
        const caret = active && active.tagName === "TEXTAREA" ? [active.selectionStart, active.selectionEnd] : null;
        document.documentElement.classList.toggle("fuad-trades-barred", Boolean(proposal && state.data && !wide.matches && state.step !== "review"));
        if (!state.data) {
            mount.innerHTML = loadingMarkup(state);
            return;
        }
        const v = view();
        if (!proposal) {
            mount.innerHTML = listMarkup(v);
        } else if (v.closed) {
            mount.innerHTML = closedMarkup(v);
        } else if (wide.matches) {
            if (window.fuadDetour) {
                window.fuadDetour(null);
            }
            mount.innerHTML = deskProposal(v);
        } else {
            if (window.fuadDetour) {
                window.fuadDetour({title: stepTitle(state)});
            }
            mount.innerHTML = phoneProposal(v);
        }
        const again = acted && mount.querySelector(acted);
        if (again && !again.disabled) {
            again.focus({preventScroll: true});
            if (caret && again.setSelectionRange) {
                again.setSelectionRange(...caret);
            }
        }
    }

    // ---- moves ----

    // Back to the proposal page's own entry first, so Back from the result leaves it rather than
    // landing on a finished proposal's steps
    const reloadList = (next) => {
        leaveFlash(FLASH_KEY, next);
        replaceEntry(listUrl, proposal ? state.depth : 0);
    };

    // after a failure: if MFL's trades changed anyway, the page reloads to show them
    // `what` names the move for its failure line: "accept the offer from Kings"
    async function failed(error, {sent, read, offerId = null, what}) {
        console.warn("[fuad] trade move failed:", error);
        let message = failedLine(what, error);
        const after = await freshTrades(context).then((found) => offersOf(found, franchiseId)).catch(() => null);
        const ids = (list) => list.map((offer) => offer.id).sort().join();
        if (after && ids(after) !== ids(offers())) {
            // sent but not confirmed: the change may be this move's own
            reloadList(sent && !read ? {note: "Couldn't confirm the move: this is how MFL has your trades now."} : {error: failedLine(what, error, {changed: true})});
            return;
        }
        if (!after && sent && !read) {
            message = "Couldn't check whether MFL made it. Reload the page to see your trades.";
        }
        state.busy = null;
        if (offerId) {
            state.failure[offerId] = message;
        } else {
            state.error = message;
        }
        render();
    }

    const answerUrl = (offerId) => {
        const form = page.answers.get(offerId);
        return form ? form.action : `${window.location.origin}/${context.season}/trade_response`;
    };

    async function answer(offer, action) {
        if (state.busy) {
            return;
        }
        state.busy = offer.id;
        state.failure[offer.id] = "";
        state.done = "";
        render();
        let sent = false;
        let read = false;
        try {
            const reply = await send(answerUrl(offer.id), {method: "POST", body: answerFields(page.answers.get(offer.id), {tradeId: offer.id, leagueId: context.leagueId, action, comment: state.comment[offer.id] || ""})});
            sent = true;
            const after = offersOf(await freshTrades(context), franchiseId);
            read = true;
            if (after.some((other) => other.id === offer.id)) {
                throw new Refused(refusal(reply));
            }
            const partnerName = nameOf(offer.partner);
            if (action === "accept") {
                // gone from the pending trades but not on the roster: it expired or was withdrawn
                const players = offer.get.filter((id) => state.data.league.players.has(id));
                read = false;
                const roster = await rosterIds(context, franchiseId);
                if (!players.every((id) => roster.includes(id))) {
                    reloadList({error: failedLine(`accept the offer from ${partnerName}`, new Refused("it’s no longer open"))});
                    return;
                }
                reloadList({done: stop(`Trade with ${partnerName} accepted`)});
            } else {
                reloadList({done: stop(`Offer from ${partnerName} rejected`)});
            }
        } catch (error) {
            await failed(error, {sent, read, offerId: offer.id, what: `${action === "accept" ? "accept" : "reject"} the offer from ${nameOf(offer.partner)}`});
        }
    }

    async function withdraw(offer) {
        if (state.busy) {
            return;
        }
        state.busy = offer.id;
        state.failure[offer.id] = "";
        state.done = "";
        render();
        let sent = false;
        let read = false;
        try {
            const href = page.revokes.get(offer.id) || `${window.location.origin}/${context.season}/trade_response?L=${encodeURIComponent(context.leagueId)}&TRADE_ID=${encodeURIComponent(offer.id)}&ACTION=revoke`;
            const reply = await send(href, {method: "GET"});
            sent = true;
            const after = offersOf(await freshTrades(context), franchiseId);
            read = true;
            if (after.some((other) => other.id === offer.id)) {
                throw new Refused(refusal(reply));
            }
            reloadList({done: stop(`Offer to ${nameOf(offer.partner)} withdrawn`)});
        } catch (error) {
            await failed(error, {sent, read, offerId: offer.id, what: `withdraw your offer to ${nameOf(offer.partner)}`});
        }
    }

    // A counter sends the new offer first, then answers the original with MFL's counter (which
    // rejects it), so a failure can only leave the original open
    async function propose() {
        const check = proposalCheck(view());
        if (state.busy || check.blocked || check.empty || !state.expires || state.expires <= now()) {
            return;
        }
        state.busy = "send";
        state.error = "";
        render();
        let sent = false;
        let read = false;
        const known = new Set(offers().map((offer) => offer.id));
        try {
            const reply = await send(proposal.form.action, {method: "POST", body: proposalFields(proposal.form, {
                mine: franchiseId, partner: proposal.partner, give: check.give, get: check.get, expires: state.expires, message: state.message
            })});
            sent = true;
            const after = offersOf(await freshTrades(context), franchiseId);
            read = true;
            const made = findOffer(after.filter((offer) => !known.has(offer.id)), {partner: proposal.partner, give: check.give, get: check.get});
            if (!made) {
                throw new Refused(refusal(reply));
            }
            if (!state.counter) {
                reloadList({done: stop(`Offer sent to ${check.partnerName}`)});
                return;
            }
            const counter = state.counter;
            try {
                await send(answerUrl(counter), {method: "POST", body: answerFields(page.answers.get(counter), {tradeId: counter, leagueId: context.leagueId, action: "counter_proposal"})});
                const left = offersOf(await freshTrades(context), franchiseId);
                if (left.some((offer) => offer.id === counter)) {
                    throw new Error("still open");
                }
                reloadList({done: stop(`Counter sent to ${check.partnerName}`)});
            } catch (error) {
                console.warn("[fuad] the countered offer is still open:", error);
                reloadList({done: stop(`Counter sent to ${check.partnerName}`), stillOpen: counter});
            }
        } catch (error) {
            await failed(error, {sent, read, what: `send your ${state.counter ? "counter" : "offer"} to ${check.partnerName}`});
        }
    }

    // ---- phone steps: each a history entry, so Back returns to the one before ----

    function goStep(step, {editing = false} = {}) {
        const depth = state.depth + 1;
        window.history.pushState({fuadTrade: {step, editing, depth}}, "");
        state.step = step;
        state.editing = editing;
        state.depth = depth;
        render();
        window.scrollTo(0, 0);
    }

    window.addEventListener("popstate", (event) => {
        if (!proposal) {
            return;
        }
        const entry = (event.state && event.state.fuadTrade) || {step: "give", editing: false, depth: 0};
        // Back that only closed a dialog over this step
        if ((entry.depth || 0) === state.depth && entry.step === state.step && entry.editing === state.editing) {
            return;
        }
        state.step = entry.step;
        state.editing = entry.editing;
        state.depth = entry.depth || 0;
        if (state.data) {
            render();
        }
    });

    // ---- events ----

    // what each control does (its data-act), given the control and the offer it names
    const onClick = {
        retry: () => load(),
        mfl: () => standAside(),
        player: (target) => {
            if (window.fuadOpenPlayer) {
                window.fuadOpenPlayer(target.dataset.id, {opener: target});
            }
        },
        answer: (target, offer) => {
            if (state.busy) {
                return;
            }
            const {id, answer: picked} = target.dataset;
            if (picked === "counter") {
                window.location.assign(`${proposeUrl(offer().partner)}#counter-${encodeURIComponent(id)}`);
                return;
            }
            state.answer[id] = state.answer[id] === picked ? null : picked;
            state.failure[id] = "";
            render();
        },
        "send-answer": (target, offer) => answer(offer(), state.answer[target.dataset.id]),
        "reject-now": (target, offer) => answer(offer(), "reject"),
        ask: (target) => {
            state.asking = target.dataset.id;
            render();
        },
        keep: () => {
            state.asking = null;
            render();
        },
        withdraw: (target, offer) => withdraw(offer()),
        next: () => {
            if (state.editing) {
                window.history.back();
            } else {
                goStep(state.step === "give" ? "get" : "review");
            }
        },
        edit: (target) => goStep(target.dataset.step, {editing: true}),
        back: () => {
            // the screen just left, or the Trades list when this page was opened directly
            if (document.referrer.startsWith(window.location.origin)) {
                window.history.back();
            } else {
                window.location.assign(listUrl);
            }
        },
        expiry: (target) => {
            const choice = !state.busy && expiryOptions(view()).find((entry) => entry.key === target.dataset.key);
            if (choice) {
                state.expKey = choice.key;
                state.expires = choice.at;
                render();
            }
        },
        send: () => propose()
    };

    mount.addEventListener("click", (event) => {
        const target = event.target.closest("[data-act]");
        if (!target || target.disabled || !mount.contains(target) || !onClick[target.dataset.act]) {
            return;
        }
        onClick[target.dataset.act](target, () => offers().find((entry) => entry.id === target.dataset.id));
    });

    // the boxes and the expiry's date and hour
    const onChange = {
        tick: (target) => {
            const set = target.dataset.side === "give" ? state.give : state.get;
            if (target.checked) {
                set.add(target.dataset.id);
            } else {
                set.delete(target.dataset.id);
            }
            state.error = "";
            render();
        },
        date: () => pickTime(),
        hour: () => pickTime()
    };

    function pickTime() {
        const date = mount.querySelector("[data-act=date]").value.split("-").map(Number);
        const hour = Number(mount.querySelector("[data-act=hour]").value);
        const at = date.length === 3 ? zoneSeconds({year: date[0], month: date[1] - 1, day: date[2], hour}) : null;
        if (at) {
            state.expires = at;
            state.expKey = null;
        }
        render();
    }

    mount.addEventListener("change", (event) => {
        const act = event.target.dataset && event.target.dataset.act;
        if (onChange[act]) {
            onChange[act](event.target);
        }
    });

    mount.addEventListener("input", (event) => {
        const target = event.target;
        if (target.dataset.act === "comment") {
            state.comment[target.dataset.id] = target.value;
        } else if (target.dataset.act === "message") {
            state.message = target.value;
        }
    });

    wide.addEventListener("change", () => state.data && render());

    // the proposal opens pre-filled: a counter with the offer, seen from the member's side; a player
    // from Rosters' popup (`#player-<id>`) ticked
    function prefill() {
        const hash = window.location.hash;
        const mineIds = new Set(proposal.mine.map((item) => item.id));
        const theirIds = new Set(proposal.theirs.map((item) => item.id));
        const counter = (hash.match(/^#counter-(\d+)$/) || [])[1];
        const offer = counter && offers().find((entry) => entry.id === counter && entry.received && entry.partner === proposal.partner);
        if (offer) {
            state.counter = offer.id;
            offer.give.filter((id) => mineIds.has(id)).forEach((id) => state.give.add(id));
            offer.get.filter((id) => theirIds.has(id)).forEach((id) => state.get.add(id));
        }
        const player = (hash.match(/^#player-(\d+)$/) || [])[1];
        if (player && theirIds.has(player)) {
            state.get.add(player);
        } else if (player && mineIds.has(player)) {
            state.give.add(player);
        }
        const choices = expiryOptions(view());
        // the safer default in season: closed before Sunday's games; otherwise MFL's 7 days
        const first = choices.find((choice) => choice.key === "sunday") || choices.find((choice) => choice.key === "week");
        if (first) {
            state.expKey = first.key;
            state.expires = first.at;
        }
        window.history.replaceState({fuadTrade: {step: "give", editing: false, depth: 0}}, "");
    }

    async function load() {
        state.failed = false;
        render();
        try {
            const data = await loadData(context, franchiseId, {more: ["pendingTrades"]});
            if (!data.league.franchises.get(franchiseId) || (proposal && !data.league.franchises.get(proposal.partner))) {
                throw new Error("the teams aren't in the rosters");
            }
            // the screens read both, so neither is kept until both are in: a redraw meanwhile (Back,
            // a phone turned) still shows the placeholder
            state.games = await loadGames(context, data.calendar);
            state.data = data;
        } catch (error) {
            console.warn("[fuad] couldn't load Trades:", error);
            state.data = null;
            state.failed = error && error.status === 429 ? "busy" : true;
            // Retry comes back on when MFL's wait is over
            if (state.failed === "busy" && waitLeft()) {
                setTimeout(render, waitLeft());
            }
            render();
            return;
        }
        if (proposal && !state.expires) {
            prefill();
        }
        render();
    }
    load();
    return {standAside};
}
