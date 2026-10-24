import {test} from "node:test";
import assert from "node:assert/strict";
import {checkIR, irGroups} from "../site/v2/ui/ir-model.js";
import {controlSelector, irMarkup, loadingMarkup, moveCount} from "../site/v2/ui/ir-view.js";

// a team at $293, 30 active: Hurts can go on IR, Coleman's game has started; Achane and McMillan on IR
const player = (playerId, fullName, salary, years, capPenalty, extra = {}) => ({playerId, fullName, salary, years, capPenalty, status: "ROSTER", nflPosition: "WR", team: "DET", ...extra});
function teamOf(active = 30) {
    const franchise = {franchiseId: "0001", capTotal: 293, numPlayers: active};
    const players = new Map([
        player("hurts", "Jalen Hurts", 65, 1, 26, {nflPosition: "QB", team: "PHI"}),
        player("coleman", "Jonah Coleman", 1, 5, 5, {nflPosition: "RB"}),
        player("williams", "Antonio Williams", 1, 5, 5),
        player("achane", "De'Von Achane", 1, 2, 2, {status: "INJURED_RESERVE", nflPosition: "RB", team: "MIA"}),
        player("mcmillan", "Jalen McMillan", 1, 3, 3, {status: "INJURED_RESERVE"})
    ].map((entry) => [entry.playerId, {...entry, franchise}]));
    return {franchise, groups: [], players};
}
const page = {
    active: [
        {id: "hurts", move: true, drop: true, locked: false, tag: "IR"},
        {id: "coleman", move: false, drop: false, locked: true, tag: "IR"},
        {id: "williams", move: false, drop: true, locked: false, tag: ""}
    ],
    reserve: [{id: "achane", move: true, drop: true, locked: false, tag: "IR"}, {id: "mcmillan", move: true, drop: true, locked: false, tag: "IR"}]
};
// the NFL still lists Hurts and Achane; McMillan no longer
const report = new Map([["hurts", {status: "IR", details: "Knee", exp_return: "Nov 22, 2026"}], ["achane", {status: "IR", details: "", exp_return: ""}]]);

function viewOf({toIR = [], activate = [], drop = null, active = 30, wide = false, state = {}, dropHref = "/drop"} = {}) {
    const team = teamOf(active);
    const groups = irGroups({players: team.players}, page, report);
    const musts = groups.onIR.filter((row) => row.must);
    const all = [...new Set([...activate, ...musts.filter((row) => !row.off).map((row) => row.player.playerId)])];
    const needsDrop = checkIR(team, {toIR, activate: all, limits: true}).needsDrop;
    const result = {...checkIR(team, {toIR, activate: all, drop, limits: true}), needsDrop, toIR, activate: all, drop};
    return {state: {busy: false, done: null, error: "", ...state}, result, groups, musts, team, page, limits: true, wide, dropHref};
}

const saveButton = (html) => html.match(/<button[^>]*data-act="save"[^>]*>[^<]*<\/button>/)[0];

test("a player the NFL no longer lists must come off IR: his box locked on, and Drop him instead", () => {
    const html = irMarkup(viewOf({active: 28}));
    assert.match(html, /<strong>Jalen McMillan must come off IR:<\/strong> the NFL no longer lists him\. <a href="\/drop#player-mcmillan">Drop him instead<\/a>/);
    assert.match(html, /data-act="activate" data-id="mcmillan" checked disabled><span>Must activate<\/span>/);
    assert.match(html, /<span class="fuad-meta fuad-bad">WR · DET · \$1 · No longer on the NFL’s IR<\/span>/);
    // a must alone is a move to save
    assert.match(saveButton(html), /data-act="save">Save IR moves</);
    assert.doesNotMatch(irMarkup(viewOf({active: 28, dropHref: null})), /Drop him instead/);
});

test("the lists: who can go, a started game's box off with its reason, the NFL's status and return", () => {
    const html = irMarkup(viewOf({active: 28, toIR: ["hurts"]}));
    assert.match(html, /<label class="fuad-ir-row fuad-ir-on-row">\s*<span class="fuad-ir-who"><span class="fuad-ir-name">Jalen Hurts<\/span><span class="fuad-meta">QB · PHI · \$65 · NFL IR · Knee · expected back Nov 22<\/span>/);
    assert.match(html, /data-act="toIR" data-id="coleman" disabled><span>Game started<\/span>/);
    assert.ok(html.indexOf("Can go on IR") < html.indexOf("On your IR"));
    // phones: the bar after the lists
    assert.ok(html.indexOf("fuad-ir-bar") > html.indexOf("On your IR"));
    // Hurts off and McMillan back: 28 either way, so no arrow
    assert.match(html, /Active<\/span> <strong><span class="">28<\/span><\/strong> <span class="fuad-muted">of 30/);
    // desktop: the bar above the table, names opening the popup
    const desk = irMarkup(viewOf({active: 28, toIR: ["hurts"], wide: true}));
    assert.ok(desk.indexOf("fuad-ir-bar") < desk.indexOf("Can go on IR"));
    assert.match(desk, /data-act="player" data-id="hurts">Jalen Hurts<\/button>/);
    assert.match(desk, /<span class="fuad-mid fuad-muted">Nov 22<\/span>/);
});

test("activating past 30 active needs a drop: Pick a drop shows, Save waits for it", () => {
    // 29, and McMillan and Achane back, is 31
    const needs = viewOf({active: 29, activate: ["achane"]});
    const html = irMarkup(needs);
    assert.match(html, /<section class="fuad-panel fuad-ir-drops fuad-ir-drops-needed"/);
    assert.match(html, /<strong class="fuad-bad">Blocked:<\/strong>/);
    assert.match(saveButton(html), /disabled/);
    // Coleman can't be dropped (game started); Williams can, for a $5 penalty
    assert.match(html, /data-act="drop" data-id="coleman" disabled>/);
    assert.match(html, /<span>\$5 penalty<\/span><span class="fuad-ir-change fuad-bad">\+\$4 cap<\/span>/);
    const picked = irMarkup(viewOf({active: 29, activate: ["achane"], drop: "williams"}));
    assert.match(picked, /<section class="fuad-panel fuad-ir-drops"/);
    assert.match(picked, /data-act="drop" data-id="williams" checked>/);
    // the must's activation, Achane's and the drop
    assert.match(saveButton(picked), /data-act="save">Save IR moves</);
    assert.equal(moveCount(viewOf({active: 29, activate: ["achane"], drop: "williams"}).result), 3);
    // at 30 a save takes one drop, so two back is still one too many
    assert.match(irMarkup(viewOf({activate: ["achane"], drop: "williams"})), /you’d have 31 active\. Activate one at a time/);
    // room for him: no drop asked
    assert.doesNotMatch(irMarkup(viewOf({active: 27, activate: ["achane"]})), /Pick a drop/);
});

test("while saving every box is off, and the button says so", () => {
    const html = irMarkup(viewOf({active: 28, toIR: ["hurts"], state: {busy: true}}));
    assert.match(html, /data-act="toIR" data-id="hurts" checked disabled>/);
    assert.match(saveButton(html), /disabled>Saving…</);
    assert.match(irMarkup(viewOf({active: 28, state: {done: "Saved: Hurts to IR.", error: "Couldn’t activate Achane."}})),
        /role="status">.*Saved: Hurts to IR\..*role="alert">Couldn’t activate Achane\./s);
    assert.match(loadingMarkup({failed: true}), /Couldn’t check your roster and cap\./);
    assert.equal(controlSelector({act: "toIR", id: "hurts"}), '[data-act="toIR"][data-id="hurts"]');
    assert.equal(controlSelector({act: "save"}), '[data-act="save"][data-id=""]');
});
