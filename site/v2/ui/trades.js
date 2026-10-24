// Moves › Trades: MFL's Trades page (`options?O=05`) and its proposal page (`O=05&FRANCHISE=<mine>,
// <theirs>`) with v2's screens over them. Answers post MFL's own answer form, Withdraw follows its
// revoke link, and a proposal posts its proposal form, each in place, then `pendingTrades` is read
// back before the page shows the result. MFL's forms stay in the page underneath; anything v2
// can't read leaves MFL's page.

import {API_BASE, exportUrl, fetchExport, weekKickoff} from "../lib/mfl.js";
import {ROSTER_MAX, TRADE_DEADLINE_WEEK} from "../lib/rules.js";
import {esc} from "./html.js";
import {pageFetch, waitLeft} from "./page-fetch.js";
import {placeholders} from "./panel.js";
import {
    Refused, WIDE, alertLine, capTone, doneLine, failedBox, failedLine, freshTrades, leaveFlash, limitsApply, loadData, money, movesPhase, refusal,
    rosterIds, send, takeFlash
} from "./moves.js";
import {teamState} from "./add-model.js";
import {dayText, whenText} from "./home-model.js";
import {contractYears} from "./rosters-model.js";
import {
    answerFields, assetList, assetView, bidsAfter, blockReason, ctParts, ctSeconds, deadlineWeek, expiresText,
    expiryChoices, findOffer, kickoffText, lockedText, offersOf, pickGroups, pickedSummary, proposalFields,
    readProposal, readTradesPage, rosterNotices, teamKickoffs, throughGames, tradeEffect
} from "./trades-model.js";

const FLASH_KEY = "fuad.tradesFlash";

const BACK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"></path></svg>';

const now = () => Math.floor(Date.now() / 1000);
// a line ending in a team's name: "Offer sent to Smooth City Styles!" takes no second stop
const stop = (text) => (/[.!?]$/.test(text) ? text : `${text}.`);

const activeTone = (count, limits) => (limits && count > ROSTER_MAX ? "fuad-caution" : "");

// The week's games and the deadline, from the NFL schedule (kept a day): the kickoffs of this week
// and next, each NFL team's this week, and the deadline's kickoff
async function loadGames(context, calendar) {
    const week = Number(window.liveScoringWeek) || 0;
    const schedule = (w) => fetchExport(exportUrl(API_BASE, context.season, "nflSchedule", {W: w}), "nflSchedule", {fetchImpl: pageFetch}).catch(() => null);
    const [thisWeek, nextWeek, deadline] = await Promise.all([
        week ? schedule(week) : null,
        week ? schedule(week + 1) : null,
        weekKickoff(context.season, deadlineWeek(calendar, TRADE_DEADLINE_WEEK), {fetchImpl: pageFetch}).catch(() => null)
    ]);
    const teams = teamKickoffs(thisWeek);
    return {teams, all: [...teams.values(), ...teamKickoffs(nextWeek).values()], deadline: deadline ? deadline.getTime() / 1000 : null};
}

export async function drawTrades({context, franchiseId, loginHref, addHref}) {
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
    const nameOf = (id) => names().get(id) || "another team";
    const phase = () => movesPhase(state.data.facts);
    const limits = () => limitsApply(state.data.facts, state.data.calendar, now() * 1000);
    const offers = () => offersOf(state.data.fresh.pendingTrades, franchiseId);
    const view = (id, holder) => assetView(id, {league: state.data.league, mflNames: state.data.mflNames, holder, names: names(), season: context.season});
    const team = () => teamState(state.data.league, franchiseId, state.data.groups);
    const closed = () => phase() === "season" && state.games.deadline && now() >= state.games.deadline;

    // ---- pieces both screens use ----

    function statusMarkup() {
        return [
            state.done ? doneLine(state.done) : "",
            state.note ? `<p class="fuad-trades-notice fuad-trades-plain" role="status">${esc(state.note)}</p>` : "",
            state.error ? alertLine(state.error) : ""
        ].join("");
    }

    const notice = (head, text, tone = "caution") => `<p class="fuad-trades-notice fuad-trades-${tone}"><strong>${esc(head)}</strong> ${text}</p>`;

    function bidsNotice(effect, give) {
        const risk = bidsAfter(team(), effect, give);
        if (!risk) {
            return "";
        }
        const what = [risk.cap ? `take you over the cap (${money(risk.cap)})` : "", risk.roster ? `${risk.cap ? "to" : "make"} ${risk.roster} active` : ""].filter(Boolean).join(" and ");
        return notice("Your pending bids:", `after this trade they could ${esc(what)}, and would all be voided. <a href="${esc(addHref)}">${risk.cap ? "Lower" : "Change"} them in Add</a> first.`);
    }

    function failedMarkup() {
        return `${statusMarkup()}${failedBox("your cap", state.failed)}`;
    }

    // a player opens the popup: on phones his whole line, on desktop his name
    function assetLine(asset) {
        if (asset.pick || !asset.player) {
            return `<div class="fuad-trades-asset"><span class="fuad-trades-name">${esc(asset.name)}</span>${asset.meta ? `<span class="fuad-meta">${esc(asset.meta)}</span>` : ""}</div>`;
        }
        const tag = asset.ir ? '<span class="fuad-tag">IR</span>' : "";
        return wide.matches
            ? `<div class="fuad-trades-asset"><span><button type="button" class="fuad-trades-name fuad-trades-link" data-act="player" data-id="${esc(asset.id)}">${esc(asset.name)}</button>${tag}</span><span class="fuad-meta">${esc(asset.meta)}</span></div>`
            : `<button type="button" class="fuad-trades-asset" data-act="player" data-id="${esc(asset.id)}"><span><span class="fuad-trades-name">${esc(asset.name)}</span>${tag}</span><span class="fuad-meta">${esc(asset.meta)}</span></button>`;
    }

    // ---- the list ----

    function offerCard(offer) {
        const partnerName = nameOf(offer.partner);
        const gets = offer.get.map((id) => view(id, offer.partner));
        const gives = offer.give.map((id) => view(id, franchiseId));
        const effect = tradeEffect(state.data.league, {mine: franchiseId, theirs: offer.partner, give: offer.give, get: offer.get});
        const blocked = blockReason(effect, {partnerName, proposing: false});
        const answer = state.answer[offer.id] || null;
        const busy = state.busy === offer.id;
        const locked = lockedText(gets.concat(gives), state.games.teams, now());
        const soon = answer === "accept" ? kickoffText(gets.concat(gives), state.games.teams, now()) : null;
        const answers = [["accept", "Accept"], ["counter", "Counter"], ["reject", "Reject"]].map(([id, label]) =>
            `<button type="button" class="fuad-trades-choice" data-act="answer" data-id="${esc(offer.id)}" data-answer="${id}" aria-pressed="${answer === id}"${(id === "accept" && blocked) || (id === "counter" && closed()) || busy ? " disabled" : ""}>${label}</button>`).join("");
        const failure = state.failure[offer.id];
        return `<article class="fuad-trades-card" aria-label="Offer from ${esc(partnerName)}">
            ${state.stillOpen === offer.id ? `<div class="fuad-trades-notice fuad-trades-caution fuad-trades-open" role="alert"><span><strong>Your counter was sent,</strong> but this offer is still open.</span><button type="button" class="fuad-trades-quiet" data-act="reject-now" data-id="${esc(offer.id)}"${busy ? " disabled" : ""}>${busy ? "Rejecting…" : "Reject it"}</button></div>` : ""}
            <div class="fuad-trades-from"><span>From <strong>${esc(partnerName)}</strong></span>${offer.expires ? `<span>expires ${esc(expiresText(offer.expires))}</span>` : ""}</div>
            ${offer.comment ? `<p class="fuad-trades-comment">“${esc(offer.comment)}”</p>` : ""}
            <div class="fuad-trades-sides">
                <div><span class="fuad-label">You get</span>${gets.map(assetLine).join("") || '<span class="fuad-meta">Nothing</span>'}</div>
                <div><span class="fuad-label">You give</span>${gives.map(assetLine).join("") || '<span class="fuad-meta">Nothing</span>'}</div>
                <div class="fuad-trades-effect">
                    <span class="fuad-muted">Your cap used</span><span>${esc(money(effect.mine.cap.from))} → <strong class="${capTone(effect.mine.cap.to)}">${esc(money(effect.mine.cap.to))}</strong></span>
                    <span class="fuad-muted">Your active</span><span>${effect.mine.active.from} → <strong class="${activeTone(effect.mine.active.to, limits())}">${effect.mine.active.to}</strong></span>
                </div>
            </div>
            ${blocked ? notice("Blocked:", esc(blocked), "bad") : ""}
            ${limits() ? rosterNotices(effect, {partnerName, others: false}).map((item) => notice(item.head, esc(item.text))).join("") : ""}
            ${blocked ? "" : bidsNotice(effect, offer.give)}
            ${locked ? `<p class="fuad-trades-notice fuad-trades-plain"><strong>Locked:</strong> ${esc(locked)}</p>` : ""}
            <div class="fuad-trades-answer">
                <div class="fuad-trades-choices" role="group" aria-label="Your answer">${answers}</div>
                ${soon ? `<p class="fuad-trades-notice fuad-trades-caution" role="alert"><strong>Heads up:</strong> ${esc(soon)}</p>` : ""}
                ${answer && answer !== "counter" ? `<div class="fuad-trades-reply">
                    <label class="fuad-meta" for="fuad-reply-${esc(offer.id)}">Comment (optional)</label>
                    <textarea id="fuad-reply-${esc(offer.id)}" rows="2" data-act="comment" data-id="${esc(offer.id)}"${busy ? " disabled" : ""}>${esc(state.comment[offer.id] || "")}</textarea>
                    <button type="button" class="fuad-trades-go" data-act="send-answer" data-id="${esc(offer.id)}"${busy || (answer === "accept" && blocked) ? " disabled" : ""}>${busy ? (answer === "accept" ? "Accepting…" : "Rejecting…") : answer === "accept" ? "Accept trade" : "Reject trade"}</button>
                </div>` : ""}
                ${failure ? alertLine(failure) : ""}
            </div>
        </article>`;
    }

    function sentCard(offer) {
        const gives = offer.give.map((id) => view(id, franchiseId));
        const gets = offer.get.map((id) => view(id, offer.partner));
        const busy = state.busy === offer.id;
        const asking = state.asking === offer.id;
        const failure = state.failure[offer.id];
        return `<article class="fuad-trades-card fuad-trades-sent" aria-label="Offer to ${esc(nameOf(offer.partner))}">
            <span class="fuad-trades-from"><span>To <strong>${esc(nameOf(offer.partner))}</strong></span></span>
            <span class="fuad-trades-moves"><span><strong>You give</strong> ${esc(assetList(gives))}</span><span><strong>You get</strong> ${esc(assetList(gets))}</span>${offer.comment ? `<span class="fuad-meta">“${esc(offer.comment)}”</span>` : ""}</span>
            <span class="fuad-meta fuad-trades-expires">${offer.expires ? `expires ${esc(expiresText(offer.expires))}` : ""}</span>
            <span class="fuad-trades-withdraw">${asking
                ? `<span class="fuad-trades-ask">Withdraw this offer?</span><button type="button" class="fuad-trades-quiet" data-act="keep" data-id="${esc(offer.id)}"${busy ? " disabled" : ""}>Keep</button><button type="button" class="fuad-trades-go" data-act="withdraw" data-id="${esc(offer.id)}"${busy ? " disabled" : ""}>${busy ? "Withdrawing…" : "Withdraw"}</button>`
                : `<button type="button" class="fuad-trades-quiet" data-act="ask" data-id="${esc(offer.id)}">Withdraw</button>`}</span>
            ${failure ? alertLine(failure) : ""}
        </article>`;
    }

    function proposePanel() {
        const deadline = state.games.deadline;
        let inner;
        if (closed()) {
            inner = `<p class="fuad-trades-none">Closed since the deadline, ${esc(dayText(deadline))}. Trades reopen after the season.</p>`;
        } else {
            const partners = page.partners.filter((partner) => partner.id !== franchiseId && state.data.league.franchises.get(partner.id));
            inner = `<div class="fuad-trades-partners">${partners.map((partner) => {
                const used = state.data.league.franchises.get(partner.id).capTotal;
                return `<a class="fuad-trades-partner" href="${esc(proposeUrl(partner.id))}"><span>${esc(nameOf(partner.id))}</span><span class="fuad-trades-used ${capTone(used) || "fuad-muted"}">${esc(money(used))} used ›</span></a>`;
            }).join("")}</div>`;
        }
        const deadlineLine = phase() === "season" && deadline && !closed() ? `<span class="fuad-meta">Deadline ${esc(whenText(deadline))}</span>` : "";
        return `<section class="fuad-panel fuad-trades-panel" aria-labelledby="fuad-trades-propose">
            <div class="fuad-trades-head"><h2 id="fuad-trades-propose">Propose a trade</h2>${deadlineLine}</div>
            ${inner}
        </section>`;
    }

    function listMarkup() {
        const all = offers();
        const received = all.filter((offer) => offer.received);
        const sent = all.filter((offer) => !offer.received);
        return `${statusMarkup()}
            <section class="fuad-panel fuad-trades-panel" aria-labelledby="fuad-trades-to-you">
                <div class="fuad-trades-head"><h2 id="fuad-trades-to-you">Offers to you</h2>${received.length ? `<span class="fuad-meta">${received.length} waiting</span>` : ""}</div>
                ${received.map(offerCard).join("") || '<p class="fuad-trades-none">None waiting.</p>'}
            </section>
            <section class="fuad-panel fuad-trades-panel" aria-labelledby="fuad-trades-by-you">
                <div class="fuad-trades-head"><h2 id="fuad-trades-by-you">Your offers</h2></div>
                ${sent.map(sentCard).join("") || '<p class="fuad-trades-none">None pending.</p>'}
            </section>
            ${proposePanel()}`;
    }

    // ---- the proposal ----

    const mineAssets = () => proposal.mine.map((item) => view(item.id, franchiseId));
    const theirAssets = () => proposal.theirs.map((item) => view(item.id, proposal.partner));
    const chosen = (assets, set) => assets.filter((asset) => set.has(asset.id));

    function proposalCheck() {
        const give = [...state.give];
        const get = [...state.get];
        const partnerName = nameOf(proposal.partner);
        const effect = tradeEffect(state.data.league, {mine: franchiseId, theirs: proposal.partner, give, get});
        const blocked = blockReason(effect, {partnerName, proposing: true});
        return {effect, blocked, partnerName, give, get, empty: !give.length && !get.length};
    }

    function sideTable(assets, set, key) {
        return pickGroups(assets).map((group) => `<div class="fuad-trades-group">${esc(group.label)} · ${group.items.length}</div>
            ${group.items.map((asset) => {
                const box = `<input type="checkbox" data-act="tick" data-side="${key}" data-id="${esc(asset.id)}"${set.has(asset.id) ? " checked" : ""} aria-label="${esc(asset.name)}">`;
                const tag = asset.ir ? '<span class="fuad-tag">IR</span>' : "";
                const salary = asset.player && !asset.player.rfa ? money(asset.player.salary) : "";
                if (wide.matches) {
                    const name = asset.player
                        ? `<button type="button" class="fuad-trades-name fuad-trades-link" data-act="player" data-id="${esc(asset.id)}">${esc(asset.name)}</button>`
                        : `<span class="fuad-trades-name">${esc(asset.name)}</span>${asset.pick ? `<span class="fuad-meta">${esc(asset.meta)}</span>` : ""}`;
                    return `<div class="fuad-trades-pick-row${set.has(asset.id) ? " fuad-trades-on-row" : ""}">${box}<span class="fuad-trades-who">${name}${tag}</span>
                        <span class="fuad-muted">${esc(asset.player ? asset.player.team || "" : "")}</span>
                        <span class="fuad-num fuad-muted">${esc(asset.player ? contractYears(asset.player) : "")}</span>
                        <span class="fuad-num"><strong>${esc(salary)}</strong></span></div>`;
                }
                const meta = asset.player ? [asset.player.team, contractYears(asset.player)].filter(Boolean).join(" · ") : asset.meta;
                return `<label class="fuad-trades-pick-row${set.has(asset.id) ? " fuad-trades-on-row" : ""}">${box}<span class="fuad-trades-who"><span><span class="fuad-trades-name">${esc(asset.name)}</span>${tag}</span><span class="fuad-meta">${esc(meta)}</span></span><span class="fuad-num"><strong>${esc(salary)}</strong></span></label>`;
            }).join("")}`).join("");
    }

    const effectCell = (side) => ({
        cap: `${esc(money(side.cap.from))} → <strong class="${capTone(side.cap.to)}">${esc(money(side.cap.to))}</strong>`,
        active: `${side.active.from} → <strong class="${activeTone(side.active.to, limits())}">${side.active.to}</strong>`
    });

    function noticesMarkup(check) {
        if (check.blocked) {
            return notice("Blocked:", esc(check.blocked), "bad");
        }
        return [
            ...(limits() ? rosterNotices(check.effect, {partnerName: check.partnerName}) : []).map((item) => notice(item.head, esc(item.text))),
            bidsNotice(check.effect, check.give)
        ].join("");
    }

    function expiryMarkup() {
        const choices = expiryChoices({phase: phase(), kickoffs: state.games.all, mflDefault: proposal.expiry, now: now()});
        const parts = state.expires ? ctParts(state.expires) : null;
        const date = parts ? `${parts.year}-${String(parts.month + 1).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}` : "";
        const today = ctParts(now());
        const min = `${today.year}-${String(today.month + 1).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;
        const max = proposal.years.length ? `${Math.max(...proposal.years)}-12-31` : "";
        const hourLabel = (hour) => `${hour % 12 || 12}:00 ${hour < 12 ? "a.m." : "p.m."}`;
        const late = phase() === "season" && state.expires && throughGames({expires: state.expires, kickoffs: state.games.all, now: now()});
        return `<div class="fuad-trades-expiry">
            <span class="fuad-meta">Offer open until</span>
            ${choices.length > 1 ? `<div class="fuad-trades-chips" role="group" aria-label="Quick choices">${choices.map((choice) =>
                `<button type="button" class="fuad-chip" data-act="expiry" data-key="${choice.key}" aria-pressed="${state.expKey === choice.key}"${state.busy ? " disabled" : ""}>${esc(choice.name)}</button>`).join("")}</div>` : ""}
            <div class="fuad-trades-when">
                <label class="fuad-meta">Date<input type="date" data-act="date" value="${esc(date)}" min="${esc(min)}"${max ? ` max="${esc(max)}"` : ""}${state.busy ? " disabled" : ""}></label>
                <label class="fuad-meta">Time (CT)<select data-act="hour"${state.busy ? " disabled" : ""}>${Array.from({length: 24}, (_, hour) =>
                    `<option value="${hour}"${parts && parts.hour === hour ? " selected" : ""}>${hourLabel(hour)}</option>`).join("")}</select></label>
            </div>
            ${state.expires && state.expires <= now() ? '<p class="fuad-meta"><strong class="fuad-bad">Pick a later time:</strong> this one has passed.</p>' : ""}
            ${late ? `<p class="fuad-meta"><strong class="fuad-caution">Heads up:</strong> it can be accepted close to game time, which may leave little time to fix starting lineups.</p>` : ""}
        </div>`;
    }

    function sendMarkup(check) {
        const label = state.counter ? "Reject and counter" : "Propose trade";
        const off = Boolean(check.blocked) || check.empty || !state.expires || state.expires <= now() || Boolean(state.busy);
        return `${expiryMarkup()}
            <div class="fuad-trades-message">
                <label class="fuad-meta" for="fuad-trades-msg">Message (optional)</label>
                <textarea id="fuad-trades-msg" rows="2" data-act="message"${state.busy ? " disabled" : ""}>${esc(state.message)}</textarea>
                ${state.error ? alertLine(state.error) : ""}
                <button type="button" class="fuad-trades-go fuad-trades-send" data-act="send"${off ? " disabled" : ""}>${state.busy ? "Sending…" : label}</button>
            </div>`;
    }

    function deskProposal() {
        const check = proposalCheck();
        const mine = effectCell(check.effect.mine);
        const theirs = effectCell(check.effect.theirs);
        const gives = chosen(mineAssets(), state.give);
        const gets = chosen(theirAssets(), state.get);
        return `<div class="fuad-trades-title"><button type="button" class="fuad-trades-back" data-act="back" aria-label="Back">${BACK}</button><h2>${state.counter ? "Counter" : "Trade with"} ${esc(check.partnerName)}</h2></div>
            <section class="fuad-trades-bar${check.blocked ? " fuad-trades-bar-blocked" : ""}" aria-label="What it does">
                <div class="fuad-trades-bar-grid">
                    <span></span><span class="fuad-label">Cap used</span><span class="fuad-label">Active</span><span class="fuad-label">Moves</span>
                    <strong>You</strong><span class="fuad-trades-big">${mine.cap}</span><span class="fuad-trades-big">${mine.active}</span><span class="fuad-trades-soft">give ${esc(assetList(gives))}</span>
                    <strong>${esc(check.partnerName)}</strong><span class="fuad-trades-big">${theirs.cap}</span><span class="fuad-trades-big">${theirs.active}</span><span class="fuad-trades-soft">give ${esc(assetList(gets))}</span>
                </div>
                ${noticesMarkup(check)}
            </section>
            <div class="fuad-trades-two">
                ${[["You give", mineAssets(), state.give, "give"], ["You get", theirAssets(), state.get, "get"]].map(([title, assets, set, key]) => `<section class="fuad-panel fuad-trades-side" aria-label="${title}">
                    <div class="fuad-trades-head"><h3>${title}</h3><span class="fuad-meta">${esc(pickedSummary(chosen(assets, set)))}</span></div>
                    <div class="fuad-trades-pick-row fuad-trades-columns" aria-hidden="true"><span></span><span>Player</span><span>NFL</span><span class="fuad-num">Years</span><span class="fuad-num">Salary</span></div>
                    ${sideTable(assets, set, key)}
                </section>`).join("")}
            </div>
            <section class="fuad-panel fuad-trades-sendband" aria-label="Send">${sendMarkup(check)}</section>`;
    }

    function phoneBar(check, step) {
        const mine = effectCell(check.effect.mine);
        const theirs = effectCell(check.effect.theirs);
        const assets = step === "give" ? chosen(mineAssets(), state.give) : chosen(theirAssets(), state.get);
        return `<div class="fuad-trades-stepbar${check.blocked ? " fuad-trades-bar-blocked" : ""}">
            <div class="fuad-trades-bar-grid">
                <span class="fuad-muted">You</span><span>${mine.cap}</span><span>${mine.active} active</span>
                <span class="fuad-muted">${esc(check.partnerName)}</span><span>${theirs.cap}</span><span>${theirs.active} active</span>
            </div>
            ${check.blocked ? `<span class="fuad-trades-bar-why"><strong class="fuad-bad">Blocked:</strong> ${esc(check.blocked)}</span>` : ""}
            <div class="fuad-trades-bar-foot"><span class="fuad-muted">${esc(pickedSummary(assets))}</span><button type="button" class="fuad-trades-go" data-act="next">${state.editing ? "Done" : "Next"}</button></div>
        </div>`;
    }

    function phoneProposal() {
        const check = proposalCheck();
        const step = state.step;
        const kicker = `<p class="fuad-trades-kicker">${state.counter ? "Counter" : "Trade with"} ${esc(check.partnerName)} · step ${{give: 1, get: 2, review: 3}[step]} of 3</p>`;
        if (step !== "review") {
            const [assets, set] = step === "give" ? [mineAssets(), state.give] : [theirAssets(), state.get];
            return `${kicker}<section class="fuad-panel fuad-trades-side" aria-label="${step === "give" ? "You give" : "You get"}">${sideTable(assets, set, step)}</section>${phoneBar(check, step)}`;
        }
        const mine = effectCell(check.effect.mine);
        const theirs = effectCell(check.effect.theirs);
        const reviewSide = (title, assets, key) => `<div><div class="fuad-trades-review-head"><span class="fuad-label">${title}</span><button type="button" class="fuad-trades-quiet fuad-trades-edit" data-act="edit" data-step="${key}">Edit</button></div>
            ${assets.map(assetLine).join("") || '<span class="fuad-meta">Nothing</span>'}</div>`;
        return `${kicker}
            <section class="fuad-panel fuad-trades-review">${reviewSide("You give", chosen(mineAssets(), state.give), "give")}${reviewSide("You get", chosen(theirAssets(), state.get), "get")}</section>
            <section class="fuad-panel" aria-label="What it does">
                <div class="fuad-trades-table">
                    <span></span><span class="fuad-label">You</span><span class="fuad-label">${esc(check.partnerName)}</span>
                    <span class="fuad-muted">Cap used</span><span>${mine.cap}</span><span>${theirs.cap}</span>
                    <span class="fuad-muted">Active</span><span>${mine.active}</span><span>${theirs.active}</span>
                </div>
                ${noticesMarkup(check)}
            </section>
            <section class="fuad-panel fuad-trades-sendband">${sendMarkup(check)}</section>`;
    }

    // ---- drawing ----

    function render() {
        const active = document.activeElement;
        const acted = active && mount.contains(active) && active.dataset && active.dataset.act
            ? `[data-act="${active.dataset.act}"]${active.dataset.id ? `[data-id="${active.dataset.id}"]` : ""}${active.dataset.answer ? `[data-answer="${active.dataset.answer}"]` : ""}${active.dataset.key ? `[data-key="${active.dataset.key}"]` : ""}${active.dataset.step ? `[data-step="${active.dataset.step}"]` : ""}`
            : null;
        const caret = active && active.tagName === "TEXTAREA" ? [active.selectionStart, active.selectionEnd] : null;
        document.documentElement.classList.toggle("fuad-trades-barred", Boolean(proposal && state.data && !wide.matches && state.step !== "review"));
        if (!state.data) {
            mount.innerHTML = state.failed ? failedMarkup() : `<section class="fuad-panel">${placeholders(8)}</section>`;
            return;
        }
        if (!proposal) {
            mount.innerHTML = listMarkup();
        } else if (closed()) {
            mount.innerHTML = `<section class="fuad-panel fuad-trades-note"><span>Closed since the deadline, ${esc(dayText(state.games.deadline))}. Trades reopen after the season.</span><a class="fuad-button" href="${esc(listUrl)}">Trades</a></section>`;
        } else if (wide.matches) {
            if (window.fuadDetour) {
                window.fuadDetour(null);
            }
            mount.innerHTML = deskProposal();
        } else {
            if (window.fuadDetour) {
                window.fuadDetour({title: {give: "You give", get: "You get", review: state.editing ? "Edit" : "Review"}[state.step]});
            }
            mount.innerHTML = phoneProposal();
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
        if (proposal && state.depth > 0) {
            window.addEventListener("popstate", () => window.location.replace(listUrl), {once: true});
            window.history.go(-state.depth);
        } else {
            window.location.replace(listUrl);
        }
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
        const check = proposalCheck();
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
        state.step = entry.step;
        state.editing = entry.editing;
        state.depth = entry.depth || 0;
        if (state.data) {
            render();
        }
    });

    // ---- events ----

    mount.addEventListener("click", (event) => {
        const target = event.target.closest("[data-act]");
        if (!target || target.disabled || !mount.contains(target)) {
            return;
        }
        const act = target.dataset.act;
        const id = target.dataset.id;
        const offer = () => offers().find((entry) => entry.id === id);
        if (act === "retry") {
            load();
        } else if (act === "mfl") {
            standAside();
        } else if (act === "player") {
            if (window.fuadOpenPlayer) {
                window.fuadOpenPlayer(id, {opener: target});
            }
        } else if (act === "answer" && !state.busy) {
            const picked = target.dataset.answer;
            if (picked === "counter") {
                window.location.assign(`${proposeUrl(offer().partner)}#counter-${encodeURIComponent(id)}`);
                return;
            }
            state.answer[id] = state.answer[id] === picked ? null : picked;
            state.failure[id] = "";
            render();
        } else if (act === "send-answer") {
            answer(offer(), state.answer[id]);
        } else if (act === "reject-now") {
            answer(offer(), "reject");
        } else if (act === "ask") {
            state.asking = id;
            render();
        } else if (act === "keep") {
            state.asking = null;
            render();
        } else if (act === "withdraw") {
            withdraw(offer());
        } else if (act === "next") {
            if (state.editing) {
                window.history.back();
            } else {
                goStep(state.step === "give" ? "get" : "review");
            }
        } else if (act === "edit") {
            goStep(target.dataset.step, {editing: true});
        } else if (act === "back") {
            // the screen just left, or the Trades list when this page was opened directly
            if (document.referrer.startsWith(window.location.origin)) {
                window.history.back();
            } else {
                window.location.assign(listUrl);
            }
        } else if (act === "expiry" && !state.busy) {
            const choice = expiryChoices({phase: phase(), kickoffs: state.games.all, mflDefault: proposal.expiry, now: now()}).find((entry) => entry.key === target.dataset.key);
            if (choice) {
                state.expKey = choice.key;
                state.expires = choice.at;
                render();
            }
        } else if (act === "send") {
            propose();
        }
    });

    mount.addEventListener("change", (event) => {
        const target = event.target;
        const act = target.dataset && target.dataset.act;
        if (act === "tick") {
            const set = target.dataset.side === "give" ? state.give : state.get;
            if (target.checked) {
                set.add(target.dataset.id);
            } else {
                set.delete(target.dataset.id);
            }
            state.error = "";
            render();
        } else if (act === "date" || act === "hour") {
            const date = mount.querySelector("[data-act=date]").value.split("-").map(Number);
            const hour = Number(mount.querySelector("[data-act=hour]").value);
            const at = date.length === 3 ? ctSeconds({year: date[0], month: date[1] - 1, day: date[2], hour}) : null;
            if (at) {
                state.expires = at;
                state.expKey = null;
            }
            render();
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
        const choices = expiryChoices({phase: phase(), kickoffs: state.games.all, mflDefault: proposal.expiry, now: now()});
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
            state.data = await loadData(context, franchiseId, {more: ["pendingTrades"]});
            if (!state.data.league.franchises.get(franchiseId) || (proposal && !state.data.league.franchises.get(proposal.partner))) {
                throw new Error("the teams aren't in the rosters");
            }
            state.games = await loadGames(context, state.data.calendar);
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
