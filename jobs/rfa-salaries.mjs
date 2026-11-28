// The renewal's RFAs: players the commissioner's rollover took from 1 contract year to 0 go to $0.01,
// as MFL won't take $0 (docs/commissioner.md, Each season).

import {existsSync, readFileSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {teamNameIn} from "./chore-context.mjs";

export const RFA_SALARY = "0.01";

// [{playerId, franchiseId}] rostered now at 0 years, at 1 at the end of last season, and on the same
// salary, whatever team they ended it on (neither the rollover nor a trade changes a salary). `added`:
// the players whose latest move is an add to their team, waiting for contract years: one of last
// season's 1-year players dropped and won again is at 0 years too, at his new salary or perhaps the
// same, and a rookie wasn't rostered at all. A salary changed since (a re-signing) is left too.
export function rfaSalaries({lastRosters, rosters, asArray, added = new Set()}) {
    const atOne = atOneYear(lastRosters, asArray);
    return entries(rosters, asArray)
        .filter((player) => Number(player.contractYear) === 0 && atOne.get(player.id) === Number(player.salary)
            && Number(player.salary) !== Number(RFA_SALARY) && !added.has(player.id))
        .map((player) => ({playerId: player.id, franchiseId: player.franchiseId}));
}

const entries = (export_, asArray) => asArray((export_ || {}).franchise)
    .flatMap((team) => asArray(team.player).map((player) => ({...player, franchiseId: team.id})));

// last season's players at 1 contract year when it ended: id → salary
export function atOneYear(lastRosters, asArray) {
    return new Map(entries(lastRosters, asArray).filter((player) => Number(player.contractYear) === 1)
        .map((player) => [player.id, Number(player.salary)]));
}

// more than this share of rostered players looks like a misread, not a rollover
export const MAX_RFA_SHARE = 0.5;

// From renewal to week 1's kickoff, the window v1's Commish tab filled in $0.01 for: before the
// commissioner's rollover no one has gone from 1 year to 0, so there's nothing to do. Resolves to
// the players it set (or would, in a dry run), which aren't due a length.
export async function run(ctx, {built, rosters, transactions, playerNames}) {
    const {lib, loggedIn, season, log, choreLog, wouldPrefix, lastSeasonRosters, mflImport, contractsXml} = ctx;
    const {asArray, displayName} = lib.mfl;
    const {pendingAdds} = lib.adds;
    const applyRfaSalaries = ctx.apply.rfaSalaries;
    if (built.started !== false) {
        log(built.started ? "Week 1 has kicked off; RFA salaries are set only before it." : "The season's start isn't known; RFA salaries skipped.");
        return [];
    }
    const lastRosters = await lastSeasonRosters().catch((error) => {
        throw new Error(`last season's rosters couldn't be read (${error.message}), so no RFA salaries were set`);
    });
    if (!lastRosters) {
        log(`The league has no ${season - 1} site, so it has no RFAs.`);
        return [];
    }
    const added = new Set(pendingAdds({rosters, transactions, players: playerNames}).map((add) => add.playerId));
    // a player set once is settled after: an RFA kept for $1 with no bids (bylaw 6.5) looks like an
    // unsettled one when last season's salary was $1 too
    const record = rfaRecord(ctx);
    const done = rfasSet(ctx, record);
    const rfas = rfaSalaries({lastRosters, rosters, asArray, added}).filter((rfa) => !done.has(rfa.playerId));
    if (!rfas.length) {
        log("No players have gone from 1 contract year to 0 without $0.01.");
        return [];
    }
    const rostered = asArray(rosters.franchise).reduce((total, team) => total + asArray(team.player).length, 0);
    if (rfas.length > rostered * MAX_RFA_SHARE) {
        throw new Error(`${rfas.length} of ${rostered} rostered players look like RFAs, more than expected, so none were set to $${RFA_SALARY}. `
            + "Check the rosters against last season's and set them on MFL's Edit Player Salaries and Contracts page by hand.");
    }
    const name = (rfa) => {
        const player = playerNames.get(rfa.playerId);
        return player ? displayName(player.name) : rfa.playerId;
    };
    const describe = (rfa) => `${name(rfa)} (${teamNameIn(built, rfa.franchiseId)})`;
    if (!applyRfaSalaries) {
        rfas.forEach((rfa) => choreLog(`${wouldPrefix("RFA_SALARIES")} set RFA ${describe(rfa)} to $${RFA_SALARY}.`));
        return rfas.map((rfa) => rfa.playerId);
    }
    if (!loggedIn) {
        throw new Error(`${rfas.length} RFA(s) are waiting for $${RFA_SALARY}, but the job isn't logged in, so none were set.`);
    }
    await mflImport("salaries", contractsXml(rfas.map((rfa) => ({playerId: rfa.playerId, salary: RFA_SALARY, years: 0}))), {APPEND: "1"});
    writeFileSync(rfaFile(ctx), JSON.stringify({...record, [season]: [...done, ...rfas.map((rfa) => rfa.playerId)]}, null, 2) + "\n");
    rfas.forEach((rfa) => choreLog(`Set RFA ${describe(rfa)} to $${RFA_SALARY}.`));
    return rfas.map((rfa) => rfa.playerId);
}

const rfaFile = ({dataDir}) => join(dataDir, "rfa-salaries.json");

// the players this job has set to $0.01, by season (rfa-salaries.json)
function rfaRecord(ctx) {
    const {dataIsThisLeagues} = ctx;
    const file = rfaFile(ctx);
    return dataIsThisLeagues && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
}

// those set this season
export function rfasSet(ctx, record = rfaRecord(ctx)) {
    return new Set(record[ctx.season] || []);
}
