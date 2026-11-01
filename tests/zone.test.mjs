// Times as MFL's pages write them, in the zone each member picks on MFL (Franchise setup › Customize ›
// Time Zone), read as the moment they are, so v2 shows them in the league's zone. `npm test` runs on
// a Pacific clock, as screens.py does, so a time taken from the device's clock rather than the
// league's comes out wrong, and every time shown carries the league's label.

import {test} from "node:test";
import assert from "node:assert/strict";
import {mflTime, zoneLabel} from "../site/v2/lib/zone.js";

test("a time MFL writes in any zone it offers is the same moment", () => {
    // a bid run, as its option's value gives it (saved 31 Oct 2026, with the member on ET)
    const run = 1792641600;
    assert.equal(mflTime("Thu Oct 22 12:00:00 a.m. ET 2026"), run);
    assert.equal(mflTime("Wed Oct 21 11:00:00 p.m. CT 2026"), run);
    assert.equal(mflTime("Wed Oct 21 10:00:00 p.m. MT 2026"), run);
    assert.equal(mflTime("Wed Oct 21 9:00:00 p.m. PT 2026"), run);
    assert.equal(mflTime("Wed Oct 21 8:00:00 p.m. AKT 2026"), run);
    assert.equal(mflTime("Wed Oct 21 6:00:00 p.m. HT 2026"), run);
    assert.equal(mflTime("Thu Oct 22 4:00:00 a.m. GMT 2026"), run);
    assert.equal(mflTime("Wed Oct 21 12:00:00 p.m. CT 2026"), run - 11 * 3600);
});

test("either side of a change of daylight time", () => {
    assert.equal(new Date(mflTime("Sun Nov 1 3:00:00 a.m. CT 2026") * 1000).toISOString(), "2026-11-01T09:00:00.000Z");
    assert.equal(new Date(mflTime("Sat Oct 31 11:00:00 p.m. CT 2026") * 1000).toISOString(), "2026-11-01T04:00:00.000Z");
    assert.equal(new Date(mflTime("Sun Mar 8 3:00:00 a.m. CT 2026") * 1000).toISOString(), "2026-03-08T08:00:00.000Z");
});

test("text that isn't one of MFL's times is nothing", () => {
    assert.equal(mflTime("yesterday"), null);
    assert.equal(mflTime("Wed Oct 21 11:00:00 p.m. XT 2026"), null);
    assert.equal(mflTime("Wed Foo 21 11:00:00 p.m. CT 2026"), null);
});

test("a time is labelled with the league's zone only for a device on another clock at that moment", () => {
    // Wed Oct 21 2026, 11 p.m. CT (daylight time, UTC−5); Wed Dec 2, 11 p.m. CT (standard, UTC−6)
    const october = 1792641600;
    const december = october + 42 * 86400 + 3600;
    assert.equal(zoneLabel(october, -5 * 3600), "");
    assert.equal(zoneLabel(december, -6 * 3600), "");
    assert.equal(zoneLabel(october, -4 * 3600), " CT");
    assert.equal(zoneLabel(october, -6 * 3600), " CT");
    // Arizona keeps UTC−7 all year: on Central's clock never
    assert.equal(zoneLabel(december, -7 * 3600), " CT");
});
