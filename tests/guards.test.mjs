// Checks for traps in AGENTS.md: the daily job reading exports a version's lib/ or ui/ no longer has, a regex
// older iPhones can't build in what members' browsers run, and the lint still refusing a request to
// MFL that skips ui/page-fetch.js.

import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {LIB_FILES, libKey} from "../jobs/chore-context.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const versions = readdirSync(join(root, "site")).filter((name) => /^v\d+$/.test(name)).sort();

// what the daily job's modules take from the version's lib/: {file: [names]}, each read as
// `const {names} = lib.<name>;` (jobs/chore-context.mjs); one with a default (`name = null`) is optional.
// `uses` counts every way of reaching the lib, `reads` only that one, so another (a nested or whole
// destructure, a bracket) leaves them unequal. A comment is from `//` at a line's start or after a
// space, so an address's https:// isn't one.
const JOBS = join(root, "jobs");
function needsIn(sources) {
    const files = Object.fromEntries(LIB_FILES.map((file) => [libKey(file), file]));
    const needs = {};
    let reads = 0;
    let uses = 0;
    for (const text of sources) {
        const source = text.replace(/(^|\s)\/\/.*$/gm, "$1");
        uses += (source.match(/\blib\s*\.\s*[A-Za-z]\w*|\blib\s*\[|=\s*(?:ctx\s*\.\s*)?lib\s*[;,)]|\{[^{}]*\blib\b[^{}]*\}\s*=\s*lib\b/g) || []).length;
        for (const [, names, key] of source.matchAll(/const\s*\{([^{}]+)\}\s*=\s*(?:ctx\.)?lib\.(\w+)\s*;/g)) {
            reads++;
            const file = files[key] || `${key}, which LIB_FILES doesn't load`;
            const taken = names.split(",").map((each) => each.trim()).filter((each) => each && !each.includes("=")).map((each) => each.split(/\s*:\s*/)[0]);
            needs[file] = [...new Set([...(needs[file] || []), ...taken])];
        }
    }
    return {needs, reads, uses};
}
const jobNeeds = () => needsIn(readdirSync(JOBS).filter((each) => each.endsWith(".mjs")).map((name) => readFileSync(join(JOBS, name), "utf8")));

test("the daily job's needs are read from its modules", () => {
    const {needs, reads, uses} = jobNeeds();
    // every use of the lib was read, so none is skipped silently
    assert.equal(reads, uses, JSON.stringify(needs));
    assert.deepEqual(Object.keys(needs).filter((file) => !LIB_FILES.includes(file)), []);
    assert.ok(needs["league.js"].includes("buildLeague") && needs["mfl.js"].includes("fetchExport"));
});

test("a use of the lib in any other form than the one read is noticed, and an address isn't taken for a comment", () => {
    const read = "const {asArray} = lib.mfl;";
    assert.deepEqual(needsIn([read]), {needs: {"mfl.js": ["asArray"]}, reads: 1, uses: 1});
    assert.deepEqual(needsIn([`const url = "https://x"; ${read}`]).needs, {"mfl.js": ["asArray"]});
    for (const other of ["const {mfl: {asArray}} = ctx.lib;", "const {mfl} = lib;", "const x = lib[\"rules\"];", "const y = ctx.lib.mfl.asArray;", "run(lib.mfl);"]) {
        const {reads, uses} = needsIn([read, other]);
        assert.ok(uses > reads, other);
    }
    // the lib handed on whole, as daily.mjs hands it to the session and the context, isn't a use
    assert.equal(needsIn(["mflSession({lib, host});", "const {lib, session} = ctx;"]).uses, 0);
});

// the morning check's pages, read by the version's own ui/ readers (jobs/mfl-check.mjs pageChecks):
// {file: [names]}
function checkNeeds() {
    const source = readFileSync(join(JOBS, "mfl-check.mjs"), "utf8");
    const [, pattern, list] = /const \[([\s\S]*?)\] = await Promise\.all\(\[([\s\S]*?)\]\.map\(ui\)\)/.exec(source) || [];
    const names = [...(pattern || "").matchAll(/\{([^}]*)\}/g)].map((found) => found[1].split(",").map((each) => each.trim()).filter(Boolean));
    const files = [...(list || "").matchAll(/"([^"]+)"/g)].map((found) => found[1]);
    return {names, files};
}

test("the morning check's needs are read from mfl-check.mjs", () => {
    const {names, files} = checkNeeds();
    assert.ok(files.length > 10, `only ${files.length} files found`);
    assert.equal(names.length, files.length);
    assert.ok(names[files.indexOf("lineup-model.js")].includes("readLineupPage"));
});

// the job refuses v1
for (const version of versions.filter((name) => name !== "v1")) {
    test(`${version}'s lib/ has every export the daily job reads, should RULES_VERSION name it`, async () => {
        const {needs} = jobNeeds();
        for (const [file, names] of Object.entries(needs)) {
            const module = await import(pathToFileURL(join(root, "site", version, "lib", file)).href);
            const missing = names.filter((name) => module[name] === undefined);
            assert.deepEqual(missing, [], `${version}/lib/${file}`);
        }
    });

    test(`${version}'s ui/ has every reader the morning check uses, should RULES_VERSION name it`, async () => {
        const {names, files} = checkNeeds();
        for (const [i, file] of files.entries()) {
            const module = await import(pathToFileURL(join(root, "site", version, "ui", file)).href);
            assert.deepEqual(names[i].filter((name) => module[name] === undefined), [], `${version}/ui/${file}`);
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

// the lint's own config, as `npm run lint` reads it: a later entry's no-restricted-syntax for the
// same files would replace this rule without a word
test("the lint refuses a request to MFL in v2's ui/ that skips page-fetch.js, fetch called or passed on, and .at() with it", async () => {
    const {ESLint} = await import("eslint");
    const eslint = new ESLint({cwd: root});
    const messages = async (code, file) => (await eslint.lintText(code, {filePath: join(root, file)}))[0].messages
        .filter((message) => message.ruleId === "no-restricted-syntax").map((message) => message.message.split(":")[0]);
    const code = "export const a = () => fetch(\"x\");\nexport const b = () => window.fetch(\"x\");\nexport const c = (list) => list.at(-1);\n"
        + "export const d = (read) => read({fetchImpl: fetch});\nexport const e = globalThis.fetch;\nexport const f = (x) => [x.fetch, {fetch: 1}];\n";
    const ask = "Ask MFL through ui/page-fetch.js";
    assert.deepEqual(await messages(code, "site/v2/ui/probe.js"), [ask, ask, "ES2022 .at() is forbidden", ask, ask]);
    assert.deepEqual(await messages(code, "site/v2/ui/page-fetch.js"), ["ES2022 .at() is forbidden"]);
});
