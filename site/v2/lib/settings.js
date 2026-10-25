// The league's settings, from settings.json (docs/settings.md). Published, this file is replaced by
// the JSON itself (tools/build.mjs); run from the repo (tests, the daily job), Node reads the file.
// Older iPhones can't import JSON as a module.

const fs = globalThis.process && globalThis.process.getBuiltinModule && globalThis.process.getBuiltinModule("node:fs");

export default JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
