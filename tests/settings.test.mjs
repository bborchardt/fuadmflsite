// The leagues' settings (site/v2/settings.json, docs/settings.md) as the site, the daily job and the
// published build read them, and a test league's as its header sets them.

import {test} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import settings, {league, leagueIdIn, resolveSettings} from "../site/v2/lib/settings.js";
import {testLeagueNote} from "../site/v2/ui/test-league.js";
import {CONTRACT_WINDOW_HOURS} from "../site/v2/lib/adds.js";
import {MAX_YEARS, yearMentions} from "../site/v2/lib/contract-years.js";
import {LENGTHS, isLengthLine, yearsIn} from "../site/v2/ui/add-model.js";
import {lineupPositions, seasonWeeks, withOthers} from "../site/v2/lib/rules.js";

const file = JSON.parse(readFileSync(new URL("../site/v2/settings.json", import.meta.url), "utf8"));

// FUAD's rules are held here, so a change to the defaults can't quietly change them
const FUAD = {
    wordmark: "FUAD",
    timeZone: "CT",
    salaryCap: 300,
    roster: {min: 23, max: 30},
    weeks: {tradeDeadline: 12},
    franchiseTag: {averageOfTop: 5},
    rookieScale: {firstPick: {QB: 6, RB: 10, WR: 10, TE: 4, PK: 1}, dropPerPick: 0.20},
    rookieCutFreeUntilLengthSet: true,
    cutPenalty: {shareOfRemainingContract: 0.40, minimumPerYear: 1},
    contracts: {maxYears: 5, defaultYears: 1, postWithinHours: 1},
    adds: {ownDropBidAfterHours: 48},
    antiTanking: true,
    playoffs: {teams: 6, divisionWinnersSeededFirst: true, byes: 2, wildcardsBy: "allPlay", thirdPlaceGame: true},
    draftOrder: "playoffFinish",
    payouts: {weeklyHighScore: 15, allPlayPerGameOver500: 0.75, places: [0.55, 0.30, 0.15]},
    renumberedFranchises: [{was: "0009", now: "0005", through: 2020}]
};

test("the repo's code reads settings.json", () => {
    assert.deepEqual(settings, FUAD);
    assert.equal(league.listed, true);
    assert.equal(CONTRACT_WINDOW_HOURS, FUAD.contracts.postWithinHours);
});

test("published, lib/settings.js is the JSON itself, in the bundle too", () => {
    const out = mkdtempSync(join(tmpdir(), "fuad-build-"));
    try {
        execFileSync(process.execPath, [new URL("../tools/build.mjs", import.meta.url).pathname, out], {stdio: "ignore"});
        const published = readFileSync(join(out, "v2", "lib", "settings-data.js"), "utf8");
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

test("from MFL's league export: the season's weeks and the league's positions", () => {
    assert.deepEqual(seasonWeeks({lastRegularSeasonWeek: "14", endWeek: "17"}), {playoffsStart: 15, championship: 17});
    assert.deepEqual(seasonWeeks({lastRegularSeasonWeek: "13", endWeek: "16"}), {playoffsStart: 14, championship: 16});
    assert.equal(seasonWeeks({}), null);
    const league = JSON.parse(readFileSync(new URL("../tools/verify/screens/league.json", import.meta.url), "utf8")).league;
    assert.deepEqual(lineupPositions(league), ["QB", "RB", "WR", "TE", "PK"]);
    assert.deepEqual(lineupPositions({starters: {position: [{name: "QB"}, {name: "Def"}]}}), ["QB", "Def"]);
    // without it, the rookie scale's
    assert.deepEqual(lineupPositions(null), Object.keys(settings.rookieScale.firstPick));
    assert.deepEqual(withOthers(["QB", "RB"], ["RB", "Def", "QB", "Def"]), ["QB", "RB", "Def"]);
});

test("the time zone is one MFL shows, labelled as MFL labels it", async () => {
    const {TIME_ZONE, ZONE, zoneOffset} = await import("../site/v2/lib/zone.js");
    assert.ok(TIME_ZONE, `timeZone "${settings.timeZone}" is not one MFL offers (ET, CT, MT, PT, AKT, HT, GMT)`);
    assert.equal(ZONE, settings.timeZone);
    // Central: daylight time in October, standard in December
    assert.equal(zoneOffset(Date.UTC(2026, 9, 18, 17) / 1000), -5 * 3600);
    assert.equal(zoneOffset(Date.UTC(2026, 11, 6, 18) / 1000), -6 * 3600);
});

test("a listed league's settings ignore a header's", () => {
    const {settings: values, league: status} = resolveSettings(file, "48571", {wordmark: "X", salaryCap: 1});
    assert.deepEqual(values, FUAD);
    assert.deepEqual([status.test, status.snapshots, status.keyId], [false, true, "48571"]);
});

test("an unlisted league gets the defaults: a generic wordmark, no one's history, no one's snapshots", () => {
    const {settings: values, league: status} = resolveSettings(file, "99999");
    assert.deepEqual(values, file.defaults);
    assert.equal(values.wordmark, "MFL");
    assert.deepEqual(values.renumberedFranchises, []);
    assert.deepEqual([status.listed, status.test, status.base, status.snapshots], [false, true, null, false]);
});

test("a test league's header line goes over a listed league's values, nested values merging", () => {
    const {settings: values, league: status} = resolveSettings(file, "50965", {extends: "48571", wordmark: "FUAD CLONE", salaryCap: 250, roster: {max: 28}});
    assert.deepEqual(values, {...FUAD, wordmark: "FUAD CLONE", salaryCap: 250, roster: {min: 23, max: 28}});
    assert.deepEqual([status.test, status.base, status.baseName, status.snapshots, status.problems], [true, "48571", "FUAD", true, []]);
    assert.deepEqual(status.changes.map((change) => change.path), ["wordmark", "salaryCap", "roster.max"]);
});

test("a list and the rookie scale's positions are replaced whole", () => {
    const {settings: values} = resolveSettings(file, "1", {payouts: {places: [1]}, rookieScale: {firstPick: {QB: 3}}});
    assert.deepEqual(values.payouts.places, [1]);
    assert.deepEqual(values.rookieScale, {firstPick: {QB: 3}, dropPerPick: 0.20});
});

test("a header's unusable values are ignored and named", () => {
    const line = JSON.parse('{"extends": "1", "salaryCapp": 1, "salaryCap": "250", "roster": 5, "timeZone": "XX", "playoffs": {"byes": -1}, "__proto__": {"salaryCap": 1}, "payouts": {"places": ["a"]}, "antiTanking": "no"}');
    const {settings: values, league: status} = resolveSettings(file, "1", line);
    assert.deepEqual(values, file.defaults);
    assert.equal(status.base, null);
    assert.equal(status.snapshots, false);
    assert.equal(status.problems.length, 9);
    for (const name of ["extends", "salaryCapp", "salaryCap", "roster", "timeZone", "playoffs.byes", "__proto__", "payouts.places", "antiTanking"]) {
        assert.ok(status.problems.some((problem) => problem.includes(name)), name);
    }
    assert.equal(({}).salaryCap, undefined);
    for (const line2 of [{franchiseTag: {averageOfTop: 0}}, {contracts: {maxYears: 2.5}}, {roster: {min: 40}}, {rookieScale: {dropPerPick: 5}}, {playoffs: {teams: 0}}, {contracts: {defaultYears: 9}}, {contracts: {maxYears: 1000000}}, {payouts: {places: [55, 30, 15]}}]) {
        const unusable = resolveSettings(file, "1", line2);
        assert.deepEqual(unusable.settings, file.defaults, JSON.stringify(line2));
        assert.equal(unusable.league.problems.length, 1, JSON.stringify(line2));
        assert.deepEqual(unusable.league.changes, [], JSON.stringify(line2));
    }
    const sibling = resolveSettings(file, "1", {contracts: {defaultYears: 9, postWithinHours: 4}});
    assert.equal(sibling.settings.contracts.postWithinHours, 4);
    assert.equal(sibling.settings.contracts.defaultYears, 1);
    assert.deepEqual(resolveSettings(file, "1", 5).league.problems, ["the settings line must be an object"]);
});

test("a changed value keeps a test league's stored values apart, and each league's from another's", () => {
    const key = (id, line) => resolveSettings(file, id, line).league.keyId;
    assert.equal(key("1", {salaryCap: 250}), key("1", {salaryCap: 250}));
    assert.notEqual(key("1", {salaryCap: 250}), key("1", {salaryCap: 200}));
    assert.notEqual(key("1"), key("2"));
    assert.notEqual(key("48571"), key("1"));
});

test("the league comes from the page's address, then L=, then the page's league_id", () => {
    const at = (href) => new URL(href);
    assert.equal(leagueIdIn(at("https://x/2026/home/48571?L=2"), "3"), "48571");
    assert.equal(leagueIdIn(at("https://x/2026/lineup?L=2"), "3"), "2");
    assert.equal(leagueIdIn(at("https://x/2026/lineup"), "3"), "3");
});

test("a test league says so; its commissioner sees what's in force, escaped", () => {
    const fuad = resolveSettings(file, "48571");
    assert.equal(testLeagueNote(fuad.league, fuad.settings, true), "");
    const plain = resolveSettings(file, "1");
    assert.match(testLeagueNote(plain.league, plain.settings, false), />Test league<\/p>/);
    assert.match(testLeagueNote(plain.league, plain.settings, true), /default rules: \$300 cap, 23–30 players/);
    const line = resolveSettings(file, "1", {extends: "48571", wordmark: "C", salaryCap: 250, "<b>": 1});
    const note = testLeagueNote(line.league, line.settings, true);
    assert.match(note, /FUAD’s rules; salaryCap 250; ignored: &lt;b&gt; isn/);
    assert.ok(!note.includes("wordmark"));
});

test("what's kept is kept per league, but for what every league shares, and old copies go", async () => {
    const items = new Map();
    globalThis.window = {localStorage: {
        getItem: (key) => (items.has(key) ? items.get(key) : null),
        setItem: (key, value) => items.set(key, String(value)),
        removeItem: (key) => items.delete(key)
    }};
    try {
        const {dropUnusedKeys, save, saved} = await import("../site/v2/ui/store.js");
        save("fuad.league.power.2026", 1);
        save("fuad.players.2026", 2);
        assert.deepEqual([...items.keys()], ["fuad.league.power.2026@48571", "fuad.players.2026"]);
        assert.equal(saved("fuad.league.power.2026").value, 1);
        for (const old of ["fuad.league.power.2026", "fuad.bids.2026.1", "fuad.homeTabs", "fuad.capUsed.2026.0001"]) {
            items.set(old, "{}");
        }
        items.set("fuad.beta", "v2");
        items.set("fuad.home.recent.2026@48571-old", "{}");
        items.set("fuad.home.recent.2026@50965-abc", "{}");
        // Moves' copy of the league export from when it kept the owners
        items.set("fuad.league.2026.48571@48571", "{}");
        items.set("fuad.league.2026.50965@50965-abc", "{}");
        items.set("fuad.tidied.48571", "x");
        globalThis.window.localStorage = new Proxy(globalThis.window.localStorage, {ownKeys: () => [...items.keys()], getOwnPropertyDescriptor: () => ({enumerable: true, configurable: true})});
        dropUnusedKeys();
        assert.deepEqual([...items.keys()].sort(), ["fuad.beta", "fuad.home.recent.2026@50965-abc", "fuad.league.power.2026@48571", "fuad.players.2026", "fuad.tidied2.48571"]);
        items.set("fuad.homeTabs", "{}");
        dropUnusedKeys();
        assert.ok(items.has("fuad.homeTabs"), "once for the settings a browser has");
    } finally {
        delete globalThis.window;
    }
});
