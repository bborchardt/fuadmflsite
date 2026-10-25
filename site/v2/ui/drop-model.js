// Moves › Drop's data and checks, from MFL's Drop Players page (docs/mfl.md, Forms) and the league
// model: no DOM here, so each can be checked against saved pages. A drop lands at once, so every
// pending bid has to still fit after it (5.5), as for an immediate add.

import {projectBids} from "../lib/bids.js";
import {ROSTER_MIN, SALARY_CAP} from "../lib/rules.js";
import {args, dropGroups, firstLast, isIR, projection, readMarks} from "./add-model.js";
import {cents} from "./format.js";

// MFL's roster list on the Drop Players page (`playerDatabaseObj["picker"]`), from the page's
// script text: each player's id and MFL's mark (`!` once his game has started)
export function readRoster(html) {
    const players = [];
    const call = /pdb_picker\[(\d+)\]\s*=\s*new Player2\s*\(([^\n]*)\);/g;
    let found;
    while ((found = call.exec(html))) {
        const [id, name, nfl, pos] = args(found[2]);
        const marks = readMarks(name);
        players.push({index: Number(found[1]), id, mflName: marks.mflName, name: firstLast(marks.mflName), mark: marks.mark, nfl, pos});
    }
    return players;
}

// A drop's checks: {fits, why, cap: {from, to}} for `drop` (a player id). Cap used takes his
// penalty for his salary; a pending claim dropping him too counts as no drop after it. Blocked when
// that takes cap used past the cap, or further past it, with every group's costliest claim; in
// season, an active player's drop at 23 active (9.2), and any drop under 23 (10.5).
export function checkDrop(team, {drop, phase}) {
    const before = projection(team);
    const dropped = team.players.get(drop);
    const franchise = {
        ...team.franchise,
        capTotal: cents(team.franchise.capTotal - dropped.salary + dropped.capPenalty),
        numPlayers: team.franchise.numPlayers - (isIR(dropped) ? 0 : 1)
    };
    const groups = team.groups.map((group) => ({
        round: group.round, claims: group.claims.map((claim) => (claim.drop === drop ? {...claim, drop: null} : claim))
    }));
    const after = projectBids(franchise, groups, team.players);
    const active = team.franchise.numPlayers;
    let why = null;
    if (after.cap > SALARY_CAP && after.cap > before.cap) {
        why = "over cap";
    } else if (phase === "season" && (isIR(dropped) ? active < ROSTER_MIN : active <= ROSTER_MIN)) {
        why = "under roster minimum";
    }
    return {fits: !why, why, cap: {from: team.franchise.capTotal, to: franchise.capTotal}};
}

// The group each player is dropped in by a pending claim, the first if several
export function bidDrops(groups) {
    const used = new Map();
    for (const group of groups) {
        group.claims.filter((claim) => claim.drop && !used.has(claim.drop)).forEach((claim) => used.set(claim.drop, group.round));
    }
    return used;
}

// The roster by position, each player's penalty, cap change and whether he can go now. `roster` is
// readRoster's list: a player whose game has started (MFL's `!`) can't be dropped until it clears.
export function dropRows(team, {roster, phase, positions}) {
    const marks = new Map(roster.map((player) => [player.id, player]));
    return dropGroups(team, {marks, check: (drop) => checkDrop(team, {drop, phase}), immediate: true, usedIn: bidDrops(team.groups), positions});
}
