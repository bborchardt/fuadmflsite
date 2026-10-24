// ESLint's standard rules everywhere: chiefly a name that's misspelled or never defined, which would
// only fail when its line runs.
//
// What runs in members' browsers also stays within ES2020, which Safari has had since iOS 14 (any
// iPhone from the 6s on, updated). Only the language is checked: newer browser APIs and CSS aren't.
// The regex lookbehind (ES2018, but Safari 16.4) passes here; tests/guards.test.mjs keeps it out of
// what fuad.js imports statically.

import js from "@eslint/js";
import esx from "eslint-plugin-es-x";
import globals from "globals";

export default [
    // the published snapshots, and MFL's own scripts saved for the screen harness
    {ignores: ["site/data/", "tools/verify/screens/"]},
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
        plugins: {"es-x": esx},
        rules: {
            ...esx.configs["flat/restrict-to-es2020"].rules,
            // the code's own `at` fields (message.at) read as Array.prototype.at; only calls are flagged
            "es-x/no-array-prototype-at": "off",
            "es-x/no-string-prototype-at": "off",
            "no-restricted-syntax": ["error", {
                selector: "CallExpression[callee.property.name='at']",
                message: "ES2022 .at() is forbidden: older iPhones lack it."
            }]
        }
    }
];
