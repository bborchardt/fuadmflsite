// The league's settings (site/v2/settings.json, docs/settings.md) as the site, the daily job and the
// published build read them.

import {test} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import settings from "../site/v2/lib/settings.js";
import {CONTRACT_WINDOW_HOURS} from "../site/v2/lib/adds.js";
import {MAX_YEARS, yearMentions} from "../site/v2/lib/contract-years.js";
import {LENGTHS, isLengthLine, yearsIn} from "../site/v2/ui/add-model.js";

const file = JSON.parse(readFileSync(new URL("../site/v2/settings.json", import.meta.url), "utf8"));

test("the repo's code reads settings.json", () => {
    assert.deepEqual(settings, file);
    assert.equal(CONTRACT_WINDOW_HOURS, file.contracts.postWithinHours);
});

test("published, lib/settings.js is the JSON itself, in the bundle too", () => {
    const out = mkdtempSync(join(tmpdir(), "fuad-build-"));
    try {
        execFileSync(process.execPath, [new URL("../tools/build.mjs", import.meta.url).pathname, out], {stdio: "ignore"});
        const published = readFileSync(join(out, "v2", "lib", "settings.js"), "utf8");
        assert.deepEqual(JSON.parse(published.replace(/^export default /, "").replace(/;\s*$/, "")), file);
        const bundle = readFileSync(join(out, "v2", "fuad.js"), "utf8");
        assert.ok(!bundle.includes("getBuiltinModule"), "the bundle mustn't read through Node");
    } finally {
        rmSync(out, {recursive: true, force: true});
    }
});

test("contract lengths run from 1 to maxYears, and a longer one is read so it can be flagged", () => {
    assert.deepEqual(LENGTHS, Array.from({length: MAX_YEARS}, (_, i) => i + 1));
    assert.equal(isLengthLine(`Akins: ${MAX_YEARS} years`), true);
    assert.equal(isLengthLine(`Akins: ${MAX_YEARS + 1} years`), false);
    assert.equal(yearsIn(`${MAX_YEARS} years`), MAX_YEARS);
    assert.equal(yearsIn(`${MAX_YEARS + 1} years`), null);
    assert.deepEqual(yearMentions("six years, or 10 yrs").map((mention) => mention.years), [6, 10]);
});
