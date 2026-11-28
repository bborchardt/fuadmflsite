// Gives every file under a folder a modification time read from its content, so GitHub Pages, whose
// ETag is the file's time and size, keeps an unchanged file's ETag across deploys and a browser's
// conditional request gets a 304. Otherwise every deploy, even one that only adds the job's data,
// would have every member download fuad.js again.
//     node tools/stable-times.mjs dist
// The time is a second within about eight years from 2010, picked by the file's SHA-256; Pages'
// Last-Modified then shows that date, which nothing reads.

import {createHash} from "node:crypto";
import {readFileSync, readdirSync, utimesSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";

const FROM = Date.UTC(2010, 0, 1) / 1000;

// the time, in seconds, for a file holding `bytes`
export const stableTime = (bytes) => FROM + parseInt(createHash("sha256").update(bytes).digest("hex").slice(0, 7), 16);

// every file under `dir`; how many were set
export function setStableTimes(dir) {
    let count = 0;
    for (const entry of readdirSync(dir, {withFileTypes: true, recursive: true})) {
        if (entry.isFile()) {
            const file = join(entry.parentPath, entry.name);
            const time = stableTime(readFileSync(file));
            utimesSync(file, time, time);
            count += 1;
        }
    }
    return count;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const dir = process.argv[2];
    if (!dir) {
        console.error("usage: node tools/stable-times.mjs <folder>");
        process.exit(2);
    }
    console.log(`Set the times of ${setStableTimes(dir)} files under ${dir} from their content.`);
}
