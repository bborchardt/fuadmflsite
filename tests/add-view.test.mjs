import {test} from "node:test";
import assert from "node:assert/strict";
import {groupViews, firstLast} from "../site/v2/ui/add-model.js";
import {controlSelector, deskHome, dropList, phoneHome, phonePlayers, reviewForm, statusMarkup} from "../site/v2/ui/add-view.js";

// a team at $293 used, as Add's checks read it
function teamOf(groups, numPlayers) {
    const franchise = {franchiseId: "0001", capTotal: 293, numPlayers};
    const rostered = (playerId, fullName, salary, years, capPenalty, extra = {}) => [playerId, {playerId, fullName, salary, years, capPenalty, franchise,
        status: "ROSTER", nflPosition: "WR", transactions: [], ...extra}];
    const players = new Map([rostered("lamar", "Lamar Jackson", 68, 1, 28, {nflPosition: "QB"}), rostered("olave", "Chris Olave", 1, 1, 1)]);
    return {franchise, groups, players};
}
const freeAgent = (id, mflName, extra = {}) => ({id, mflName, name: firstLast(mflName), nfl: "LAR", pos: "TE", opp: "@SF", bye: 8, salary: 1,
    mark: null, inj: "", proj: 6.25, pts: 40, ...extra});
const lists = {
    add: [freeAgent("higbee", "Higbee, Tyler"), freeAgent("fehoko", "Fehoko, Simi", {mark: "#", pos: "WR", proj: 2})],
    drop: [{id: "olave", opp: "@NO", proj: 9}, {id: "lamar", opp: "Bye", proj: null}]
};
const names = (id) => {
    const mflName = {higbee: "Higbee, Tyler", fehoko: "Fehoko, Simi", lamar: "Jackson, Lamar", olave: "Olave, Chris"}[id];
    return {mflName, name: firstLast(mflName)};
};

// add-view's `v`, with `groups` as MFL's pending groups: [{round, claims: [{add, bid, drop}], comment}]
function viewOf({groups = [], state = {}, banner = {kind: "bids", text: "Blind bids only until Wednesday 11 p.m. CT"}, numPlayers = 29, ...rest} = {}) {
    const team = teamOf(groups, numPlayers);
    const rounds = groups.map((group) => group.round);
    return {
        state: {data: {groups}, compose: null, q: "", pos: "ALL", watching: false, sort: "proj", open: null, flash: null, done: null, error: "", busy: false, ...state},
        team, phase: "season", banner, groups: groupViews(team, groups.map((group) => ({comment: "", ...group})), names), rounds,
        nextRound: Math.max(0, ...rounds) + 1, lists, names, wide: false, watched: null, runsLeft: true, now: 0, franchiseId: "0001",
        canMove: () => true, ...rest
    };
}

const bid = (extra = {}) => ({add: "higbee", drop: undefined, round: 1, bid: "1", years: 1, editing: null, kind: "bid", ...extra});
const submitButton = (html) => html.match(/<button[^>]*data-act="submit"[^>]*>[^<]*<\/button>/)[0];

test("the review's button says what it'll do, and waits for a drop and for a move in flight", () => {
    assert.match(submitButton(reviewForm(viewOf({state: {compose: bid()}}), {withPicks: true})), /disabled>Pick a drop</);
    assert.match(submitButton(reviewForm(viewOf({state: {compose: bid({drop: null, bid: "3"})}}), {withPicks: true})), /data-act="submit">Submit \$3 bid to group 1</);
    assert.match(submitButton(reviewForm(viewOf({state: {compose: bid({drop: null}), busy: true}}), {withPicks: true})), /disabled>Sending…</);
    const add = reviewForm(viewOf({banner: {kind: "window", text: ""}, state: {compose: bid({drop: "lamar", kind: "add", round: null, years: 2})}}), {withPicks: true});
    assert.match(submitButton(add), /Add Higbee now · posts “Higbee: 2 years”/);
    assert.match(add, /posted as “Higbee: 2 years” once the add goes through/);
    // no bid field for an add, and the drop's change to cap used on the phone's row
    assert.doesNotMatch(add, /data-act="bid-plus"/);
    assert.match(add, /Lamar Jackson · −\$40/);
});

test("the review blocks a bid past the cap, naming the limit", () => {
    // $300 − $293 leaves $7
    const html = reviewForm(viewOf({state: {compose: bid({drop: null, bid: "8"})}}), {withPicks: false});
    assert.match(html, /max \$7/);
    assert.match(html, /Over the max: with your other groups’ max bids, \$8 would exceed the cap\./);
    assert.match(html, /fuad-add-amount fuad-add-amount-bad/);
    assert.match(submitButton(html), /disabled/);
    // a limit other than the bid's own max is a Blocked line
    const full = reviewForm(viewOf({numPlayers: 30, state: {compose: bid({drop: null})}}), {withPicks: false});
    assert.match(full, /role="alert">Blocked: with your other groups, this bid could make more than 30 active players\. Pick a drop\.</);
});

test("an edit keeps the group's line for the claim until a length is picked", () => {
    const groups = [{round: 2, claims: [{add: "higbee", bid: 4, drop: null}], comment: "Higbee: 3 years"}];
    const html = reviewForm(viewOf({groups, state: {compose: bid({round: 2, drop: null, bid: "4", years: null, editing: "2_higbee_4_0000"})}}), {withPicks: true});
    assert.match(html, /keeps “Higbee: 3 years”/);
    assert.match(submitButton(html), />Save \$4 bid</);
    // the player to add can't change in an edit
    assert.doesNotMatch(html, /data-act="change-add"/);
});

test("the drop list: No drop, each player's cost, and the ones the move can't take", () => {
    const groups = [{round: 2, claims: [{add: "fehoko", bid: 1, drop: "lamar"}]}];
    const html = dropList(viewOf({groups, numPlayers: 30, state: {compose: bid({drop: "olave"})}}));
    // at 30 active a bid needs a drop
    assert.match(html, /data-act="pick-drop" data-id="" disabled aria-pressed="false">\s*<span>No drop<\/span><span class="fuad-meta">over roster limit</);
    assert.match(html, /data-id="olave" aria-pressed="true">/);
    // Lamar: $28 penalty for $68 off, his week's bye, and already dropped in group 2
    assert.match(html, /<span>\$28<\/span><span class="fuad-faint"> · <\/span><span class="fuad-add-change fuad-good">−\$40<\/span>/);
    assert.match(html, /\$68 · 1 yr · bye · also dropped in group 2/);
});

test("the phone's Add: Start group for bids, and nothing to start over the roster limit", () => {
    const groups = [{round: 1, claims: [{add: "fehoko", bid: 2, drop: null}, {add: "higbee", bid: 1, drop: "olave"}]}];
    const html = phoneHome(viewOf({groups, state: {flash: "1_higbee_1_olave"}, canMove: (action, key) => !(action === "MOVE_UP" && key === "1_higbee_1_olave")}));
    assert.match(html, /data-act="start" data-round="2">\+ Start group 2</);
    assert.match(html, /data-act="start" data-round="1">\+ Add a claim to group 1</);
    assert.match(html, /<div class="fuad-add-claim fuad-add-flash">\s*<span class="fuad-add-rank">#2/);
    // the first claim can't move up; the second has no link from MFL to
    assert.equal((html.match(/data-act="up"[^>]*disabled/g) || []).length, 2);
    assert.equal((html.match(/data-act="down"[^>]*disabled/g) || []).length, 1);
    const over = phoneHome(viewOf({groups, numPlayers: 31}));
    assert.match(over, /Over the roster limit: 31 active of 30\./);
    assert.doesNotMatch(over, /data-act="start"/);
    const window_ = phoneHome(viewOf({numPlayers: 31, banner: {kind: "window", text: ""}}));
    assert.match(window_, /class="fuad-add-start" data-act="start" disabled>/);
});

test("the free agents: bid only in the window, and no Add while the team is over the limit", () => {
    const window_ = {kind: "window", text: "Free agent window open until Sunday noon CT"};
    const phone = phonePlayers(viewOf({banner: window_}));
    assert.ok(phone.indexOf("Tyler Higbee") < phone.indexOf("Simi Fehoko"), "by projection");
    assert.match(phone, /WR · @SF · bye 8 · <span class="fuad-bid-only">bid only<\/span>/);
    assert.match(phonePlayers(viewOf({state: {q: "zz"}})), /No free agents match\./);
    const desk = deskHome(viewOf({banner: window_, numPlayers: 31, wide: true, state: {sort: "name"}}));
    assert.match(desk, /aria-label="Bid Simi Fehoko" disabled>Bid</);
    assert.match(desk, /aria-label="Add Tyler Higbee" disabled>Add</);
    assert.match(desk, /data-sort="name" aria-pressed="true">Player ↑</);
    // no bids pending and no bid period: no bids table
    assert.doesNotMatch(desk, /Pending bids/);
});

test("the line a move leaves, with Post it now when the length didn't post", () => {
    const failed = statusMarkup({done: {text: "Higbee added. Couldn’t post the length", failed: true, line: "Higbee: 1 year"}, busy: false});
    assert.match(failed, /fuad-add-status fuad-add-status-warn/);
    assert.match(failed, /data-act="post-now">Post it now</);
    assert.doesNotMatch(statusMarkup({done: {text: "Posted."}}), /post-now/);
    // a failure beside a move being composed isn't repeated above it
    assert.equal(statusMarkup({error: "Couldn’t add Higbee.", compose: bid()}), "");
    assert.match(statusMarkup({error: "Couldn’t add Higbee."}), /role="alert">Couldn’t add Higbee\.</);
});

test("a redraw finds the control that had focus by what it does and what it acts on", () => {
    assert.equal(controlSelector({act: "pick-drop", id: ""}), '[data-act="pick-drop"][data-id=""]');
    assert.equal(controlSelector({act: "copy", key: "1_x_2_0000", round: "3"}), '[data-act="copy"][data-key="1_x_2_0000"][data-round="3"]');
    assert.equal(controlSelector({act: "submit"}), '[data-act="submit"]');
});
