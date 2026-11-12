// Checks for two traps in AGENTS.md: the daily job reading exports a version's lib/ no longer has,
// and a regex older iPhones can't build in what members' browsers run.

import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const versions = readdirSync(join(root, "site")).filter((name) => /^v\d+$/.test(name)).sort();

// what jobs/daily.mjs takes from `lib(...)`: {file: [names]}; one with a default (`name = null`) is
// optional
function dailyNeeds() {
    const source = readFileSync(join(root, "jobs", "daily.mjs"), "utf8");
    const needs = {};
    for (const [, names, file] of source.matchAll(/const\s*\{([^}]+)\}\s*=\s*await\s+lib\(\s*["']([^"']+)["']\s*\)/g)) {
        needs[file] = names.split(",").map((name) => name.trim()).filter((name) => name && !name.includes("="))
            .map((name) => name.split(/\s*:\s*/)[0]);
    }
    return {needs, calls: source.match(/\blib\(/g).length};
}

test("the daily job's needs are read from daily.mjs", () => {
    const {needs, calls} = dailyNeeds();
    // every lib(...) call was read, so none is skipped silently
    assert.equal(Object.keys(needs).length, calls, JSON.stringify(needs));
    assert.ok(needs["league.js"].includes("buildLeague"));
});

// the job refuses v1
for (const version of versions.filter((name) => name !== "v1")) {
    test(`${version}'s lib/ has every export the daily job reads, should RULES_VERSION name it`, async () => {
        const {needs} = dailyNeeds();
        for (const [file, names] of Object.entries(needs)) {
            const module = await import(pathToFileURL(join(root, "site", version, "lib", file)).href);
            const missing = names.filter((name) => module[name] === undefined);
            assert.deepEqual(missing, [], `${version}/lib/${file}`);
        }
    });
}

// A regex lookbehind throws on Safari before 16.4, on older iPhones members have: in a regex
// literal it stops the whole bundle from parsing, in `new RegExp` the module that builds it. None is
// allowed in what members' browsers run but the frozen v1, which loads its own on demand.
const LOOKBEHIND = /\(\?<[=!]/;

test("a lookbehind is recognized in a regex's source, a named group isn't", () => {
    assert.ok(LOOKBEHIND.test(String(/(?<![\d.])x/)) && LOOKBEHIND.test("new RegExp(`(?<=a)b`)"));
    assert.ok(!LOOKBEHIND.test(String(/(?<name>x)/)));
});

// the header and tab messages pasted into MFL (mfl/) run on every member's page, v1's too
test("nothing members' browsers run, but the frozen v1, uses a regex lookbehind (older iPhones)", () => {
    const files = [];
    const walk = (dir) => readdirSync(dir, {withFileTypes: true}).forEach((entry) => entry.isDirectory()
        ? walk(join(dir, entry.name)) : /\.(m?js|html)$/.test(entry.name) && files.push(join(dir, entry.name)));
    readdirSync(join(root, "site"), {withFileTypes: true}).filter((entry) => entry.isDirectory() && !["v1", "data"].includes(entry.name))
        .forEach((entry) => walk(join(root, "site", entry.name)));
    walk(join(root, "mfl"));
    assert.ok(files.length > 50, `only ${files.length} files found`);
    const offending = files.filter((file) => LOOKBEHIND.test(readFileSync(file, "utf8"))).map((file) => file.slice(root.length + 1));
    assert.deepEqual(offending, []);
});
