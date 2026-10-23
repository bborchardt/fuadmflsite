import {test} from "node:test";
import assert from "node:assert/strict";
import {watchedIds} from "../site/v2/ui/watch.js";

test("the watch list's ids, however MFL's export gives them", () => {
    const ids = (body) => [...watchedIds(body)];
    assert.deepEqual(ids({myWatchList: {player: [{id: "13604"}, {id: "14782"}]}}), ["13604", "14782"]);
    assert.deepEqual(ids({myWatchList: {player: {id: "13604"}}}), ["13604"]);
    assert.deepEqual(ids({myWatchList: {player: "13604,14782"}}), ["13604", "14782"]);
    assert.deepEqual(ids({myWatchList: {player: ["13604", "14782"]}}), ["13604", "14782"]);
    // an empty list, or none at all
    assert.deepEqual(ids({myWatchList: {}}), []);
    assert.deepEqual(ids({myWatchList: ""}), []);
    assert.deepEqual(ids({}), []);
});
