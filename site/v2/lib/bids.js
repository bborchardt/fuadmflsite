// A team's pending blind bids, as they could land. A bid that could put a team over a limit is
// invalid by league rule (5.5), so this is what Home's alert and Moves' controls check.

import {asArray} from "./mfl.js";
import {ROSTER_MAX, SALARY_CAP} from "./rules.js";

// MFL's `pendingWaivers`: one entry per group, its claims in priority order as ADD_BID_DROP
export function pendingGroups(pendingWaivers) {
    return asArray(pendingWaivers && pendingWaivers.blindBidWaiverRequest).map((group) => ({
        round: Number(group.round),
        claims: String(group.addsDrops || "").split(",").filter(Boolean).map((claim) => {
            const [add, bid, drop] = claim.split("_");
            return {add, bid: Number(bid) || 0, drop: drop && drop !== "0000" ? drop : null};
        })
    })).filter((group) => group.claims.length);
}

// What one claim does to cap used: the bid comes on, the drop's salary goes off and his cut
// penalty on. `players` maps ids to the league model's players.
export function claimCapChange(claim, players) {
    const dropped = claim.drop && players.get(claim.drop);
    return claim.bid - (dropped ? dropped.salary - dropped.capPenalty : 0);
}

// an IR player's drop frees no active spot
const addsActive = (claim, players) => !claim.drop || (players.get(claim.drop) || {}).status === "INJURED_RESERVE";

// If every group's costliest claim wins: groups have no priority and each awards one claim or none,
// so the most any group can add is its largest cap change, never less than nothing (a group whose
// claims all lower cap used may still lose), and an active player if any claim adds one.
export function projectBids(franchise, groups, players) {
    let capChange = 0;
    let rosterChange = 0;
    for (const group of groups) {
        capChange += Math.max(0, ...group.claims.map((claim) => claimCapChange(claim, players)));
        rosterChange += group.claims.some((claim) => addsActive(claim, players)) ? 1 : 0;
    }
    const cap = Math.round((franchise.capTotal + capChange) * 100) / 100;
    const roster = franchise.numPlayers + rosterChange;
    return {
        bids: groups.reduce((total, group) => total + group.claims.length, 0),
        cap,
        roster,
        overCap: cap > SALARY_CAP,
        // bids that only swap active players are fine at any roster size
        overRoster: rosterChange > 0 && roster > ROSTER_MAX
    };
}
