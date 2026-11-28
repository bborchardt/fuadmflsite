// Fails when v2's bundle, as Pages sends it (gzipped), is over its budget (REVIEW.md: Performance).
// Raising the budget is a change to BUDGET_KB, made on purpose as "more requests" is.
//     node tools/bundle-budget.mjs [DIST]          DIST defaults to dist/, after `npm run build`
import {readFileSync} from "node:fs";
import {join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {gzipSync} from "node:zlib";

export const BUDGET_KB = 200;
// reported, not budgeted
const ALSO = ["v2/fuad.css"];

const gzippedKb = (file) => gzipSync(readFileSync(file)).length / 1024;

// each file's gzipped size in KB, and whether the bundle is over `budgetKb`
export function weigh(dist, budgetKb = BUDGET_KB) {
    const bundle = gzippedKb(join(dist, "v2", "fuad.js"));
    return {bundle, over: bundle > budgetKb, also: ALSO.map((path) => [path, gzippedKb(join(dist, path))])};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const dist = resolve(process.argv[2] || "dist");
    const {bundle, over, also} = weigh(dist);
    console.log(`v2/fuad.js: ${bundle.toFixed(1)} KB gzipped, budget ${BUDGET_KB} KB${over ? ": over budget" : ""}`);
    for (const [path, kb] of also) {
        console.log(`${path}: ${kb.toFixed(1)} KB gzipped`);
    }
    process.exitCode = over ? 1 : 0;
}
