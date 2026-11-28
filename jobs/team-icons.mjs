// Each team's icon as a small still for v2's lists (docs/design.md): MFL serves the picture an owner
// uploaded, often hundreds of KB and sometimes animated, for a spot 26–34px wide. The job keeps a
// square first frame of each in league-data's data/icons/, published with the site.

import {existsSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync} from "node:fs";
import {join} from "node:path";
import sharp from "sharp";

// the largest spot, 34px, on a 3x screen
export const ICON_PIXELS = 96;
export const MAX_ICON_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 30000;
// most pictures are on MFL's servers, which throttle bursts
const SPACING_MS = 1000;
// what a picture may decode to: a few times the largest a phone takes, well short of a bomb
const MAX_INPUT_PIXELS = 40_000_000;

// {team: address} from the league export, for teams whose icon is a web address
export function iconSources(league, asArray) {
    const sources = new Map();
    for (const team of asArray(((league || {}).franchises || {}).franchise)) {
        const icon = team && typeof team.icon === "string" ? team.icon.trim() : "";
        if (team.id && /^https?:\/\//i.test(icon)) {
            sources.set(team.id, icon);
        }
    }
    return sources;
}

// the picture's first frame, centred and cropped square, as WebP (iOS 14 shows it)
export async function stillIcon(bytes) {
    return sharp(bytes, {pages: 1, limitInputPixels: MAX_INPUT_PIXELS})
        .rotate()
        .resize(ICON_PIXELS, ICON_PIXELS, {fit: "cover", position: "centre"})
        .webp({quality: 80})
        .toBuffer();
}

async function download(url, known, userAgent, fetchImpl) {
    // a picture can be anywhere an owner found it: nothing of the job's (its session, its name
    // registered with MFL) goes with the request
    const headers = {"User-Agent": userAgent};
    if (known && known.url === url && known.etag) {
        headers["If-None-Match"] = known.etag;
    }
    if (known && known.url === url && known.lastModified) {
        headers["If-Modified-Since"] = known.lastModified;
    }
    const response = await fetchImpl(url, {headers, signal: AbortSignal.timeout(TIMEOUT_MS)});
    if (response.status === 304) {
        return {unchanged: true};
    }
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    if (Number(response.headers.get("content-length")) > MAX_ICON_BYTES) {
        throw new Error("larger than the job takes");
    }
    // counted as it comes, as a reply needn't say its length
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body || []) {
        size += chunk.length;
        if (size > MAX_ICON_BYTES) {
            throw new Error("larger than the job takes");
        }
        chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    return {bytes, etag: response.headers.get("etag"), lastModified: response.headers.get("last-modified")};
}

// Brings data/icons/<team>.webp up to date with `sources`. `known` (icon-sources.json) is each
// picture's address and its validators, so an unchanged one is answered 304 and not re-made; a
// re-upload keeps its address, so the address alone can't tell. A picture that can't be read keeps
// the team's still as it was. Writes nothing when `write` is false.
export async function updateIcons({sources, dataDir, userAgent, fetchImpl = fetch, write = true, spacing = SPACING_MS}) {
    const dir = join(dataDir, "data", "icons");
    const knownFile = join(dataDir, "icon-sources.json");
    const known = existsSync(knownFile) ? JSON.parse(readFileSync(knownFile, "utf8")) : {};
    const next = {};
    const result = {written: [], removed: [], failed: []};
    let first = true;
    for (const [team, url] of sources) {
        if (!first) {
            await new Promise((resolve) => setTimeout(resolve, spacing));
        }
        first = false;
        const file = join(dir, `${team}.webp`);
        const had = existsSync(file);
        try {
            const got = await download(url, had ? known[team] : null, userAgent, fetchImpl);
            if (got.unchanged) {
                next[team] = known[team];
                continue;
            }
            const still = await stillIcon(got.bytes);
            next[team] = {url, ...(got.etag ? {etag: got.etag} : {}), ...(got.lastModified ? {lastModified: got.lastModified} : {})};
            if (!had || !readFileSync(file).equals(still)) {
                result.written.push(team);
                if (write) {
                    mkdirSync(dir, {recursive: true});
                    writeFileSync(file, still);
                }
            }
        } catch (error) {
            result.failed.push({team, reason: error.message});
            if (known[team]) {
                next[team] = known[team];
            }
        }
    }
    // a team whose owner took their icon away; an export with no icons at all is taken for MFL's
    // glitch, not every owner's choice
    for (const file of existsSync(dir) && sources.size ? readdirSync(dir) : []) {
        const team = file.replace(/\.webp$/, "");
        if (file.endsWith(".webp") && !sources.has(team)) {
            result.removed.push(team);
            if (write) {
                rmSync(join(dir, file));
            }
        }
    }
    const text = JSON.stringify(next, null, 2) + "\n";
    result.knownChanged = text !== (existsSync(knownFile) ? readFileSync(knownFile, "utf8") : "{}\n");
    if (write && result.knownChanged) {
        writeFileSync(knownFile, text);
    }
    return result;
}

// The chore: the stills of the team icons v2's lists show. A picture that can't be read is only
// logged: it's its owner's, and the team's still stays as it was.
export async function run(ctx, {league}) {
    const {lib, dryRun, dataDir, repo, repoName, log, choreLog} = ctx;
    const {asArray} = lib.mfl;
    const names = new Map(asArray(((league || {}).franchises || {}).franchise).map((team) => [team.id, team.name]));
    const named = (teams) => teams.map((team) => names.get(team) || team).join(", ");
    const sources = iconSources(league, asArray);
    const {written, removed, failed, knownChanged} = await updateIcons({
        sources, dataDir, userAgent: `${repoName || "league-site"}-icons${repo ? ` (github.com/${repo})` : ""}`, write: !dryRun
    });
    if (written.length) {
        choreLog(`${dryRun ? "Dry run: would update" : "Updated"} the team icons of ${named(written)}.`);
    }
    if (removed.length) {
        choreLog(`${dryRun ? "Dry run: would remove" : "Removed"} the team icons of ${named(removed)}, who no longer have one.`);
    }
    for (const {team, reason} of failed) {
        log(`Couldn't make ${named([team])}'s icon from ${sources.get(team)} (${reason}); its still is left as it was.`);
    }
    return {changed: !dryRun && (written.length > 0 || removed.length > 0 || knownChanged), publish: !dryRun && (written.length > 0 || removed.length > 0)};
}

// icon stills on league-data that the site doesn't have, as for snapshots
export async function toPublish({dataDir, pagesData, userAgent, log}) {
    const dir = join(dataDir, "data", "icons");
    const stale = [];
    for (const file of existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".webp")) : []) {
        try {
            const response = await fetch(new URL(`icons/${file}`, pagesData), {headers: {"User-Agent": userAgent}, cache: "no-store"});
            if (response.status === 404 || (response.ok && !Buffer.from(await response.arrayBuffer()).equals(readFileSync(join(dir, file))))) {
                stale.push(file);
            }
        } catch (error) {
            log(`Couldn't check whether icons/${file} is published (${error.message}); will check again tomorrow.`);
        }
    }
    return stale;
}
