// Moves › Trades' data and checks, from MFL's trade pages (docs/mfl.md, Forms), `pendingTrades` and
// the league model: no DOM building here, so each can be checked against saved pages. A trade that
// puts either team over the cap is void (10.3), so it's blocked; the roster limits may be broken by
// a trade and fixed after (10.5), so they're notices.

import {GAME_HOURS, asArray} from "../lib/mfl.js";
import {projectBids} from "../lib/bids.js";
import {ROSTER_MAX, ROSTER_MIN, SALARY_CAP} from "../lib/rules.js";
import {POSITIONS, firstLast, isIR, projection, surname} from "./add-model.js";
import {clock, dayText} from "./home-model.js";
import {contractYears} from "./rosters-model.js";
import {cents, money} from "./format.js";

const CT = "America/Chicago";
const HOUR = 3600;
// how close to a traded player's kickoff accepting warns that lineups need fixing
export const KICKOFF_WARNING_HOURS = 3;

// ---- MFL's pages ----

const actionOf = (form) => String(form.getAttribute("action") || "");

// The Trades page (`options?O=05`): each offer's answer form by trade id, each of the member's
// offers' revoke link, and the teams to trade with. The answer forms open inside table rows, so
// their fields belong to them without being inside them (`form.elements`, not querySelector).
export function readTradesPage(doc) {
    const answers = new Map();
    for (const form of doc.querySelectorAll("form")) {
        if (/trade_response$/.test(actionOf(form)) && form.elements.TRADE_ID) {
            answers.set(String(form.elements.TRADE_ID.value), form);
        }
    }
    const revokes = new Map();
    for (const link of doc.querySelectorAll('a[href*="ACTION=revoke"]')) {
        const id = new URL(link.getAttribute("href"), doc.baseURI).searchParams.get("TRADE_ID");
        if (id) {
            revokes.set(id, link.href);
        }
    }
    const select = [...doc.querySelectorAll("select[name=FRANCHISE]")].find((node) => node.form && node.form.elements.OPTION && node.form.elements.OPTION.value === "05");
    const partners = select ? [...select.options].map((option) => ({id: option.value, name: option.textContent.trim()})) : [];
    return {answers, revokes, partners};
}

// "Year 2027 Round 1 Draft Pick from So your saying there’s a chance?"
const PICK_LABEL = /Year\s+(\d{4})\s+Round\s+(\d+)\s+Draft Pick from\s+(.+)$/i;

// The proposal page (`options?O=05&FRANCHISE=<mine>,<theirs>`): MFL's form and what it lets each
// side trade, as checkbox values (player ids and picks), and the expiry it fills in (its 7-day
// default). null when it isn't the page v2 knows, or not the member's.
export function readProposal(doc, franchiseId) {
    const form = [...doc.querySelectorAll("form")].find((node) => /trade_offer$/.test(actionOf(node)));
    const pair = form && form.elements.FRANCHISE_ID ? String(form.elements.FRANCHISE_ID.value).split(",") : [];
    if (!form || pair.length !== 2 || !pair.includes(franchiseId) || pair[0] === pair[1]) {
        return null;
    }
    const partner = pair.find((id) => id !== franchiseId);
    const side = (team) => [...doc.querySelectorAll(`input[type=checkbox][name="drop${team}"]`)]
        .filter((box) => box.form === form)
        .map((box) => {
            const row = box.closest("tr");
            const text = row ? row.textContent.replace(/\s+/g, " ").trim() : "";
            const pick = text.match(PICK_LABEL);
            return {id: box.value, pick: pick ? {year: Number(pick[1]), round: Number(pick[2]), from: pick[3].trim()} : null, label: text};
        });
    const field = (name) => form.elements[name];
    const value = (name) => (field(name) ? String(field(name).value) : "");
    const years = field("TRADE_EXPIRES_YEAR") ? [...field("TRADE_EXPIRES_YEAR").options].map((option) => Number(option.value)) : [];
    const expiry = {year: Number(value("TRADE_EXPIRES_YEAR")), month: Number(value("TRADE_EXPIRES_MONTH")), day: Number(value("TRADE_EXPIRES_DAY")), hour: Number(value("TRADE_EXPIRES_TIME"))};
    const known = ["TRADE_EXPIRES_MONTH", "TRADE_EXPIRES_DAY", "TRADE_EXPIRES_TIME", "TRADE_EXPIRES_YEAR", "msg"].every((name) => field(name));
    if (!known) {
        return null;
    }
    return {form, partner, mine: side(franchiseId), theirs: side(partner), expiry: ctSeconds(expiry), years};
}

// The proposal's fields as MFL's form posts them: `give` and `get` are checkbox values
export function proposalFields(form, {mine, partner, give, get, expires, message}) {
    const fields = new URLSearchParams();
    for (const element of form.elements) {
        if (element.name && element.type === "hidden") {
            fields.append(element.name, element.value);
        }
    }
    give.forEach((id) => fields.append(`drop${mine}`, id));
    get.forEach((id) => fields.append(`drop${partner}`, id));
    const parts = ctParts(expires);
    fields.set("TRADE_EXPIRES_MONTH", String(parts.month));
    fields.set("TRADE_EXPIRES_DAY", String(parts.day));
    fields.set("TRADE_EXPIRES_TIME", String(parts.hour).padStart(2, "0"));
    fields.set("TRADE_EXPIRES_YEAR", String(parts.year));
    fields.set("msg", message);
    const submit = form.querySelector("input[type=submit][name=Propose]");
    fields.set("Propose", submit ? submit.value : "Propose Trade");
    return fields;
}

// An answer to an offer as MFL's form posts it: ACTION is accept, counter_proposal or reject
export function answerFields(form, {tradeId, leagueId, action, comment = ""}) {
    const fields = new URLSearchParams();
    if (form) {
        for (const element of form.elements) {
            if (element.name && element.type === "hidden") {
                fields.append(element.name, element.value);
            }
        }
    }
    fields.set("LEAGUE_ID", fields.get("LEAGUE_ID") || leagueId);
    fields.set("TRADE_ID", tradeId);
    fields.set("ACTION", action);
    fields.set("COMMENTS", comment);
    return fields;
}

// ---- offers ----

const idsOf = (text) => String(text || "").split(",").map((id) => id.trim()).filter(Boolean);

// The member's pending trades from `pendingTrades`, both ways: what the member would give and get,
// oldest first
export function offersOf(pendingTrades, franchiseId) {
    return asArray(pendingTrades && pendingTrades.pendingTrade)
        .filter((trade) => trade.offeringteam === franchiseId || trade.offeredto === franchiseId)
        .map((trade) => {
            const sent = trade.offeringteam === franchiseId;
            return {
                id: String(trade.trade_id),
                received: !sent,
                partner: sent ? trade.offeredto : trade.offeringteam,
                give: idsOf(sent ? trade.will_give_up : trade.will_receive),
                get: idsOf(sent ? trade.will_receive : trade.will_give_up),
                expires: Number(trade.expires) || null,
                comment: String(trade.comments || "").trim(),
                made: Number(trade.timestamp) || 0
            };
        })
        .sort((a, b) => a.made - b.made);
}

const sameSet = (a, b) => a.length === b.length && a.every((id) => b.includes(id));

// the member's offer to `partner` of exactly these, among `offers`
export const findOffer = (offers, {partner, give, get}) => offers.find((offer) => !offer.received && offer.partner === partner && sameSet(offer.give, give) && sameSet(offer.get, get)) || null;

// A future pick (`FP_<owner>_<year>_<round>`) or this year's (`DP_<round>_<pick>`, from 0)
export function readPick(id) {
    let found = /^FP_(\d{4})_(\d{4})_(\d+)$/.exec(id);
    if (found) {
        return {owner: found[1], year: Number(found[2]), round: Number(found[3])};
    }
    found = /^DP_(\d+)_(\d+)$/.exec(id);
    return found ? {round: Number(found[1]) + 1, pick: Number(found[2]) + 1} : null;
}

// What an asset reads as: a player with his position, team and contract; a pick with whose it was.
// `holder` is the team giving it; `names` maps team ids to names.
export function assetView(id, {league, mflNames, holder, names, season}) {
    const pick = readPick(id);
    if (pick) {
        const name = pick.year ? `${pick.year} Round ${pick.round}` : `${season} pick ${pick.round}.${String(pick.pick).padStart(2, "0")}`;
        const from = pick.owner && pick.owner !== holder ? `from ${names.get(pick.owner) || "another team"}` : "own pick";
        return {id, pick: true, name, meta: pick.year ? from : "draft pick"};
    }
    const player = league.players.get(id);
    const mfl = mflNames.get(id);
    if (!player) {
        return {id, pick: false, name: mfl ? firstLast(mfl) : "A player", meta: "", surname: mfl ? surname(mfl) : "him"};
    }
    return {
        id, pick: false, player,
        name: player.fullName,
        surname: surname(mfl || player.fullName),
        meta: [player.nflPosition, player.team, player.rfa ? "" : money(player.salary), contractYears(player)].filter(Boolean).join(" · "),
        ir: isIR(player)
    };
}

// ---- what a trade does ----

// Cap used and active players for both teams, before and after: `give` is what the member sends,
// `get` what they receive (player ids and picks; picks change neither). An IR player moves no
// active spot.
export function tradeEffect(league, {mine, theirs, give, get}) {
    const players = (ids) => ids.map((id) => league.players.get(id)).filter(Boolean);
    const out = players(give);
    const back = players(get);
    const salary = (list) => list.reduce((total, player) => total + player.salary, 0);
    const active = (list) => list.filter((player) => !isIR(player)).length;
    const side = (franchise, losing, gaining) => ({
        franchise,
        cap: {from: franchise.capTotal, to: cents(franchise.capTotal - salary(losing) + salary(gaining))},
        active: {from: franchise.numPlayers, to: franchise.numPlayers - active(losing) + active(gaining)}
    });
    return {mine: side(league.franchises.get(mine), out, back), theirs: side(league.franchises.get(theirs), back, out)};
}

// The member's pending bids after the trade (5.5): {cap, roster} for the limit they could newly
// break, else null. A claim dropping a player traded away counts as no drop, as for a cut.
export function bidsAfter(team, effect, give) {
    if (!team.groups.length) {
        return null;
    }
    const before = projection(team);
    const groups = team.groups.map((group) => ({round: group.round, claims: group.claims.map((claim) => (give.includes(claim.drop) ? {...claim, drop: null} : claim))}));
    const after = projectBids({...team.franchise, capTotal: effect.mine.cap.to, numPlayers: effect.mine.active.to}, groups, team.players);
    const cap = after.overCap && after.cap > before.cap ? after.cap : null;
    const roster = after.overRoster && after.roster > before.roster ? after.roster : null;
    return cap || roster ? {cap, roster} : null;
}

// Why the trade can't be made, naming the limit, or null: either team over the cap after it (10.3).
// A team already over may trade its way back under, not stay over (the commissioner's ruling).
export function blockReason(effect, {partnerName, proposing}) {
    if (effect.mine.cap.to > SALARY_CAP) {
        return proposing
            ? `you’d be at ${money(effect.mine.cap.to)} of $${SALARY_CAP}. Send more salary their way, or take less back.`
            : `you’d be at ${money(effect.mine.cap.to)} of $${SALARY_CAP}, so the trade would be void.`;
    }
    if (effect.theirs.cap.to > SALARY_CAP) {
        return `${partnerName} would be at ${money(effect.theirs.cap.to)} of $${SALARY_CAP}, so the trade would be void.`;
    }
    return null;
}

const OVER = "within 12 hours, before the next NFL game, or by the next blind-bid deadline, whichever comes first";
const UNDER = "within 12 hours or before the next NFL game, whichever comes first";

// The roster notices (10.5), while the limits apply: [{head, text}]. `others` adds the other team's.
export function rosterNotices(effect, {partnerName, others = true}) {
    const notices = [];
    const {mine, theirs} = effect;
    if (mine.active.to > ROSTER_MAX && mine.active.to > mine.active.from) {
        notices.push({head: `You’d have ${mine.active.to} active.`, text: `Allowed in a trade, but you must get back to ${ROSTER_MAX} ${OVER}, and you can’t set a lineup until you do.`});
    }
    if (mine.active.to < ROSTER_MIN && mine.active.to < mine.active.from) {
        notices.push({head: `You’d have ${mine.active.to} active.`, text: `You must add players ${UNDER}.`});
    }
    if (others && theirs.active.to > ROSTER_MAX && theirs.active.to > theirs.active.from) {
        notices.push({head: `${partnerName} would have ${theirs.active.to} active.`, text: `Allowed, but they must get back to ${ROSTER_MAX} ${OVER}.`});
    }
    if (others && theirs.active.to < ROSTER_MIN && theirs.active.to < theirs.active.from) {
        notices.push({head: `${partnerName} would have ${theirs.active.to} active.`, text: `They must add players ${UNDER}.`});
    }
    return notices;
}

// "Higbee’s", "Higbee’s and Waller’s", "A’s, B’s and C’s"
function possessives(names) {
    const owned = names.map((name) => `${name}’s`);
    return owned.length > 1 ? `${owned.slice(0, -1).join(", ")} and ${owned[owned.length - 1]}` : owned[0];
}

// each NFL team's kickoff this week, in seconds, from `nflSchedule`
export const teamKickoffs = (nflSchedule) => new Map(asArray(nflSchedule && nflSchedule.matchup)
    .flatMap((matchup) => asArray(matchup.team).map((team) => [team.id, Number(matchup.kickoff) || 0]))
    .filter(([, kickoff]) => kickoff > 0));

// "Locked: Fairbairn’s game has started." while a traded player's game this week has kicked off,
// until the week's games are over. v2 computes none of MFL's windows (when its lock lifts): MFL
// takes or refuses the answer itself.
export function lockedText(assets, kickoffs, now) {
    const last = Math.max(0, ...kickoffs.values());
    if (!last || now > last + GAME_HOURS * HOUR) {
        return null;
    }
    const started = assets.filter((asset) => asset.player && kickoffs.get(asset.player.team) && kickoffs.get(asset.player.team) <= now);
    if (!started.length) {
        return null;
    }
    return `${possessives(started.map((asset) => asset.surname))} ${started.length === 1 ? "game has" : "games have"} started.`;
}

const waitText = (seconds) => {
    const minutes = Math.max(1, Math.round(seconds / 60));
    if (minutes < 60) {
        return `${minutes} minute${minutes === 1 ? "" : "s"}`;
    }
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `${hours} hour${hours === 1 ? "" : "s"}${rest ? ` ${rest} minute${rest === 1 ? "" : "s"}` : ""}`;
};

// The heads-up for accepting shortly before a traded player's kickoff: allowed (no bylaw against
// it), but both lineups need fixing
export function kickoffText(assets, kickoffs, now) {
    const soon = assets
        .filter((asset) => asset.player)
        .map((asset) => ({asset, kickoff: kickoffs.get(asset.player.team) || 0}))
        .filter(({kickoff}) => kickoff > now && kickoff - now <= KICKOFF_WARNING_HOURS * HOUR)
        .sort((a, b) => a.kickoff - b.kickoff);
    if (!soon.length) {
        return null;
    }
    const first = soon[0].kickoff;
    const one = soon.length === 1;
    const when = soon.every(({kickoff}) => kickoff === first)
        ? `${one ? "starts" : "start"} at ${clock(first)}, in ${waitText(first - now)}`
        : `start from ${clock(first)}, the first in ${waitText(first - now)}`;
    return `${possessives(soon.map(({asset}) => asset.surname))} ${one ? "game" : "games"} ${when}. Accepting moves ${one ? "him" : "them"} now, so both teams’ lineups need fixing before kickoff.`;
}

// ---- expiry ----

// a moment's date and hour in Central time: {year, month (0–11), day, hour, weekday (0 Sunday)}
export function ctParts(seconds) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {timeZone: CT, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", weekday: "short", hourCycle: "h23"})
        .formatToParts(new Date(seconds * 1000)).map((part) => [part.type, part.value]));
    return {year: Number(parts.year), month: Number(parts.month) - 1, day: Number(parts.day), hour: Number(parts.hour) % 24,
        weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday)};
}

// the moment a Central date and hour names, in seconds (MFL's form: month 0–11, hour 0–23; its
// hour 0 is 12:00:01 a.m.)
export function ctSeconds({year, month, day, hour}) {
    if (![year, month, day, hour].every(Number.isFinite)) {
        return null;
    }
    const wanted = Date.UTC(year, month, day, hour) / 1000;
    // Central is 5 or 6 hours behind UTC: try both, keep the one that reads back right
    for (const offset of [5, 6]) {
        const guess = wanted + offset * HOUR;
        const back = ctParts(guess);
        if (Date.UTC(back.year, back.month, back.day, back.hour) / 1000 === wanted) {
            return guess + (hour === 0 ? 1 : 0);
        }
    }
    return null;
}

// a moment's hour, rounded down: MFL's expiry takes whole hours
const hourOf = (seconds) => seconds - (seconds % HOUR);

// Expiry choices: before Sunday's games (the next Sunday kickoff's hour) and before Thursday's game,
// in season, then MFL's own 7 days. `kickoffs` are this week's and next week's game kickoffs.
export function expiryChoices({phase, kickoffs, mflDefault, now}) {
    const choices = [];
    if (phase === "season") {
        const next = (weekday) => kickoffs.filter((kickoff) => kickoff > now && ctParts(kickoff).weekday === weekday).sort((a, b) => a - b)[0];
        const sunday = next(0);
        const thursday = next(4);
        // only while that hour is still ahead: within it, nothing MFL's form takes comes before kickoff
        if (sunday && hourOf(sunday) > now) {
            choices.push({key: "sunday", name: "Before Sunday’s games", at: hourOf(sunday)});
        }
        if (thursday && hourOf(thursday) > now) {
            choices.push({key: "thursday", name: "Before Thursday’s game", at: hourOf(thursday)});
        }
    }
    if (mflDefault) {
        choices.push({key: "week", name: "In 7 days", at: mflDefault});
    }
    return choices;
}

// open through game time: the next kickoff comes before it expires
export const throughGames = ({expires, kickoffs, now}) => kickoffs.some((kickoff) => kickoff > now && kickoff < expires);

// "Sun Oct 25, 8:00 a.m."
export const expiresText = (seconds) => `${dayText(seconds)}, ${clock(seconds)}`;

// ---- the proposal's lists ----

// A side's assets for picking, by position, then its picks: [{label, items}]
export function pickGroups(assets) {
    const players = assets.filter((asset) => !asset.pick);
    const positions = POSITIONS.concat([...new Set(players.map((asset) => asset.player && asset.player.nflPosition))].filter((pos) => pos && !POSITIONS.includes(pos)));
    const groups = positions.map((pos) => ({
        label: pos,
        items: players.filter((asset) => asset.player && asset.player.nflPosition === pos)
            .sort((a, b) => b.player.salary - a.player.salary || b.player.years - a.player.years || a.name.localeCompare(b.name))
    }));
    const unknown = players.filter((asset) => !asset.player);
    if (unknown.length) {
        groups.push({label: "Other", items: unknown});
    }
    groups.push({label: "Draft picks", items: assets.filter((asset) => asset.pick)});
    return groups.filter((group) => group.items.length);
}

// "2 players ($66) + 1 pick", "Nothing yet"
export function pickedSummary(assets) {
    const players = assets.filter((asset) => !asset.pick);
    const picks = assets.length - players.length;
    const salary = players.reduce((total, asset) => total + (asset.player ? asset.player.salary : 0), 0);
    return [
        players.length ? `${players.length} player${players.length === 1 ? "" : "s"} (${money(salary)})` : "",
        picks ? `${picks} pick${picks === 1 ? "" : "s"}` : ""
    ].filter(Boolean).join(" + ") || "Nothing yet";
}

// "Carson Beck, 2027 Round 1"
export const assetList = (assets) => assets.map((asset) => asset.name).join(", ") || "nothing";

// The trade deadline (10.1): week 12's first kickoff (the calendar's TRADE event names the week)
export function deadlineWeek(calendar, fallback) {
    const event = asArray(calendar && calendar.event).find((entry) => entry.type === "TRADE");
    const week = event ? Number(event.start_time) : 0;
    return week > 0 && week < 100 ? week : fallback;
}
