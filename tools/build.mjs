// Builds what GitHub Pages publishes: site/ as it is, except each version in BUNDLED, whose code
// becomes one minified fuad.js (the parts loaded on demand still run only when asked for), and whose
// fuad.css is minified. A slow phone then waits for one request instead of one per module, level by
// level, and a stale cache re-checks one file.
//
//   node tools/build.mjs [OUT]          OUT defaults to dist/
import {cpSync, mkdirSync, rmSync} from "node:fs";
import {join, resolve} from "node:path";
import {build} from "esbuild";

const REPO = resolve(import.meta.dirname, "..");
// v1 is frozen and published as written
const BUNDLED = ["v2"];

const out = resolve(process.argv[2] || join(REPO, "dist"));

rmSync(out, {recursive: true, force: true});
mkdirSync(out, {recursive: true});
cpSync(join(REPO, "site"), out, {recursive: true, filter: (path) => !path.startsWith(join(REPO, "site", "data"))});
for (const version of BUNDLED) {
    const from = join(REPO, "site", version);
    const target = join(out, version);
    rmSync(target, {recursive: true, force: true});
    await build({
        entryPoints: [join(from, "fuad.js")],
        outfile: join(target, "fuad.js"),
        bundle: true,
        format: "esm",
        minify: true,
        sourcemap: true,
        // syntax past ES2020 fails the build, as `npm run lint` holds the source to it. Safari before
        // 16.4 can't parse a lookbehind regex, which would stop the whole file: as Safari 16.3 it
        // becomes `new RegExp`, failing only where it runs (lib/contract-years.js, loaded on demand)
        target: ["es2020", "safari16.3"],
        legalComments: "none",
        logLevel: "warning"
    });
    // only minified: newer CSS stays as written, failing quietly where unsupported
    await build({
        entryPoints: [join(from, "fuad.css")],
        outfile: join(target, "fuad.css"),
        minify: true,
        sourcemap: true,
        logLevel: "warning"
    });
    console.log(`${version}: bundled`);
}
