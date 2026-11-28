// The daily job. What it does: docs/commissioner.md (The daily job); why: docs/design.md.
//
// Environment:
//   DATA_DIR                    checkout of the league-data branch (required)
//   MFL_USERNAME, MFL_PASSWORD  commissioner login; without them the job reads public data only
//   MFL_LEAGUE_ID               the league's id (required)
//   MFL_HOST                    the league's host, as https://www44.myfantasyleague.com (required)
//   MFL_USER_AGENT              optional, the repository secret: the client name registered with MFL
//   SEASON                      default: the newest season the league has a site for
//   RULES_VERSION               which site version's league logic to use, default v2
//   PAGES_DATA_URL              published snapshots, default the repository's GitHub Pages data/
//   GITHUB_REPOSITORY           set by GitHub Actions ("owner/name"); names the Pages address and the job
//   GITHUB_OUTPUT               set by GitHub Actions; receives changed=true|false and publish=true|false
//   GITHUB_STEP_SUMMARY         set by GitHub Actions; receives this run's chore log entries, shown on
//                               the run's page (GitHub's failure email links to it)
//   DROP_PENALTIES              "apply" to charge drop penalties; "log" or unset only logs them
//   CONTRACT_YEARS              "apply" to set contract years for adds; "log" or unset only logs them
//   PAYOUTS                     "apply" to record the league's payouts in MFL's accounting; "log" or
//                               unset only logs them
//   RFA_SALARIES                "apply" to set the renewal's RFAs (1 year to 0) to $0.01; "log" or
//                               unset only logs them
//   BACKUP_STARTERS             "apply" to start members' backups for inactive starters (bylaw 16.5);
//                               "log" only logs them; unset, the chore doesn't run, as a league
//                               without the rule handles backups itself, if at all.
//                               Of all five above, any other value is flagged, and its chore only
//                               logs (backup starters: doesn't run)
//   MFL_CHECK                   "off" skips the check of what v2 reads from MFL (jobs/mfl-check.mjs)
//   SAVED_PAGES_DIR             where the check saves MFL's pages, cleaned as the capture bookmark
//                               cleans them: a page it flags, and with SAVE_PAGES every one it reads
//   SAVE_PAGES                  on a dry run, "true" saves every page the check reads, and of a league
//                               other than the real one every export the job reads
//   NOW                         optional ISO time, for testing
//   DRY_RUN                     "true": writes nothing to MFL or DATA_DIR, whatever the variables above
//                               say, and may name a league the version doesn't list
//   MFL_SETTINGS                on a dry run, an unlisted league's settings, as its header line's
//   DATA_LEAGUE_ID              on a dry run, the league DATA_DIR's files are from; another starts with none

// It only sequences: each chore is jobs/<chore>.mjs, given the context chore-context.mjs makes.

import {appendFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {choreContext, loadLib} from "./chore-context.mjs";
import {mflSession} from "./mfl-session.mjs";
import {runLog} from "./run-log.mjs";
import {leagueState} from "./league-state.mjs";
import {leagueRules, overCap} from "./over-cap.mjs";
import * as dropPenalties from "./drop-penalties.mjs";
import * as contractYears from "./contract-years.mjs";
import * as rfaSalaries from "./rfa-salaries.mjs";
import * as contractLengths from "./contract-lengths.mjs";
import * as backupStarters from "./backup-starters.mjs";
import * as payouts from "./payouts.mjs";
import * as mflCheck from "./mfl-check.mjs";
import * as franchiseSnapshot from "./franchise-snapshot.mjs";
import * as teamIcons from "./team-icons.mjs";
import {saveExports} from "./saved-pages.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = process.env.RULES_VERSION || "v2";
// v1's lib lacks the settings, payouts and offseason lengths the job needs; v2's holds its rules
if (!/^v\d+$/.test(version) || version === "v1") {
    throw new Error(`RULES_VERSION must name a version from v2 on, as v2, not "${version}"`);
}
const lib = await loadLib(root, version);
const {exportUrl} = lib.mfl;
const {ROSTER_MAX} = lib.rules;

if (!process.env.DATA_DIR) {
    throw new Error("DATA_DIR must point at a checkout of the league-data branch");
}
const dataDir = resolve(process.env.DATA_DIR);
if (!process.env.MFL_LEAGUE_ID || !/^https:\/\/[^/]+\/?$/.test(process.env.MFL_HOST || "")) {
    throw new Error("MFL_LEAGUE_ID and MFL_HOST must name the league (the repository variables of the same names; MFL_HOST as https://www44.myfantasyleague.com)");
}
const leagueId = process.env.MFL_LEAGUE_ID;
const dryRun = process.env.DRY_RUN === "true";
if (dryRun && !/^\d+$/.test(leagueId)) {
    throw new Error(`A dry run's league must be its id, a number, not "${leagueId}"`);
}
// a dry run's host is typed in, and is sent the commissioner's session
if (dryRun && !/^https:\/\/([a-z0-9-]+\.)*myfantasyleague\.com\/?$/i.test(process.env.MFL_HOST)) {
    throw new Error(`A dry run's host must be on myfantasyleague.com, not ${process.env.MFL_HOST}`);
}
// A league with no entry has only assumed rules, too little to go by.
const {league: leagueSettings} = lib.settings;
if (!leagueSettings.listed && !dryRun) {
    throw new Error(`League ${leagueId} isn't listed in site/${version}/settings.json`);
}
if (dryRun && process.env.MFL_SETTINGS) {
    if (leagueSettings.listed) {
        throw new Error(`League ${leagueId} is listed in site/${version}/settings.json, which ignores settings given for a run`);
    }
    if (leagueSettings.problems.length) {
        throw new Error(`The run's settings can't be used: ${leagueSettings.problems.join("; ")}`);
    }
}
const host = process.env.MFL_HOST.replace(/\/+$/, "");
const repo = process.env.GITHUB_REPOSITORY || "";
const [owner = "", repoName = ""] = repo.split("/");
const now = process.env.NOW ? new Date(process.env.NOW) : new Date();
if (Number.isNaN(now.getTime()) || (process.env.SEASON && !/^\d{4}$/.test(process.env.SEASON))) {
    throw new Error(`NOW must be an ISO time and SEASON a year, not "${process.env.NOW}" and "${process.env.SEASON}"`);
}
const userAgent = process.env.MFL_USER_AGENT || `${repoName || "league-site"}-daily-chores${repo ? ` (github.com/${repo})` : ""}`;
// a repository named owner.github.io publishes at the site's root
const pagesData = process.env.PAGES_DATA_URL || (repo
    ? `https://${owner.toLowerCase()}.github.io/${repoName.toLowerCase() === `${owner.toLowerCase()}.github.io` ? "" : `${repoName}/`}data/`
    : null);
if (!pagesData) {
    throw new Error("PAGES_DATA_URL must be set outside GitHub Actions");
}
const SWITCHES = ["DROP_PENALTIES", "CONTRACT_YEARS", "PAYOUTS", "RFA_SALARIES", "BACKUP_STARTERS"];
const applies = (name) => !dryRun && process.env[name] === "apply";
const apply = {dropPenalties: applies("DROP_PENALTIES"), contractYears: applies("CONTRACT_YEARS"), payouts: applies("PAYOUTS"),
    rfaSalaries: applies("RFA_SALARIES"), backups: applies("BACKUP_STARTERS")};
// what a switch's value does, for the summary; an unset variable reaches the job as ""
const switchState = (name) => {
    const value = process.env[name] || "";
    if (value === "apply") {
        return "apply";
    }
    return `${name === "BACKUP_STARTERS" && value !== "log" ? "off" : "log only"} (${value ? `"${value}"` : "unset"})`;
};
const knownSwitch = (name) => ["", "apply", "log"].includes(process.env[name] || "");
const dataIsThisLeagues = !dryRun || process.env.DATA_LEAGUE_ID === leagueId;

const run = runLog({onAttention: () => {
    process.exitCode = 1;
}});
const {log, needsAttention, choreLog} = run;
const session = mflSession({lib, host, leagueId, userAgent, log});

function setOutput(name, value) {
    if (process.env.GITHUB_OUTPUT) {
        appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
    }
}

// the league renews on no fixed date; a season with no site answers 404 or an error document
async function leagueSeason() {
    if (process.env.SEASON) {
        return Number(process.env.SEASON);
    }
    const year = now.getUTCFullYear();
    let response, body;
    try {
        response = await session.fetch(exportUrl(host, year, "league", {L: leagueId}), {headers: session.headers});
        // only read the body of a reply that can say: a 404, or a 200 with JSON
        body = response.ok ? await response.json() : null;
    } catch (error) {
        throw new Error(`Couldn't tell whether the league has a ${year} site: ${error.message}`);
    }
    if (response.status === 404 || (response.ok && body && body.error)) {
        return year - 1;
    }
    if (response.ok && body && body.league) {
        return year;
    }
    throw new Error(`Couldn't tell whether the league has a ${year} site: HTTP ${response.status}`);
}

// each chore fails on its own, flagged under its name
async function chore(name, work) {
    try {
        return await work();
    } catch (error) {
        needsAttention(`${name}: ${error.message}`);
        return undefined;
    }
}

let ctx = null;
let snapshotWritten = false;
let iconsChanged = false;
let backupsChanged = false;
let publish = false;
try {
    // a mistyped "apply" would otherwise look like a switch left to log
    for (const name of SWITCHES.filter((each) => !knownSwitch(each))) {
        needsAttention(`${name} is "${process.env[name]}", which the job doesn't know, so ${name === "BACKUP_STARTERS" ? "the chore is off" : "the chore only logs"}. `
            + "Set it to apply or log, or remove it, in the repository's variables (Settings › Secrets and variables › Actions).");
    }
    const season = await leagueSeason();
    if (dryRun) {
        const given = process.env.MFL_SETTINGS ? `, with the settings ${process.env.MFL_SETTINGS}` : "";
        run.dryRunNotes.push(`League ${leagueId}, the ${season} season, ${version}'s rules, as of ${now.toISOString()}${given}. Nothing was written to MFL, committed or published, and writes to MFL weren't tested.`);
    }
    log(`Working on the ${season} league site.`);
    // snapshots only need public data, so a failed login doesn't stop them
    const loginProblem = await session.login(season, process.env.MFL_USERNAME, process.env.MFL_PASSWORD);
    if (loginProblem) {
        needsAttention(`${loginProblem}. Continuing with public league data.`);
    }
    if (dryRun && session.headers.Cookie && !session.leagueEntry()) {
        delete session.headers.Cookie;
        log(`League ${leagueId} isn't among the login's leagues, so the session isn't used on it.`);
    }
    const loggedIn = !loginProblem && Boolean(session.headers.Cookie);
    if (dryRun && !loggedIn) {
        run.dryRunNotes.push("**Public data only:** the run isn't logged in to this league. Contract years, payouts and the final cut-down date weren't checked, so roster limits start with week 1.");
    }
    ctx = choreContext({lib, session, run, config: {
        dryRun, now, season, host, leagueId, dataDir, dataIsThisLeagues, loggedIn, version, apply,
        // unlike the other chores, off unless asked for: the rule is a league's own choice (settings.backupStarters)
        backupsOff: !["apply", "log"].includes(process.env.BACKUP_STARTERS),
        userAgent, repo, repoName, pagesData,
        savedPagesDir: process.env.SAVED_PAGES_DIR || null,
        savePages: dryRun && process.env.SAVE_PAGES === "true",
        dataLeagueId: process.env.DATA_LEAGUE_ID || "",
        checkOff: process.env.MFL_CHECK === "off"
    }});
    // the snapshot doesn't depend on any of the league chores
    const state = await chore("League chores", () => leagueState(ctx));
    if (state) {
        // their moves may be reversed, so their chores are held; if the league rules can't run, any
        // team over 30 is still held
        const overThirty = () => new Set([...state.built.franchises.values()]
            .filter((franchise) => franchise.numPlayers > ROSTER_MAX).map((franchise) => franchise.franchiseId));
        const overRoster = await chore("League rules", () => (state.built.seasonOver === null ? overThirty() : leagueRules(ctx, state))) || overThirty();
        let over = null;
        await chore("Cap chores", async () => {
            over = new Set([...overCap(ctx, state), ...overRoster]);
            await dropPenalties.run(ctx, state, over);
        });
        const unheld = () => {
            if (!over) {
                throw new Error("skipped: the cap check didn't finish, so it isn't known which teams are held");
            }
        };
        await chore("Contract years", () => {
            unheld();
            return contractYears.run(ctx, state, over);
        });
        // before the lengths, as an unsettled RFA looks due a length until he has $0.01
        const rfas = await chore("RFA salaries", () => rfaSalaries.run(ctx, state)) || null;
        await chore("Contract lengths", () => {
            unheld();
            if (!rfas && state.built.started === false) {
                throw new Error("skipped: the RFA salaries didn't finish, so it isn't known which players are RFAs");
            }
            return contractLengths.run(ctx, state, over, new Set(rfas || []));
        });
        // before payouts, which wait for a week's backups
        const backups = await chore("Backup starters", () => backupStarters.run(ctx, state));
        backupsChanged = Boolean(backups && backups.changed);
        // when the chore failed, the weeks it left open aren't known; a record that can't be read either
        // stops only payouts
        await chore("Payouts", () => payouts.run(ctx, state, backups ? backups.openFrom : backupStarters.openFromAfterFailure(ctx)));
        // it writes nothing, so last
        await chore("MFL check", () => mflCheck.run(ctx, state));
    }
    // last season is for a job that missed its snapshot; a test league may have no site for it
    for (const year of dataIsThisLeagues ? [season - 1, season] : [season]) {
        snapshotWritten = (await franchiseSnapshot.run(ctx, year)) || snapshotWritten;
    }
    const stale = snapshotWritten ? [] : await franchiseSnapshot.toPublish(ctx);
    if (stale.length) {
        choreLog(`${dryRun ? "Dry run: would publish" : "Publishing"} snapshots that are new or changed since the site was last published: ${stale.join(", ")}.`);
    }
    // a dry run of another league leaves this league's icons alone; without the league export (the
    // chores' failure says so) they wait for tomorrow
    let iconsPublish = false;
    if (dataIsThisLeagues && state) {
        await chore("Team icons", async () => {
            const icons = await teamIcons.run(ctx, state);
            iconsChanged = icons.changed;
            iconsPublish = icons.publish || (!dryRun && (await teamIcons.toPublish(ctx)).length > 0);
        });
    }
    publish = !dryRun && (snapshotWritten || stale.length > 0 || iconsPublish);
} catch (error) {
    needsAttention(`Failed: ${error.message}`);
} finally {
    try {
        if (ctx) {
            saveExports(ctx);
        }
    } catch (error) {
        needsAttention(`Save pages: the exports couldn't be saved: ${error.message}`);
    }
    run.explainFailure();
    const logChanged = !dryRun && run.updateChoreLog(dataDir, now);
    setOutput("changed", snapshotWritten || iconsChanged || backupsChanged || logChanged ? "true" : "false");
    setOutput("publish", publish ? "true" : "false");
    run.writeSummary({file: process.env.GITHUB_STEP_SUMMARY, dryRun,
        switches: `Chore switches: ${SWITCHES.map((name) => `${name} ${switchState(name)}`).join(", ")}${dryRun ? "; a dry run writes nothing, whatever they say" : ""}.`});
}
