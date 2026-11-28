// jobs/mfl-session.mjs: requests spaced, MFL's refusals waited out, redirects followed only on MFL's
// own hosts, the login's cookie and the commissioner switch. Every answer is given here; nothing
// leaves the machine.

import {test} from "node:test";
import assert from "node:assert/strict";
import * as mfl from "../site/v2/lib/mfl.js";
import {REFUSAL_WAITS_MS, mflSession} from "../jobs/mfl-session.mjs";

const HOST = "https://www44.myfantasyleague.com";
const HOME = "https://home.myfantasyleague.com/";
const redirect = (location, status = 302, headers = {}) => new Response(null, {status, headers: {location, ...headers}});
const page = (html, status = 200) => new Response(html, {status});

// a session whose requests are answered in turn by `answers` (a Response, or a function of the
// request), recording each request and each wait
function session(answers, options = {}) {
    const requests = [];
    const waits = [];
    const logged = [];
    const queue = [...answers];
    const fetchImpl = async (url, init = {}) => {
        requests.push({url: String(url), method: init.method || "GET", headers: init.headers || {}, body: init.body ? String(init.body) : null, signal: init.signal});
        const next = queue.shift();
        if (!next) {
            throw new Error(`no answer left for ${url}`);
        }
        return typeof next === "function" ? next(url, init) : next;
    };
    const made = mflSession({lib: {mfl}, host: HOST, leagueId: "48571", userAgent: "test-agent", log: (message) => logged.push(message),
        fetchImpl, sleep: async (ms) => waits.push(ms), spacing: 0, ...options});
    return {session: made, requests, waits, logged};
}

test("requests asked at once go out a spacing apart, each with a timeout", async () => {
    const {session: mflSessionMade, requests, waits} = session([page("a"), page("b"), page("c")], {spacing: 1000});
    await Promise.all(["/a", "/b", "/c"].map((path) => mflSessionMade.fetch(`${HOST}${path}`, {})));
    assert.equal(requests.length, 3);
    assert.equal(waits.length, 2);
    // the second waits about a spacing, the third about two
    assert.ok(waits[0] > 900 && waits[0] <= 1000 && waits[1] > 1900 && waits[1] <= 2000, String(waits));
    assert.ok(requests.every((request) => request.signal instanceof AbortSignal));
});

test("a page MFL turns away is waited out and asked again, and fails once turned away every time", async () => {
    const asked = session([redirect(HOME), page("<title>Lineup</title>")]);
    assert.equal(await asked.session.page("/2026/lineup?L=48571", "Submit Lineup"), "<title>Lineup</title>");
    assert.deepEqual(asked.waits, [REFUSAL_WAITS_MS[0]]);
    assert.deepEqual(asked.logged, [`MFL turned /2026/lineup?L=48571 away with its home page; asking again in ${REFUSAL_WAITS_MS[0] / 1000} seconds.`]);

    const refused = session([redirect(HOME), redirect(HOME), redirect(HOME)]);
    await assert.rejects(refused.session.page("/2026/lineup?L=48571", "Submit Lineup"),
        {message: `Couldn't load MFL's Submit Lineup: MFL turned it away with its home page ${REFUSAL_WAITS_MS.length + 1} times`});
    assert.equal(refused.requests.length, REFUSAL_WAITS_MS.length + 1);
});

test("an import isn't asked again: with no waits, the first refusal fails, marked as MFL's", async () => {
    const {session: made, requests} = session([redirect(HOME)]);
    await assert.rejects(made.ask(`${HOST}/2026/import`, {method: "POST"}, {waits: []}),
        (error) => error.fromMfl === true && error.message === "MFL turned it away with its home page");
    assert.equal(requests.length, 1);
});

test("MFL's own home page served in place of a page is an error, as what it's read for isn't there", async () => {
    const {session: made} = session([page("<html><title>MyFantasyLeague Home Page</title></html>")]);
    await assert.rejects(made.page("/2026/options?L=48571&O=210", "Lineup Details"), {message: "Couldn't load MFL's Lineup Details: MFL sent its own home page instead"});
});

test("a redirect is followed on MFL's hosts over https, a post becoming a get, and refused anywhere else", async () => {
    const followed = session([redirect("http://www45.myfantasyleague.com/2026/lineup", 302), page("moved")]);
    const response = await followed.session.ask(`${HOST}/2026/lineup`, {method: "POST", body: "x=1", headers: {"Content-Type": "application/x-www-form-urlencoded", Cookie: "c"}});
    assert.equal(await response.text(), "moved");
    assert.equal(followed.requests[1].url, "https://www45.myfantasyleague.com/2026/lineup");
    assert.equal(followed.requests[1].method, "GET");
    assert.equal(followed.requests[1].body, null);
    assert.deepEqual(followed.requests[1].headers, {Cookie: "c"});

    const elsewhere = session([redirect("https://example.com/steal")]);
    await assert.rejects(elsewhere.session.ask(`${HOST}/2026/lineup`), (error) => error.fromMfl && /example\.com, which isn't MFL's/.test(error.message));

    const loop = session(Array.from({length: 6}, () => redirect(`${HOST}/again`)));
    await assert.rejects(loop.session.ask(`${HOST}/2026/lineup`), {message: "MFL redirected it more than 5 times"});
});

test("the login's cookie is tried as MFL gave it, then escaped, and only one MFL takes is kept", async () => {
    const leagues = (list) => page(JSON.stringify({leagues: {league: list}}));
    const {session: made, requests, logged} = session([
        page('<status MFL_USER_ID="ab+c/=">OK</status>'),
        // as given: no leagues this season or last
        leagues([]), leagues([]),
        leagues([{league_id: "48571", franchise_id: "0003"}])
    ]);
    assert.equal(await made.login(2026, "commish", "secret"), null);
    assert.equal(made.headers.Cookie, `MFL_USER_ID=${encodeURIComponent("ab+c/=")}`);
    assert.deepEqual(made.leagueEntry(), {league_id: "48571", franchise_id: "0003"});
    assert.match(requests[0].body, /USERNAME=commish&PASSWORD=secret/);
    assert.equal(requests[0].headers["User-Agent"], "test-agent");
    assert.deepEqual(logged, ["Logged in to MFL as commissioner."]);
});

test("a login MFL refuses, or none configured, is said, and the session stays logged out", async () => {
    const refused = session([page("<error>Invalid password</error>")]);
    assert.equal(await refused.session.login(2026, "commish", "wrong"), "MFL login failed: Invalid password");
    assert.equal(refused.session.headers.Cookie, undefined);
    const none = session([]);
    assert.equal(await none.session.login(2026, "", ""), null);
    assert.deepEqual(none.logged, ["No MFL login configured; reading public league data only."]);
    assert.equal(none.requests.length, 0);
});

test("the commissioner switch's cookie is added once, even when MFL's answer is a redirect to its home page", async () => {
    const switched = redirect(HOME, 302, {"set-cookie": "MFL_IS_COMMISH=1; path=/"});
    const {session: made, requests} = session([switched]);
    made.headers.Cookie = "MFL_USER_ID=abc";
    const headers = await made.asCommissioner(2026);
    assert.equal(headers.Cookie, "MFL_USER_ID=abc; MFL_IS_COMMISH=1");
    assert.equal(await made.asCommissioner(2026), headers);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, `${HOST}/2026/logout?L=48571&BECOME=0000`);
    // the login's own headers don't carry it
    assert.equal(made.headers.Cookie, "MFL_USER_ID=abc");

    const without = session([page("no cookie")]);
    without.session.headers.Cookie = "MFL_USER_ID=abc";
    await assert.rejects(without.session.asCommissioner(2026), {message: "MFL didn't make the login the commissioner (HTTP 200, no MFL_IS_COMMISH cookie)"});
});
