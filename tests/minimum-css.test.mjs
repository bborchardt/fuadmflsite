import {test} from "node:test";
import assert from "node:assert/strict";
import {minimumCss} from "../tools/minimum-css.mjs";

const R = "/* stylelint-disable-next-line plugin/no-unsupported-browser-features -- why */";
const P = "/* stylelint-disable-next-line property-disallowed-list -- why */";

test("only what a browser at the minimum drops of what's marked goes", () => {
    const {css} = minimumCss(`
${R}
.a:has(img), .b { color: red; }
${P}
.c { width: 1px; accent-color: red; }
.d {
    ${R}
    overscroll-behavior: contain;
    color: blue;
}
/* stylelint-disable plugin/no-unsupported-browser-features -- why */
@supports (grid-template-rows: subgrid) { .e { display: grid; } }
/* stylelint-enable plugin/no-unsupported-browser-features */
${R}
.f:not([x]) { color: green; }
.g:has(img) { color: red; }
`);
    // a rule whose selector it can't read goes whole, its other selectors too
    assert.doesNotMatch(css, /\.a:has|\.b \{/);
    // a newer declaration goes, the rest of its rule stays
    assert.match(css, /\.c \{ width: 1px;\s*\}/);
    assert.match(css, /\.d \{[^}]*color: blue;[^}]*\}/);
    assert.doesNotMatch(css, /accent-color|overscroll-behavior/);
    assert.doesNotMatch(css, /@supports/);
    // a mark that's a false alarm leaves its rule, and nothing unmarked is touched
    assert.match(css, /\.f:not\(\[x\]\) \{ color: green; \}/);
    assert.match(css, /\.g:has\(img\)/);
});
