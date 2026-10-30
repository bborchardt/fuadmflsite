// How Moves' screens tell whether MFL made a move: what it answered, then what it holds, read back
// while an export lags. tools/verify/screens.py check sees each screen's lines for the same cases.

import {test} from "node:test";
import assert from "node:assert/strict";
import {DOMParser} from "linkedom";
import {READ_GAP, READS, Refused, moveOutcome, readBack, refusal, sendMove} from "../site/v2/ui/moves.js";

// a read that answers `answers` in turn (an Error rejects), and the waits between reads
function reads(...answers) {
    const log = {reads: 0, waits: []};
    const read = async () => {
        const answer = answers[Math.min(log.reads, answers.length - 1)];
        log.reads += 1;
        if (answer instanceof Error) {
            throw answer;
        }
        return answer;
    };
    const wait = async (ms) => {
        log.waits.push(ms);
    };
    return {read, wait, log};
}
const has = (id) => (roster) => roster.includes(id);

test("a move MFL shows at once is read once, with no wait", async () => {
    const {read, wait, log} = reads(["higbee"]);
    assert.deepEqual(await readBack(read, has("higbee"), {wait}), ["higbee"]);
    assert.deepEqual(log, {reads: 1, waits: []});
});

test("an export that lags the move is read again, a gap apart, until it shows it", async () => {
    const {read, wait, log} = reads([], ["higbee"]);
    assert.deepEqual(await readBack(read, has("higbee"), {wait}), ["higbee"]);
    assert.deepEqual(log, {reads: 2, waits: [READ_GAP]});
});

test("after every read, what MFL last showed, though it lacks the move", async () => {
    const {read, wait, log} = reads(["lamar"]);
    assert.deepEqual(await readBack(read, has("higbee"), {wait}), ["lamar"]);
    assert.equal(log.reads, READS);
    assert.equal(log.waits.length, READS - 1);
});

test("a read that fails keeps the one before it; none read is null", async () => {
    const failed = new Error("MFL answered HTTP 500");
    assert.deepEqual(await readBack(reads(["lamar"], failed).read, has("higbee"), {wait: reads().wait}), ["lamar"]);
    assert.deepEqual(await readBack(reads(failed, ["higbee"]).read, has("higbee"), {wait: reads().wait}), ["higbee"]);
    assert.equal(await readBack(reads(failed).read, has("higbee"), {wait: reads().wait}), null);
    // MFL's answer leaving the team out, read as null, isn't a roster
    assert.equal(await readBack(reads(null).read, has("higbee"), {wait: reads().wait}), null);
});

test("what MFL holds decides, whatever it answered", (t) => {
    globalThis.DOMParser = DOMParser;
    t.after(() => delete globalThis.DOMParser);
    const ok = {answer: "<div class=\"pagebody\">Done</div>", error: null};
    const failed = {answer: "", error: new Error("MFL answered HTTP 502")};
    const shows = has("higbee");
    // lands; fails but was made
    assert.equal(moveOutcome(ok, ["higbee"], shows), "made");
    assert.equal(moveOutcome(failed, ["higbee"], shows), "made");
    // unread, whether the answer worked or not
    assert.equal(moveOutcome(ok, null, shows), "unread");
    assert.equal(moveOutcome(failed, null, shows), "unread");
    // fails: the error it failed with
    assert.equal(moveOutcome(failed, ["lamar"], shows), failed.error);
    // refuses: MFL's reason from its page, or none
    const refused = moveOutcome({answer: "<div class=\"pagebody\"><span class=\"warning\">Roster moves are locked for this team.</span></div>", error: null}, ["lamar"], shows);
    assert.ok(refused instanceof Refused);
    assert.equal(refused.reason, "Roster moves are locked for this team.");
    assert.equal(moveOutcome(ok, ["lamar"], shows).reason, null);
});

test("MFL's reason is a warning or error on its page, not its projections note", (t) => {
    globalThis.DOMParser = DOMParser;
    t.after(() => delete globalThis.DOMParser);
    assert.equal(refusal("<div class=\"pagebody\"><p class=\"warning\">Use projections from…</p><p class=\"error\">Player is not on your roster</p></div>"), "Player is not on your roster");
    assert.equal(refusal("<div class=\"warning\">Outside the page body</div><div class=\"pagebody\"></div>"), null);
});

test("a move's send keeps MFL's answer, or the error it failed with", async (t) => {
    const answers = [new Response("OK", {status: 200}), new Response("", {status: 500})];
    const sent = [];
    globalThis.fetch = async (url, init) => {
        sent.push({url, init});
        return answers.shift();
    };
    t.after(() => delete globalThis.fetch);
    assert.deepEqual(await sendMove("https://mfl/add_drop", () => ({method: "POST", body: "a=1"})), {answer: "OK", error: null});
    const failed = await sendMove("https://mfl/add_drop", () => ({method: "POST"}));
    assert.equal(failed.answer, "");
    assert.match(failed.error.message, /HTTP 500/);
    assert.deepEqual(sent[0].init, {credentials: "include", method: "POST", body: "a=1"});
});
