import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseHTML} from "linkedom";
import {iconMarkup, stillOf, teamPicturesMarkup, useTeamPictures, withIcon} from "../site/v2/ui/team-pictures.js";
import {restyleTopic} from "../site/v2/ui/topic.js";

const DATA = "https://bborchardt.github.io/fuadmflsite/data/";
const database = {
    fid_0000: {id: "0000", name: "Commissioner", icon: "https://www44.myfantasyleague.com/fflnetdynamic2008/75574_avatar.jpg", logo: ""},
    fid_0001: {id: "0001", name: "Alpha", icon: "https://www44.myfantasyleague.com/fflnetdynamic2026/48571_franchise_icon0001.png", logo: "https://www44.myfantasyleague.com/fflnetdynamic2026/48571_franchise_logo0001.png"},
    fid_0002: {id: "0002", name: "Beta", icon: "https://i.example/beta.gif", logo: ""},
    fid_0003: {id: "0003", name: "Gamma", icon: "", logo: ""},
    fid_0004: {id: "0004", name: "Delta", icon: "javascript:alert(1)", logo: "javascript:alert(1)"}
};

test("before the page is set up, no team has a picture", () => {
    assert.equal(iconMarkup("0001"), "");
    assert.equal(withIcon("0001", "Alpha"), "Alpha");
});

test("lists show the job's still for a team with an icon; the team's page the uploads", () => {
    const {document} = parseHTML("<html><body></body></html>");
    useTeamPictures({dataBase: DATA, database, doc: document});
    assert.match(iconMarkup("0001"), /<img src="https:\/\/bborchardt\.github\.io\/fuadmflsite\/data\/icons\/0001\.webp" alt="" loading="lazy"/);
    assert.equal(stillOf("0002"), `${DATA}icons/0002.webp`);
    // no icon, or not a web address, or the commissioner: none
    for (const team of ["0003", "0004", "0000", "0099"]) {
        assert.equal(iconMarkup(team), "", team);
    }
    assert.equal(withIcon("0003", "Gamma"), "Gamma");
    assert.match(withIcon("0001", "Alpha", {after: true}), /^<span class="fuad-with-pic fuad-pic-after"><span class="fuad-team-pic"/);

    // a logo: the banner on desktop, the icon on phones, each downloaded only where it shows
    const alpha = teamPicturesMarkup("0001");
    assert.match(alpha.banner, /fuad-team-banner fuad-desktop-only.*<source media="\(max-width: 48em\)" srcset="data:image\/gif;base64,[^"]+"><img src="[^"]+logo0001\.png"/);
    assert.match(alpha.icon, /fuad-team-pic-xl fuad-phone-only.*<source media="\(min-width: 48\.01em\)"[^>]*><img src="[^"]+icon0001\.png"/);
    // no logo: the icon at every width, as uploaded
    const beta = teamPicturesMarkup("0002");
    assert.equal(beta.banner, "");
    assert.match(beta.icon, /^<span class="fuad-team-pic fuad-team-pic-xl" aria-hidden="true"><img src="https:\/\/i\.example\/beta\.gif"/);
    assert.deepEqual(teamPicturesMarkup("0003"), {banner: "", icon: ""});
});

test("a picture that won't load leaves the name; a logo that won't, the icon; a still that won't, the upload", () => {
    const {document} = parseHTML("<html><body><div id='list'></div><div id='team'></div><div id='post'></div></body></html>");
    useTeamPictures({dataBase: DATA, database, doc: document});
    // a picture's error doesn't bubble in a browser, which the page's capturing listener catches;
    // linkedom only reaches the document's listeners by bubbling
    const fail = (image) => image.dispatchEvent(new document.defaultView.Event("error", {bubbles: true}));

    document.getElementById("list").innerHTML = withIcon("0001", "Alpha");
    fail(document.querySelector("#list img"));
    assert.ok(!document.querySelector("#list .fuad-team-pic"));
    assert.match(document.getElementById("list").textContent, /Alpha/);

    const {banner, icon} = teamPicturesMarkup("0001");
    document.getElementById("team").innerHTML = `${banner}<div class="fuad-team-head">${icon}<h2>Alpha</h2></div>`;
    fail(document.querySelector("#team .fuad-team-banner img"));
    assert.ok(!document.querySelector("#team .fuad-team-banner"));
    const big = document.querySelector("#team .fuad-team-pic-xl");
    assert.equal(big.classList.contains("fuad-phone-only"), false);
    assert.ok(!big.querySelector("source"));

    document.getElementById("post").innerHTML = `<span class="fuad-post-avatar"><img src="${DATA}icons/0002.webp" data-fuad-upload="https://i.example/beta.gif"></span>`;
    fail(document.querySelector("#post img"));
    assert.equal(document.querySelector("#post img").getAttribute("src"), "https://i.example/beta.gif");
});

test("a board post's badge is the poster's still, MFL's upload kept for if it won't load", () => {
    const doc = parseHTML(readFileSync(new URL("./fixtures/pages/member/mb-topic_show.html", import.meta.url), "utf8")).document;
    useTeamPictures({dataBase: DATA, database, doc});
    assert.equal(restyleTopic(doc), true);
    const avatar = doc.querySelector(".fuad-post-avatar img");
    assert.equal(avatar.getAttribute("src"), `${DATA}icons/0001.webp`);
    assert.match(avatar.getAttribute("data-fuad-upload"), /48571_franchise_icon0001\.png$/);
});
