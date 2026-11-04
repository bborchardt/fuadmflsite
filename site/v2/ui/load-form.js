// The commissioner's screen for the auction's and the rookie draft's results (lib/load.js), opened
// from Home: the sheet pasted in, read against MFL's rosters, shown team by team, then sent to MFL
// through Load/Unload Rosters, the draft import (draftResults) and salaries. What it
// sends is the difference between the sheet and MFL, read afresh each time, so after a failure it's
// sent again from where it stopped.

import {asArray as asList, exportUrl, fetchExport} from "../lib/mfl.js";
import {draftResultsXml, matchOwner, matchPlayer, planAuction, planRookies, readAuction, readRookies, rosterSteps, salariesXml} from "../lib/load.js";
import {openDialog} from "./dialog.js";
import {money} from "./format.js";
import {esc} from "./html.js";
import {readBack, send} from "./moves.js";

const CLOSE_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>';
// MFL asks for about a second between requests
const SPACING = 1100;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const KINDS = {
    auction: {label: "Auction", tab: "Franchises", hint: "Copy the whole Franchises tab and paste it here."},
    rookies: {label: "Rookie draft", tab: "Rookie", hint: "Copy the whole Rookie tab and paste it here: its Pick, Owner and Player columns are read."}
};

const firstLast = (name) => String(name).split(",").reverse().map((part) => part.trim()).join(" ");
const yearsText = (years) => `${years} yr${years === 1 ? "" : "s"}`;

// Each sheet name the commissioner still has to pick an MFL player for, and each owner a team:
// [{key, label, options: [{value, text}]}]
function choicesNeeded(read, {players, teams, chosen}) {
    const needed = [];
    for (const entry of read.bad) {
        needed.push({key: `bad:${entry.row}`, label: `${entry.name} (${entry.owner}, row ${entry.row}): its $ or Yrs isn’t a number`, options: []});
    }
    for (const owner of read.owners) {
        if (!chosen.owners.get(owner)) {
            needed.push({key: `owner:${owner}`, label: `${owner}’s team`, options: [...teams].map(([id, name]) => ({value: id, text: name}))});
        }
    }
    for (const entry of read.entries) {
        if (!chosen.players.get(entry.key)) {
            const options = entry.choices.map((id) => ({value: id, text: `${firstLast(players.get(id).name)} ${players.get(id).position} ${players.get(id).team}`}));
            needed.push({key: `player:${entry.key}`, label: `${entry.name} (${entry.owner}, row ${entry.row})`, options});
        }
    }
    return needed;
}

// the sheet read: its owners, and the entries that need a player ({key, owner, name, position, row,
// choices}), matched where one fits
function readSheet(kind, text, {players, rosters, franchises, chosen}) {
    const rosterOf = new Map(asList(rosters.franchise).map((team) => [team.id, asList(team.player).map((entry) => entry.id)]));
    const sheet = kind === "auction" ? readAuction(text) : readRookies(text);
    const owners = [...new Set(sheet.map((entry) => entry.owner))];
    for (const owner of owners) {
        if (!chosen.owners.has(owner)) {
            chosen.owners.set(owner, matchOwner(owner, franchises));
        }
    }
    const heldBy = new Map([...rosterOf].flatMap(([franchiseId, ids]) => ids.map((id) => [id, franchiseId])));
    const entries = [];
    // a rookie matched to a player on another team's roster is likely a namesake: picked by hand
    const match = (entry, roster) => {
        const found = matchPlayer(entry, players, roster);
        const elsewhere = found.id && kind === "rookies" && heldBy.has(found.id) && heldBy.get(found.id) !== chosen.owners.get(entry.owner);
        return elsewhere ? {choices: [found.id]} : found;
    };
    const add = (entry, roster) => {
        const found = match(entry, roster);
        if (!chosen.players.has(entry.key)) {
            chosen.players.set(entry.key, found.id || null);
        }
        entry.choices = found.choices || [];
        entries.push(entry);
    };
    const bad = [];
    if (kind === "auction") {
        for (const team of sheet) {
            // a released player needs no match: the team's roster says who goes
            for (const player of team.players.filter((entry) => entry.salary !== null)) {
                if (Number.isNaN(player.salary) || Number.isNaN(player.years)) {
                    bad.push({...player, owner: team.owner});
                    continue;
                }
                add({...player, owner: team.owner, key: `${team.owner}:${player.row}:${player.name}`}, rosterOf.get(chosen.owners.get(team.owner)) || []);
            }
        }
    } else {
        sheet.forEach((pick, index) => add({...pick, position: null, key: `${index}:${pick.name}`}, []));
    }
    return {kind, sheet, owners, entries, bad};
}

function plan(read, {chosen, rosters, players, draft, teamCount, clearing = new Set()}) {
    if (read.kind === "auction") {
        const teams = read.sheet.map((team) => ({
            franchiseId: chosen.owners.get(team.owner),
            players: team.players.filter((player) => player.salary !== null).map((player) => ({
                id: chosen.players.get(`${team.owner}:${player.row}:${player.name}`), salary: player.salary, years: player.years
            }))
        }));
        const result = planAuction({teams, rosters});
        // unloaded in an earlier send whose salaries step didn't go through
        const rostered = new Set(asList(rosters.franchise).flatMap((team) => asList(team.player).map((entry) => entry.id)));
        const placed = new Set(result.add.map((entry) => entry.id).concat(result.salaries.map((entry) => entry.id)));
        const clear = [...new Set(result.clear.concat([...clearing].filter((id) => !rostered.has(id) && !placed.has(id))))];
        return {kind: "auction", teams, ...result, clear};
    }
    const picks = planRookies({
        picks: read.sheet.map((pick, index) => ({franchiseId: chosen.owners.get(pick.owner), id: chosen.players.get(`${index}:${pick.name}`)})),
        // the league's teams, not the sheet's owners: a team that traded all its picks is still in the order
        teams: teamCount,
        players
    });
    const held = new Map(asList(rosters.franchise).flatMap((team) => asList(team.player).map((entry) => [entry.id, entry])));
    // MFL's import overwrites the picks it's sent and keeps the others (the clone, 3 Nov 2026)
    const atPick = new Map(asList(draft && draft.draftPick).map((entry) => [`${Number(entry.round)}.${Number(entry.pick)}`, entry]));
    const seen = new Map();
    picks.forEach((pick) => seen.set(pick.id, [...(seen.get(pick.id) || []), pick.franchiseId]));
    const conflicts = [...seen].filter(([, list]) => list.length > 1).map(([id, franchiseIds]) => ({id, franchiseIds}));
    const differs = picks.filter((pick) => {
        const found = atPick.get(`${pick.round}.${pick.pick}`);
        return !found || found.player !== pick.id || found.franchise !== pick.franchiseId;
    });
    return {
        kind: "rookies", picks, conflicts, release: movedFrom(picks, rosters), existing: differs.filter((pick) => (atPick.get(`${pick.round}.${pick.pick}`) || {}).player).length, loadDraft: differs.length > 0,
        add: notOnTeam(picks, rosters),
        salaries: picks.filter((pick) => {
            const now = held.get(pick.id);
            return !now || Number(now.salary) !== pick.salary || Number(now.contractYear) !== 0;
        }).map((pick) => ({id: pick.id, salary: pick.salary, years: 0}))
    };
}

// a pick on another team's roster comes off it, so he isn't on two
function movedFrom(picks, rosters) {
    const drafted = new Map(picks.map((pick) => [pick.id, pick.franchiseId]));
    return asList(rosters.franchise).flatMap((team) => asList(team.player)
        .filter((entry) => drafted.has(entry.id) && drafted.get(entry.id) !== team.id)
        .map((entry) => ({franchiseId: team.id, id: entry.id})));
}

// the picks not yet on their team's roster
function notOnTeam(picks, rosters) {
    const roster = new Map(asList(rosters.franchise).map((team) => [team.id, new Set(asList(team.player).map((entry) => entry.id))]));
    return picks.filter((pick) => !(roster.get(pick.franchiseId) || new Set()).has(pick.id));
}

const nothingLeft = (result) => !result.conflicts.length && (result.kind === "auction"
    ? !result.release.length && !result.add.length && !result.salaries.length && !result.clear.length
    : !result.loadDraft && !result.release.length && !result.add.length && !result.salaries.length);

// the review, team by team: what goes, what comes, and what's set
export function previewMarkup(result, {players, teams, rosters}) {
    const name = (id) => (players.get(id) ? firstLast(players.get(id).name) : id);
    const team = (id) => teams.get(id) || id;
    if (nothingLeft(result)) {
        return '<p class="fuad-load-note">MFL already matches the sheet.</p>';
    }
    const conflicts = result.conflicts.map((conflict) => `<p class="fuad-load-note fuad-load-bad">${esc(name(conflict.id))} is on both ${conflict.franchiseIds.map(team).map(esc).join(" and ")}: fix the sheet and read it again.</p>`).join("");
    if (result.kind === "rookies") {
        const from = new Map(result.release.map((entry) => [entry.id, entry.franchiseId]));
        const about = (id) => (players.get(id) ? `${players.get(id).position} ${players.get(id).team}` : "");
        return `${conflicts}${result.loadDraft ? `<p class="fuad-load-note">Loads the draft’s ${result.picks.length} picks${result.existing ? `, replacing another player at ${result.existing} of them` : ""}.</p>` : ""}
        <ul class="fuad-rows fuad-load-list">${result.picks.map((pick) => `<li><span>${pick.round}.${String(pick.pick).padStart(2, "0")} ${esc(name(pick.id))} <span class="fuad-meta">${esc(about(pick.id))}</span></span><span class="fuad-meta">${esc(team(pick.franchiseId))} · ${esc(money(pick.salary))}${from.has(pick.id) ? `<span class="fuad-load-bad"> · from ${esc(team(from.get(pick.id)))}</span>` : ""}</span></li>`).join("")}</ul>`;
    }
    const now = new Map(asList(rosters.franchise).flatMap((entry) => asList(entry.player).map((player) => [player.id, player])));
    const ids = [...new Set([...result.release, ...result.add].map((entry) => entry.franchiseId).concat(result.teams.map((entry) => entry.franchiseId)))];
    const sections = ids.map((franchiseId) => {
        const sheet = result.teams.find((entry) => entry.franchiseId === franchiseId);
        const going = result.release.filter((entry) => entry.franchiseId === franchiseId);
        const coming = new Set(result.add.filter((entry) => entry.franchiseId === franchiseId).map((entry) => entry.id));
        const set = result.salaries.filter((entry) => sheet && sheet.players.some((player) => player.id === entry.id));
        const cleared = new Set(result.clear);
        if (!going.length && !set.length) {
            return "";
        }
        const total = sheet ? sheet.players.reduce((sum, player) => sum + (result.conflicts.some((conflict) => conflict.id === player.id) ? 0 : player.salary), 0) : 0;
        const rows = [
            ...going.map((entry) => `<li><span>Unload ${esc(name(entry.id))}</span><span class="fuad-meta${entry.years > 0 ? " fuad-load-bad" : ""}">${esc(money(entry.salary))}, ${esc(yearsText(entry.years))}${entry.years > 0 ? " left" : ""}${cleared.has(entry.id) ? " → cleared" : ""}</span></li>`),
            ...set.map((entry) => {
                const was = now.get(entry.id);
                const from = coming.has(entry.id) || !was ? "" : `${money(Number(was.salary))}, ${yearsText(Number(was.contractYear))} → `;
                return `<li><span>${coming.has(entry.id) ? "Load" : "Set"} ${esc(name(entry.id))}</span><span class="fuad-meta">${esc(from)}${esc(money(entry.salary))}, ${esc(yearsText(entry.years))}</span></li>`;
            })
        ];
        return `<section class="fuad-load-team"><h3><span>${esc(team(franchiseId))}</span><span class="fuad-meta">${sheet ? `${sheet.players.length} players · ${esc(money(total))}` : ""}</span></h3><ul class="fuad-rows fuad-load-list">${rows.join("")}</ul></section>`;
    }).join("");
    const released = new Set(result.release.map((entry) => entry.id));
    const only = result.clear.filter((id) => !released.has(id));
    const clearing = only.length ? `<section class="fuad-load-team"><h3><span>Off every roster</span></h3><ul class="fuad-rows fuad-load-list">${only.map((id) => `<li><span>Clear ${esc(name(id))}</span><span class="fuad-meta">salary and years</span></li>`).join("")}</ul></section>` : "";
    return `${conflicts}${sections}${clearing}`;
}

// a commissioner's import, from the logged-in page: MFL answers <status>OK</status> or <error>
async function mflImport(context, type, fields) {
    const answer = await send(`${window.location.origin}/${context.season}/import?TYPE=${type}&L=${encodeURIComponent(context.leagueId)}`, {method: "POST", body: new URLSearchParams(fields)});
    if (/<error/i.test(answer) || !/<status\b[^>]*>\s*OK\s*<\/status>/i.test(answer)) {
        throw new Error((answer.match(/<error[^>]*>([^<]*)/i) || [])[1] || "MFL didn't take it");
    }
}

// MFL's Load/Unload Rosters (csetup?C=LOADROST): a team's whole roster, anyone left out unloaded. It
// leaves no transaction and skips the add rules (locks, blind bids only), as the commissioner's tool.
// MFL answers with a page, so what it did is read back: each post is built on the one before, so
// one MFL didn't take stops the rest.
async function loadRoster(context, franchiseId, ids, rosters) {
    const fields = new URLSearchParams({L: context.leagueId, FRANCHISE_ID: franchiseId, C: "LOADROST"});
    ids.forEach((id) => fields.append("ROSTER", id));
    const answer = await send(`${window.location.origin}/${context.season}/load_rosters`, {method: "POST", body: fields});
    if (/<error|not authorized|commissioner access/i.test(answer)) {
        throw new Error("MFL didn't take the roster");
    }
    const wanted = [...ids].sort().join(",");
    const has = (found) => {
        const team = asList(found.franchise).find((entry) => entry.id === franchiseId);
        return Boolean(team) && asList(team.player).map((entry) => entry.id).sort().join(",") === wanted;
    };
    const found = await readBack(rosters, has);
    if (!found || !has(found)) {
        throw new Error("MFL's rosters don't show it");
    }
}

// `built` is Home's league (lib/league.js): its players, franchises and the commissioner's league
// export with owners' names
export function openLoadForm({context, built, opener}) {
    const players = built.boardContext.playerNames;
    const teams = new Map([...built.franchises].map(([id, franchise]) => [id, franchise.teamName]));
    const franchises = asList(built.raw.league.franchises && built.raw.league.franchises.franchise);
    const fresh = (type, params = {}) => fetchExport(exportUrl(window.location.origin, context.season, type, {L: context.leagueId, ...params}), type, {init: {cache: "no-store"}});
    const teamCount = teams.size;
    // players unloaded whose salaries aren't cleared yet, kept across reads
    const clearing = new Set();
    const state = {kind: "auction", text: "", read: null, result: null, rosters: null, draft: null, busy: false, log: [], error: "", chosen: {owners: new Map(), players: new Map()}};

    const choices = () => (state.read ? choicesNeeded(state.read, {players, teams, chosen: state.chosen}) : []);

    function markup() {
        const needed = choices();
        const ready = state.result && !needed.length && !nothingLeft(state.result) && !(state.result.conflicts || []).length;
        return `
            <div class="fuad-load-kinds" role="group" aria-label="Results">${Object.entries(KINDS).map(([kind, {label}]) => `<button type="button" class="fuad-add-chip" data-kind="${kind}" aria-pressed="${state.kind === kind}"${state.busy ? " disabled" : ""}>${label}</button>`).join("")}</div>
            <label class="fuad-load-paste"><span class="fuad-meta">${esc(KINDS[state.kind].hint)}</span><textarea rows="6" spellcheck="false"${state.busy ? " disabled" : ""}>${esc(state.text)}</textarea></label>
            <button type="button" class="fuad-cta fuad-load-read"${state.busy || !state.text.trim() ? " disabled" : ""}>${state.read ? "Read again" : "Read the sheet"}</button>
            ${state.read && !state.read.sheet.length ? `<p class="fuad-lengths-error">No ${esc(KINDS[state.kind].tab)} tab found in what was pasted.</p>` : ""}
            ${needed.length ? `<div class="fuad-load-choices"><p class="fuad-load-note">Pick what these are on MFL:</p><ul class="fuad-rows">${needed.map((item) => `<li class="fuad-lengths-row"><span class="fuad-row-text">${esc(item.label)}</span>${item.options.length
                ? `<select data-choice="${esc(item.key)}"><option value="">Pick</option>${item.options.map((option) => `<option value="${esc(option.value)}">${esc(option.text)}</option>`).join("")}</select>`
                : `<span class="fuad-meta fuad-load-bad">${item.key.startsWith("bad:") ? "Fix the sheet and read again" : "Not on MFL: fix the spelling and read again"}</span>`}</li>`).join("")}</ul></div>` : ""}
            ${state.result && !needed.length ? `<div class="fuad-load-preview">${previewMarkup(state.result, {players, teams, rosters: state.rosters})}</div>` : ""}
            ${state.log.length ? `<ul class="fuad-rows fuad-load-log" role="status">${state.log.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>` : ""}
            ${state.error ? `<p class="fuad-lengths-error" role="alert">${esc(state.error)}</p>` : ""}
            ${ready ? `<button type="button" class="fuad-cta fuad-load-apply"${state.busy ? " disabled" : ""}>${state.busy ? "Sending…" : "Send to MFL"}</button>` : ""}`;
    }

    // the panel stays, as the dialog keeps focus within it; only what's inside is drawn again
    const layer = document.createElement("div");
    layer.className = "fuad-layer fuad-popup-layer";
    layer.hidden = true;
    layer.innerHTML = `<section class="fuad-popup fuad-lengths fuad-load" role="dialog" aria-modal="true" aria-labelledby="fuad-load-title" tabindex="-1">
        <div class="fuad-popup-head">
            <div class="fuad-popup-title"><h2 id="fuad-load-title">Load results</h2><span class="fuad-meta fuad-popup-meta">From the league’s sheet, onto MFL</span></div>
            <button type="button" class="fuad-close" data-close aria-label="Close">${CLOSE_ICON}</button>
        </div>
        <div class="fuad-load-body"></div>
    </section>`;
    document.body.append(layer);
    const body = layer.querySelector(".fuad-load-body");

    function render() {
        body.innerHTML = markup();
    }

    async function read() {
        state.busy = true;
        state.error = "";
        render();
        try {
            state.rosters = await fresh("rosters");
            state.draft = state.kind === "rookies" ? await wait(SPACING).then(() => fresh("draftResults").then((found) => found.draftUnit, () => null)) : null;
            state.read = readSheet(state.kind, state.text, {players, rosters: state.rosters, franchises, chosen: state.chosen});
            state.result = choices().length || !state.read.sheet.length ? null : plan(state.read, {chosen: state.chosen, rosters: state.rosters, players, draft: state.draft, teamCount, clearing});
        } catch (error) {
            state.error = `Couldn’t read MFL’s rosters: ${error.message}`;
        }
        state.busy = false;
        render();
    }

    async function apply() {
        const result = state.result;
        state.busy = true;
        state.error = "";
        state.log = [];
        render();
        const step = async (line, task) => {
            state.log.push(`${line}…`);
            render();
            await task();
            state.log[state.log.length - 1] = line;
            await wait(SPACING);
        };
        try {
            // each team's roster as MFL has it now, each post its whole new roster
            let rosters = await fresh("rosters");
            await wait(SPACING);
            if (result.kind === "rookies" && result.loadDraft) {
                await step(`Loaded the draft’s ${result.picks.length} picks`, () => mflImport(context, "draftResults", {DATA: draftResultsXml(result.picks)}));
                // MFL puts the picks on the rosters itself; any it didn't are loaded below
                rosters = await fresh("rosters");
                await wait(SPACING);
                result.add = notOnTeam(result.picks, rosters);
                result.release = movedFrom(result.picks, rosters);
            }
            // remembered before any unload, so a send stopped partway still clears them on the next
            const clear = result.clear || [];
            clear.forEach((id) => clearing.add(id));
            for (const entry of rosterSteps({rosters, release: result.release, add: result.add})) {
                const what = entry.unloaded.length ? `Unloaded ${entry.unloaded.length} from` : `Loaded ${entry.loaded.length} onto`;
                await step(`${what} ${teams.get(entry.franchiseId)}`, () => loadRoster(context, entry.franchiseId, entry.ids, () => fresh("rosters")));
            }
            if (result.salaries.length || clear.length) {
                const line = [result.salaries.length ? `Set ${result.salaries.length} salaries and lengths` : "", clear.length ? `cleared ${clear.length}` : ""].filter(Boolean).join(", ");
                await step(line.charAt(0).toUpperCase() + line.slice(1), () => mflImport(context, "salaries", {DATA: salariesXml(result.salaries, clear), APPEND: "1"}));
                clear.forEach((id) => clearing.delete(id));
            }
        } catch (error) {
            state.error = `MFL refused the last step: ${error.message}. Read the sheet again to send the rest.`;
        }
        // what's still different, read afresh
        try {
            state.rosters = await fresh("rosters");
            state.draft = result.kind === "rookies" ? await wait(SPACING).then(() => fresh("draftResults").then((found) => found.draftUnit, () => null)) : null;
            state.result = plan(state.read, {chosen: state.chosen, rosters: state.rosters, players, draft: state.draft, teamCount, clearing});
            if (!state.error) {
                state.log.push(nothingLeft(state.result) ? "Done: MFL matches the sheet." : "MFL doesn’t match the sheet yet: what’s left is below.");
            }
        } catch (error) {
            state.error = state.error || `Sent, but MFL’s rosters couldn’t be read back: ${error.message}`;
        }
        state.busy = false;
        render();
    }

    layer.addEventListener("input", (event) => {
        if (event.target.matches("textarea")) {
            state.text = event.target.value;
            const button = layer.querySelector(".fuad-load-read");
            button.disabled = state.busy || !state.text.trim();
        }
    });
    layer.addEventListener("change", (event) => {
        const key = event.target.dataset && event.target.dataset.choice;
        if (!key || !event.target.value) {
            return;
        }
        const [type, ...rest] = key.split(":");
        state.chosen[type === "owner" ? "owners" : "players"].set(rest.join(":"), event.target.value);
        if (type === "owner") {
            // the team's roster is looked in first for its players' names
            state.chosen.players = new Map();
            state.read = readSheet(state.kind, state.text, {players, rosters: state.rosters, franchises, chosen: state.chosen});
        }
        if (!choices().length) {
            state.result = plan(state.read, {chosen: state.chosen, rosters: state.rosters, players, draft: state.draft, teamCount, clearing});
        }
        render();
    });
    layer.addEventListener("click", (event) => {
        const kind = event.target.closest("[data-kind]");
        if (kind && !state.busy) {
            Object.assign(state, {kind: kind.dataset.kind, text: "", read: null, result: null, log: [], error: "", chosen: {owners: new Map(), players: new Map()}});
            render();
        } else if (state.busy) {
            return;
        } else if (event.target.closest(".fuad-load-read")) {
            state.chosen.players = new Map();
            read();
        } else if (event.target.closest(".fuad-load-apply")) {
            apply();
        }
    });
    render();
    openDialog(layer, {opener, history: true, onClose: () => layer.remove()});
}
