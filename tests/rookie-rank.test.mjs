// A rookie scale whose first picks are set by salary rank (rookieScale.firstPickFromRank,
// docs/settings.md): each position's first pick is paid the salary at its rank at the trade deadline
// before the draft, as the bylaw read before 2026. Run under a test league's settings line in a child
// process, as lib/settings.js resolves the league once, on import.

import {test} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {resolveSettings} from "../site/v2/lib/settings.js";

const RANKS = {QB: 15, RB: 20, WR: 35, TE: 15, PK: 15};
const file = JSON.parse(readFileSync(new URL("../site/v2/settings.json", import.meta.url), "utf8"));

// what `script` (a module body, `out` its result) gives under a ranked scale
function ranked(script) {
    const body = `globalThis.window = {location: {pathname: "/", search: ""}}; let out; ${script}; console.log(JSON.stringify(out));`;
    const text = execFileSync(process.execPath, ["--input-type=module", "-e", body], {
        cwd: new URL("..", import.meta.url),
        env: {...process.env, MFL_LEAGUE_ID: "99999", DRY_RUN: "true", MFL_SETTINGS: JSON.stringify({rookieScale: {firstPickFromRank: RANKS}})},
        encoding: "utf8"
    });
    return JSON.parse(text.trim().split("\n").pop());
}

// a position's salaries, highest first: `count` of them from `top` down by 1
const salaries = (top, count) => Array.from({length: count}, (_, i) => ({fullName: `P${i + 1}`, salary: top - i}));

test("a league sets either the first picks' amounts or their ranks, and its own replaces what it would inherit", () => {
    const own = resolveSettings(file, "1", {rookieScale: {firstPickFromRank: RANKS}});
    assert.deepEqual(own.league.problems, []);
    assert.deepEqual(own.settings.rookieScale, {firstPickFromRank: RANKS, dropPerPick: 0.20});
    const listed = resolveSettings({defaults: file.defaults, leagues: {7: {rookieScale: {firstPickFromRank: RANKS}}}}, "7");
    assert.deepEqual(listed.settings.rookieScale, {firstPickFromRank: RANKS, dropPerPick: 0.20});
    const back = resolveSettings({defaults: file.defaults, leagues: {7: {rookieScale: {firstPickFromRank: RANKS}}}}, "1", {extends: "7", rookieScale: {firstPick: {QB: 3}}});
    assert.deepEqual(back.settings.rookieScale, {firstPick: {QB: 3}, dropPerPick: 0.20});
    for (const bad of [{QB: 0}, {QB: 2.5}, {QB: "15"}, {}]) {
        const result = resolveSettings(file, "1", {rookieScale: {firstPickFromRank: bad}});
        assert.match(result.league.problems.join(), /firstPickFromRank must name each position's rank/, JSON.stringify(bad));
        assert.deepEqual(result.settings.rookieScale, file.defaults.rookieScale);
    }
});

test("each first pick is paid the salary at its rank, $1 where the position had fewer; the bylaw's example", () => {
    const out = ranked(`
        const rules = await import("./site/v2/lib/rules.js");
        const top = {QB: ${JSON.stringify(salaries(40, 20))}, RB: ${JSON.stringify(salaries(41, 25))}, WR: ${JSON.stringify(salaries(60, 30))}, TE: ${JSON.stringify(salaries(20, 15))}};
        out = {positions: rules.POSITIONS, depth: rules.SNAPSHOT_DEPTH, baselines: rules.rookieBaselines(top), none: rules.rookieBaselines(null),
            fourth: rules.rookieSalary(22, 4)};`);
    assert.deepEqual(out.positions.map((position) => position.code), ["QB", "RB", "WR", "TE", "PK"]);
    assert.equal(out.depth, 35);
    // the 15th QB (40 down to 26), the 20th RB (41 down to 22), WR and PK short of their ranks, the 15th TE
    assert.deepEqual(out.baselines, {QB: 26, RB: 22, WR: 1, TE: 6, PK: 1});
    assert.equal(out.none, null);
    // 8.3.4: an RB at overall pick 4 with a baseline of 22 is paid 22 × 0.8³ = 11
    assert.equal(out.fourth, 11);
});

test("the deadline snapshot keeps the deepest rank's salaries, and a franchise salary still averages the top five", () => {
    const out = ranked(`
        const rules = await import("./site/v2/lib/rules.js");
        const players = Array.from({length: 40}, (_, i) => ({nflPosition: "WR", fullName: "W" + i, salary: 100 - i}));
        const top = rules.franchiseTopSalaries(players);
        out = {kept: top.WR.length, first: top.WR[0].salary, franchise: rules.franchiseSalary(top.WR)};`);
    assert.deepEqual(out, {kept: 35, first: 100, franchise: 98});
});

test("the rookie draft's picks are paid from the deadline's ranks, and the Draft page says where they're from", () => {
    const out = ranked(`
        const {planRookies} = await import("./site/v2/lib/load.js");
        const {scaleNote} = await import("./site/v2/ui/rosters-view.js");
        const rules = await import("./site/v2/lib/rules.js");
        const top = {QB: ${JSON.stringify(salaries(40, 20))}, RB: ${JSON.stringify(salaries(41, 25))}, WR: ${JSON.stringify(salaries(60, 40))}, TE: ${JSON.stringify(salaries(20, 15))}, PK: ${JSON.stringify(salaries(5, 20))}};
        const baselines = rules.rookieBaselines(top);
        const players = new Map([["1", {position: "QB"}], ["2", {position: "WR"}], ["3", {position: "RB"}], ["4", {position: "RB"}]]);
        const picks = planRookies({picks: ["1", "2", "3", "4"].map((id) => ({franchiseId: "0001", id})), teams: 12, players, baselines});
        const short = {...top, PK: ${JSON.stringify(salaries(5, 3))}};
        out = {salaries: picks.map((pick) => pick.salary),
            set: scaleNote({phase: "previous", topSalaries: top}, 2027),
            short: scaleNote({phase: "final", topSalaries: short}, 2026),
            live: scaleNote({phase: "projected", topSalaries: top}, 2026),
            missing: scaleNote({phase: "previous", missing: true, topSalaries: top}, 2027)};`);
    // QB 26 at pick 1; WR 26 (60 down to the 35th) at pick 2, 26 × 0.8 = 21; RB 22 × 0.8² = 14, × 0.8³ = 11
    assert.deepEqual(out.salaries, [26, 21, 14, 11]);
    assert.equal(out.set, "Pick 1 is paid the QB15, RB20, WR35, TE15 and PK15 salaries at the 2026 trade deadline.");
    assert.equal(out.short, "Pick 1 is paid the QB15, RB20, WR35, TE15 and PK15 salaries at the 2026 trade deadline. PK had fewer under contract, so it starts at $1.");
    assert.equal(out.live, "Pick 1 is paid the QB15, RB20, WR35, TE15 and PK15 salaries as they stand now, until the 2026 trade deadline sets them.");
    assert.equal(out.missing, "Pick 1 is paid the QB15, RB20, WR35, TE15 and PK15 salaries as they stand now: there’s no snapshot from the 2026 trade deadline.");
});

test("FUAD's fixed scale needs no snapshot and keeps five salaries a position", async () => {
    const rules = await import("../site/v2/lib/rules.js");
    const {scaleNote} = await import("../site/v2/ui/rosters-view.js");
    assert.equal(rules.ROOKIE_RANKED, false);
    assert.equal(rules.SNAPSHOT_DEPTH, 5);
    assert.deepEqual(rules.rookieBaselines(null), {QB: 6, RB: 10, WR: 10, TE: 4, PK: 1});
    assert.equal(scaleNote({phase: "previous", topSalaries: {}}, 2027), "");
});
