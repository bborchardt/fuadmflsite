// The commissioner's sheet after the auction and the rookie draft, pasted from a spreadsheet, read
// into what MFL needs (ui/load-form.js). The auction's tab holds a block per team, headed by the
// owner's first name: player, rank ("QB2"), $, Yrs. A player with a $ is the team's at that salary and
// length (0 years: due one with Home's form); one without was on the team and is released. The
// rookie tab's Pick, Owner and Player columns are the draft, in pick order. Players are named as
// people write them ("AJ Brown", "Marvin Harrison Jr."); MFL names them "Brown, A.J.".

import {rookieSalary, POSITIONS} from "./rules.js";
import {asArray, salariesImportXml} from "./mfl.js";
import settings from "./settings.js";
import {SUFFIXES, withoutAccents} from "./names.js";

const cells = (text) => String(text).replace(/\r/g, "").split("\n").map((line) => line.split("\t").map((cell) => cell.trim()));

// rows that end a team's block
const FOOTER = /^(cap penalties|total|max bid)$/i;

// [{owner, players: [{name, position, salary, years, row}]}]: salary null for a player released
export function readAuction(text) {
    const rows = cells(text);
    const header = rows.findIndex((row) => row.some((cell) => cell === "$") && row.some((cell) => /^yrs?$/i.test(cell)));
    if (header < 0) {
        return [];
    }
    const blocks = [];
    rows[header].forEach((cell, at) => {
        if (cell === "$" && at >= 2 && rows[header][at - 2]) {
            blocks.push({owner: rows[header][at - 2], at: at - 2});
        }
    });
    return blocks.map(({owner, at}) => {
        const players = [];
        for (let index = header + 1; index < rows.length; index++) {
            const name = rows[index][at] || "";
            if (FOOTER.test(name)) {
                break;
            }
            if (!name) {
                continue;
            }
            const [rank, dollars, years] = [rows[index][at + 1] || "", rows[index][at + 2] || "", rows[index][at + 3] || ""];
            players.push({
                name,
                position: (rank.match(/^[A-Z]+/) || [""])[0] || null,
                salary: dollars === "" ? null : Number(dollars.replace(/[$,]/g, "")),
                years: years === "" ? null : Number(years),
                row: index + 1
            });
        }
        return {owner, players};
    });
}

// [{owner, name, row}] in pick order, from the columns headed Pick, Owner and Player (the last Player)
export function readRookies(text) {
    const rows = cells(text);
    const header = rows.findIndex((row) => row.includes("Owner") && row.includes("Pick"));
    if (header < 0) {
        return [];
    }
    const ownerAt = rows[header].indexOf("Owner");
    const playerAt = rows[header].indexOf("Player", ownerAt);
    if (playerAt < 0) {
        return [];
    }
    const picks = [];
    for (let index = header + 1; index < rows.length; index++) {
        const owner = rows[index][ownerAt] || "";
        if (!owner) {
            continue;
        }
        picks.push({owner, name: rows[index][playerAt] || "", row: index + 1});
    }
    return picks;
}

// "Brown, A.J." and "AJ Brown" alike: first name first, without accents, periods, apostrophes, hyphens or a
// suffix (Jr., III)
const SUFFIX_WORDS = new RegExp(`\\b(${[...SUFFIXES].join("|")})\\b`, "g");
export function plainName(name) {
    const text = String(name).includes(",") ? String(name).split(",").reverse().join(" ") : String(name);
    return withoutAccents(text).toLowerCase().replace(/[.'’`]/g, "").replace(/-/g, " ")
        .replace(SUFFIX_WORDS, " ").replace(/\s+/g, " ").trim();
}

const lastName = (name) => plainName(name).split(" ").pop();

// The MFL player a sheet's name is: {id} when one fits, else {choices: [ids]} to pick from (the same
// last name at the position, or anywhere), empty when none. `roster` (ids) is looked in first.
export function matchPlayer({name, position}, players, roster = []) {
    const wanted = plainName(name);
    const same = (id) => players.get(id) && plainName(players.get(id).name) === wanted;
    const atPosition = (ids) => (position ? ids.filter((id) => players.get(id).position === position) : ids);
    const onRoster = roster.filter(same);
    if (onRoster.length === 1) {
        return {id: onRoster[0]};
    }
    const named = [...players.keys()].filter(same);
    const found = named.length > 1 ? atPosition(named) : named;
    if (found.length === 1) {
        return {id: found[0]};
    }
    if (found.length > 1) {
        return {choices: found};
    }
    const last = lastName(name);
    const near = [...players.keys()].filter((id) => lastName(players.get(id).name) === last);
    return {choices: atPosition(near).length ? atPosition(near) : near};
}

// A sheet's owner, by first name, among the league's franchises ({id, owner_name}): the id, or null
// when none or more than one has that first name
export function matchOwner(owner, franchises) {
    const first = plainName(owner).split(" ")[0];
    const found = asArray(franchises).filter((team) => plainName(team.owner_name || "").split(" ")[0] === first);
    return found.length === 1 ? found[0].id : null;
}

// What the auction's sheet changes on MFL, team by team, once every team and player is matched:
// `teams` [{franchiseId, players: [{id, salary, years}]}] (salary null: released), `rosters` MFL's
// export. Resolves to {release: [{franchiseId, id, years, salary}], add: [{franchiseId, id}],
// salaries: [{id, salary, years}], clear: [ids], conflicts: [{id, franchiseIds}]}. `clear` is who's
// released to no team: MFL keeps an unloaded player's salary and years until they're cleared. A
// player on two teams' sheets with a $ is a conflict, left out of the rest.
export function planAuction({teams, rosters}) {
    const held = new Map();
    for (const team of asArray(rosters && rosters.franchise)) {
        for (const entry of asArray(team.player)) {
            held.set(entry.id, {franchiseId: team.id, salary: Number(entry.salary), years: Number(entry.contractYear)});
        }
    }
    const kept = new Map();
    for (const team of teams) {
        for (const player of team.players.filter((entry) => entry.salary !== null)) {
            kept.set(player.id, [...(kept.get(player.id) || []), {...player, franchiseId: team.franchiseId}]);
        }
    }
    const conflicts = [...kept].filter(([, list]) => list.length > 1).map(([id, list]) => ({id, franchiseIds: list.map((entry) => entry.franchiseId)}));
    const conflicted = new Set(conflicts.map((conflict) => conflict.id));
    const sheetTeams = new Set(teams.map((team) => team.franchiseId));
    // a player bought from a team the sheet doesn't have would be on both rosters
    for (const [id, list] of kept) {
        const now = held.get(id);
        if (list.length === 1 && now && !sheetTeams.has(now.franchiseId) && now.franchiseId !== list[0].franchiseId) {
            conflicts.push({id, franchiseIds: [now.franchiseId, list[0].franchiseId]});
            conflicted.add(id);
        }
    }
    const release = [];
    for (const [id, now] of held) {
        const going = kept.get(id);
        // a team the sheet doesn't have keeps its players
        if (sheetTeams.has(now.franchiseId) && !conflicted.has(id) && (!going || going[0].franchiseId !== now.franchiseId)) {
            release.push({franchiseId: now.franchiseId, id, years: now.years, salary: now.salary});
        }
    }
    const add = [];
    const salaries = [];
    for (const [id, [player]] of kept) {
        if (conflicted.has(id)) {
            continue;
        }
        const now = held.get(id);
        if (!now || now.franchiseId !== player.franchiseId) {
            add.push({franchiseId: player.franchiseId, id});
        }
        const years = player.years === null ? 0 : player.years;
        if (!now || now.franchiseId !== player.franchiseId || now.salary !== player.salary || now.years !== years) {
            salaries.push({id, salary: player.salary, years});
        }
    }
    const clear = release.filter((entry) => !kept.has(entry.id)).map((entry) => entry.id);
    return {release, add, salaries, clear, conflicts};
}

// The Load/Unload Rosters posts that make the plan's `release` and `add`, each a team's whole roster
// (`rosters` as MFL has them now): every team's unloads before any team's loads, so a player can move
// between teams. [{franchiseId, ids, unloaded: [ids], loaded: [ids]}]
export function rosterSteps({rosters, release = [], add = []}) {
    const roster = new Map(asArray(rosters && rosters.franchise).map((team) => [team.id, asArray(team.player).map((entry) => entry.id)]));
    const steps = [];
    for (const franchiseId of [...new Set(release.map((entry) => entry.franchiseId))]) {
        const unloaded = release.filter((entry) => entry.franchiseId === franchiseId).map((entry) => entry.id);
        roster.set(franchiseId, (roster.get(franchiseId) || []).filter((id) => !unloaded.includes(id)));
        steps.push({franchiseId, ids: roster.get(franchiseId), unloaded, loaded: []});
    }
    for (const franchiseId of [...new Set(add.map((entry) => entry.franchiseId))]) {
        const loaded = add.filter((entry) => entry.franchiseId === franchiseId).map((entry) => entry.id);
        roster.set(franchiseId, [...(roster.get(franchiseId) || []), ...loaded]);
        steps.push({franchiseId, ids: roster.get(franchiseId), unloaded: [], loaded});
    }
    return steps;
}

const baseline = (position) => (POSITIONS.find((entry) => entry.code === position) || {rookieBaseline: 1}).rookieBaseline;

// The rookie draft's picks for MFL, `picks` [{franchiseId, id}] in order, `teams` how many to a
// round: [{round, pick, franchiseId, id, salary}], each on the rookie scale by overall pick
// (rules.js) at 0 years
export function planRookies({picks, teams, players}) {
    return picks.map((entry, index) => ({
        ...entry,
        round: Math.floor(index / teams) + 1,
        pick: (index % teams) + 1,
        salary: rookieSalary(baseline((players.get(entry.id) || {}).position), index + 1)
    }));
}

// Why a sheet row's $ and Yrs can't be sent, or null: a salary of $1 or more and a whole number of
// years from 0 (due one with Home's form) to the league's most. Yrs left blank is 0.
export function contractProblem({salary, years}) {
    if (Number.isNaN(salary) || Number.isNaN(years)) {
        return "its $ or Yrs isn’t a number";
    }
    if (!(salary >= 1)) {
        return `$${salary}: a salary is at least $1`;
    }
    const maxYears = settings.contracts.maxYears;
    if (years !== null && !(Number.isInteger(years) && years >= 0 && years <= maxYears)) {
        return `${years} yrs: a length is a whole number of years, 0 to ${maxYears}`;
    }
    return null;
}

// What a send makes of the sheet as read (ui/load-form.js readSheet) against MFL now: the auction's
// planAuction, its `clear` taking in any player an earlier send unloaded (`clearing`) whose salaries
// step didn't go through, unless the sheet places him; or the rookie draft's picks, with what differs
// from MFL's draft results, rosters and salaries. `chosen` maps the sheet's owners to teams and its
// entries to players.
export function planSend(read, {chosen, rosters, players, draft, teamCount, clearing = new Set()}) {
    if (read.kind === "auction") {
        const teams = read.sheet.map((team) => ({
            franchiseId: chosen.owners.get(team.owner),
            players: team.players.filter((player) => player.salary !== null).map((player) => ({
                id: chosen.players.get(`${team.owner}:${player.row}:${player.name}`), salary: player.salary, years: player.years
            }))
        }));
        const result = planAuction({teams, rosters});
        // unloaded in an earlier send whose salaries step didn't go through
        const rostered = new Set(asArray(rosters.franchise).flatMap((team) => asArray(team.player).map((entry) => entry.id)));
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
    const held = new Map(asArray(rosters.franchise).flatMap((team) => asArray(team.player).map((entry) => [entry.id, entry])));
    // MFL's import overwrites the picks it's sent and keeps the others (the clone, 3 Nov 2026)
    const atPick = new Map(asArray(draft && draft.draftPick).map((entry) => [`${Number(entry.round)}.${Number(entry.pick)}`, entry]));
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
export function movedFrom(picks, rosters) {
    const drafted = new Map(picks.map((pick) => [pick.id, pick.franchiseId]));
    return asArray(rosters.franchise).flatMap((team) => asArray(team.player)
        .filter((entry) => drafted.has(entry.id) && drafted.get(entry.id) !== team.id)
        .map((entry) => ({franchiseId: team.id, id: entry.id})));
}

// the picks not yet on their team's roster
export function notOnTeam(picks, rosters) {
    const roster = new Map(asArray(rosters.franchise).map((team) => [team.id, new Set(asArray(team.player).map((entry) => entry.id))]));
    return picks.filter((pick) => !(roster.get(pick.franchiseId) || new Set()).has(pick.id));
}

const two = (number) => String(number).padStart(2, "0");
const attr = (value) => String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// MFL's draftResults import: the whole draft, replacing what MFL has
export function draftResultsXml(picks) {
    const order = picks.filter((entry) => entry.round === 1).map((entry) => entry.franchiseId).join(",");
    return `<draftResults><draftUnit unit="LEAGUE" round1DraftOrder="${attr(order)},">${picks.map((entry) =>
        `<draftPick round="${two(entry.round)}" pick="${two(entry.pick)}" franchise="${attr(entry.franchiseId)}" player="${attr(entry.id)}"/>`).join("")}</draftUnit></draftResults>`;
}

// MFL's salaries import, laid over what MFL has (APPEND); `clear` (ids) set blank, as a player on no
// roster has (the clone, 3 Nov 2026)
export function salariesXml(entries, clear = []) {
    const set = new Set(entries.map((entry) => entry.id));
    return salariesImportXml(entries.concat(clear.filter((id) => !set.has(id)).map((id) => ({id, salary: "", years: ""}))));
}
