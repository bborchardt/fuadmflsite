// What members' browsers draw stays within the minimum (docs/design.md: Devices): the browsers in
// package.json's browserslist, from caniuse's data. Newer CSS is allowed only as an extra a page works
// without, marked where it's used with the reason (a disable comment needs one).
//
// caniuse's data misses some newer features, so those are listed here by hand: past the minimum's
// Safari 14.1 / Chrome 88, each with the version that brought it. Partial support is left out: what's
// partial at the minimum was gone through when this was set up, and is prefixed by the build
// (tools/build.mjs) or works as v2 uses it.

const RULE = "plugin/no-unsupported-browser-features";
const NEWER = "newer than the minimum (docs/design.md: Devices): an extra only, with the reason in a disable comment";

export default {
    plugins: ["stylelint-no-unsupported-browser-features"],
    ignoreFiles: ["site/v1/**", "site/data/**", "dist/**", "tools/**", "node_modules/**"],
    reportDescriptionlessDisables: true,
    reportNeedlessDisables: true,
    overrides: [{files: ["**/*.html"], customSyntax: "postcss-html"}],
    rules: {
        [RULE]: [true, {ignorePartialSupport: true}],
        "property-disallowed-list": [[
            "aspect-ratio", // Safari 15
            "accent-color", // Safari 15.4, Chrome 93
            "container-type", "container-name", "container", // Safari 16
            "text-wrap", "text-wrap-style", // Safari 17.4
            "content-visibility", // Safari 18
            "field-sizing", "anchor-name", "position-anchor", "view-transition-name"
        ], {message: (property) => `"${property}" is ${NEWER}`}],
        "function-disallowed-list": [[
            "color-mix", // Safari 16.2
            "light-dark", // Safari 17.5
            "oklch", "oklab", "lab", "lch" // Safari 15
        ], {message: (name) => `"${name}()" is ${NEWER}`}]
    }
};
