// tools/stable-times.mjs: a file's time comes from its content alone, so an unchanged file keeps
// GitHub Pages' ETag (its time and size) across deploys, and a changed one gets a new one.

import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {setStableTimes, stableTime} from "../tools/stable-times.mjs";

test("the same content gets the same time in any build, other content another, nested files too", (t) => {
    const builds = [mkdtempSync(join(tmpdir(), "fuad-times-")), mkdtempSync(join(tmpdir(), "fuad-times-"))];
    t.after(() => builds.forEach((dir) => rmSync(dir, {recursive: true, force: true})));
    for (const [i, dir] of builds.entries()) {
        mkdirSync(join(dir, "v2"));
        mkdirSync(join(dir, "data", "icons"), {recursive: true});
        writeFileSync(join(dir, "v2", "fuad.js"), "console.log(1);");
        writeFileSync(join(dir, "data", "icons", "0001.webp"), "icon");
        // changed between the two builds, at the same size
        writeFileSync(join(dir, "data", "last.json"), i === 0 ? "{\"a\":1}" : "{\"a\":2}");
        assert.equal(setStableTimes(dir), 3);
    }
    const time = (dir, ...path) => statSync(join(dir, ...path)).mtimeMs / 1000;
    assert.equal(time(builds[0], "v2", "fuad.js"), time(builds[1], "v2", "fuad.js"));
    assert.equal(time(builds[0], "data", "icons", "0001.webp"), stableTime(Buffer.from("icon")));
    assert.notEqual(time(builds[0], "data", "last.json"), time(builds[1], "data", "last.json"));
    // in the past, so no time reads as a file from the future
    assert.ok(time(builds[0], "v2", "fuad.js") * 1000 < Date.UTC(2019, 0, 1));
});
