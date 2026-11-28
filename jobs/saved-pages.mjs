// MFL's pages and exports a run saves, cleaned, for tests/fixtures/pages.

import {mkdirSync, writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {join, resolve} from "node:path";
import {ownersOf, scrub} from "../site/capture/capture-model.js";

// MFL's pages as the check reads them, for tests/fixtures/pages: cleaned as the capture bookmark
// cleans them (site/capture/capture-model.js), into SAVED_PAGES_DIR/<league>/member/ with the
// bookmark's manifest, which the workflow puts on the run. The run's files are public, as the repo is,
// so a page with what only members see, or the commissioner's own team's (pending bids and offers), is
// saved only from a league other than the real one (a dry run of the test league).
export function pageSaver({dryRun, now, season, host, leagueId, savedPagesDir, savePages, dataLeagueId, log, needsAttention}, league) {
    const dir = savedPagesDir ? join(resolve(savedPagesDir), leagueId, "member") : null;
    const all = savePages;
    const realLeague = !dryRun || !dataLeagueId || dataLeagueId === leagueId;
    // a page that would keep the owners' names isn't saved, as the bookmark saves none
    const owners = ownersOf({league});
    const pages = [];
    const held = [];
    const keep = (page, answer, changed) => {
        if (!dir || !(all || changed)) {
            return false;
        }
        if (page.members && realLeague) {
            held.push(page.what);
            return false;
        }
        if (!owners.length) {
            return false;
        }
        mkdirSync(dir, {recursive: true});
        writeFileSync(join(dir, page.name), scrub(answer.body, owners));
        pages.push({name: page.name.replace(/\.html$/, ""), url: `${host}${page.path}`, served: answer.served || `${host}${page.path}`, status: answer.status});
        return true;
    };
    const finish = (franchise) => {
        if (all && dir && !owners.length) {
            needsAttention("MFL check: the league export gave no owners' names to take out, so no pages were saved.");
        }
        if (held.length) {
            log(`MFL check: not saved, as they show what only members see or the commissioner's own team: ${held.join(", ")}. A dry run of the test league with "Save pages" saves them.`);
        }
        if (pages.length) {
            writeFileSync(join(dir, "manifest.json"), JSON.stringify({league: leagueId, season: String(season), viewer: "member", franchise, at: now.toISOString(), pages}, null, 2));
            log(`MFL check: saved ${pages.length} of MFL's pages, cleaned, on the run.`);
        }
    };
    return {keep, finish};
}

// The exports read on the run (exportsRead), for tests/fixtures/pages/stages: cleaned as the pages
// are, the owners' names from the league export among them, into SAVED_PAGES_DIR/<league>/exports/
// with a manifest of each one's address and rules. The players' whole list is left out for its size.
const EXPORT_MAX_BYTES = 400000;
// a commissioner's league export gives each owner's contact details, login and preferences, in fields
// the text cleaning can't recognize (a phone number as bare digits, a street address): a franchise
// keeps only its team's own fields, and the league neither the commissioner's login nor alerts' numbers
const LEAGUE_PRIVATE = ["commish_username", "mobileAlerts"];
const FRANCHISE_FIELDS = ["id", "name", "owner_name", "abbrev", "division", "icon", "logo", "salaryCapAmount", "bbidAvailableBalance", "waiverSortOrder", "future_draft_picks"];
function withoutContacts(body) {
    const parsed = JSON.parse(body);
    const franchises = parsed.league?.franchises;
    if (!franchises?.franchise) {
        return body;
    }
    for (const field of LEAGUE_PRIVATE) {
        delete parsed.league[field];
    }
    const kept = (franchise) => Object.fromEntries(Object.entries(franchise).filter(([field]) => FRANCHISE_FIELDS.includes(field)));
    franchises.franchise = Array.isArray(franchises.franchise) ? franchises.franchise.map(kept) : kept(franchises.franchise);
    return JSON.stringify(parsed);
}
// an export's file by what it asked for: rosters-W3.json, and the year when not this season's
// (rosters-2025.json); a long list (playerScores' players) by a short hash of it
function exportFileName(url, year) {
    const {pathname, searchParams} = new URL(url);
    const value = (text) => (text.length > 20 ? createHash("sha256").update(text).digest("hex").slice(0, 8) : text.replace(/[^A-Za-z0-9]+/g, "_"));
    const params = [...searchParams].filter(([key]) => !["TYPE", "L", "JSON"].includes(key)).sort(([a], [b]) => a.localeCompare(b));
    const asked = pathname.split("/")[1];
    return `${[searchParams.get("TYPE"), ...params.map(([key, text]) => `${key}${value(text)}`), ...(asked === String(year) ? [] : [asked])].join("-")}.json`;
}
export function saveExports({now, season, leagueId, savedPagesDir, exportsRead, log, needsAttention}) {
    if (!exportsRead || !exportsRead.size) {
        return;
    }
    const dir = join(resolve(savedPagesDir), leagueId, "exports");
    // every season's league export read, so an owner since gone comes out of last season's too
    const leagues = [...exportsRead].filter(([url, read]) => new URL(url).searchParams.get("TYPE") === "league" && read.body);
    const owners = leagues.flatMap(([, read]) => ownersOf(JSON.parse(read.body)));
    if (!leagues.some(([url]) => new URL(url).pathname.startsWith(`/${season}/`)) || !owners.length) {
        needsAttention("Save pages: the league export gave no owners' names to take out, so no exports were saved.");
        return;
    }
    const saved = [];
    const large = [];
    for (const [url, {body, rules}] of exportsRead) {
        if (!body) {
            continue;
        }
        // the same ask of another host is kept apart
        const asked = exportFileName(url, season);
        const name = saved.some((each) => each.name === asked) ? asked.replace(/\.json$/, `-${new URL(url).hostname.split(".")[0]}.json`) : asked;
        if (body.length > EXPORT_MAX_BYTES) {
            large.push(name);
            continue;
        }
        mkdirSync(dir, {recursive: true});
        writeFileSync(join(dir, name), scrub(withoutContacts(body), owners));
        saved.push({name, url: url.replace(/^https:\/\/[^/]+/, ""), ...(rules ? {rules} : {})});
    }
    writeFileSync(join(dir, "manifest.json"), JSON.stringify({league: leagueId, season: String(season), at: now.toISOString(), exports: saved}, null, 2));
    log(`Save pages: saved ${saved.length} of MFL's exports, cleaned, on the run${large.length ? `; not ${large.join(", ")}, over ${EXPORT_MAX_BYTES / 1000} kB` : ""}.`);
}
