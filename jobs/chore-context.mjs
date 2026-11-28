// What every chore of the daily job is given (REVIEW.md: Architecture): the version's lib, the MFL
// session, the run's log and flags, and the reads and writes the chores share. A chore imports no
// lib/ of its own, so RULES_VERSION decides every rule it goes by.

import {pathToFileURL} from "node:url";
import {join} from "node:path";
import {mflImport as sendImport} from "./mfl-import.mjs";

// the version's lib/ the job reads, each by its name in camel case (contract-years.js: contractYears),
// and taken from as `const {names} = lib.<name>;`, the way tests/guards.test.mjs finds them
export const LIB_FILES = ["mfl.js", "payouts.js", "rounds.js", "league.js", "shapes.js", "rules.js", "franchise.js", "adds.js",
    "violations.js", "contract-years.js", "lengths.js", "backups.js", "zone.js", "names.js", "settings.js"];
export const libKey = (file) => file.replace(/\.js$/, "").replace(/-(\w)/g, (_, letter) => letter.toUpperCase());

export async function loadLib(root, version) {
    const modules = await Promise.all(LIB_FILES.map((file) => import(pathToFileURL(join(root, "site", version, "lib", file)).href)));
    return Object.fromEntries(LIB_FILES.map((file, i) => [libKey(file), modules[i]]));
}

export function teamNameIn(built, id) {
    return (built.franchises.get(id) || {}).teamName || id;
}

// `run`: the run's log and flags (run-log.mjs). `config`: what the run is for and may do, as daily.mjs
// read it from the environment: {dryRun, now, season, host, leagueId, dataDir, dataIsThisLeagues,
// loggedIn, version, apply: {dropPenalties, contractYears, payouts, rfaSalaries, backups}, backupsOff,
// userAgent, repo, repoName, pagesData, savedPagesDir, savePages, dataLeagueId, checkOff}
export function choreContext({lib, session, run, config}) {
    const {dryRun, season, host, leagueId, savedPagesDir, savePages, dataLeagueId} = config;
    const {WEEK_ROSTERS, checkShape} = lib.shapes;
    const {exportSection, exportUrl, fetchExport, salariesImportXml, asArray} = lib.mfl;

    // With Save pages, on a dry run of a league other than the real one (the run's files are public,
    // and a logged-in export may hold what only members see): every export the job reads, as MFL gave
    // it, by address, with the rules other than its section's it was read by; saved-pages.mjs writes
    // them out
    const exportsRead = savePages && savedPagesDir && dataLeagueId && dataLeagueId !== leagueId ? new Map() : null;
    async function exportFetch(url, init) {
        const response = await session.fetch(url, init);
        if (exportsRead && response.ok) {
            exportsRead.set(String(url), {...exportsRead.get(String(url)), body: await response.clone().text()});
        }
        return response;
    }

    // an export whose items lack a field the job relies on throws, so nothing is written from it (lib/shapes.js)
    const exportOptions = {fetchImpl: exportFetch, init: {headers: session.headers}, check: checkShape};
    const fetchFrom = (base, type, params, section = exportSection(type, params), year = season, rules) => {
        const url = exportUrl(base, year, type, params);
        if (exportsRead && rules === WEEK_ROSTERS) {
            exportsRead.set(url, {...exportsRead.get(url), rules: "WEEK_ROSTERS"});
        }
        return fetchExport(url, section, rules ? {...exportOptions, check: (name, body) => checkShape(name, body, rules)} : exportOptions);
    };

    // every write to MFL goes through it, or mflForm for a commissioner's form: both refuse a dry run
    const mflImport = (type, data, params = {}, headers = session.headers) => sendImport({type, data, params},
        {dryRun, url: `${host}/${season}/import`, leagueId, headers, fetchImpl: (url, init) => session.ask(url, init, {waits: []})});

    // MFL's salaries import for [{playerId, salary, years}]; only sent with APPEND=1, or MFL replaces every salary
    const contractsXml = (contracts) => salariesImportXml(contracts.map(({playerId, salary, years}) => ({id: playerId, salary, years})));

    // every post in `threads`, read one thread at a time
    async function threadPosts(threads) {
        const posts = [];
        for (const thread of threads) {
            posts.push(...asArray((await fetchFrom(host, "messageBoardThread", {L: leagueId, THREAD: thread.id})).post));
        }
        return posts;
    }

    // last season's rosters, read once a run; null when the league had no site then, as a season with
    // none answers 404 or an error document (daily.mjs: leagueSeason)
    let lastRostersRead = null;
    function lastSeasonRosters() {
        lastRostersRead = lastRostersRead || fetchFrom(host, "rosters", {L: leagueId}, "rosters", season - 1).catch((error) => {
            if (error.status === 404 || /Invalid league ID/i.test(error.message)) {
                return null;
            }
            throw error;
        });
        return lastRostersRead;
    }

    const weekResults = async (week) => asArray((await fetchFrom(host, "weeklyResults", {L: leagueId, W: week})).matchup).flatMap((matchup) => asArray(matchup.franchise));

    // a chore that only logs says why, so a switch left off isn't taken for a dry run
    const wouldPrefix = (name) => (dryRun ? "Dry run: would" : `${name} isn't "apply": would`);

    return {
        ...config, lib, session,
        log: run.log, choreLog: run.choreLog, needsAttention: run.needsAttention, skipped: run.skipped,
        wouldPrefix, exportsRead, exportOptions, fetchFrom, mflImport, contractsXml, threadPosts, lastSeasonRosters, weekResults
    };
}
