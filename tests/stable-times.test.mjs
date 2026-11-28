// tools/stable-times.mjs: a file's time comes from its content alone, so an unchanged file keeps
// GitHub Pages' ETag (its time and size) across deploys, and a changed one gets a new one.

import {test} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, relative} from "node:path";
import {fileURLToPath} from "node:url";
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

test("two builds give the same files, so an unchanged one keeps its time", (t) => {
    const build = fileURLToPath(new URL("../tools/build.mjs", import.meta.url));
    // one folder, built into twice, as the publish workflow always builds into dist/: the source maps
    // name the folder's own path
    const out = mkdtempSync(join(tmpdir(), "fuad-build-"));
    t.after(() => rmSync(out, {recursive: true, force: true}));
    const files = () => readdirSync(out, {withFileTypes: true, recursive: true}).filter((entry) => entry.isFile())
        .map((entry) => join(entry.parentPath, entry.name)).map((file) => [relative(out, file), readFileSync(file).toString("base64")]).sort();
    const builtOnce = () => {
        rmSync(out, {recursive: true, force: true});
        execFileSync(process.execPath, [build, out], {stdio: "ignore"});
        return files();
    };
    const first = builtOnce();
    assert.ok(first.some(([name]) => name === join("v2", "fuad.js")));
    // compared by name and a short digest, so a difference is readable
    const digest = (list) => list.map(([name, body]) => `${name} ${stableTime(Buffer.from(body, "base64"))}`);
    assert.deepEqual(digest(builtOnce()), digest(first));
});
