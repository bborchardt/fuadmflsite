import {after, test} from "node:test";
import assert from "node:assert/strict";
import {existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import sharp from "sharp";
import {ICON_PIXELS, iconSources, stillIcon, updateIcons} from "../jobs/team-icons.mjs";
import {asArray} from "../site/v2/lib/mfl.js";

const colour = (background, width = 8, height = 8) => sharp({create: {width, height, channels: 3, background}}).png().toBuffer();
// red, then blue: an animated GIF's frames
const animated = async () => sharp([await colour("#ff0000"), await colour("#0000ff")], {join: {animated: true}}).gif().toBuffer();
const pixel = async (bytes) => [...(await sharp(bytes).raw().toBuffer()).subarray(0, 3)];

const dirs = [];
after(() => dirs.forEach((dir) => rmSync(dir, {recursive: true, force: true})));

test("an icon's still: its first frame, cropped square, small", async () => {
    const still = await stillIcon(await animated());
    const meta = await sharp(still, {pages: -1}).metadata();
    assert.equal(meta.format, "webp");
    assert.equal(meta.pages || 1, 1);
    assert.deepEqual([meta.width, meta.height], [ICON_PIXELS, ICON_PIXELS]);
    const [red, , blue] = await pixel(still);
    assert.ok(red > 200 && blue < 60, `first frame is red: ${red}, ${blue}`);
    // a wide picture keeps its middle
    const wide = await sharp({create: {width: 300, height: 100, channels: 3, background: "#00ff00"}})
        .composite([{input: await colour("#ff0000", 100, 100), left: 0, top: 0}]).png().toBuffer();
    const [r, g] = await pixel(await stillIcon(wide));
    assert.ok(g > 200 && r < 60);
    await assert.rejects(stillIcon(Buffer.from("<html>not a picture</html>")));
});

test("the league export's icons: web addresses only", () => {
    const sources = iconSources({franchises: {franchise: [
        {id: "0001", icon: "https://www44.myfantasyleague.com/fflnetdynamic2026/48571_franchise_icon0001.png"},
        {id: "0002", icon: ""},
        {id: "0003"},
        {id: "0004", icon: "javascript:alert(1)"},
        {id: "0005", icon: " http://example.com/a.jpg "}
    ]}}, asArray);
    assert.deepEqual([...sources], [
        ["0001", "https://www44.myfantasyleague.com/fflnetdynamic2026/48571_franchise_icon0001.png"],
        ["0005", "http://example.com/a.jpg"]
    ]);
    assert.equal(iconSources(null, asArray).size, 0);
});

test("stills are made when a picture is new or changed, kept when it can't be read, removed when it's gone", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "fuad-icons-"));
    dirs.push(dataDir);
    const pictures = {"https://a.example/1.png": {bytes: await colour("#ff0000"), etag: '"r"'}, "https://a.example/2.gif": {bytes: await animated()}};
    const sent = [];
    const fetchImpl = async (url, init) => {
        sent.push({url, headers: init.headers});
        const picture = pictures[url];
        if (typeof picture === "number") {
            return new Response("", {status: picture});
        }
        if (picture.etag && init.headers["If-None-Match"] === picture.etag) {
            return new Response(null, {status: 304});
        }
        return new Response(picture.bytes, {headers: picture.etag ? {ETag: picture.etag} : {}});
    };
    const sources = new Map([["0001", "https://a.example/1.png"], ["0002", "https://a.example/2.gif"]]);
    const update = (options = {}) => updateIcons({sources, dataDir, userAgent: "league-site-icons", fetchImpl, spacing: 0, ...options});
    const file = (team) => join(dataDir, "data", "icons", `${team}.webp`);

    let result = await update();
    assert.deepEqual(result.written, ["0001", "0002"]);
    assert.ok(existsSync(file("0001")) && existsSync(file("0002")));
    assert.deepEqual(JSON.parse(readFileSync(join(dataDir, "icon-sources.json"), "utf8")),
        {"0001": {url: "https://a.example/1.png", etag: '"r"'}, "0002": {url: "https://a.example/2.gif"}});
    // nothing of the job's goes with the request
    assert.deepEqual(sent[0].headers, {"User-Agent": "league-site-icons"});

    // the next day: the first answered 304, the second the same picture again
    sent.length = 0;
    result = await update();
    assert.deepEqual([result.written, result.removed, result.failed, result.knownChanged], [[], [], [], false]);
    assert.equal(sent[0].headers["If-None-Match"], '"r"');

    // a re-upload at the same address, and a picture that's gone
    pictures["https://a.example/1.png"] = {bytes: await colour("#0000ff"), etag: '"b"'};
    pictures["https://a.example/2.gif"] = 404;
    const before = readFileSync(file("0002"));
    result = await update();
    assert.deepEqual(result.written, ["0001"]);
    assert.deepEqual(result.failed, [{team: "0002", reason: "HTTP 404"}]);
    assert.ok(readFileSync(file("0002")).equals(before));
    assert.ok((await pixel(readFileSync(file("0001"))))[2] > 200);

    // a still the job didn't make (deleted by hand) is made again, though MFL says 304
    rmSync(file("0001"));
    result = await update();
    assert.deepEqual(result.written, ["0001"]);

    // an owner who took their icon away; a dry run writes nothing
    sources.delete("0002");
    result = await update({write: false});
    assert.deepEqual(result.removed, ["0002"]);
    assert.ok(existsSync(file("0002")));
    result = await update();
    assert.deepEqual(result.removed, ["0002"]);
    assert.ok(!existsSync(file("0002")));
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(dataDir, "icon-sources.json"), "utf8"))), ["0001"]);

    // too large to take, though the reply doesn't say its length
    pictures["https://a.example/1.png"] = {bytes: new ReadableStream({
        pull(controller) {
            controller.enqueue(new Uint8Array(1024 * 1024));
        }
    }), etag: '"big"'};
    result = await update();
    assert.deepEqual(result.failed, [{team: "0001", reason: "larger than the job takes"}]);
    // a request that fails outright
    pictures["https://a.example/1.png"] = {get bytes() {
        throw new TypeError("fetch failed");
    }};
    result = await update();
    assert.deepEqual(result.failed, [{team: "0001", reason: "fetch failed"}]);
    assert.ok(existsSync(file("0001")));
    // an export with no icons at all removes none
    result = await update({sources: new Map()});
    assert.deepEqual(result.removed, []);
    assert.ok(existsSync(file("0001")));
});

test("a still left from a picture's earlier address is made again from the new one", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "fuad-icons-"));
    dirs.push(dataDir);
    mkdirSync(join(dataDir, "data", "icons"), {recursive: true});
    writeFileSync(join(dataDir, "data", "icons", "0001.webp"), await stillIcon(await colour("#ff0000")));
    writeFileSync(join(dataDir, "icon-sources.json"), JSON.stringify({"0001": {url: "https://a.example/old.png", etag: '"r"'}}));
    const sent = [];
    const result = await updateIcons({
        sources: new Map([["0001", "https://a.example/new.png"]]), dataDir, userAgent: "x", spacing: 0,
        fetchImpl: async (url, init) => {
            sent.push(init.headers);
            return new Response(await colour("#0000ff"), {headers: {ETag: '"r"'}});
        }
    });
    assert.equal(sent[0]["If-None-Match"], undefined);
    assert.deepEqual(result.written, ["0001"]);
});
