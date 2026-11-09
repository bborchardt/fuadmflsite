import {test} from "node:test";
import assert from "node:assert/strict";
import {SUFFIXES, normalize, withoutAccents} from "../site/v2/lib/names.js";
import {matchPlayer, plainName} from "../site/v2/lib/load.js";

test("names compare without case, accents, apostrophes or punctuation", () => {
    assert.equal(normalize("D.Booker"), "d booker");
    assert.equal(normalize("Ja’Marr Chase"), "jamarr chase");
    assert.equal(normalize("St. Brown, Amon-Ra"), "st brown amon ra");
    assert.equal(normalize("José Núñez"), "jose nunez");
    assert.equal(withoutAccents("Núñez"), "Nunez");
    assert.deepEqual([...SUFFIXES], ["jr", "sr", "ii", "iii", "iv", "v"]);
});

test("the results screen's sheet matches a name MFL spells without its accents", () => {
    assert.equal(plainName("Núñez, José"), "jose nunez");
    assert.equal(plainName("Harrison Jr., Marvin"), "marvin harrison");
    assert.equal(plainName("Brown, A.J."), plainName("AJ Brown"));
    const players = new Map([["1", {name: "Nunez, Jose", position: "WR"}], ["2", {name: "Brown, A.J.", position: "WR"}]]);
    assert.deepEqual(matchPlayer({name: "José Núñez", position: "WR"}, players), {id: "1"});
});
