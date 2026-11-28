// The commissioner's alert that the daily job hasn't run (ui/home-model.js), from GitHub's list of its
// scheduled runs; ui/home.js asks GitHub for it only on the commissioner's pages.

import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {RUN_LATE_HOURS, readLastRun, repoOf, runAlert, runsPage, runsUrl} from "../site/v2/ui/home-model.js";

const runs = JSON.parse(readFileSync(new URL("./fixtures/github-daily-runs.json", import.meta.url), "utf8"));
const HOUR = 60 * 60;
const at = Date.parse("2026-11-27T17:36:45Z") / 1000;

test("the repository is the one its GitHub Pages address is published from", () => {
    const repo = repoOf("https://bborchardt.github.io/fuadmflsite/data/");
    assert.deepEqual(repo, {owner: "bborchardt", repo: "fuadmflsite"});
    assert.equal(runsUrl(repo), "https://api.github.com/repos/bborchardt/fuadmflsite/actions/workflows/daily.yml/runs?event=schedule&status=completed&per_page=10");
    assert.equal(runsPage(repo), "https://github.com/bborchardt/fuadmflsite/actions/workflows/daily.yml");
    assert.equal(repoOf("http://localhost:8000/data/"), null);
    assert.equal(repoOf("https://bborchardt.github.io/"), null);
});

test("GitHub's list gives the last run that did the chores; none is none, anything else not recognised", () => {
    assert.deepEqual(readLastRun(runs), {at});
    const run = (conclusion, created) => ({event: "schedule", status: "completed", conclusion, created_at: created});
    // a cancelled or skipped run did none of the chores; a failed or timed-out one ran
    assert.deepEqual(readLastRun({total_count: 3, workflow_runs: [run("cancelled", "2026-11-28T17:00:00Z"), run("skipped", "2026-11-28T16:00:00Z"), run("failure", "2026-11-27T17:36:45Z")]}), {at});
    assert.deepEqual(readLastRun({total_count: 2, workflow_runs: [run("timed_out", "2026-11-27T17:36:45Z"), run("success", "2026-11-26T17:00:00Z")]}), {at});
    assert.deepEqual(readLastRun({total_count: 1, workflow_runs: [run("cancelled", "2026-11-28T17:00:00Z")]}), {at: null});
    // a broken workflow file: the schedule fires, but no job starts
    assert.deepEqual(readLastRun({total_count: 2, workflow_runs: [run("startup_failure", "2026-11-28T17:00:00Z"), run("success", "2026-11-27T17:36:45Z")]}), {at});
    assert.deepEqual(readLastRun({total_count: 0, workflow_runs: []}), {at: null});
    assert.equal(readLastRun({total_count: 0, workflow_runs: [run("success", "2026-11-28T17:00:00Z")]}), null);
    assert.equal(readLastRun({total_count: 1, workflow_runs: [{created_at: "2026-11-28T17:00:00Z"}]}), null);
    assert.equal(readLastRun({total_count: 1, workflow_runs: [run("success", "yesterday")]}), null);
    assert.equal(readLastRun({message: "API rate limit exceeded"}), null);
    assert.equal(readLastRun(null), null);
});

test("the alert shows once the last run is more than 36 hours back", () => {
    const href = "https://github.com/o/r/actions/workflows/daily.yml";
    assert.equal(runAlert({at}, href, at + RUN_LATE_HOURS * HOUR), null);
    const late = runAlert({at}, href, at + RUN_LATE_HOURS * HOUR + 1);
    assert.equal(late.title, "The daily chores haven’t run on schedule since Fri Nov 27");
    assert.equal(late.detail, "Check Actions › Daily chores");
    assert.equal(late.href, href);
    assert.equal(late.tone, "red");
    assert.equal(runAlert({at: null}, href, at).title, "The daily chores haven’t run on schedule lately");
    // not read yet, or not readable: nothing
    assert.equal(runAlert(null, href, at), null);
});
