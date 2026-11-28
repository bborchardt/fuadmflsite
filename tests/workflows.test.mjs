// .github/workflows/daily.yml: every manual-run input but Dry run applies only to a dry run, so the
// step that refuses them on a real run must know each one, or a new input is silently ignored again.

import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";

const workflow = readFileSync(join(import.meta.dirname, "..", ".github", "workflows", "daily.yml"), "utf8");

test("the real run's refusal names every manual-run input but Dry run", () => {
    const inputs = /workflow_dispatch:\n {4}inputs:\n([\s\S]*?)\n\S/.exec(workflow);
    assert.ok(inputs, "daily.yml's workflow_dispatch inputs");
    const names = [...inputs[1].matchAll(/^ {6}([a-z_]+):$/gm)].map(([, name]) => name).filter((name) => name !== "dry_run");
    assert.ok(names.length >= 7, names.join());
    const step = /- name: Refuse a dry run's inputs on a real run\n([\s\S]*?)\n {6}- /.exec(workflow);
    assert.ok(step, "the refusal step");
    const loop = (/for pair in ([^;]+);/.exec(step[1]) || [])[1] || "";
    const checked = new Map(loop.trim().split(/\s+/).map((pair) => pair.split(":")));
    for (const name of names) {
        const variable = (new RegExp(`^ {10}([A-Z_]+): \\$\\{\\{ inputs\\.${name}\\b`, "m").exec(step[1]) || [])[1];
        assert.ok(variable, `${name} is passed to the refusal step`);
        assert.ok(checked.has(variable), `${name} (${variable}) is checked by the refusal step`);
    }
});
