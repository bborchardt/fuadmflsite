import {test} from "node:test";
import assert from "node:assert/strict";
import {mflImport} from "../jobs/mfl-import.mjs";

const answering = (body, status = 200) => {
    const sent = [];
    const fetchImpl = async (url, init) => {
        sent.push({url, init});
        if (body instanceof Error) {
            throw body;
        }
        return new Response(body, {status});
    };
    return {sent, options: {dryRun: false, url: "https://www44.myfantasyleague.com/2026/import", leagueId: "48571", headers: {"User-Agent": "test"}, fetchImpl}};
};

test("a dry run is refused before anything is sent", async () => {
    const {sent, options} = answering("<status>OK</status>");
    await assert.rejects(mflImport({type: "salaries", data: "<salaries/>"}, {...options, dryRun: true}), /A dry run reached MFL's salaries import/);
    assert.equal(sent.length, 0);
});

test("only <status>OK</status> passes: an error, a page served with 200, a refusal or the network fails it", async () => {
    const ok = answering("<status>OK</status>");
    await mflImport({type: "accounting", data: null, params: {AMOUNT: "7.5"}}, ok.options);
    const body = Object.fromEntries(new URLSearchParams(String(ok.sent[0].init.body)));
    assert.deepEqual(body, {TYPE: "accounting", L: "48571", AMOUNT: "7.5"});
    const cases = [
        [answering("<error>Invalid data</error>"), /import failed: Invalid data/],
        [answering("<html><body>Please log in</body></html>"), /import failed: HTTP 200, "<html><body>Please log in/],
        [answering("Too many requests", 429), /import failed: HTTP 429/],
        [answering(new Error("socket hang up")), /import failed: network error \(socket hang up\)/]
    ];
    for (const [{options}, message] of cases) {
        await assert.rejects(mflImport({type: "salaries", data: "<salaries/>"}, options), message);
    }
});
