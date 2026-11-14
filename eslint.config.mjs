// ESLint's standard rules everywhere: chiefly a name that's misspelled or never defined, which would
// only fail when its line runs.
//
// What runs in members' browsers stays within the minimum (docs/design.md: Devices): ES2020, and
// browser APIs the browsers in package.json's browserslist have (eslint-plugin-compat, which sees
// globals and some methods, not all). The header, which decides whether a browser is below the minimum,
// is ES5, so it parses in any. The regex lookbehind (ES2018, but Safari 16.4) passes here;
// tests/guards.test.mjs keeps it out. CSS is stylelint's (stylelint.config.mjs).

import js from "@eslint/js";
import compat from "eslint-plugin-compat";
import esx from "eslint-plugin-es-x";
import html from "eslint-plugin-html";
import globals from "globals";

export default [
    // the published snapshots, and MFL's own scripts saved for the screen harness
    {ignores: ["site/data/", "tools/verify/screens/", "dist/"]},
    js.configs.recommended,
    {
        languageOptions: {ecmaVersion: "latest", sourceType: "module"},
        // the code's own eslint-disable comments are for other linters' rules
        linterOptions: {reportUnusedDisableDirectives: "off"},
        // a caught error left unread, or an empty catch, is the code's way of saying it doesn't matter
        // (browser storage that's full or blocked)
        rules: {"no-unused-vars": ["error", {caughtErrors: "none"}], "no-empty": ["error", {allowEmptyCatch: true}]}
    },
    {
        files: ["**/*.mjs"],
        languageOptions: {globals: globals.node}
    },
    {
        files: ["site/**/*.js"],
        languageOptions: {globals: globals.browser},
        // flag newer methods such as Array.prototype.at even where the value's type can't be told
        settings: {"es-x": {aggressive: true}},
        plugins: {"es-x": esx, compat},
        rules: {
            ...esx.configs["flat/restrict-to-es2020"].rules,
            "compat/compat": "error",
            // the code's own `at` fields (message.at) read as Array.prototype.at; only calls are flagged
            "es-x/no-array-prototype-at": "off",
            "es-x/no-string-prototype-at": "off",
            "no-restricted-syntax": ["error", {
                selector: "CallExpression[callee.property.name='at']",
                message: "ES2022 .at() is forbidden: older iPhones lack it."
            }]
        }
    },
    {
        // the frozen v1's contract readings, loaded only when asked for: an older Safari can't read them
        // (lookbehind) and skips just that
        files: ["site/v1/lib/contract-years.js"],
        rules: {"compat/compat": "off"}
    },
    {
        // the header and the capture page's scripts, as pasted into MFL or published: ES5
        files: ["mfl/*.html", "site/**/*.html"],
        plugins: {html, compat},
        languageOptions: {ecmaVersion: 5, sourceType: "script", globals: globals.browser},
        rules: {"compat/compat": "error"}
    }
];
