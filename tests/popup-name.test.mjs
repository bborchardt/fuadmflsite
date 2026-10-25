import {test} from "node:test";
import assert from "node:assert/strict";
import {parseHTML} from "linkedom";
import {openerName} from "../site/v2/ui/player-page.js";

test("the popup's name until the page arrives comes only from what names the player", () => {
    const {document} = parseHTML(`<html><body>
        <a id="mfl" href="javascript:launch_player_modal('48571','15241')">Beck, Carson ARI QB</a>
        <button id="name" class="fuad-name" data-player="1">Lamar Jackson</button>
        <button id="line" class="fuad-ln" data-player="2"><span class="fuad-ln-pos">WR</span>
            <span class="fuad-ln-name"><span class="fuad-short">M. Nabers</span><span class="fuad-full">Malik Nabers</span></span>
            <span class="fuad-ln-meta">WR · Playing · Q4 · 4 rec, 31 yds</span></button>
        <button id="row" data-act="player" data-id="3"><span>Josh Allen</span><span class="fuad-meta">QB · BUF</span></button>
        <p>206 yds, 1 Menu FUAD Week 7 FUAD Home Lineup League Moves Rosters</p>
    </body></html>`);
    assert.equal(openerName(document.getElementById("mfl")), "Carson Beck");
    assert.equal(openerName(document.getElementById("name")), "Lamar Jackson");
    assert.equal(openerName(document.getElementById("line")), "Malik Nabers");
    // a button with more than a name in it: the placeholder
    assert.equal(openerName(document.getElementById("row")), "");
    // Safari leaves the page focused after a tap on a button
    assert.equal(openerName(document.body), "");
    assert.equal(openerName(null), "");
});
