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

// "… Message Board / Free Agent Contracts (1,204 hits)" → {title, hits}
export function topicTitle(text) {
    const match = clean(text).match(/\/\s*(.+?)\s*\(([\d,]+) hits?\)\s*$/);
    return match ? {title: match[1], hits: Number(match[2].replace(/,/g, ""))} : null;
}

const plural = (count, word) => `${count.toLocaleString("en-US")} ${word}${count === 1 ? "" : "s"}`;

const initials = (name) => clean(name).split(" ").filter((word) => /^[A-Za-z0-9]/.test(word)).slice(0, 2).map((word) => word[0]).join("").toUpperCase();

// MFL indents a reply by 3% a level; capped, so a deep thread stays inside the column
const depthOf = (post) => Math.min(6, Math.round((parseFloat(post.style.marginLeft) || 0) / 3));

// a post's parts in MFL's markup, or null; nothing is moved yet
function readPost(post) {
    const rows = post.querySelectorAll("table tr");
    const team = rows[0] && rows[0].querySelector("td.poster a");
    const head = rows[0] && rows[0].querySelector("td.message");
    const body = rows[1] && rows[1].querySelector("td.message");
    const reply = head && head.querySelector("a[href*='post_add'][href]:not([href*='quote=1'])");
    if (!team || !head || !body || !reply) {
        return null;
    }
    const status = head.querySelector("img.ico[title]");
    return {
        post,
        team,
        body,
        reply: reply.getAttribute("href"),
        quote: (head.querySelector("a[href*='quote=1']") || {getAttribute: () => null}).getAttribute("href"),
        unread: Boolean(status && /unread/i.test(status.getAttribute("title"))),
        when: shortDate([...head.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent).join(" ")),
        avatar: rows[1].querySelector("img.ava[src]")
    };
}

// the card, with MFL's own team link, avatar and text moved into it
function card(parts) {
    const article = document.createElement("article");
    article.className = "fuad-post";
    article.innerHTML = `
        <div class="fuad-post-head">
            <span class="fuad-post-avatar" aria-hidden="true">${esc(initials(parts.team.textContent))}</span>
            <span class="fuad-post-who"><span class="fuad-post-team"></span><span class="fuad-post-when">${esc(parts.when)}</span>${parts.unread ? '<span class="fuad-post-new">New</span>' : ""}</span>
            <span class="fuad-post-actions"><a href="${esc(parts.reply)}">Reply</a>${parts.quote ? `<a href="${esc(parts.quote)}">Quote</a>` : ""}</span>
        </div>
        <div class="fuad-post-text"></div>`;
    article.querySelector(".fuad-post-team").append(parts.team);
    if (parts.avatar) {
        parts.avatar.alt = "";
        article.querySelector(".fuad-post-avatar").replaceChildren(parts.avatar);
    }
    article.querySelector(".fuad-post-text").append(...parts.body.childNodes);
    return article;
}

// true when the page was restyled. Everything is read and checked before anything moves, so a page
// v2 can't read is left exactly as MFL drew it.
export function restyleTopic(doc = document) {
    const posts = [...doc.querySelectorAll("div.frm.pst[id^='pid']")].map(readPost);
    const bars = [...doc.querySelectorAll("th.messageboardbar")].map((th) => th.closest("table"));
    const nav = doc.querySelector("span.nav");
    if (!posts.length || posts.some((parts) => !parts) || !bars.length || bars.some((table) => !table) || !nav) {
        return false;
    }
    const bar = doc.querySelector("th.messageboardbar");
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
            <span class="fuad-meta">${plural(posts.length, "post")}${topic ? ` · ${plural(topic.hits, "view")}` : ""}</span>
        </div>
        <nav class="fuad-topic-nav" aria-label="Topics">
            ${link("dir=prev") ? `<a href="${esc(link("dir=prev"))}">‹ Previous</a>` : ""}
            ${link("board_show") ? `<a href="${esc(link("board_show"))}">Message board</a>` : ""}
            ${link("dir=next") ? `<a href="${esc(link("dir=next"))}">Next ›</a>` : ""}
        </nav>`;
    const cards = posts.map(card);
    nav.before(header);
    bars.forEach((table) => table.classList.add("fuad-topic-bar"));
    posts.forEach(({post}, index) => {
        post.style.setProperty("--fuad-depth", String(depthOf(post)));
        post.replaceChildren(cards[index]);
    });
    doc.documentElement.classList.add("fuad-topic");
    return true;
}
