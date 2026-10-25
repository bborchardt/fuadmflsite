// Builds what GitHub Pages publishes: site/ as it is, except each version in BUNDLED, whose code
// becomes one minified fuad.js (the parts loaded on demand still run only when asked for), and whose
// fuad.css is minified. A slow phone then waits for one request instead of one per module, level by
// level, and a stale cache re-checks one file. Its modules stay published too, for a page still
// holding an unbundled fuad.js from before (Pages caches for 10 minutes).
//
//   node tools/build.mjs [OUT]          OUT defaults to dist/
import {cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from "node:fs";
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
    // lib/settings.js reads settings.json through Node; published, it is the JSON itself. The bundle is
    // built from the copy so it takes that one too.
    const settings = join(from, "settings.json");
    if (existsSync(settings)) {
        writeFileSync(join(target, "lib", "settings.js"), `export default ${JSON.stringify(JSON.parse(readFileSync(settings, "utf8")))};\n`);
    }
    await build({
        entryPoints: [join(target, "fuad.js")],
        outfile: join(target, "fuad.js"),
        allowOverwrite: true,
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
    // minified for iOS 14, so it doesn't merge sides into `inset` (Safari 14.1+); newer CSS stays as
    // written, failing quietly where unsupported
    await build({
        entryPoints: [join(from, "fuad.css")],
        outfile: join(target, "fuad.css"),
        allowOverwrite: true,
        minify: true,
        target: ["safari14"],
        sourcemap: true,
        logLevel: "warning"
    });
    console.log(`${version}: bundled`);
}
