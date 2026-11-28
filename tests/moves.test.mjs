// How Moves' screens tell whether MFL made a move: what it answered, then what it holds, read back
// while an export lags. tools/verify/screens.py check sees each screen's lines for the same cases.

import {test} from "node:test";
import assert from "node:assert/strict";
import {DOMParser} from "linkedom";
import {FALLBACK_TEXT, READ_GAP, READS, Refused, failedLine, limitsApply, loadFailed, moveOutcome, movesPhase, readBack, refusal, sendMove, sent, withoutOwners} from "../site/v2/ui/moves.js";

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

test("a move sent gives MFL's answer unread, so a failure reading it isn't taken for one sending it", async (t) => {
    const fetch = globalThis.fetch;
    let read = false;
    globalThis.fetch = async () => ({ok: true, status: 200, text: async () => {
        read = true;
        throw new TypeError("Load failed");
    }});
    t.after(() => {
        globalThis.fetch = fetch;
    });
    const response = await sent("https://mfl/lineup", {method: "POST"});
    assert.equal(read, false);
    await assert.rejects(response.text(), /Load failed/);
    globalThis.fetch = async () => new Response("", {status: 500});
    await assert.rejects(sent("https://mfl/lineup", {method: "POST"}), /MFL answered HTTP 500/);
});

test("a move's send keeps MFL's answer, or the error it failed with", async (t) => {
    const answers = [new Response("OK", {status: 200}), new Response("", {status: 500})];
    const sent = [];
    const fetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
        sent.push({url, init});
        return answers.shift();
    };
    t.after(() => {
        globalThis.fetch = fetch;
    });
    assert.deepEqual(await sendMove("https://mfl/add_drop", () => ({method: "POST", body: "a=1"})), {answer: "OK", error: null});
    const failed = await sendMove("https://mfl/add_drop", () => ({method: "POST"}));
    assert.equal(failed.answer, "");
    assert.match(failed.error.message, /HTTP 500/);
    assert.deepEqual(sent[0].init, {credentials: "include", method: "POST", body: "a=1"});
});

test("Moves keeps the league export without its owners' names and emails", () => {
    const league = {maxWaiverRounds: "3", franchises: {franchise: [
        {id: "0001", name: "Alpha", owner_name: "Owner 0001", email: "owner@example.com", lastVisit: "1", icon: "x"},
        {id: "0002", name: "Beta"}
    ]}};
    assert.deepEqual(withoutOwners(league), {maxWaiverRounds: "3", franchises: {franchise: [{id: "0001", name: "Alpha", icon: "x"}, {id: "0002", name: "Beta"}]}});
    // MFL gives a one-team league its team bare
    assert.deepEqual(withoutOwners({franchises: {franchise: {id: "0001", owner_name: "Owner 0001"}}}), {franchises: {franchise: {id: "0001"}}});
    assert.equal(league.franchises.franchise[0].owner_name, "Owner 0001");
    assert.deepEqual(withoutOwners({}), {});
});

// MFL's page with v2's screen on it, as `document`, while `run` runs; what console.error was given
async function onPage(run) {
    const doc = new DOMParser().parseFromString('<html><body><div class="pagebody"><div id="fuad-drop"></div><form id="mfl"></form></div></body></html>', "text/html");
    const logged = {error: []};
    const saved = {document: globalThis.document, error: console.error};
    globalThis.document = doc;
    console.error = (first) => logged.error.push(first);
    try {
        await run(doc);
    } finally {
        Object.assign(globalThis, {document: saved.document});
        console.error = saved.error;
    }
    return logged;
}

test("a screen that can't load gives MFL's own page, says its rules aren't checked, and logs it", async () => {
    for (const error of [new Error("HTTP 500"), Object.assign(new Error("HTTP 429"), {status: 429})]) {
        let doc;
        const logged = await onPage(async (page) => {
            doc = page;
            const body = page.querySelector(".pagebody");
            const mount = page.getElementById("fuad-drop");
            const standAside = () => mount.remove();
            loadFailed("Drop", error, body, standAside);
            // a second failure, as a Retry would: still one line
            loadFailed("Drop", error, body, standAside);
        });
        assert.equal(doc.getElementById("fuad-drop"), null, error.message);
        assert.ok(doc.getElementById("mfl"));
        const lines = doc.querySelectorAll("#fuad-fallback");
        assert.equal(lines.length, 1);
        assert.equal(doc.querySelector(".pagebody").firstElementChild.id, "fuad-fallback");
        assert.equal(lines[0].getAttribute("role"), "alert");
        assert.equal(lines[0].querySelector("span").textContent, FALLBACK_TEXT);
        assert.equal(FALLBACK_TEXT, "Error loading cap and roster data. Rule checks are disabled; please ensure this transaction follows league rules.");
        assert.equal(lines[0].querySelector("button").textContent, "Reload Page");
        assert.deepEqual(logged.error, Array(2).fill("[fuad] Drop couldn't load, so MFL's page was shown:"), error.message);
    }
});

// Add's page as MFL lays it out: the list beside the players chosen, a row of filters under the list
const ADD_PAGE = `<html><body><div class="pagebody"><div id="fuad-add"></div><div id="withmenus"><table id="layout"><tbody><tr>
    <td><table id="list"><tbody><tr><th>Name</th><th>Team</th></tr><tr><td colspan="2"><div><table class="pickerbox"><tbody><tr><td>Abdullah</td></tr></tbody></table></div></td></tr>
        <tr><td colspan="2">Filter by: <select id="add_filt_pos"></select><input id="add_filt_name"></td></tr></tbody></table></td>
    <td><table id="chosen"><tbody><tr><td>To Add:</td><td><input type="submit" id="add_drop_submit"></td></tr></tbody></table></td>
</tr></tbody></table></div></div></body></html>`;

test("a fallen-back Add has its layout marked to stack, and its filters moved out from under the list", async () => {
    const doc = new DOMParser().parseFromString(ADD_PAGE, "text/html");
    const saved = {document: globalThis.document, error: console.error};
    Object.assign(globalThis, {document: doc});
    console.error = () => {};
    try {
        loadFailed("Add", new Error("HTTP 429"), doc.querySelector(".pagebody"), () => doc.getElementById("fuad-add").remove());
    } finally {
        Object.assign(globalThis, {document: saved.document});
        console.error = saved.error;
    }
    assert.ok(doc.documentElement.classList.contains("fuad-fallback-on"));
    assert.ok(doc.getElementById("layout").classList.contains("fuad-fallback-stack"));
    // the table without a list stacks; the list's own table scrolls instead
    assert.ok(doc.getElementById("chosen").classList.contains("fuad-fallback-stack"));
    assert.ok(!doc.getElementById("list").classList.contains("fuad-fallback-stack"));
    const controls = doc.getElementById("list").nextElementSibling;
    assert.equal(controls.className, "fuad-fallback-controls");
    assert.ok(controls.querySelector("#add_filt_pos") && controls.querySelector("#add_filt_name"));
    assert.equal(doc.getElementById("list").querySelectorAll("select, input").length, 0);
});

test("a move that didn't happen says why if MFL said, else to try again, and asks for a review when something changed anyway", () => {
    assert.equal(failedLine("drop Jackson", new Refused("Roster moves are locked for this team.")), "Couldn’t drop Jackson: Roster moves are locked for this team.");
    assert.equal(failedLine("drop Jackson", new Error("HTTP 500")), "Couldn’t drop Jackson. Reload the page and try again.");
    assert.equal(failedLine("save your IR moves", new Refused("Invalid roster"), {changed: true}),
        "Couldn’t save your IR moves: Invalid roster. Some changes may have gone through; review below.");
});

// MFL's page as `page` ({liveScoringWeek, completedWeek}) for the length of `run`
function withMflWeek(page, run) {
    globalThis.window = {...page};
    try {
        return run();
    } finally {
        delete globalThis.window;
    }
}

test("Moves' phase goes by week 1's kickoff, as the line does; without it by MFL's page, unless the schedule isn't out", () => {
    const week1 = Date.parse("2026-09-11T00:20:00Z");
    const drafted = {draftKnown: true, drafted: true};
    withMflWeek({liveScoringWeek: "1", completedWeek: "0"}, () => {
        assert.equal(movesPhase({...drafted, week1, week1Known: true}, week1 - 1), "preseason");
        assert.equal(movesPhase({...drafted, week1, week1Known: true}, week1), "season");
    });
    // the schedule isn't out, though MFL's page still shows last season's week: no roster limits yet
    withMflWeek({liveScoringWeek: "17", completedWeek: "17"}, () => {
        const facts = {...drafted, week1: null, week1Known: true};
        assert.equal(movesPhase(facts, week1), "preseason");
        assert.equal(limitsApply({facts, calendar: null, season: 2027}, week1), false);
    });
    // no facts could be read: a completed week says the season has begun
    withMflWeek({liveScoringWeek: "4", completedWeek: "3"}, () => {
        assert.equal(movesPhase({}, week1), "season");
        assert.equal(limitsApply({facts: {}, calendar: null, season: 2026}, week1), true);
    });
});
