// What runs in members' browsers stays within ES2020, which Safari has had since iOS 14 (any iPhone
// from the 6s on, updated). Only the language is checked: newer browser APIs and CSS aren't. The regex
// lookbehind (ES2018, but Safari 16.4) passes here; tests/guards.test.mjs keeps it out of what fuad.js
// imports statically.

import esx from "eslint-plugin-es-x";

export default [
    {
        files: ["site/**/*.js"],
        languageOptions: {ecmaVersion: "latest", sourceType: "module"},
        // the code's own eslint-disable comments are for other linters' rules
        linterOptions: {reportUnusedDisableDirectives: "off"},
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
