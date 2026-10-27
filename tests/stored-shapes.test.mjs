// What v2 builds from MFL's pages and keeps in members' browsers (store.js `cached`) is used as found
// until it expires, a year for a bid run, so a copy kept by an older version must not be read by a
// newer one expecting another shape. Each such value's outline, from the saved pages, is pinned
// here beside its key: a change to the outline changes the key too, so old copies are ignored.

import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {readBidRun} from "../site/v2/ui/bids-model.js";
import {readCareer, readChampions, readSeries} from "../site/v2/ui/history-model.js";
import {BIDS_KEY} from "../site/v2/ui/move-rows.js";
import {KEYS} from "../site/v2/ui/history.js";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

// an object keyed by data (team numbers, player names) rather than field names is a map; an empty
// one, as a team no claim was refused for, is read as a map too
const kind = (value) => (value === null ? "null" : Array.isArray(value) ? "array" : typeof value !== "object" ? typeof value
    : Object.keys(value).length && Object.keys(value).every((name) => /^[A-Za-z_$][\w$]*$/.test(name)) ? "object" : "map");

// field names and value types across every sample, no values: a map is `{*: …}`, a field some
// samples lack ends in `?`
function outline(samples) {
    const of = (wanted) => samples.filter((value) => kind(value) === wanted);
    return [...new Set(samples.map(kind))].sort().map((name) => {
        if (name === "array") {
            const items = of("array").flat();
            return items.length ? `[${outline(items)}]` : "[]";
        }
        if (name === "map") {
            const values = of("map").flatMap(Object.values);
            return values.length ? `{*: ${outline(values)}}` : "{}";
        }
        if (name === "object") {
            const objects = of("object");
            const fields = [...new Set(objects.flatMap(Object.keys))].sort();
            return `{${fields.map((field) => {
                const having = objects.filter((value) => field in value);
                return `${field}${having.length < objects.length ? "?" : ""}: ${outline(having.map((value) => value[field]))}`;
            }).join(", ")}}`;
        }
        return name;
    }).join("|");
}

// [the key as pinned, the key v2 uses, its values from the saved pages, the outline as pinned]
const stored = [
    ["fuad.bids", BIDS_KEY, () => [readBidRun(fixture("processed-waivers.html")), readBidRun(fixture("processed-waivers-backup.html"))],
        "[{awarded: null|number, claims: [{amount: number, name: string, nfl: string, position: string}], comment: string, refused: {*: string}, team: string}]"],
    ["fuad.history.champions", KEYS.champions, () => [readChampions(fixture("history-champions.html"))], "[{name: string, team: string, year: number}]"],
    ["fuad.history.career", KEYS.career, () => [readCareer(fixture("history-career.html"))], "{*: {l: number, seasons: [number], t: number, w: number}}"],
    ["fuad.history.series", KEYS.series, () => [readSeries(fixture("history-series-0005.html"))], "{*: {l: number, t: number, w: number}}"]
];

for (const [pinnedKey, key, read, pinned] of stored) {
    test(`${key}: the shape kept under it`, () => {
        assert.equal(key, pinnedKey, "a key changed: pin it here with its outline");
        assert.equal(outline(read()), pinned, `what's kept under ${key} changed shape: give it a new key (as ${key}2) and pin both here`);
    });
}

test("the outline: types, optional fields and maps, no values", () => {
    assert.equal(outline([{a: 1, b: "x", c: {"0001": [true]}}, {a: null, c: {}}]), "{a: null|number, b?: string, c: {*: [boolean]}}");
});
