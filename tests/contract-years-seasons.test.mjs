// The contract years chore replayed on the league's real 2019–2026 seasons (tests/fixtures/seasons:
// each season's posts, blind bid comments, adds and end-of-season rosters, owners' names replaced),
// one run each morning after adds, and checked against the years each player ended the season on.
// The adds it gets wrong or flags are listed: mostly rule defaults the commissioner overrode, posts
// after the hour, and one-offs. A change that fixes or breaks one fails here, naming the player.

import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {decideYears, teamPlayers} from "../site/v2/lib/contract-years.js";
import {contractDeadline, pendingAdds} from "../site/v2/lib/adds.js";

const SEASONS = {
    2019: {match: 45, differ: ["Edwards, Gus", "Ginn Jr., Ted", "Dissly, Will"], flagged: ["Phillip Dorsett", "Rex Burkhead"]},
    2020: {match: 39, differ: ["Agholor, Nelson"], flagged: ["Marquez Valdes-Scantling"]},
    2021: {match: 30, differ: ["Knox, Dawson", "Bourne, Kendrick", "Johnson, D'Ernest", "Uzomah, C.J."], flagged: ["Emmanuel Sanders", "Taylor Heinicke"]},
    2022: {match: 29, differ: [], flagged: []},
    2023: {match: 41, differ: ["Atwell, Tutu", "Hopkins, Dustin", "Johnson, Juwan"], flagged: []},
    2024: {match: 50, differ: ["Hill, Justice"], flagged: []},
    2025: {match: 45, differ: ["Ferguson, Terrance", "Elliott, Jake", "Cowing, Jacob"], flagged: []},
    2026: {match: 20, differ: ["Keenum, Case"], flagged: []}
};

// the job's morning run, taken as 08:00 UTC; an add in the hour before is still in its window, so waits a day
function runAfter(time) {
    const run = new Date(time * 1000);
    run.setUTCHours(8, 0, 0, 0);
    if (run.getTime() / 1000 - time < 3600) {
        run.setUTCDate(run.getUTCDate() + 1);
    }
    return run.getTime() / 1000;
}

function replay(season) {
    const data = JSON.parse(readFileSync(new URL(`./fixtures/seasons/${season}.json`, import.meta.url), "utf8"));
    const players = new Map(data.players.map((player) => [player.id, player]));
    const finalYears = new Map(data.rosters.flatMap((franchise) => franchise.player.map((entry) => [entry.id, entry.contractYear])));
    // as each add stood before the job set its years
    const zeroed = {franchise: data.rosters.map((franchise) => ({...franchise, player: franchise.player.map((entry) => ({...entry, contractYear: "0"}))}))};
    const adds = pendingAdds({rosters: zeroed, transactions: data.transactions, players});
    const teams = teamPlayers({rosters: {franchise: data.rosters}, players});
    const runs = new Map();
    for (const add of adds) {
        const run = runAfter(add.added);
        runs.set(run, [...(runs.get(run) || []), add]);
    }
    const result = {match: 0, differ: [], flagged: []};
    for (const [run, pending] of [...runs].sort((a, b) => a[0] - b[0])) {
        const {contracts, flags} = decideYears({adds: pending, posts: data.posts.filter((post) => Number(post.postTime) <= run),
            bidRequests: data.bids, teams, contractDeadline});
        for (const contract of contracts) {
            if (String(contract.years) === String(finalYears.get(contract.playerId))) {
                result.match++;
            } else {
                result.differ.push(contract.name);
            }
        }
        result.flagged.push(...flags.map((flag) => flag.split(":")[0]));
    }
    return result;
}

for (const [season, expected] of Object.entries(SEASONS)) {
    test(`the ${season} season's adds get the years they ended the season on`, () => {
        assert.deepEqual(replay(season), expected);
    });
}
