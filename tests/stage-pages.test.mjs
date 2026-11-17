// Each season stage's saved pages (tests/fixtures/pages/stages/<stage>/<league>/member/, as the daily
// job's "Save pages" saves them): every page is read by the reader the daily check tries on it, so a
// reader that stops reading an earlier stage's MFL page fails here.

import {test} from "node:test";
import assert from "node:assert/strict";
import {existsSync, readFileSync, readdirSync} from "node:fs";
import {join} from "node:path";
import {pageChecks} from "../jobs/mfl-check.mjs";

const STAGES = join(import.meta.dirname, "fixtures", "pages", "stages");
const dirs = (dir) => readdirSync(dir, {withFileTypes: true}).filter((entry) => entry.isDirectory()).map((entry) => join(dir, entry.name));
const folders = dirs(STAGES).flatMap(dirs).map((league) => join(league, "member"));

test("there are stage folders, each the job's layout", () => {
    assert.ok(folders.length >= 2);
    for (const folder of folders) {
        assert.ok(existsSync(join(folder, "manifest.json")), folder);
    }
});

for (const folder of folders) {
    const name = folder.slice(STAGES.length + 1);
    const manifest = JSON.parse(readFileSync(join(folder, "manifest.json"), "utf8"));
    const files = readdirSync(folder).filter((file) => file !== "manifest.json");
    // the week, from the feeds' names: the projections are this week's, the stats the week before's
    const proj = files.map((file) => /^live_proj_(\d+)\.txt$/.exec(file)).find(Boolean);
    const stats = files.map((file) => /^live_stats_(\d+)\.txt$/.exec(file)).find(Boolean);
    const week = proj ? Number(proj[1]) : stats ? Number(stats[1]) + 1 : 0;

    test(`${name}: every saved page is read as the daily check reads it`, async () => {
        const checks = await pageChecks({season: manifest.season, leagueId: manifest.league, franchise: manifest.franchise,
            partner: "0002", playerId: "1", week, inSeason: week > 0});
        const byName = new Map(checks.map((each) => [each.name, each]));
        assert.deepEqual(files.filter((file) => !byName.has(file)), [], "a file the check doesn't read");
        const unread = [];
        for (const file of files) {
            if (!byName.get(file).read(readFileSync(join(folder, file), "utf8"), {})) {
                unread.push(file);
            }
        }
        assert.deepEqual(unread, []);
    });
}
