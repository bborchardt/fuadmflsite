// Checks for two traps in AGENTS.md: the daily job reading exports a version's lib/ no longer has,
// and syntax older iPhones can't parse in a module fuad.js imports statically.

import {test} from "node:test";
import assert from "node:assert/strict";
import {existsSync, readFileSync, readdirSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const versions = readdirSync(join(root, "site")).filter((name) => /^v\d+$/.test(name)).sort();

// what jobs/daily.mjs takes from `lib(...)`: {file: [names]}; one with a default (`name = null`) is
// optional. A file loaded as `version === "v1" ? {} : await lib(...)` isn't read from that version.
function dailyNeeds() {
    const source = readFileSync(join(root, "jobs", "daily.mjs"), "utf8");
    const needs = {};
    const skipped = {};
    for (const [, names, without, file] of source.matchAll(/const\s*\{([^}]+)\}\s*=\s*(?:version\s*===\s*"(v\d+)"\s*\?\s*\{\}\s*:\s*)?await\s+lib\(\s*["']([^"']+)["']\s*\)/g)) {
        needs[file] = names.split(",").map((name) => name.trim()).filter((name) => name && !name.includes("="))
            .map((name) => name.split(/\s*:\s*/)[0]);
        if (without) {
            skipped[file] = without;
        }
    }
    return {needs, skipped, calls: source.match(/\blib\(/g).length};
}

test("the daily job's needs are read from daily.mjs", () => {
    const {needs, calls} = dailyNeeds();
    // every lib(...) call was read, so none is skipped silently
    assert.equal(Object.keys(needs).length, calls, JSON.stringify(needs));
    assert.ok(needs["league.js"].includes("buildLeague"));
    assert.deepEqual(dailyNeeds().skipped, {"payouts.js": "v1", "settings.js": "v1"});
});

for (const version of versions) {
    test(`${version}'s lib/ has every export the daily job reads, should RULES_VERSION name it`, async () => {
        const {needs, skipped} = dailyNeeds();
        for (const [file, names] of Object.entries(needs).filter(([file]) => skipped[file] !== version)) {
            const module = await import(pathToFileURL(join(root, "site", version, "lib", file)).href);
            const missing = names.filter((name) => module[name] === undefined);
            assert.deepEqual(missing, [], `${version}/lib/${file}`);
        }
    });
}

// the modules a file imports statically; dynamic import() is left out on purpose
function staticImports(source) {
    const specifiers = [
        ...source.matchAll(/(?:^|;)\s*(?:import|export)\b[^;(]+?\bfrom\s*["']([^"']+)["']/gm),
        ...source.matchAll(/(?:^|;)\s*import\s*["']([^"']+)["']/gm)
    ];
    return specifiers.map((match) => match[1]);
}

function staticGraph(entry) {
    const seen = new Set();
    const visit = (file) => {
        if (seen.has(file)) {
            return;
        }
        assert.ok(existsSync(file), `missing module ${file}`);
        seen.add(file);
        for (const specifier of staticImports(readFileSync(file, "utf8"))) {
            assert.match(specifier, /^\.\.?\//, `${file} imports ${specifier}, which this walk can't follow`);
            visit(join(dirname(file), specifier));
        }
    };
    visit(entry);
    return [...seen];
}

// regex lookbehind needs Safari 16.4
const LOOKBEHIND = /\(\?<[=!]/;

test("static imports are found across lines, dynamic ones aren't", () => {
    const source = 'import {a,\n    b as c, // the c-thing\n} from "./one.js";\nimport "./two.js";\nexport {d}from "../three.js"; import {e} from "./six.js";\nconst x = await import("./four.js");\nexport const s = "./five.js";\nexport function f() {\n    return Object.fromEntries([]);\n}';
    assert.deepEqual(staticImports(source), ["./one.js", "../three.js", "./six.js", "./two.js"]);
    assert.ok(LOOKBEHIND.test(String(/(?<![\d.])x/)) && LOOKBEHIND.test(String(/(?<=a)b/)));
    assert.ok(!LOOKBEHIND.test(String(/(?<name>x)/)));
});

for (const version of versions) {
    test(`${version}: nothing fuad.js imports statically uses regex lookbehind (older iPhones)`, () => {
        const graph = staticGraph(join(root, "site", version, "fuad.js"));
        assert.ok(graph.length > 5, `only ${graph.length} modules found`);
        const offending = graph.filter((file) => LOOKBEHIND.test(readFileSync(file, "utf8")))
            .map((file) => file.slice(root.length + 1));
        assert.deepEqual(offending, []);
    });
}
