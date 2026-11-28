// The daily job's way of asking MFL: requests spaced and timed, the commissioner's login, the pages
// it reads and the commissioner switch. Takes the version's lib, so imports no lib/.

import {mflHomePage} from "./mfl-form.mjs";
import {networkError} from "./network-error.mjs";

// MFL asks for about a second between requests
const SPACING_MS = 1000;
const TIMEOUT_MS = 30000;
// MFL turns about one in ten of the job's requests for the league's pages and forms away with a
// redirect to its public home page, scattered, whatever the pace; a browser's it answers (docs/mfl.md).
// A page or form is asked again after a wait, as a form posted twice comes to the same (a lineup, a
// recalculation); turned away once more, it fails. An import isn't asked again (`waits` none): one
// posted twice could charge a penalty twice, were the first taken after all.
export const REFUSAL_WAITS_MS = [15000, 15000];
const MAX_REDIRECTS = 5;
const isRedirect = (response) => response.status >= 300 && response.status < 400 && response.headers.has("location");
const turnedAway = (response, url) => isRedirect(response) && new URL(response.headers.get("location"), url).hostname.toLowerCase() === "home.myfantasyleague.com";
// a refused answer's connection back for the next request
const discard = (response) => (response.body ? response.body.cancel().catch(() => {}) : null);
// ask's own errors, told from a failed fetch's by page, mflForm and mflImport
const mflError = (message) => Object.assign(new Error(message), {fromMfl: true});
const commishCookie = (response) => (response.headers.getSetCookie ? response.headers.getSetCookie() : []).map((each) => each.split(";")[0])
    .find((each) => each.startsWith("MFL_IS_COMMISH="));

// `fetchImpl`, `sleep` and `clock` are the global fetch, a timer and Date.now unless a test gives its own
export function mflSession({lib, host, leagueId, userAgent, log, fetchImpl = (url, init) => fetch(url, init),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), clock = () => Date.now(), spacing = SPACING_MS, timeout = TIMEOUT_MS}) {
    const {API_BASE, asArray, exportUrl, fetchExport} = lib.mfl;
    // after login these carry the commissioner's session cookie: never send them anywhere else
    const headers = {"User-Agent": userAgent};
    // what the login's leagues are, once it's known to work
    let leagues = [];
    let commishHeaders = null;
    let nextRequestAt = 0;

    // spaced even when several start at once: MFL throttles bursts with HTTP 429
    async function spaced(url, init) {
        const wait = nextRequestAt - clock();
        nextRequestAt = Math.max(clock(), nextRequestAt) + spacing;
        if (wait > 0) {
            await sleep(wait);
        }
        // a stalled reply mustn't hang the job
        return fetchImpl(url, {...init, signal: AbortSignal.timeout(timeout)});
    }

    // A request to the league's host, spaced: one MFL turns away is waited out and asked again after
    // each of `waits`; another redirect is followed hop by hop, on myfantasyleague.com only and over
    // https, as the session goes with it, or with `follow` false is the answer. An answer `answered`
    // says is the one asked for is never taken for a refusal (the commissioner switch, by its cookie).
    async function ask(url, init = {}, {follow = true, waits = REFUSAL_WAITS_MS, answered = () => false} = {}) {
        let target = url;
        let options = {...init, redirect: "manual"};
        const refused = (response) => !answered(response) && turnedAway(response, target);
        for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
            let response = await spaced(target, options);
            for (const wait of waits) {
                if (!refused(response)) {
                    break;
                }
                await discard(response);
                const {pathname, search} = new URL(target);
                log(`MFL turned ${pathname}${search} away with its home page; asking again in ${wait / 1000} seconds.`);
                await sleep(wait);
                response = await spaced(target, options);
            }
            if (refused(response)) {
                await discard(response);
                throw mflError(`MFL turned it away with its home page${waits.length ? ` ${waits.length + 1} times` : ""}`);
            }
            if (!follow || !isRedirect(response)) {
                return response;
            }
            const next = new URL(response.headers.get("location"), target);
            await discard(response);
            if (!/(^|\.)myfantasyleague\.com$/i.test(next.hostname)) {
                throw mflError(`MFL sent it on to ${next.host}, which isn't MFL's`);
            }
            // MFL's servers all answer https, and the login mustn't go out unencrypted
            next.protocol = "https:";
            // a 303, or a 301 or 302 to a post, is followed as a GET, as browsers do
            if (response.status === 303 || ([301, 302].includes(response.status) && (options.method || "GET") === "POST")) {
                const without = {...options.headers};
                delete without["Content-Type"];
                options = {...options, method: "GET", body: undefined, headers: without};
            }
            target = next.href;
        }
        throw mflError(`MFL redirected it more than ${MAX_REDIRECTS} times`);
    }

    // a page of MFL's (not an export), as the logged-in commissioner
    async function page(path, what, asHeaders = headers) {
        let response;
        try {
            response = await ask(`${host}${path}`, {headers: asHeaders});
        } catch (error) {
            throw new Error(`Couldn't load MFL's ${what}: ${error.fromMfl ? error.message : networkError(error)}`);
        }
        if (!response.ok) {
            throw new Error(`Couldn't load MFL's ${what}: HTTP ${response.status}`);
        }
        const body = await response.text();
        const homePage = mflHomePage(body);
        if (homePage) {
            throw new Error(`Couldn't load MFL's ${what}: ${homePage}`);
        }
        return body;
    }

    // last season too, in case MFL doesn't list a newly renewed league yet
    async function loginWorks(cookie, season) {
        for (const year of [season, season - 1]) {
            try {
                const found = await fetchExport(exportUrl(API_BASE, year, "myleagues", {YEAR: year}), "leagues",
                    {fetchImpl: spaced, init: {headers: {...headers, Cookie: cookie}}});
                if (asArray(found.league).length > 0) {
                    leagues = asArray(found.league);
                    return true;
                }
            } catch (error) {
                // try the next year; a cookie that works nowhere fails below
            }
        }
        return false;
    }

    // MFL_USER_ID is Base64 and MFL's docs say it may need +, / and = escaped, so both forms are tried.
    // Resolves to what went wrong, or null; never throws, as snapshots only need public data.
    async function login(season, username, password) {
        if (!username || !password) {
            log("No MFL login configured; reading public league data only.");
            return null;
        }
        let response, body;
        try {
            response = await spaced(`${API_BASE}/${season}/login`, {
                method: "POST",
                headers: {...headers, "Content-Type": "application/x-www-form-urlencoded"},
                body: new URLSearchParams({USERNAME: username, PASSWORD: password, XML: "1"})
            });
            body = await response.text();
        } catch (error) {
            return `MFL login failed: ${networkError(error)}`;
        }
        const error = (/<error>([^<]*)<\/error>/.exec(body) || [])[1];
        const value = (/<status\b[^>]*\bMFL_USER_ID="([^"]*)"/.exec(body) || [])[1];
        if (error || !response.ok || !value) {
            return `MFL login failed: ${error || `HTTP ${response.status}, no MFL_USER_ID in the response`}`;
        }
        for (const candidate of [value, encodeURIComponent(value)]) {
            if (await loginWorks(`MFL_USER_ID=${candidate}`, season)) {
                headers.Cookie = `MFL_USER_ID=${candidate}`;
                log("Logged in to MFL as commissioner.");
                return null;
            }
        }
        return "MFL login succeeded but MFL didn't accept the session cookie";
    }

    // MFL serves the commissioner's own forms (a past week's lineup, Recalculate Standings) once the
    // login has become the commissioner, which sets a cookie of its own
    async function asCommissioner(season) {
        if (commishHeaders) {
            return commishHeaders;
        }
        let response;
        try {
            response = await ask(`${host}/${season}/logout?L=${leagueId}&BECOME=0000`, {headers}, {follow: false, answered: (answer) => Boolean(commishCookie(answer))});
        } catch (error) {
            throw new Error(`MFL didn't make the login the commissioner: ${error.message}`);
        }
        const cookie = commishCookie(response);
        await discard(response);
        if (!cookie) {
            throw new Error(`MFL didn't make the login the commissioner (HTTP ${response.status}, no MFL_IS_COMMISH cookie)`);
        }
        commishHeaders = {...headers, Cookie: `${headers.Cookie}; ${cookie}`};
        return commishHeaders;
    }

    // a dry run can name any league; the session is only for one the login is in
    const isThisLeague = (entry) => entry.league_id === leagueId || (/\/home\/(\d+)/.exec(entry.url || "") || [])[1] === leagueId;
    // the login's entry for the league (its franchise_id), or undefined when it isn't in it
    const leagueEntry = () => leagues.find(isThisLeague);

    return {headers, fetch: spaced, ask, page, login, asCommissioner, leagueEntry};
}
