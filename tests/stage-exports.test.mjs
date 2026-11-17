// Each season stage's saved exports (tests/fixtures/pages/stages/<stage>/<league>/exports/, as the
// daily job's "Save pages" saves them): every one passes the rules the job read it by (lib/shapes.js),
// so a rule that turns down an export MFL really gave, at a stage other than the one a change is made
// in, fails here.

import {test} from "node:test";
import assert from "node:assert/strict";
import {existsSync, readFileSync, readdirSync} from "node:fs";
import {join} from "node:path";
import {SHAPES, WEEK_ROSTERS, shapeProblem} from "../site/v2/lib/shapes.js";

const STAGES = join(import.meta.dirname, "fixtures", "pages", "stages");
const dirs = (dir) => readdirSync(dir, {withFileTypes: true}).filter((entry) => entry.isDirectory()).map((entry) => join(dir, entry.name));
const folders = dirs(STAGES).flatMap(dirs).map((league) => join(league, "exports")).filter(existsSync);
// the rules other than an export's section's that the job reads one by, by the name the manifest gives
const RULES = {WEEK_ROSTERS};

for (const folder of folders) {
    const name = folder.slice(STAGES.length + 1);
    const manifest = JSON.parse(readFileSync(join(folder, "manifest.json"), "utf8"));

    test(`${name}: the manifest lists every saved export, and only those`, () => {
        const files = readdirSync(folder).filter((file) => file !== "manifest.json").sort();
        assert.deepEqual(manifest.exports.map((each) => each.name).sort(), files);
        assert.deepEqual(manifest.exports.filter((each) => each.rules && !(each.rules in RULES)), []);
    });

    test(`${name}: every saved export passes the rules the job read it by`, () => {
        const problems = [];
        for (const {name: file, rules} of manifest.exports) {
            const body = JSON.parse(readFileSync(join(folder, file), "utf8"));
            if (body.error) {
                problems.push(`${file}: MFL said ${JSON.stringify(body.error)}`);
            }
            for (const section of Object.keys(body).filter((key) => key in SHAPES)) {
                const problem = shapeProblem(section, body[section], rules ? RULES[rules] : undefined);
                if (problem) {
                    problems.push(`${file}: ${problem}`);
                }
            }
        }
        assert.deepEqual(problems, []);
    });
}
