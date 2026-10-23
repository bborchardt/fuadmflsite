// A blind bid run from MFL's Previously Processed Waivers page (`processed_waivers?PERIOD=<run>`,
// logged in), the only place other teams' bids and their comments show (docs/mfl.md). No drawing or
// fetching here, so it can be checked against saved pages.

import {displayName} from "../lib/mfl.js";
import {text} from "./player-page.js";

// "Add Marks, Woody HOU RB for $5.00 and drop None"
const CLAIM = /^Add (.+) (\S+) ([A-Za-z]{1,4}) for \$([\d.]+) and drop (.+)$/;
// "5yrs", "5 years.", "2 yr"
const YEARS = /\b([1-5])\s*-?\s*(?:yrs?|years?)\b/i;

// [{team, claims: [{name, amount}], comment, awarded}], one per group in the page's order, `awarded`
// the index of the claim MFL gave the group, or null. MFL lists a group again for each step it took
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
        const claims = lines.map((line) => CLAIM.exec(line)).filter(Boolean).map((match) => ({name: match[1], amount: Number(match[4])}));
        const at = lines.findIndex((line) => /^Comments:/.test(line));
        const comment = at < 0 ? "" : [lines[at].replace(/^Comments:\s*/, ""), ...lines.slice(at + 1)].join("\n").trim();
        if (!claims.length) {
            continue;
        }
        const key = `${team}|${JSON.stringify(claims)}|${comment}`;
        const group = groups.get(key) || {team, claims, comment, awarded: null};
        groups.set(key, group);
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
