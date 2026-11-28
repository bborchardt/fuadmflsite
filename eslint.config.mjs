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

// a later entry's no-restricted-syntax replaces an earlier one's for the files both match, so each
// entry lists all its selectors: a selector for all of site/ goes in SITE_SYNTAX
const SITE_SYNTAX = [{selector: "CallExpression[callee.property.name='at']", message: "ES2022 .at() is forbidden: older iPhones lack it."}];
const FETCH_MESSAGE = "Ask MFL through ui/page-fetch.js: mflFetch for a read, mflConfirm for one confirming a move or planning a form's send, mflSend (or moves.js send) for a move. "
    + "A file of the site's own on Pages: fetch, with a disable comment saying so.";
// called, or passed on (`{fetchImpl: fetch}`), which would skip page-fetch.js just as well
const NO_FETCH = [
    {selector: "CallExpression[callee.name='fetch']", message: FETCH_MESSAGE},
    {selector: "CallExpression[callee.object.name=/^(?:window|globalThis|self)$/][callee.property.name='fetch']", message: FETCH_MESSAGE},
    {selector: "Identifier[name='fetch']:not(CallExpression > Identifier.callee, MemberExpression > Identifier.property, Property > Identifier.key)", message: FETCH_MESSAGE},
    {selector: "MemberExpression[object.name=/^(?:window|globalThis|self)$/][property.name='fetch']:not(CallExpression > MemberExpression.callee)", message: FETCH_MESSAGE}
];

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
            "no-restricted-syntax": ["error", ...SITE_SYNTAX]
        }
    },
    {
        // every request to MFL goes through page-fetch.js, so a 429 holds reads on every page; a direct
        // fetch is only for the site's own files on Pages, each with a disable comment saying so
        files: ["site/v2/ui/**/*.js"],
        ignores: ["site/v2/ui/page-fetch.js"],
        rules: {"no-restricted-syntax": ["error", ...SITE_SYNTAX, ...NO_FETCH]}
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
