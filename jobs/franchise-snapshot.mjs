// The franchise salary snapshot, taken once a season after the trade deadline and published with the
// site (docs/design.md).

import {existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from "node:fs";
import {dirname, join} from "node:path";

const LATE_AFTER_DAYS = 7;

// whether it wrote one
export async function run(ctx, year) {
    const {lib, dryRun, now, host, leagueId, dataDir, dataIsThisLeagues, log, choreLog, fetchFrom, exportOptions} = ctx;
    const {API_BASE, weekKickoff} = lib.mfl;
    const {TRADE_DEADLINE_WEEK, franchiseSalary, franchiseTopSalaries} = lib.rules;
    const {buildLeague, playersFromExport} = lib.league;
    const {makeSnapshot, snapshotFileName} = lib.franchise;
    const file = join(dataDir, "data", snapshotFileName(year));
    if (dataIsThisLeagues && existsSync(file)) {
        log(`The ${year} franchise snapshot already exists.`);
        return false;
    }
    const deadline = await weekKickoff(year, TRADE_DEADLINE_WEEK, exportOptions);
    if (!deadline) {
        log(`MFL hasn't published the ${year} week ${TRADE_DEADLINE_WEEK} schedule yet; nothing to snapshot.`);
        return false;
    }
    if (now < deadline) {
        log(`The ${year} trade deadline is ${deadline.toISOString()}; nothing to snapshot yet.`);
        return false;
    }
    const [players, league, rosters] = await Promise.all([
        fetchFrom(API_BASE, "players", {}, "players", year),
        fetchFrom(host, "league", {L: leagueId}, "league", year),
        fetchFrom(host, "rosters", {L: leagueId}, "rosters", year)
    ]);
    const built = buildLeague({players: playersFromExport(players), league, rosters});
    const top = franchiseTopSalaries(built.rosteredPlayers);
    const daysLate = Math.floor((now - deadline) / 86400000);
    const late = daysLate >= LATE_AFTER_DAYS;
    const source = late
        ? `Daily job, ${daysLate} days after the trade deadline: rosters may have changed since, so check it`
        : "Daily job, after the trade deadline";
    const snapshot = makeSnapshot(year, top, {takenAt: now.toISOString(), source});
    const summary = Object.entries(top).map(([position, list]) => `${position} $${franchiseSalary(list)}`).join(", ");
    if (dryRun) {
        choreLog(`Dry run: would take the ${year} franchise salary snapshot${late ? ` ${daysLate} days late` : ""} (${summary}).`);
        return false;
    }
    mkdirSync(dirname(file), {recursive: true});
    writeFileSync(file, JSON.stringify(snapshot, null, 2) + "\n");
    choreLog(late
        ? `Took the ${year} franchise salary snapshot ${daysLate} days late (${summary}). Rosters may have changed since the deadline; check it.`
        : `Took the ${year} franchise salary snapshot (${summary}).`);
    return true;
}

// the snapshots the site doesn't have, including ones committed or corrected by hand on league-data
export async function toPublish({dataDir, dataIsThisLeagues, pagesData, userAgent, log}) {
    if (!dataIsThisLeagues) {
        return [];
    }
    const dir = join(dataDir, "data");
    const files = existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith(".json")) : [];
    const stale = [];
    for (const file of files) {
        try {
            const response = await fetch(new URL(file, pagesData), {headers: {"User-Agent": userAgent}, cache: "no-store"});
            const local = readFileSync(join(dir, file), "utf8");
            if (response.status === 404 || (response.ok && (await response.text()) !== local)) {
                stale.push(file);
            }
        } catch (error) {
            log(`Couldn't check whether ${file} is published (${error.message}); will check again tomorrow.`);
        }
    }
    return stale;
}
