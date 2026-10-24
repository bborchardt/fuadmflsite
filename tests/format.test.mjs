import {test} from "node:test";
import assert from "node:assert/strict";
import {cents, money, ordinal, plural, yearsText} from "../site/v2/ui/format.js";
import {displayName} from "../site/v2/lib/mfl.js";

test("amounts: whole dollars bare, anything else to the cent", () => {
    assert.equal(money(12), "$12");
    assert.equal(money(12.5), "$12.50");
    assert.equal(money(0.01), "$0.01");
    // sums of salaries drift in floating point
    assert.equal(money(0.1 + 0.2), "$0.30");
    assert.equal(money(26.4 + 0.6), "$27");
    assert.equal(cents(292.99999999), 293);
});

test("counts, places and lengths", () => {
    assert.equal(plural(1, "bid"), "1 bid");
    assert.equal(plural(2, "bid"), "2 bids");
    assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st", "111th"]);
    assert.equal(yearsText(1), "1 yr");
    assert.equal(yearsText(3), "3 yrs");
});

test("MFL's names, last name first, as written everywhere else", () => {
    assert.equal(displayName("Jackson, Lamar"), "Lamar Jackson");
    assert.equal(displayName("St. Brown, Amon-Ra"), "Amon-Ra St. Brown");
    assert.equal(displayName("Bears"), "Bears");
    assert.equal(displayName(" Jackson ,Lamar"), "Lamar Jackson");
});
