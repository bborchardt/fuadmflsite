// What Moves › Trades draws, as HTML, from `v`: the screen's state and what trades.js reads for it.
//   state       trades.js's state (data, games, failed, busy, done, error, note, stillOpen, answer,
//               comment, failure, asking, give, get, step, editing, expires, expKey, message, counter)
//   franchiseId, season; names: each team's name by id
//   proposal    the proposal page as readProposal reads it, or null on the Trades list
//   partners    the teams MFL's Trades page lists
//   now         seconds; phase: movesPhase; limits: whether the roster limits hold; closed: past
//               the deadline
//   wide        the desktop layout; addHref: Add's page; listUrl: the Trades list;
//               proposeUrl(partner): the proposal page with that team; teamHref(id): a team's page

import {ROSTER_MAX} from "../lib/rules.js";
import {ZONE} from "../lib/zone.js";
import {esc} from "./html.js";
import {placeholders} from "./panel.js";
import {alertLine, capTone, doneLine, failedBox} from "./moves.js";
import {teamState} from "./add-model.js";
import {dayText, whenText} from "./home-model.js";
import {contractYears} from "./rosters-model.js";
import {
    assetList, assetView, bidsAfter, blockReason, zoneParts, expiresText, expiryChoices, kickoffText, lockedText, offersOf, pickGroups, pickedSummary,
    rosterNotices, throughGames, tradeEffect
} from "./trades-model.js";
import {money} from "./format.js";

const BACK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"></path></svg>';

const activeTone = (count, limits) => (limits && count > ROSTER_MAX ? "fuad-caution" : "");

export const nameOf = (v, id) => v.names.get(id) || "another team";
export const offers = (v) => offersOf(v.state.data.fresh.pendingTrades, v.franchiseId);
const asset = (v, id, holder) => assetView(id, {league: v.state.data.league, mflNames: v.state.data.mflNames, holder, names: v.names, season: v.season});

// the proposal as ticked: what it does to both teams, and why it can't be sent
export function proposalCheck(v) {
    const give = [...v.state.give];
    const get = [...v.state.get];
    const partnerName = nameOf(v, v.proposal.partner);
    const effect = tradeEffect(v.state.data.league, {mine: v.franchiseId, theirs: v.proposal.partner, give, get});
    const blocked = blockReason(effect, {partnerName, proposing: true});
    return {effect, blocked, partnerName, give, get, empty: !give.length && !get.length};
}

// the expiry's quick choices
export const expiryOptions = (v) => expiryChoices({phase: v.phase, kickoffs: v.state.games.all, mflDefault: v.proposal.expiry, now: v.now});

// ---- pieces both screens use ----

export function statusMarkup(state) {
    return [
        state.done ? doneLine(state.done) : "",
        state.note ? `<p class="fuad-trades-notice fuad-trades-plain" role="status">${esc(state.note)}</p>` : "",
        state.error ? alertLine(state.error) : ""
    ].join("");
}

// before the data loads, or when it couldn't
export function loadingMarkup(state) {
    return state.failed ? `${statusMarkup(state)}${failedBox("your cap", state.failed)}` : `<section class="fuad-panel">${placeholders(8)}</section>`;
}

const notice = (head, text, tone = "caution") => `<p class="fuad-trades-notice fuad-trades-${tone}"><strong>${esc(head)}</strong> ${text}</p>`;

function bidsNotice(v, effect, give) {
    const risk = bidsAfter(teamState(v.state.data.league, v.franchiseId, v.state.data.groups), effect, give);
    if (!risk) {
        return "";
    }
    const what = [risk.cap ? `take you over the cap (${money(risk.cap)})` : "", risk.roster ? `${risk.cap ? "to" : "make"} ${risk.roster} active` : ""].filter(Boolean).join(" and ");
    return notice("Your pending bids:", `after this trade they could ${esc(what)}, and would all be voided. <a href="${esc(v.addHref)}">${risk.cap ? "Lower" : "Change"} them in Add</a> first.`);
}

// a player opens the popup: on phones his whole line, on desktop his name
function assetLine(v, item) {
    if (item.pick || !item.player) {
        return `<div class="fuad-trades-asset"><span class="fuad-trades-name">${esc(item.name)}</span>${item.meta ? `<span class="fuad-meta">${esc(item.meta)}</span>` : ""}</div>`;
    }
    const tag = item.ir ? '<span class="fuad-tag">IR</span>' : "";
    return v.wide
        ? `<div class="fuad-trades-asset"><span><button type="button" class="fuad-trades-name fuad-trades-link" data-act="player" data-id="${esc(item.id)}">${esc(item.name)}</button>${tag}</span><span class="fuad-meta">${esc(item.meta)}</span></div>`
        : `<button type="button" class="fuad-trades-asset" data-act="player" data-id="${esc(item.id)}"><span><span class="fuad-trades-name">${esc(item.name)}</span>${tag}</span><span class="fuad-meta">${esc(item.meta)}</span></button>`;
}

// ---- the list ----

function offerCard(v, offer) {
    const {state} = v;
    const partnerName = nameOf(v, offer.partner);
    const gets = offer.get.map((id) => asset(v, id, offer.partner));
    const gives = offer.give.map((id) => asset(v, id, v.franchiseId));
    const effect = tradeEffect(state.data.league, {mine: v.franchiseId, theirs: offer.partner, give: offer.give, get: offer.get});
    const blocked = blockReason(effect, {partnerName, proposing: false});
    const answer = state.answer[offer.id] || null;
    const busy = state.busy === offer.id;
    const locked = lockedText(gets.concat(gives), state.games.teams, v.now);
    const soon = answer === "accept" ? kickoffText(gets.concat(gives), state.games.teams, v.now) : null;
    const answers = [["accept", "Accept"], ["counter", "Counter"], ["reject", "Reject"]].map(([id, label]) =>
        `<button type="button" class="fuad-trades-choice" data-act="answer" data-id="${esc(offer.id)}" data-answer="${id}" aria-pressed="${answer === id}"${(id === "accept" && blocked) || (id === "counter" && v.closed) || busy ? " disabled" : ""}>${label}</button>`).join("");
    const failure = state.failure[offer.id];
    const line = (item) => assetLine(v, item);
    return `<article class="fuad-trades-card" aria-label="Offer from ${esc(partnerName)}">
    ${state.stillOpen === offer.id ? `<div class="fuad-trades-notice fuad-trades-caution fuad-trades-open" role="alert"><span><strong>Your counter was sent,</strong> but this offer is still open.</span><button type="button" class="fuad-trades-quiet" data-act="reject-now" data-id="${esc(offer.id)}"${busy ? " disabled" : ""}>${busy ? "Rejecting…" : "Reject it"}</button></div>` : ""}
    <div class="fuad-trades-from"><span>From <strong><a href="${esc(v.teamHref(offer.partner))}">${esc(partnerName)}</a></strong></span>${offer.expires ? `<span>expires ${esc(expiresText(offer.expires))}</span>` : ""}</div>
    ${offer.comment ? `<p class="fuad-trades-comment">“${esc(offer.comment)}”</p>` : ""}
    <div class="fuad-trades-sides">
        <div><span class="fuad-label">You get</span>${gets.map(line).join("") || '<span class="fuad-meta">Nothing</span>'}</div>
        <div><span class="fuad-label">You give</span>${gives.map(line).join("") || '<span class="fuad-meta">Nothing</span>'}</div>
        <div class="fuad-trades-effect">
            <span class="fuad-muted">Your cap used</span><span>${esc(money(effect.mine.cap.from))} → <strong class="${capTone(effect.mine.cap.to)}">${esc(money(effect.mine.cap.to))}</strong></span>
            <span class="fuad-muted">Your active</span><span>${effect.mine.active.from} → <strong class="${activeTone(effect.mine.active.to, v.limits)}">${effect.mine.active.to}</strong></span>
        </div>
    </div>
    ${blocked ? notice("Blocked:", esc(blocked), "bad") : ""}
    ${v.limits ? rosterNotices(effect, {partnerName, others: false}).map((item) => notice(item.head, esc(item.text))).join("") : ""}
    ${blocked ? "" : bidsNotice(v, effect, offer.give)}
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

function sentCard(v, offer) {
    const {state} = v;
    const gives = offer.give.map((id) => asset(v, id, v.franchiseId));
    const gets = offer.get.map((id) => asset(v, id, offer.partner));
    const busy = state.busy === offer.id;
    const asking = state.asking === offer.id;
    const failure = state.failure[offer.id];
    return `<article class="fuad-trades-card fuad-trades-sent" aria-label="Offer to ${esc(nameOf(v, offer.partner))}">
    <span class="fuad-trades-from"><span>To <strong><a href="${esc(v.teamHref(offer.partner))}">${esc(nameOf(v, offer.partner))}</a></strong></span></span>
    <span class="fuad-trades-moves"><span><strong>You give</strong> ${esc(assetList(gives))}</span><span><strong>You get</strong> ${esc(assetList(gets))}</span>${offer.comment ? `<span class="fuad-meta">“${esc(offer.comment)}”</span>` : ""}</span>
    <span class="fuad-meta fuad-trades-expires">${offer.expires ? `expires ${esc(expiresText(offer.expires))}` : ""}</span>
    <span class="fuad-trades-withdraw">${asking
        ? `<span class="fuad-trades-ask">Withdraw this offer?</span><button type="button" class="fuad-trades-quiet" data-act="keep" data-id="${esc(offer.id)}"${busy ? " disabled" : ""}>Keep</button><button type="button" class="fuad-trades-go" data-act="withdraw" data-id="${esc(offer.id)}"${busy ? " disabled" : ""}>${busy ? "Withdrawing…" : "Withdraw"}</button>`
        : `<button type="button" class="fuad-trades-quiet" data-act="ask" data-id="${esc(offer.id)}">Withdraw</button>`}</span>
    ${failure ? alertLine(failure) : ""}
</article>`;
}

function proposePanel(v) {
    const deadline = v.state.games.deadline;
    let inner;
    if (v.closed) {
        inner = `<p class="fuad-trades-none">Closed since the deadline, ${esc(dayText(deadline))}. Trades reopen after the season.</p>`;
    } else {
        const franchises = v.state.data.league.franchises;
        const partners = v.partners.filter((partner) => partner.id !== v.franchiseId && franchises.get(partner.id));
        inner = `<div class="fuad-trades-partners">${partners.map((partner) => {
            const used = franchises.get(partner.id).capTotal;
            return `<a class="fuad-trades-partner" href="${esc(v.proposeUrl(partner.id))}"><span>${esc(nameOf(v, partner.id))}</span><span class="fuad-trades-used ${capTone(used) || "fuad-muted"}">${esc(money(used))} used ›</span></a>`;
        }).join("")}</div>`;
    }
    const deadlineLine = v.phase === "season" && deadline && !v.closed ? `<span class="fuad-meta">Deadline ${esc(whenText(deadline))}</span>` : "";
    return `<section class="fuad-panel fuad-trades-panel" aria-labelledby="fuad-trades-propose">
    <div class="fuad-trades-head"><h2 id="fuad-trades-propose">Propose a trade</h2>${deadlineLine}</div>
    ${inner}
</section>`;
}

// the Trades list: offers to the member, the member's own, and the teams to propose to
export function listMarkup(v) {
    const all = offers(v);
    const received = all.filter((offer) => offer.received);
    const sent = all.filter((offer) => !offer.received);
    return `${statusMarkup(v.state)}
    <section class="fuad-panel fuad-trades-panel" aria-labelledby="fuad-trades-to-you">
        <div class="fuad-trades-head"><h2 id="fuad-trades-to-you">Offers to you</h2>${received.length ? `<span class="fuad-meta">${received.length} waiting</span>` : ""}</div>
        ${received.map((offer) => offerCard(v, offer)).join("") || '<p class="fuad-trades-none">None waiting.</p>'}
    </section>
    <section class="fuad-panel fuad-trades-panel" aria-labelledby="fuad-trades-by-you">
        <div class="fuad-trades-head"><h2 id="fuad-trades-by-you">Your offers</h2></div>
        ${sent.map((offer) => sentCard(v, offer)).join("") || '<p class="fuad-trades-none">None pending.</p>'}
    </section>
    ${proposePanel(v)}`;
}

// the proposal page past the deadline
export function closedMarkup(v) {
    return `<section class="fuad-panel fuad-trades-note"><span>Closed since the deadline, ${esc(dayText(v.state.games.deadline))}. Trades reopen after the season.</span><a class="fuad-button" href="${esc(v.listUrl)}">Trades</a></section>`;
}

// ---- the proposal ----

const mineAssets = (v) => v.proposal.mine.map((item) => asset(v, item.id, v.franchiseId));
const theirAssets = (v) => v.proposal.theirs.map((item) => asset(v, item.id, v.proposal.partner));
const chosen = (assets, set) => assets.filter((item) => set.has(item.id));

function sideTable(v, assets, set, key) {
    return pickGroups(assets, v.positions).map((group) => `<div class="fuad-trades-group">${esc(group.label)} · ${group.items.length}</div>
    ${group.items.map((item) => {
        const box = `<input type="checkbox" data-act="tick" data-side="${key}" data-id="${esc(item.id)}"${set.has(item.id) ? " checked" : ""} aria-label="${esc(item.name)}">`;
        const tag = item.ir ? '<span class="fuad-tag">IR</span>' : "";
        const salary = item.player && !item.player.rfa ? money(item.player.salary) : "";
        if (v.wide) {
            const name = item.player
                ? `<button type="button" class="fuad-trades-name fuad-trades-link" data-act="player" data-id="${esc(item.id)}">${esc(item.name)}</button>`
                : `<span class="fuad-trades-name">${esc(item.name)}</span>${item.pick ? `<span class="fuad-meta">${esc(item.meta)}</span>` : ""}`;
            return `<div class="fuad-trades-pick-row${set.has(item.id) ? " fuad-trades-on-row" : ""}">${box}<span class="fuad-trades-who">${name}${tag}</span>
                <span class="fuad-muted">${esc(item.player ? item.player.team || "" : "")}</span>
                <span class="fuad-num fuad-muted">${esc(item.player ? contractYears(item.player) : "")}</span>
                <span class="fuad-num"><strong>${esc(salary)}</strong></span></div>`;
        }
        const meta = item.player ? [item.player.team, contractYears(item.player)].filter(Boolean).join(" · ") : item.meta;
        return `<label class="fuad-trades-pick-row${set.has(item.id) ? " fuad-trades-on-row" : ""}">${box}<span class="fuad-trades-who"><span><span class="fuad-trades-name">${esc(item.name)}</span>${tag}</span><span class="fuad-meta">${esc(meta)}</span></span><span class="fuad-num"><strong>${esc(salary)}</strong></span></label>`;
    }).join("")}`).join("");
}

const effectCell = (v, side) => ({
    cap: `${esc(money(side.cap.from))} → <strong class="${capTone(side.cap.to)}">${esc(money(side.cap.to))}</strong>`,
    active: `${side.active.from} → <strong class="${activeTone(side.active.to, v.limits)}">${side.active.to}</strong>`
});

function noticesMarkup(v, check) {
    if (check.blocked) {
        return notice("Blocked:", esc(check.blocked), "bad");
    }
    return [
        ...(v.limits ? rosterNotices(check.effect, {partnerName: check.partnerName}) : []).map((item) => notice(item.head, esc(item.text))),
        bidsNotice(v, check.effect, check.give)
    ].join("");
}

const isoDate = (parts) => `${parts.year}-${String(parts.month + 1).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;

function expiryMarkup(v) {
    const {state} = v;
    const choices = expiryOptions(v);
    const parts = state.expires ? zoneParts(state.expires) : null;
    const date = parts ? isoDate(parts) : "";
    const min = isoDate(zoneParts(v.now));
    const max = v.proposal.years.length ? `${Math.max(...v.proposal.years)}-12-31` : "";
    const hourLabel = (hour) => `${hour % 12 || 12}:00 ${hour < 12 ? "a.m." : "p.m."}`;
    const late = v.phase === "season" && state.expires && throughGames({expires: state.expires, kickoffs: state.games.all, now: v.now});
    return `<div class="fuad-trades-expiry">
    <span class="fuad-meta">Offer open until</span>
    ${choices.length > 1 ? `<div class="fuad-trades-chips" role="group" aria-label="Quick choices">${choices.map((choice) =>
        `<button type="button" class="fuad-chip" data-act="expiry" data-key="${choice.key}" aria-pressed="${state.expKey === choice.key}"${state.busy ? " disabled" : ""}>${esc(choice.name)}</button>`).join("")}</div>` : ""}
    <div class="fuad-trades-when">
        <label class="fuad-meta">Date<input type="date" data-act="date" value="${esc(date)}" min="${esc(min)}"${max ? ` max="${esc(max)}"` : ""}${state.busy ? " disabled" : ""}></label>
        <label class="fuad-meta">Time (${ZONE})<select data-act="hour"${state.busy ? " disabled" : ""}>${Array.from({length: 24}, (_, hour) =>
            `<option value="${hour}"${parts && parts.hour === hour ? " selected" : ""}>${hourLabel(hour)}</option>`).join("")}</select></label>
    </div>
    ${state.expires && state.expires <= v.now ? '<p class="fuad-meta"><strong class="fuad-bad">Pick a later time:</strong> this one has passed.</p>' : ""}
    ${late ? `<p class="fuad-meta"><strong class="fuad-caution">Heads up:</strong> it can be accepted close to game time, which may leave little time to fix starting lineups.</p>` : ""}
</div>`;
}

function sendMarkup(v, check) {
    const {state} = v;
    const label = state.counter ? "Reject and counter" : "Propose trade";
    const off = Boolean(check.blocked) || check.empty || !state.expires || state.expires <= v.now || Boolean(state.busy);
    return `${expiryMarkup(v)}
    <div class="fuad-trades-message">
        <label class="fuad-meta" for="fuad-trades-msg">Message (optional)</label>
        <textarea id="fuad-trades-msg" rows="2" data-act="message"${state.busy ? " disabled" : ""}>${esc(state.message)}</textarea>
        ${state.error ? alertLine(state.error) : ""}
        <button type="button" class="fuad-trades-go fuad-trades-send" data-act="send"${off ? " disabled" : ""}>${state.busy ? "Sending…" : label}</button>
    </div>`;
}

// the desktop's proposal: what it does, both sides' tables, and Send
export function deskProposal(v) {
    const {state} = v;
    const check = proposalCheck(v);
    const mine = effectCell(v, check.effect.mine);
    const theirs = effectCell(v, check.effect.theirs);
    const gives = chosen(mineAssets(v), state.give);
    const gets = chosen(theirAssets(v), state.get);
    return `<div class="fuad-trades-title"><button type="button" class="fuad-trades-back" data-act="back" aria-label="Back">${BACK}</button><h2>${state.counter ? "Counter" : "Trade with"} ${esc(check.partnerName)}</h2></div>
    <section class="fuad-trades-bar${check.blocked ? " fuad-trades-bar-blocked" : ""}" aria-label="What it does">
        <div class="fuad-trades-bar-grid">
            <span></span><span class="fuad-label">Cap used</span><span class="fuad-label">Active</span><span class="fuad-label">Moves</span>
            <strong>You</strong><span class="fuad-trades-big">${mine.cap}</span><span class="fuad-trades-big">${mine.active}</span><span class="fuad-trades-soft">give ${esc(assetList(gives))}</span>
            <strong>${esc(check.partnerName)}</strong><span class="fuad-trades-big">${theirs.cap}</span><span class="fuad-trades-big">${theirs.active}</span><span class="fuad-trades-soft">give ${esc(assetList(gets))}</span>
        </div>
        ${noticesMarkup(v, check)}
    </section>
    <div class="fuad-trades-two">
        ${[["You give", mineAssets(v), state.give, "give"], ["You get", theirAssets(v), state.get, "get"]].map(([title, assets, set, key]) => `<section class="fuad-panel fuad-trades-side" aria-label="${title}">
            <div class="fuad-trades-head"><h3>${title}</h3><span class="fuad-meta">${esc(pickedSummary(chosen(assets, set)))}</span></div>
            <div class="fuad-trades-pick-row fuad-trades-columns" aria-hidden="true"><span></span><span>Player</span><span>NFL</span><span class="fuad-num">Years</span><span class="fuad-num">Salary</span></div>
            ${sideTable(v, assets, set, key)}
        </section>`).join("")}
    </div>
    <section class="fuad-panel fuad-trades-sendband" aria-label="Send">${sendMarkup(v, check)}</section>`;
}

function phoneBar(v, check, step) {
    const {state} = v;
    const mine = effectCell(v, check.effect.mine);
    const theirs = effectCell(v, check.effect.theirs);
    const assets = step === "give" ? chosen(mineAssets(v), state.give) : chosen(theirAssets(v), state.get);
    return `<div class="fuad-trades-stepbar${check.blocked ? " fuad-trades-bar-blocked" : ""}">
    <div class="fuad-trades-bar-grid">
        <span class="fuad-muted">You</span><span>${mine.cap}</span><span>${mine.active} active</span>
        <span class="fuad-muted">${esc(check.partnerName)}</span><span>${theirs.cap}</span><span>${theirs.active} active</span>
    </div>
    ${check.blocked ? `<span class="fuad-trades-bar-why"><strong class="fuad-bad">Blocked:</strong> ${esc(check.blocked)}</span>` : ""}
    <div class="fuad-trades-bar-foot"><span class="fuad-muted">${esc(pickedSummary(assets))}</span><button type="button" class="fuad-trades-go" data-act="next">${state.editing ? "Done" : "Next"}</button></div>
</div>`;
}

// the phone's proposal, a step at a time: give, get, review
export function phoneProposal(v) {
    const {state} = v;
    const check = proposalCheck(v);
    const step = state.step;
    const kicker = `<p class="fuad-trades-kicker">${state.counter ? "Counter" : "Trade with"} ${esc(check.partnerName)} · step ${{give: 1, get: 2, review: 3}[step]} of 3</p>`;
    if (step !== "review") {
        const [assets, set] = step === "give" ? [mineAssets(v), state.give] : [theirAssets(v), state.get];
        return `${kicker}<section class="fuad-panel fuad-trades-side" aria-label="${step === "give" ? "You give" : "You get"}">${sideTable(v, assets, set, step)}</section>${phoneBar(v, check, step)}`;
    }
    const mine = effectCell(v, check.effect.mine);
    const theirs = effectCell(v, check.effect.theirs);
    const reviewSide = (title, assets, key) => `<div><div class="fuad-trades-review-head"><span class="fuad-label">${title}</span><button type="button" class="fuad-trades-quiet fuad-trades-edit" data-act="edit" data-step="${key}">Edit</button></div>
    ${assets.map((item) => assetLine(v, item)).join("") || '<span class="fuad-meta">Nothing</span>'}</div>`;
    return `${kicker}
    <section class="fuad-panel fuad-trades-review">${reviewSide("You give", chosen(mineAssets(v), state.give), "give")}${reviewSide("You get", chosen(theirAssets(v), state.get), "get")}</section>
    <section class="fuad-panel" aria-label="What it does">
        <div class="fuad-trades-table">
            <span></span><span class="fuad-label">You</span><span class="fuad-label">${esc(check.partnerName)}</span>
            <span class="fuad-muted">Cap used</span><span>${mine.cap}</span><span>${theirs.cap}</span>
            <span class="fuad-muted">Active</span><span>${mine.active}</span><span>${theirs.active}</span>
        </div>
        ${noticesMarkup(v, check)}
    </section>
    <section class="fuad-panel fuad-trades-sendband">${sendMarkup(v, check)}</section>`;
}

// the phone's title for a step
export const stepTitle = (state) => ({give: "You give", get: "You get", review: state.editing ? "Edit" : "Review"}[state.step]);

// the control a redraw gives focus back to: what it does and what it acts on
const NAMED_BY = ["id", "answer", "key", "step"];
export const controlSelector = (dataset) => `[data-act="${dataset.act}"]${NAMED_BY.filter((name) => dataset[name]).map((name) => `[data-${name}="${dataset[name]}"]`).join("")}`;
