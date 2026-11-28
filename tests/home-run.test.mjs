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
    assert.equal(runsUrl(repo), "https://api.github.com/repos/bborchardt/fuadmflsite/actions/workflows/daily.yml/runs?event=schedule&status=completed&per_page=1");
    assert.equal(runsPage(repo), "https://github.com/bborchardt/fuadmflsite/actions/workflows/daily.yml");
    assert.equal(repoOf("http://localhost:8000/data/"), null);
    assert.equal(repoOf("https://bborchardt.github.io/"), null);
});

test("GitHub's list gives the last run's start; an empty list is none, anything else not recognised", () => {
    assert.deepEqual(readLastRun(runs), {at});
    assert.deepEqual(readLastRun({total_count: 0, workflow_runs: []}), {at: null});
    assert.equal(readLastRun({total_count: 3, workflow_runs: []}), null);
    assert.equal(readLastRun({total_count: 1, workflow_runs: [{created_at: "yesterday"}]}), null);
    assert.equal(readLastRun({message: "API rate limit exceeded"}), null);
    assert.equal(readLastRun(null), null);
});

test("the alert shows once the last run is more than 36 hours back", () => {
    const href = "https://github.com/o/r/actions/workflows/daily.yml";
    assert.equal(runAlert({at}, href, at + RUN_LATE_HOURS * HOUR), null);
    const late = runAlert({at}, href, at + RUN_LATE_HOURS * HOUR + 1);
    assert.equal(late.title, "The daily chores haven’t run since Fri Nov 27");
    assert.equal(late.detail, "Check Actions › Daily chores");
    assert.equal(late.href, href);
    assert.equal(late.tone, "red");
    assert.equal(runAlert({at: null}, href, at).title, "The daily chores haven’t run on schedule");
    // not read yet, or not readable: nothing
    assert.equal(runAlert(null, href, at), null);
});
