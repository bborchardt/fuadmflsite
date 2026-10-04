// Tests for which version a page runs: the header's, a developer preview, or the beta.

import {test} from "node:test";
import assert from "node:assert/strict";
import {betaOffer, decide, previewBase, withParam} from "../site/v1/loader.js";

const PAGES = "https://bborchardt.github.io/fuadmflsite/";
const here = `${PAGES}v1/`;
const offer = (version = "v2", extra = {}) => betaOffer({version, feedback: "https://www44.myfantasyleague.com/2026/options?L=48571&O=28", ...extra}, {versionHere: "v1", teamId: "0001"});
const run = ({query = "", preview = null, beta = null, offered = offer()} = {}) =>
    decide({here, versionHere: "v1", params: new URLSearchParams(query), preview, beta, offer: offered});

test("the header's beta offer: a version other than the header's, for the teams named", () => {
    assert.deepEqual(offer(), {version: "v2", base: `${PAGES}v2/`, feedback: "https://www44.myfantasyleague.com/2026/options?L=48571&O=28"});
    assert.equal(betaOffer(undefined, {versionHere: "v1", teamId: "0001"}), null);
    assert.equal(betaOffer({version: "v1"}, {versionHere: "v1", teamId: "0001"}), null);
    assert.equal(betaOffer({version: "../evil"}, {versionHere: "v1", teamId: "0001"}), null);
    assert.equal(betaOffer("v2", {versionHere: "v1", teamId: "0001"}), null);
    assert.equal(offer("v2", {teams: ["0003"]}), null);
    assert.equal(offer("v2", {teams: ["0003", "0001"]}).version, "v2");
    assert.equal(offer("v2", {teams: [1]}).version, "v2");
    // a visitor who isn't logged in has no team
    assert.equal(betaOffer({version: "v2", teams: ["0001"]}, {versionHere: "v1", teamId: undefined}), null);
    assert.equal(offer("v2", {feedback: "javascript:alert(1)"}).feedback, null);
});

test("members opt in and out of the beta, and stay in while it's offered", () => {
    assert.deepEqual(run(), {preview: null, beta: null, load: null});
    assert.deepEqual(run({query: "fuadBeta=on"}), {preview: null, beta: "v2", load: `${PAGES}v2/`, mode: "beta"});
    assert.deepEqual(run({beta: "v2"}), {preview: null, beta: "v2", load: `${PAGES}v2/`, mode: "beta"});
    assert.deepEqual(run({query: "fuadBeta=off", beta: "v2"}), {preview: null, beta: null, load: null});
    // no beta offered to this viewer: the link does nothing
    assert.deepEqual(run({query: "fuadBeta=on", offered: null}), {preview: null, beta: null, load: null});
});

test("a beta that's over, promoted or replaced is forgotten", () => {
    // the header no longer offers one (ended, or promoted to the header's version)
    assert.deepEqual(run({beta: "v2", offered: null}), {preview: null, beta: null, load: null});
    // a newer beta needs a new opt-in
    assert.deepEqual(run({beta: "v2", offered: offer("v3")}), {preview: null, beta: null, load: null});
});

test("a developer preview wins over the beta, and one of the header's own version is no preview", () => {
    assert.deepEqual(run({query: "fuadPreview=v3", beta: "v2"}), {preview: `${PAGES}v3/`, beta: "v2", load: `${PAGES}v3/`, mode: "preview"});
    assert.deepEqual(run({query: "fuadPreview=off", preview: `${PAGES}v3/`}), {preview: null, beta: null, load: null});
    assert.deepEqual(run({query: "fuadPreview=local"}).load, "http://localhost:8000/v1/");
    // stored before v1 became the header's version
    assert.deepEqual(run({preview: here, offered: null}), {preview: null, beta: null, load: null});
    assert.deepEqual(run({preview: "https://example.com/v2/", offered: null}), {preview: null, beta: null, load: null});
    assert.equal(previewBase("nonsense", "v1"), null);
});

test("links keep the page's own address and query", () => {
    assert.equal(withParam("https://www44.myfantasyleague.com/2026/home/48571?MODULE=MESSAGE3#0", "fuadBeta", "on"),
        "https://www44.myfantasyleague.com/2026/home/48571?MODULE=MESSAGE3&fuadBeta=on#0");
});
