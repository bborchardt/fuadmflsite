// A message board topic (MFL's `mb/topic_show.pl`), restyled: each post becomes a card (avatar, team,
// date, text, Reply and Quote), replies indented under the post they answer, and MFL's icons go.
// The posts are MFL's own nodes moved into the cards, so its links and anchors keep working; the
// page is marked `fuad-topic` only once it's done, so a page v2 can't read stays as MFL drew it.

import {esc} from "./html.js";

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();

// "Wed Sep 9 11:11:12 p.m. CT 2026" → "Wed Sep 9 · 11:11 p.m."
export function shortDate(text) {
    const match = clean(text).match(/^(\w{3} \w{3} \d{1,2}) (\d{1,2}:\d{2}):\d{2} ([ap]\.m\.)/);
    return match ? `${match[1]} · ${match[2]} ${match[3]}` : clean(text);
}

// "… Message Board / Free Agent Contracts (103 hits)" → {title, hits}
export function topicTitle(text) {
    const match = clean(text).match(/\/\s*(.+?)\s*\((\d+) hits?\)\s*$/);
    return match ? {title: match[1], hits: Number(match[2])} : null;
}

const initials = (name) => clean(name).split(" ").filter((word) => /^[A-Za-z0-9]/.test(word)).slice(0, 2).map((word) => word[0]).join("").toUpperCase();

// MFL indents a reply by 3% a level
const depthOf = (post) => Math.round((parseFloat(post.style.marginLeft) || 0) / 3);

function card(post) {
    const rows = post.querySelectorAll("table tr");
    const team = rows[0] && rows[0].querySelector("td.poster a");
    const head = rows[0] && rows[0].querySelector("td.message");
    const body = rows[1] && rows[1].querySelector("td.message");
    const reply = head && head.querySelector("a[href*='post_add'][href]:not([href*='quote=1'])");
    const quote = head && head.querySelector("a[href*='quote=1']");
    if (!team || !head || !body || !reply) {
        return null;
    }
    const status = head.querySelector("img.ico[title]");
    const unread = Boolean(status && /unread/i.test(status.getAttribute("title")));
    const dateText = [...head.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent).join(" ");
    const avatar = rows[1].querySelector("img.ava");

    const article = document.createElement("article");
    article.className = "fuad-post";
    article.innerHTML = `
        <div class="fuad-post-head">
            <span class="fuad-post-avatar" aria-hidden="true">${esc(initials(team.textContent))}</span>
            <span class="fuad-post-who"><span class="fuad-post-team"></span><span class="fuad-post-when">${esc(shortDate(dateText))}</span>${unread ? '<span class="fuad-post-new">New</span>' : ""}</span>
            <span class="fuad-post-actions"><a href="${esc(reply.getAttribute("href"))}">Reply</a>${quote ? `<a href="${esc(quote.getAttribute("href"))}">Quote</a>` : ""}</span>
        </div>
        <div class="fuad-post-text"></div>`;
    article.querySelector(".fuad-post-team").append(team);
    if (avatar && avatar.getAttribute("src")) {
        avatar.alt = "";
        article.querySelector(".fuad-post-avatar").replaceChildren(avatar);
    }
    article.querySelector(".fuad-post-text").append(...body.childNodes);
    return article;
}

// true when the page was restyled
export function restyleTopic(doc = document) {
    const posts = [...doc.querySelectorAll("div.frm.pst[id^='pid']")];
    const bar = doc.querySelector("th.messageboardbar");
    const nav = doc.querySelector("span.nav");
    if (!posts.length || !bar || !nav) {
        return false;
    }
    const cards = posts.map(card);
    if (cards.some((built) => !built)) {
        return false;
    }
    const topic = topicTitle(bar.textContent);
    const link = (test) => {
        const found = nav.querySelector(`a[href*='${test}']`);
        return found ? found.getAttribute("href") : null;
    };
    const header = doc.createElement("div");
    header.className = "fuad-topic-head";
    header.innerHTML = `
        <div class="fuad-topic-title">
            <h2>${esc(topic ? topic.title : clean(bar.textContent))}</h2>
            <span class="fuad-meta">${posts.length} post${posts.length === 1 ? "" : "s"}${topic ? ` · ${topic.hits} views` : ""}</span>
        </div>
        <nav class="fuad-topic-nav" aria-label="Topics">
            ${link("dir=prev") ? `<a href="${esc(link("dir=prev"))}">‹ Previous</a>` : ""}
            ${link("board_show") ? `<a href="${esc(link("board_show"))}">Message board</a>` : ""}
            ${link("dir=next") ? `<a href="${esc(link("dir=next"))}">Next ›</a>` : ""}
        </nav>`;
    nav.before(header);
    doc.querySelectorAll("th.messageboardbar").forEach((th) => th.closest("table").classList.add("fuad-topic-bar"));
    posts.forEach((post, index) => {
        post.style.setProperty("--fuad-depth", String(depthOf(post)));
        post.replaceChildren(cards[index]);
    });
    doc.documentElement.classList.add("fuad-topic");
    return true;
}
