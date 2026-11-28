// tools/bundle-budget.mjs: v2's bundle, gzipped, against its budget.

import {test} from "node:test";
import assert from "node:assert/strict";
import {execFileSync, spawnSync} from "node:child_process";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {BUDGET_KB, weigh} from "../tools/bundle-budget.mjs";

test("the bundle is within its budget, and one over it fails", (t) => {
    const dist = mkdtempSync(join(tmpdir(), "fuad-budget-"));
    t.after(() => rmSync(dist, {recursive: true, force: true}));
    execFileSync(process.execPath, [fileURLToPath(new URL("../tools/build.mjs", import.meta.url)), dist], {stdio: "ignore"});
    const {bundle, over, also} = weigh(dist);
    assert.ok(bundle > 0);
    assert.equal(over, false, `v2/fuad.js is ${bundle.toFixed(1)} KB gzipped, over its ${BUDGET_KB} KB budget`);
    assert.deepEqual(also.map(([path]) => path), ["v2/fuad.css"]);
    assert.equal(weigh(dist, bundle - 1).over, true);
    const run = spawnSync(process.execPath, [fileURLToPath(new URL("../tools/bundle-budget.mjs", import.meta.url)), dist], {encoding: "utf8"});
    assert.equal(run.status, 0);
    assert.match(run.stdout, /^v2\/fuad\.js: [\d.]+ KB gzipped, budget 200 KB\n/);
});
