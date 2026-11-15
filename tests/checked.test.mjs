// ui/checked.js: v2's checks and forms hold the exports they read to lib/shapes.js, as the job does,
// and log MFL's change once a page (docs/design.md: Outside change).

import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {fetchExport} from "../site/v2/lib/mfl.js";
import {strict, unlessChanged} from "../site/v2/ui/checked.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const answer = (body) => async () => new Response(JSON.stringify(body), {status: 200});

// what console.error was given while `run` ran
async function errorsOf(run) {
    const logged = [];
    const original = console.error;
    console.error = (...args) => logged.push(args.join(" "));
    try {
        await run();
    } finally {
        console.error = original;
    }
    return logged;
}

test("an export MFL has changed fails as one that couldn't load, and is logged once a page", async () => {
    const changed = {rosters: {franchise: {id: "0001", player: {id: "13604", status: "ROSTER", salary: "5", contractYears: "2"}}}};
    const logged = await errorsOf(async () => {
        for (let i = 0; i < 2; i++) {
            await assert.rejects(fetchExport("https://x/2026/export?TYPE=rosters", "rosters", {fetchImpl: answer(changed), check: strict}),
                (error) => error.changed === true && /franchise 0001 player 13604 has no contractYear/.test(error.message));
        }
    });
    assert.deepEqual(logged, ["[fuad] MFL's rosters export has changed: franchise 0001 player 13604 has no contractYear"]);
});

test("an export as MFL gives it passes, and an outage isn't logged as a change", async () => {
    const rosters = {franchise: {id: "0001", player: {id: "13604", status: "ROSTER", salary: "5", contractYear: "2"}}};
    const logged = await errorsOf(async () => {
        assert.deepEqual(await fetchExport("https://x/2026/export?TYPE=rosters", "rosters", {fetchImpl: answer({rosters}), check: strict}), rosters);
        await assert.rejects(fetchExport("https://x/2026/export?TYPE=salaryAdjustments", "salaryAdjustments",
            {fetchImpl: async () => new Response("", {status: 500}), check: strict}), /HTTP 500/);
    });
    assert.deepEqual(logged, []);
});

test("a check does without an export MFL can't give, but not one MFL has changed", async () => {
    assert.equal(await Promise.reject(new Error("HTTP 500")).catch(unlessChanged(null)), null);
    const changed = Object.assign(new Error("Couldn't load calendar: MFL's export has changed: event 1 has no type"), {changed: true});
    await assert.rejects(Promise.reject(changed).catch(unlessChanged(null)), /has no type/);
});

// The display panels' reads not yet held to lib/shapes.js (the next steps of docs/design.md's Outside
// change), and the web app's, which asks only whether next season's site is there. A new read of an
// export elsewhere in v2's screens passes `check: strict`, or a display panel's helper defaults to
// `check = lenient` and passes it on.
const UNCHECKED = new Set(["all-moves.js", "popup.js", "rosters.js", "web-app.js"]);

test("every export v2's checks and forms read is checked", () => {
    const dir = join(root, "site", "v2", "ui");
    const missing = [];
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".js") && !UNCHECKED.has(name))) {
        const source = readFileSync(join(dir, file), "utf8");
        for (const [index, line] of source.split("\n").entries()) {
            // a read's options, on its line or a shared `options` holding the check
            const passed = /check: strict/.test(line) || (/check: check \|\| undefined/.test(line) && /\bcheck = lenient\b/.test(source));
            if (/\b(fetchExport|weekKickoff|weekEnd|seasonPhase)\(/.test(line) && !/^import\b/.test(line)
                && !passed && !/\boptions\b\)?/.test(line)) {
                missing.push(`${file}:${index + 1}`);
            }
        }
        if (/\bconst options = \{/.test(source)) {
            assert.match(source, /const options = \{[^}]*check: strict/, `${file}'s shared options`);
        }
    }
    assert.deepEqual(missing, []);
});
