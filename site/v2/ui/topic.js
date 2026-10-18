// The message board's topic and reply pages (MFL's `mb/topic_show.pl` and `mb/post_add.pl`),
// restyled. A topic's posts become cards (avatar, team, date, text, Reply and Quote), replies indented
// under the post they answer, MFL's icons gone; the reply page shows the post being answered, then
// the form. MFL's own nodes move into v2's markup, so its links, fields and buttons keep working; the
// page is marked only once it's done, so a page v2 can't read stays as MFL drew it.

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

// MFL's formatting buttons by the tag they insert, as v2 labels them; the smileys are left out
const FORMATS = {b: "B", i: "I", tt: "tt", "url=": "Link", img: "Image", video: "Video"};

// true when the reply page was restyled
export function restyleReply(doc = document) {
    const form = doc.querySelector("form.rpl");
    const up = doc.querySelector("span.nav a[href*='topic_show']");
    const bars = [...doc.querySelectorAll("th.messageboardbar")].map((th) => th.closest("table"));
    const body = form && form.querySelector("textarea[name=body]");
    const post = form && form.querySelector("input[type=submit][name=add]");
    const preview = form && form.querySelector("input[type=submit][name=preview]");
    const notify = form && form.querySelector("input[type=checkbox][name=notify]");
    if (!form || !up || !bars.length || bars.some((table) => !table) || !body || !post || !preview) {
        return false;
    }
    // a field v2 doesn't know (a new topic's subject) would be lost, so such a form stays MFL's
    const known = [body, post, preview, notify].filter(Boolean);
    if ([...form.querySelectorAll("input:not([type=hidden]), textarea, select")].some((field) => !known.includes(field))) {
        return false;
    }
    const formats = [...form.querySelectorAll("button.tbt")].map((button) => {
        const tag = ((button.getAttribute("onclick") || "").match(/insertTags\("([^"]+)"/) || [])[1];
        return tag && FORMATS[tag] ? {button, label: FORMATS[tag]} : null;
    }).filter(Boolean);
    const answered = [...doc.querySelectorAll("div.frm")].find((frm) => !form.contains(frm) && /In Response to/i.test((frm.querySelector(".hcl") || {}).textContent || ""));
    const answeredText = answered && answered.querySelector(".ccl");
    const topic = clean([...bars[0].querySelector("th.messageboardbar").childNodes].filter((node) => !(node.classList && node.classList.contains("htt"))).map((node) => node.textContent).join(" "));

    const header = doc.createElement("div");
    header.className = "fuad-reply-head";
    header.innerHTML = `<a href="${esc(up.getAttribute("href"))}">‹ ${esc(topic || "Back to the topic")}</a><h2>Reply</h2>`;
    let card = null;
    if (answered && answeredText) {
        card = doc.createElement("article");
        card.className = "fuad-reply-to";
        card.innerHTML = `<span class="fuad-label"></span><div class="fuad-post-text"></div>`;
        card.querySelector(".fuad-label").textContent = `In response to ${clean(answered.querySelector(".hcl").textContent.replace(/In Response to/i, ""))}`;
        card.querySelector(".fuad-post-text").append(...answeredText.childNodes);
    }
    const fields = doc.createElement("div");
    fields.className = "fuad-reply-form";
    fields.innerHTML = `<div class="fuad-reply-formats" role="group" aria-label="Formatting"></div><label class="fuad-reply-text"><span class="fuad-label">Your reply</span></label><div class="fuad-reply-buttons"></div>`;
    formats.forEach(({button, label}) => {
        button.textContent = label;
        button.dataset.format = label;
        fields.querySelector(".fuad-reply-formats").append(button);
    });
    fields.querySelector(".fuad-reply-text").append(body);
    const buttons = fields.querySelector(".fuad-reply-buttons");
    if (notify) {
        const label = doc.createElement("label");
        label.className = "fuad-reply-notify";
        label.append(notify, " Email me replies");
        buttons.append(label);
    }
    preview.classList.add("fuad-reply-preview");
    post.classList.add("fuad-reply-post");
    buttons.append(preview, post);
    fields.append(...form.querySelectorAll("input[type=hidden]"));

    form.replaceChildren(fields);
    form.before(header);
    if (card) {
        form.before(card);
        answered.remove();
    }
    bars.forEach((table) => table.classList.add("fuad-topic-bar"));
    doc.documentElement.classList.add("fuad-reply");
    return true;
}
