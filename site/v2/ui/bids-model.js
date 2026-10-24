// A blind bid run from MFL's Previously Processed Waivers page (`processed_waivers?PERIOD=<run>`,
// logged in), the only place other teams' bids and their comments show (docs/mfl.md). No drawing or
// fetching here, so it can be checked against saved pages.

import {displayName} from "../lib/mfl.js";
import {text} from "./player-page.js";

// "Add Marks, Woody HOU RB for $5.00 and drop None"
const CLAIM = /^Add (.+) (\S+) ([A-Za-z]{1,4}) for \$([\d.]+) and drop (.+)$/;
// "5yrs", "5 years.", "2 yr"
const YEARS = /\b([1-5])\s*-?\s*(?:yrs?|years?)\b/i;

// [{team, claims: [{name, nfl, position, amount}], comment, awarded, refused}], one per group in the
// page's order: `awarded` the index of the claim MFL gave the group, or null; `refused` MFL's reason
// for each claim it turned down, by name. MFL lists a group again for each step it took
// through it; that counts once. null if the page has no waiver table.
export function readBidRun(html) {
    const table = /<table[^>]*class="report[^"]*"[^>]*>([\s\S]*?)<\/table>/i.exec(String(html || ""));
    if (!table || !/Original Waiver Request/i.test(table[1])) {
        return null;
    }
    const groups = new Map();
    for (const row of table[1].match(/<tr\b[\s\S]*?<\/tr>/gi) || []) {
        const cells = row.match(/<td\b[^>]*>[\s\S]*?<\/td>/gi) || [];
        const team = cells.length >= 5 && (/franchise_(\d{4})/.exec(cells[1]) || [])[1];
        if (!team) {
            continue;
        }
        const lines = cells[4].replace(/<br\s*\/?>/gi, "\n").split("\n").map(text).filter(Boolean);
        const claims = lines.map((line) => CLAIM.exec(line)).filter(Boolean).map((match) => ({name: match[1], nfl: match[2], position: match[3], amount: Number(match[4])}));
        const at = lines.findIndex((line) => /^Comments:/.test(line));
        const comment = at < 0 ? "" : [lines[at].replace(/^Comments:\s*/, ""), ...lines.slice(at + 1)].join("\n").trim();
        if (!claims.length) {
            continue;
        }
        const key = `${team}|${JSON.stringify(claims)}|${comment}`;
        const group = groups.get(key) || {team, claims, comment, awarded: null, refused: {}};
        groups.set(key, group);
        // "Marks, Woody HOU RB Cannot Be Added Because Is Not Available.", one line per claim refused
        cells[5].replace(/<br\s*\/?>/gi, "\n").split("\n").map(text).forEach((line) => {
            const refused = /^(.+?) \S+ [A-Za-z]{1,4} Cannot Be Added Because (.+?)\.?$/i.exec(line);
            if (refused) {
                group.refused[refused[1]] = refused[2];
            }
        });
        // "Marks, Woody HOU RB ($5.00)", or "None"
        const added = (/^(.+) \S+ [A-Za-z]{1,4} \(\$/.exec(text(cells[2])) || [])[1];
        const index = added ? claims.findIndex((claim) => claim.name === added) : -1;
        if (index >= 0) {
            group.awarded = index;
        }
    }
    return [...groups.values()];
}

// the years a group's comment gives a claim: with one claim, the comment's; with several, the line
// in the same place when there's a line per claim, else the line naming the player; else null
export function yearsFor(group, index) {
    const read = (line) => Number((YEARS.exec(line) || [])[1]) || null;
    if (group.claims.length === 1) {
        return read(group.comment);
    }
    const lines = group.comment.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length === group.claims.length) {
        return read(lines[index]);
    }
    const last = group.claims[index].name.split(",")[0].trim().toLowerCase();
    const naming = lines.find((line) => line.toLowerCase().includes(last));
    return naming ? read(naming) : null;
}

// the bids MFL tried: a group's claims up to the one it was awarded, every claim if none
const tried = (group) => group.claims.slice(0, group.awarded === null ? group.claims.length : group.awarded + 1);

// the other teams' bids on a player the run awarded to `winner`, highest first: [{team, amount, years}],
// one per team, its highest (a team may name a player in several groups). A claim behind the one its
// group won was never tried, so it isn't a bid that lost. `name` as MFL writes it ("Marks, Woody") or
// as v2 shows it ("Woody Marks").
export function otherBids(groups, name, winner) {
    const wanted = displayName(name);
    const best = new Map();
    for (const group of groups || []) {
        if (group.team === winner) {
            continue;
        }
        tried(group).forEach((claim, index) => {
            if (displayName(claim.name) === wanted && !(best.has(group.team) && best.get(group.team).amount >= claim.amount)) {
                best.set(group.team, {team: group.team, amount: claim.amount, years: yearsFor(group, index)});
            }
        });
    }
    return [...best.values()].sort((a, b) => b.amount - a.amount);
}

// MFL's reason a claim was turned down, in a few words
export function reasonText(reason) {
    const said = String(reason || "");
    if (/not available/i.test(said)) {
        return "taken";
    }
    if (/cannot be dropped/i.test(said)) {
        return "drop already gone";
    }
    if (/locked/i.test(said)) {
        return "locked";
    }
    return said.toLowerCase();
}

// A run's player ({name, nfl, position}, MFL's page has no id) in v2's players by id: the one of that
// name and position, the NFL team only telling two apart, as he may have moved since. Null unless
// exactly one.
export function playerIdOf(player, known) {
    const name = displayName(player.name);
    const named = [...known.values()].filter((entry) => entry.fullName === name && entry.nflPosition === player.position);
    const found = named.length > 1 ? named.filter((entry) => entry.team === player.nfl) : named;
    return found.length === 1 ? found[0].playerId : null;
}

// A run as a block per player MFL tried a bid on: [{name, nfl, position, won, bids}], the players
// won first (highest winning bid first), then those no one got. `won` is {team, amount, years} or null;
// `bids` the others, one per team at its highest tried bid, each with MFL's `reason` when no one got
// the player.
export function runPlayers(groups) {
    const players = new Map();
    for (const group of groups || []) {
        tried(group).forEach((claim, index) => {
            const key = displayName(claim.name);
            const player = players.get(key) || {name: claim.name, nfl: claim.nfl, position: claim.position, won: null, bids: []};
            players.set(key, player);
            const bid = {team: group.team, amount: claim.amount, years: yearsFor(group, index), reason: reasonText(group.refused[claim.name])};
            if (group.awarded === index) {
                player.won = bid;
            } else {
                player.bids.push(bid);
            }
        });
    }
    return [...players.values()].map((player) => {
        const best = new Map();
        player.bids
            .filter((bid) => !(player.won && bid.team === player.won.team))
            .forEach((bid) => {
                if (!(best.has(bid.team) && best.get(bid.team).amount >= bid.amount)) {
                    best.set(bid.team, bid);
                }
            });
        const bids = [...best.values()].sort((a, b) => b.amount - a.amount).map((bid) => (player.won ? {...bid, reason: ""} : bid));
        return {...player, won: player.won && {...player.won, reason: ""}, bids};
    }).sort((a, b) => (b.won ? b.won.amount : -1) - (a.won ? a.won.amount : -1) || b.bids.length - a.bids.length);
}
