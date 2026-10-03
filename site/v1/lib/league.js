// Builds the league model from MFL export sections. No DOM and no fetching, so it
// runs the same in the page and in the daily job, and can be tested on saved data.

import {asArray, displayName} from "./mfl.js";
import {capPenalty, netCapSpace} from "./rules.js";

function newPlayer(id, fullName, nflPosition, team) {
    return {
        playerId: id, fullName, nflPosition, team,
        franchise: null, status: null, salary: 0, years: 0, capPenalty: 0, netCapSpace: 0,
        contractStatus: null, injured: false,
        // newest first, once the model is built
        transactions: []
    };
}

function newFranchise(id, teamName) {
    return {
        franchiseId: id, teamName, salary: 0, numPlayers: 0, lineup: [],
        pendingDroppedPlayers: [], pendingPenalty: 0, penaltyReason: "",
        // rostered players with no contract years yet
        signedPlayers: []
    };
}

/** Players from the `players` export: Map of id -> player. */
export function playersFromExport(players) {
    const byId = new Map();
    for (const player of asArray(players.player)) {
        byId.set(player.id, newPlayer(player.id, displayName(player.name), player.position, player.team));
    }
    return byId;
}

/** Salary as the site counts it: anything under $1 counts as $0. */
function salaryOf(value) {
    const salary = parseFloat(value);
    return salary < 1 ? 0 : salary;
}

function setContract(player, salary, contractYear) {
    player.salary = salaryOf(salary);
    player.years = parseFloat(contractYear);
    player.capPenalty = capPenalty(player.years, player.salary);
    player.netCapSpace = netCapSpace(player.years, player.salary);
}

/**
 * Build the league from export sections. Each argument is the top-level section of
 * that export (e.g. the `rosters` object). `players` is a Map from playersFromExport.
 * `freeAgents`, `transactions`, `weeklyResults`, `salaryAdjustments` and `injuries`
 * may be omitted when a caller doesn't need what they feed.
 */
export function buildLeague({players, league, salaryAdjustments, rosters, transactions, weeklyResults, freeAgents, injuries}) {
    const franchises = new Map();
    for (const franchise of asArray(league.franchises && league.franchises.franchise)) {
        franchises.set(franchise.id, newFranchise(franchise.id, franchise.name));
    }
    const rosteredPlayers = [];
    let week = "";

    if (salaryAdjustments) {
        for (const adjustment of asArray(salaryAdjustments.salaryAdjustment)) {
            const franchise = franchises.get(adjustment.franchise_id);
            if (franchise) {
                franchise.salary = franchise.salary + parseFloat(adjustment.amount);
            }
        }
    }

    for (const rosterFranchise of asArray(rosters.franchise)) {
        const franchise = franchises.get(rosterFranchise.id);
        for (const entry of asArray(rosterFranchise.player)) {
            const player = players.get(entry.id);
            if (!player || !franchise) {
                continue;
            }
            player.franchise = franchise;
            player.status = entry.status;
            setContract(player, entry.salary, entry.contractYear);
            player.contractStatus = entry.contractStatus || null;
            franchise.salary = franchise.salary + player.salary;
            rosteredPlayers.push(player);
            if (entry.status === "ROSTER") {
                franchise.numPlayers++;
            }
            if (player.years === 0) {
                franchise.signedPlayers.push(player);
            }
        }
    }

    if (transactions) {
        const record = (playerId, transaction, added) => {
            const player = playerId && players.get(playerId);
            if (player) {
                player.transactions.push({
                    timestamp: Number(transaction.timestamp),
                    franchise: franchises.get(transaction.franchise) || null,
                    added
                });
            }
        };
        const ids = (list) => String(list || "").split(",").filter(Boolean);
        for (const transaction of asArray(transactions.transaction)) {
            if (transaction.type === "FREE_AGENT") {
                const [adds, drops] = String(transaction.transaction).split("|");
                ids(adds).forEach((id) => record(id, transaction, true));
                ids(drops).forEach((id) => record(id, transaction, false));
            } else if (transaction.type === "WAIVER") {
                ids(transaction.added).forEach((id) => record(id, transaction, true));
                ids(transaction.dropped).forEach((id) => record(id, transaction, false));
            } else if (transaction.type === "BBID_WAIVER") {
                // "added,|bid|dropped," -- only the first player on each side counts
                const [added, , dropped] = String(transaction.transaction).split("|");
                record(ids(added)[0], transaction, true);
                if (dropped !== "0000") {
                    record(ids(dropped)[0], transaction, false);
                }
            }
        }
        for (const player of players.values()) {
            player.transactions.sort((a, b) => b.timestamp - a.timestamp);
        }
    }

    if (weeklyResults) {
        week = weeklyResults.week || "";
        const resultFranchises = asArray(weeklyResults.matchup)
            .flatMap((matchup) => asArray(matchup.franchise))
            .concat(asArray(weeklyResults.franchise));
        for (const result of resultFranchises) {
            const franchise = franchises.get(result.id);
            for (const entry of asArray(result.player)) {
                const player = players.get(entry.id);
                if (franchise && player && entry.status === "starter") {
                    franchise.lineup.push(player);
                }
            }
        }
    }

    if (freeAgents) {
        const units = asArray(freeAgents.leagueUnit);
        for (const entry of units.flatMap((unit) => asArray(unit.player))) {
            const player = players.get(entry.id);
            if (!player) {
                continue;
            }
            setContract(player, entry.salary, entry.contractYear);
            // A free agent still carrying a contract, last moved by a drop, is owed a cap penalty.
            const latest = player.transactions[0];
            if ((player.salary > 1 || player.years > 0) && latest && !latest.added && latest.franchise) {
                latest.franchise.pendingDroppedPlayers.push(player);
            }
        }
        for (const franchise of franchises.values()) {
            franchise.pendingPenalty = franchise.pendingDroppedPlayers.reduce((total, player) => total + player.capPenalty, 0);
            franchise.penaltyReason = franchise.pendingDroppedPlayers
                .map((player) => `${player.fullName} (${player.years}yrs@${player.salary})`)
                .join(" : ");
        }
    }

    if (injuries) {
        for (const injury of asArray(injuries.injury)) {
            const status = injury.status || "";
            // IR also comes as IR-R, IR-PUP and IR-NFI
            if (status.indexOf("IR") === 0 || status === "Out" || status === "Suspended") {
                const player = players.get(injury.id);
                if (player) {
                    player.injured = true;
                }
            }
        }
    }

    return {players, franchises, rosteredPlayers, week};
}
