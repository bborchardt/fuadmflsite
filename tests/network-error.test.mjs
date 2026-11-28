// What a request that fails outright says: the message, and the code Node gives under it, which
// "fetch failed" alone doesn't say (a connect timeout, a reset, a DNS failure).

import {test} from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:net";
import {fetchExport, networkError as libNetworkError} from "../site/v2/lib/mfl.js";
import {networkError, withCause} from "../jobs/network-error.mjs";

const withCode = (code, message = code) => new TypeError("fetch failed", {cause: Object.assign(new Error(message), {code})});

test("Node's code under a failed fetch is said, in the lib's and the job's alike", () => {
    for (const read of [libNetworkError, networkError]) {
        assert.equal(read(withCode("UND_ERR_CONNECT_TIMEOUT")), "network error (fetch failed: UND_ERR_CONNECT_TIMEOUT)");
        // both addresses of a host refused: the code is on each of them
        const both = new TypeError("fetch failed", {cause: Object.assign(new AggregateError([Object.assign(new Error("a"), {code: "ECONNREFUSED"})]), {})});
        assert.equal(read(both), "network error (fetch failed: ECONNREFUSED)");
        // a browser's has no cause, and the job's own timeout says so itself
        assert.equal(read(new TypeError("Load failed")), "network error (Load failed)");
        assert.equal(read(new DOMException("The operation was aborted due to timeout", "TimeoutError")), "network error (The operation was aborted due to timeout)");
        // a reason with no code says its message; what isn't an Error says itself
        assert.equal(read(new TypeError("fetch failed", {cause: new Error("invalid onError method")})), "network error (fetch failed: invalid onError method)");
        assert.equal(read("offline"), "network error (offline)");
    }
    assert.equal(withCause(withCode("ENOTFOUND")), "fetch failed: ENOTFOUND");
});

test("an export read that fails outright says the code, and is still a cut-off", async () => {
    const fetchImpl = async () => {
        throw withCode("ECONNRESET");
    };
    await assert.rejects(fetchExport("https://api.myfantasyleague.com/2026/export?TYPE=players&JSON=1", "players", {fetchImpl}),
        (error) => error.cutOff === true && error.message === "Couldn't load players: network error (fetch failed: ECONNRESET)");
});

test("a connection a real server drops says Node's code for it", async (t) => {
    // a server on this machine that closes every connection before answering
    const server = createServer((socket) => socket.destroy());
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(() => server.close());
    const error = await fetch(`http://127.0.0.1:${server.address().port}/`, {signal: AbortSignal.timeout(5000)}).catch((each) => each);
    // reset, or "other side closed" as the system tells it
    assert.match(networkError(error), /^network error \(fetch failed: (ECONNRESET|UND_ERR_SOCKET)\)$/);
});
