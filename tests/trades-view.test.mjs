import {test} from "node:test";
import assert from "node:assert/strict";
import {controlSelector, deskProposal, listMarkup, phoneProposal, proposalCheck, stepTitle} from "../site/v2/ui/trades-view.js";

const at = (...utc) => Date.UTC(...utc) / 1000;
// Tuesday 13 Oct 2026, 1 p.m. CT
const NOW = at(2026, 9, 13, 18);

const player = (playerId, fullName, salary, years, extra = {}) => ({playerId, fullName, salary, years, capPenalty: 0, status: "ROSTER", nflPosition: "WR", team: "DET", ...extra});

// my team 0001 at $290 and the partner 0002 at $280, both 28 active
function leagueOf({mineCap = 290} = {}) {
    return {
        franchises: new Map([
            ["0001", {franchiseId: "0001", capTotal: mineCap, numPlayers: 28}],
            ["0002", {franchiseId: "0002", capTotal: 280, numPlayers: 28}]
        ]),
        players: new Map([
            ["olave", player("olave", "Chris Olave", 5, 1)],
            ["lamar", player("lamar", "Lamar Jackson", 40, 2, {nflPosition: "QB", team: "BAL"})],
            ["higbee", player("higbee", "Tyler Higbee", 8, 1, {nflPosition: "TE", team: "LAR"})]
        ])
    };
}

// Pat offers Lamar for Olave; I offer Higbee to Pat for nothing
const pendingTrades = {pendingTrade: [
    {trade_id: "11", offeringteam: "0002", offeredto: "0001", will_give_up: "lamar,", will_receive: "olave,", expires: String(NOW + 86400), comments: "fair?", timestamp: "1"},
    {trade_id: "12", offeringteam: "0001", offeredto: "0002", will_give_up: "higbee,", will_receive: "", expires: "", comments: "", timestamp: "2"}
]};

function viewOf({state = {}, league = leagueOf(), proposal = null, closed = false, ...rest} = {}) {
    return {
        state: {
            data: {league, mflNames: new Map(), groups: [], fresh: {pendingTrades}}, games: {teams: new Map(), all: [], deadline: at(2026, 10, 15, 18)},
            failed: false, busy: null, done: "", error: "", note: "", stillOpen: null, answer: {}, comment: {}, failure: {}, asking: null,
            give: new Set(), get: new Set(), step: "give", editing: false, expires: NOW + 7 * 86400, expKey: null, message: "", counter: null, ...state
        },
        franchiseId: "0001", season: 2026, names: new Map([["0001", "Mine"], ["0002", "Pat's Team"]]), proposal, partners: [{id: "0001"}, {id: "0002"}],
        now: NOW, phase: "season", limits: true, closed, wide: true, addHref: "/add", listUrl: "/trades",
        proposeUrl: (partner) => `/trades&FRANCHISE=0001,${partner}`, ...rest
    };
}

const button = (html, act) => html.match(new RegExp(`<button[^>]*data-act="${act}"[^>]*>[^<]*</button>`, "g")) || [];

test("an offer that would put the member over the cap can't be accepted, only rejected or countered", () => {
    // $290 − $5 + $40 = $325
    const html = listMarkup(viewOf());
    assert.match(html, /<strong>Blocked:<\/strong> you’d be at \$325 of \$300, so the trade would be void\./);
    assert.match(button(html, "answer")[0], /data-answer="accept"[^>]*disabled>Accept</);
    assert.doesNotMatch(button(html, "answer")[2], /disabled/);
    assert.match(html, /<p class="fuad-trades-comment">“fair\?”<\/p>/);
    assert.match(html, /<span class="fuad-meta">1 waiting<\/span>/);
    // room under the cap: Accept opens the comment box and its button
    const room = listMarkup(viewOf({league: leagueOf({mineCap: 250}), state: {answer: {11: "accept"}}}));
    assert.doesNotMatch(room, /Blocked:/);
    assert.match(button(room, "send-answer")[0], /data-id="11">Accept trade</);
    assert.match(room, /<textarea id="fuad-reply-11"/);
    // past the deadline no counter
    assert.match(button(listMarkup(viewOf({closed: true})), "answer")[1], /data-answer="counter"[^>]*disabled/);
});

test("the member's own offers: Withdraw asks first, and Withdrawing… while it goes", () => {
    const html = listMarkup(viewOf());
    assert.match(html, /<strong>You give<\/strong> Tyler Higbee<\/span><span><strong>You get<\/strong> nothing/);
    assert.match(button(html, "ask")[0], />Withdraw</);
    const asking = listMarkup(viewOf({state: {asking: "12", busy: "12"}}));
    assert.match(asking, /Withdraw this offer\?/);
    assert.match(button(asking, "withdraw")[0], /disabled>Withdrawing…</);
    assert.match(button(asking, "keep")[0], /disabled>Keep</);
});

test("the teams to propose to, each with cap used, until the deadline closes trades", () => {
    const html = listMarkup(viewOf());
    assert.match(html, /<a class="fuad-trades-partner" href="\/trades&amp;FRANCHISE&#x3D;0001,0002"><span>Pat&#x27;s Team<\/span><span class="fuad-trades-used fuad-muted">\$280 used ›<\/span><\/a>/);
    assert.doesNotMatch(html, /0001,0001/);
    assert.match(html, /Deadline /);
    const closed = listMarkup(viewOf({closed: true}));
    assert.match(closed, /Closed since the deadline, .*Trades reopen after the season\./);
    assert.doesNotMatch(closed, /fuad-trades-partner/);
});

const proposal = {partner: "0002", mine: [{id: "olave"}, {id: "higbee"}], theirs: [{id: "lamar"}], expiry: NOW + 7 * 86400, years: [2026, 2027]};

test("a proposal can be sent once something is ticked, it fits the cap, and its expiry is ahead", () => {
    const send = (html) => button(html, "send")[0];
    assert.match(send(deskProposal(viewOf({proposal}))), /disabled>Propose trade</);
    const fits = viewOf({proposal, state: {give: new Set(["olave"])}});
    assert.match(send(deskProposal(fits)), /data-act="send">Propose trade</);
    assert.match(deskProposal(fits), /give Chris Olave/);
    assert.equal(proposalCheck(fits).blocked, null);
    // Olave for Lamar takes me to $325
    const over = viewOf({proposal, state: {give: new Set(["olave"]), get: new Set(["lamar"])}});
    assert.match(proposalCheck(over).blocked, /\$325 of \$300/);
    assert.match(deskProposal(over), /fuad-trades-bar fuad-trades-bar-blocked/);
    assert.match(send(deskProposal(over)), /disabled/);
    const passed = deskProposal(viewOf({proposal, state: {give: new Set(["olave"]), expires: NOW - 3600}}));
    assert.match(passed, /Pick a later time:<\/strong> this one has passed\./);
    assert.match(send(passed), /disabled/);
    assert.match(send(deskProposal(viewOf({proposal, state: {give: new Set(["olave"]), counter: "11"}}))), />Reject and counter</);
});

test("the phone's proposal goes a step at a time, with Edit on review returning to a step", () => {
    const give = phoneProposal(viewOf({proposal, wide: false}));
    assert.match(give, /Trade with Pat&#x27;s Team · step 1 of 3/);
    assert.match(give, /data-side="give" data-id="olave"/);
    assert.match(button(give, "next")[0], />Next</);
    assert.match(button(phoneProposal(viewOf({proposal, wide: false, state: {step: "get", editing: true}})), "next")[0], />Done</);
    const review = phoneProposal(viewOf({proposal, wide: false, state: {step: "review", give: new Set(["higbee"])}}));
    assert.match(review, /step 3 of 3/);
    assert.deepEqual(button(review, "edit").map((edit) => edit.match(/data-step="(\w+)"/)[1]), ["give", "get"]);
    // a player on the phone opens the popup from his whole line
    assert.match(review, /<button type="button" class="fuad-trades-asset" data-act="player" data-id="higbee">/);
    assert.equal(stepTitle({step: "review", editing: true}), "Edit");
    assert.equal(stepTitle({step: "get"}), "You get");
});

test("a redraw finds the control that had focus by what it does and what it acts on", () => {
    assert.equal(controlSelector({act: "answer", id: "11", answer: "accept"}), '[data-act="answer"][data-id="11"][data-answer="accept"]');
    assert.equal(controlSelector({act: "edit", step: "give"}), '[data-act="edit"][data-step="give"]');
    assert.equal(controlSelector({act: "send"}), '[data-act="send"]');
});
