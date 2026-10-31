// The repo is public: every page saved from MFL (tests/fixtures, the screen harness's samples and
// the bookmark's captures in tests/fixtures/pages) has had what's private taken out. A page saved
// some other way fails here until it has.

import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {join} from "node:path";

const ROOTS = ["tests/fixtures", "tools/verify/screens"].map((root) => new URL(`../${root}/`, import.meta.url).pathname);

function savedFiles(dir) {
    return readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
        const path = join(dir, entry.name);
        return entry.isDirectory() ? savedFiles(path) : /\.(html|json|xml|txt)$/.test(entry.name) ? [path] : [];
    });
}

const pages = ROOTS.flatMap(savedFiles).map((path) => ({path: path.slice(path.indexOf("/tests/") >= 0 ? path.indexOf("/tests/") + 1 : path.indexOf("/tools/") + 1), text: readFileSync(path, "utf8")}));

// what each finds, outside the placeholders the capture leaves
const CHECKS = {
    "an email address": (text) => (text.match(/[A-Za-z0-9._%+-]+(?:@|%40|&#64;)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [])
        .filter((address) => !/(@|%40|&#64;)example\.com$|@myfantasyleague\.com$|\.(png|jpe?g|gif|svg|webp)$/i.test(address)),
    "an apiKey": (text) => (text.match(/apiKey\s*[=:]\s*["'][^"']*["']|[?&;]APIKEY=[^&"'\s]+/gi) || []).filter((found) => !/saved-sample/.test(found)),
    "a board token": (text) => (text.match(/[?&;](?:auth|sid|session|token|upload_key)=[^&;#"'\s]+|name=["']?(?:auth|sid|session|token|upload_key)["']?[^>]*value=["'][^"']*["']/gi) || [])
        .filter((found) => !/saved-sample|value=["']["']/.test(found)),
    "a private message": (text) => (text.match(/<a\b[^>]*message_show\.pl[^>]*>[^<]*/gi) || [])
        .filter((link) => !/>A message$/.test(link) || /\btitle\s*=\s*["'](?!A message["'])/i.test(link)),
    "an owner's name": (text) => [
        ...(text.match(/Owner:\s*[^,"'<]+|"owner_name"\s*:\s*"[^"]*"/g) || [])
            .filter((found) => !/(Owner:\s*|"owner_name"\s*:\s*")(Owner \d{4}|Someone|Commissioner)\b/.test(found)),
        ...(text.match(/<input\b[^>]*\bname\s*=\s*["']?FRANCHISE_OWNER_NAME\d{4}\b[^>]*>/gi) || [])
            // a value cut short leaves the rest of the name as stray attributes
            .filter((input) => !/^<input(?:\s+[\w-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*\s*\/?>$/i.test(input)
                || (/\svalue\s*=/i.test(input) && !/\svalue\s*=\s*(?:"(?:Owner \d{4})?"|'(?:Owner \d{4})?')(?=[\s/>])/i.test(input)))
    ]
};

test("the contact screens' saved pages hold no typed or chosen value", () => {
    const found = pages.filter(({path}) => /\/csetup-(FCONTACT|FMOBILE)\.html$/.test(path))
        .map(({path, text}) => ({path, found: [
            ...(text.match(/<input\b[^>]*>/gi) || []).filter((input) => !/\btype\s*=\s*["']?(?:hidden|radio|checkbox|submit|button|image|reset)\b/i.test(input)
                && /\bvalue\s*=\s*(?:"[^"]+"|'[^']+'|[^\s>"']+)/i.test(input)),
            ...(text.match(/<textarea\b[^>]*>[^<]+</gi) || []),
            ...(text.match(/<option\b[^>]*\sselected\b[^>]*>[^<]*/gi) || [])
        ]}))
        .filter((page) => page.found.length);
    assert.deepEqual(found, []);
});

for (const [what, find] of Object.entries(CHECKS)) {
    test(`no saved page holds ${what}`, () => {
        const found = pages.map(({path, text}) => ({path, found: find(text)})).filter((page) => page.found.length);
        assert.deepEqual(found, []);
    });
}

test("the bookmark's captures are all here", () => {
    assert.ok(pages.filter((page) => page.path.startsWith("tests/fixtures/pages/")).length > 80);
});
