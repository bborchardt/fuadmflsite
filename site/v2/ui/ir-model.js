// Moves › IR's data and checks, from MFL's Injured Reserve page (docs/mfl.md, Forms), today's NFL
// injury report and the league model: no DOM building here, so each can be checked against saved
// pages. Save is MFL's one submit, so moves to IR, activations and a drop go together, and the
// checks take them together, with the pending bids as they could land (5.5).

import {asArray} from "../lib/mfl.js";
import {projectBids} from "../lib/bids.js";
import {MIN_INJURY_REPORT} from "../lib/league.js";
import {ROSTER_MAX, SALARY_CAP} from "../lib/rules.js";
import {onNflIR} from "../lib/violations.js";
import {projection} from "./add-model.js";

const round2 = (amount) => Math.round(amount * 100) / 100;
const IR = "INJURED_RESERVE";

const playerId = (link) => (String(link.getAttribute("href")).match(/launch_player_modal\(\s*'[^']*'\s*,\s*'(\d+)'/) || [])[1];

// MFL's IR page: its form, and per player listed what its boxes allow. `active` are the rows of
// "Select Players To Deactivate/Drop", `reserve` those of "Select Players To Activate": each {id,
// move (a box to IR or to activate), drop (a box to drop), locked (his game has started), tag
// (MFL's injury mark: "IR", "Out")}. Null when it isn't the page v2 knows, or not the member's.
export function readIRPage(doc, franchiseId) {
    const form = [...doc.querySelectorAll("form")].find((node) => /\/ir$/.test(node.getAttribute("action") || "") && node.elements.FRANCHISE_ID);
    if (!form || form.elements.FRANCHISE_ID.value !== franchiseId || !form.elements.LEAGUE_ID) {
        return null;
    }
    // the boxes by name and player; the form's fields belong to it wherever MFL's markup puts them
    const boxes = new Set([...form.elements].filter((field) => field.type === "checkbox").map((field) => `${field.name}:${field.value}`));
    const tables = [...doc.querySelectorAll("table.report")].filter((table) => table.querySelector(":scope > caption"));
    const tableFor = (pattern) => tables.find((table) => pattern.test(table.querySelector(":scope > caption").textContent.trim()));
    const deactivate = tableFor(/^Select Players To Deactivate/i);
    const activate = tableFor(/^Select Players To Activate/i);
    if (!deactivate || !activate) {
        return null;
    }
    const rows = (table, move) => [...table.querySelectorAll("tr")].map((row) => {
        const link = row.querySelector('a[href*="launch_player_modal"]');
        const id = link && playerId(link);
        if (!id) {
            return null;
        }
        const mark = link.parentNode.querySelector(".warning");
        const cells = [...row.children];
        return {
            id,
            move: boxes.has(`${move}${franchiseId}:${id}`),
            drop: boxes.has(`drop${franchiseId}:${id}`),
            locked: cells.slice(0, 2).some((cell) => /^\s*Locked\s*$/i.test(cell.textContent)),
            tag: mark && mark.compareDocumentPosition(link) & 2 ? mark.textContent.trim() : ""
        };
    }).filter(Boolean);
    return {form, active: rows(deactivate, "deactivate"), reserve: rows(activate, "activate")};
}

// Today's NFL injury report by player id, or null when it's too thin to trust (lib/league.js: a
// thin report would make every IR player look healthy)
export function injuryReport(injuries) {
    const report = asArray(injuries && injuries.injury);
    return report.length >= MIN_INJURY_REPORT ? new Map(report.map((entry) => [entry.id, entry])) : null;
}

// "Nov 22, 2026" → "Nov 22"
const backText = (date) => String(date || "").replace(/,\s*\d{4}$/, "");

// The two groups: "Can go on IR" (active players MFL lets go to IR, and those it would but for a
// started game) and "On your IR". Each row {player, entry, status, back, must, off, why}: `must` a
// player the NFL no longer lists on IR (bylaw 11.1), whose Activate is locked on while it's open.
export function irGroups(league, page, report) {
    const view = (entry, onIR) => {
        const player = league.players.get(entry.id);
        if (!player) {
            return null;
        }
        const injury = report && report.get(entry.id);
        const must = Boolean(onIR && report && !onNflIR({injuryStatus: injury ? injury.status : ""}));
        const status = must
            ? "No longer on the NFL’s IR"
            : injury ? [`NFL ${injury.status}`, injury.details].filter(Boolean).join(" · ") : entry.tag;
        const off = !entry.move;
        return {player, entry, status, back: must || !injury ? "" : backText(injury.exp_return), must, off, why: off ? (entry.locked ? "Game started" : "Can’t move") : ""};
    };
    const canGo = page.active.filter((entry) => entry.move || (entry.locked && /^IR/.test(entry.tag)))
        .map((entry) => view(entry, false)).filter(Boolean);
    const onIR = page.reserve.map((entry) => view(entry, true)).filter(Boolean);
    const order = (a, b) => b.player.salary - a.player.salary || a.player.fullName.localeCompare(b.player.fullName);
    return {canGo: canGo.sort(order), onIR: onIR.sort(order)};
}

// What a save does: {active, cap, bids, why, needsDrop}. `toIR`, `activate` are player ids; `drop` a
// player id or null; `limits` whether the roster limits hold (from the cut-down date). Cap used
// changes only by the drop (IR salaries count fully). Blocked when it takes cap used, or the active
// count once the limits hold, past its limit or further past it, with every pending group's
// costliest claim counted; a claim dropping a player moved to IR frees no active spot, and one
// dropping the player dropped here counts as no drop.
export function checkIR(team, {toIR = [], activate = [], drop = null, limits}) {
    const before = projection(team);
    const dropped = drop ? team.players.get(drop) : null;
    const players = new Map(team.players);
    toIR.forEach((id) => players.has(id) && players.set(id, {...players.get(id), status: IR}));
    activate.forEach((id) => players.has(id) && players.set(id, {...players.get(id), status: "ROSTER"}));
    const moved = team.franchise.numPlayers - toIR.length + activate.length;
    const franchise = {
        ...team.franchise,
        capTotal: round2(team.franchise.capTotal - (dropped ? dropped.salary - dropped.capPenalty : 0)),
        numPlayers: moved - (dropped ? 1 : 0)
    };
    const groups = team.groups.map((group) => ({round: group.round, claims: group.claims.map((claim) => (drop && claim.drop === drop ? {...claim, drop: null} : claim))}));
    const after = projectBids(franchise, groups, players);
    // without a drop, would the roster break?
    const undropped = projectBids({...team.franchise, numPlayers: moved}, team.groups, players);
    // past 30 now (a claim dropping a player activated here keeps the projection level), or if the
    // bids land
    const rosterOver = (projected, active) => limits && ((projected.roster > ROSTER_MAX && projected.roster > before.roster)
        || (active > ROSTER_MAX && active > team.franchise.numPlayers));
    let why = null;
    if (after.cap > SALARY_CAP && after.cap > before.cap) {
        why = "over cap";
    } else if (rosterOver(after, franchise.numPlayers)) {
        why = "over roster limit";
    }
    return {
        active: {from: team.franchise.numPlayers, to: franchise.numPlayers},
        cap: {from: team.franchise.capTotal, to: franchise.capTotal},
        // the active count the pending bids could reach, when it's them that break the limit
        bids: after.roster > franchise.numPlayers ? after.roster : null,
        bidsCap: after.cap > franchise.capTotal ? after.cap : null,
        why,
        needsDrop: rosterOver(undropped, moved)
    };
}

// "Blocked: …" for a save that doesn't fit; `check` is checkIR's, with the `drop` picked
export function irBlockText(check) {
    if (check.why === "over cap") {
        return check.bidsCap
            ? `with your pending bids, that drop’s penalty could take you to $${check.bidsCap} of $${SALARY_CAP}. Pick another, or lower a bid first.`
            : `that drop’s penalty puts you at $${check.cap.to} of $${SALARY_CAP}.`;
    }
    // a save takes one drop: past that, activating one at a time is the way
    if (check.why === "over roster limit" && check.active.to > ROSTER_MAX) {
        return check.drop || check.active.to > ROSTER_MAX + 1
            ? `you’d have ${check.active.to} active. Activate one at a time, or move another player to IR.`
            : `you’d have ${check.active.to} active. Pick a drop, or move another player to IR.`;
    }
    if (check.why === "over roster limit") {
        return check.drop
            ? `with your pending bids, you could have ${check.bids} active. Remove a claim in Add first.`
            : `with your pending bids, you could have ${check.bids} active. Pick a drop, or remove a claim in Add first.`;
    }
    return "";
}

// The players a save can drop, lowest penalty first: the active ones MFL's form lets go, not those
// moving to IR. Each {player, penalty, capChange, off, why}, off when his game has started or the
// drop's penalty would break the cap.
export function dropChoices(team, page, {toIR, activate, limits}) {
    const leaving = new Set(toIR);
    return page.active.filter((entry) => !leaving.has(entry.id)).map((entry) => {
        const player = team.players.get(entry.id);
        if (!player) {
            return null;
        }
        const check = checkIR(team, {toIR, activate, drop: entry.id, limits});
        const why = !entry.drop ? (entry.locked ? "Game started" : "Can’t drop") : check.why === "over cap" ? "over cap" : "";
        return {player, penalty: player.capPenalty, capChange: round2(player.capPenalty - player.salary), off: Boolean(why), why};
    }).filter(Boolean)
        .sort((a, b) => a.penalty - b.penalty || a.player.salary - b.player.salary || a.player.fullName.localeCompare(b.player.fullName));
}

// MFL's form as one save posts it: the member's moves, nothing else ticked
export function irFields(form, {franchiseId, toIR, activate, drop}) {
    const fields = new URLSearchParams();
    fields.set("LEAGUE_ID", form.elements.LEAGUE_ID.value);
    fields.set("FRANCHISE_ID", franchiseId);
    toIR.forEach((id) => fields.append(`deactivate${franchiseId}`, id));
    activate.forEach((id) => fields.append(`activate${franchiseId}`, id));
    if (drop) {
        fields.append(`drop${franchiseId}`, drop);
    }
    return fields;
}

// What MFL made of a save, from the roster read back: each move done or not. `roster` maps the
// team's player ids to MFL's status (`ROSTER`, `INJURED_RESERVE`).
export function savedMoves(roster, {toIR, activate, drop}) {
    const moves = [
        ...toIR.map((id) => ({id, kind: "toIR", done: roster.get(id) === IR})),
        ...activate.map((id) => ({id, kind: "activate", done: roster.has(id) && roster.get(id) !== IR})),
        ...(drop ? [{id: drop, kind: "drop", done: !roster.has(drop)}] : [])
    ];
    return {moves, done: moves.filter((move) => move.done), missed: moves.filter((move) => !move.done)};
}

// "Brown to IR, McMillan activated, Olave dropped"; `undone`: "moving Brown to IR, activating …"
export function movesText(moves, nameOf, {undone = false} = {}) {
    const said = undone
        ? {toIR: (name) => `moving ${name} to IR`, activate: (name) => `activating ${name}`, drop: (name) => `dropping ${name}`}
        : {toIR: (name) => `${name} to IR`, activate: (name) => `${name} activated`, drop: (name) => `${name} dropped`};
    return moves.map((move) => said[move.kind](nameOf(move.id))).join(", ");
}
