// The message board's pages (MFL's `mb/…`), restyled. The topic list becomes Home's Message board
// card; a topic's posts become cards (avatar, team, date, text, Reply and Quote), replies indented
// under the post they answer, MFL's icons gone; the reply and new topic pages show the post being
// answered and Preview's copy, then the form; Messages, Options and Search keep MFL's forms under
// v2's heading. MFL's own nodes move into v2's markup, so its links, fields and buttons keep working;
// the page is marked only once it's done, so a page v2 can't read stays as MFL drew it.

import {esc, initials} from "./html.js";

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
    const quote = head.querySelector("a[href*='quote=1']");
    // only on the member's own posts; MFL's edit page also deletes
    const edit = head.querySelector("a[href*='post_edit']");
    return {
        post,
        team,
        body,
        reply: reply.getAttribute("href"),
        quote: quote ? quote.getAttribute("href") : null,
        edit: edit ? edit.getAttribute("href") : null,
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
            <span class="fuad-post-actions"><a href="${esc(parts.reply)}">Reply</a>${parts.quote ? `<a href="${esc(parts.quote)}">Quote</a>` : ""}${parts.edit ? `<a href="${esc(parts.edit)}">Edit</a>` : ""}</span>
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

// "Sun Oct 18 3:29:08 p.m. CT 2026" → "Oct 18", as Home's list dates a topic
export function dayOnly(text) {
    const match = clean(text).match(/^\w{3} (\w{3} \d{1,2}) /);
    return match ? match[1] : clean(text);
}

// a topic list row's parts, or null
function readTopicRow(row) {
    const cells = row.querySelectorAll(":scope > td");
    const link = cells[0] && cells[0].querySelector("a[href*='topic_show']");
    if (cells.length !== 4 || !link) {
        return null;
    }
    const status = link.querySelector("img[title]");
    const posts = Number(clean(cells[2].textContent).replace(/,/g, ""));
    return {
        href: link.getAttribute("href"),
        title: clean(link.textContent),
        poster: clean(cells[1].textContent),
        posts: Number.isFinite(posts) ? posts : null,
        when: dayOnly(cells[3].textContent),
        unread: Boolean(status && /unread/i.test(status.getAttribute("title")))
    };
}

const BOARD_LINKS = ["topic_add", "message_list", "user_options", "forum_search"];

// MFL's page numbers ("1 2 3", then its previous and next arrows) as {pages, prev, next}; null when
// they hold something else
function readPager(pln) {
    const pages = [];
    let prev = null;
    let next = null;
    for (const node of pln.childNodes) {
        const arrow = node.nodeType === 1 && node.querySelector && (node.tagName === "IMG" ? node : node.querySelector("img"));
        const title = arrow ? arrow.getAttribute("title") || "" : "";
        if (node.nodeType === 3 && !clean(node.textContent)) {
            continue;
        } else if (arrow && /previous/i.test(title)) {
            prev = node.tagName === "A" ? node.getAttribute("href") : null;
        } else if (arrow && /next/i.test(title)) {
            next = node.tagName === "A" ? node.getAttribute("href") : null;
        } else if (node.tagName === "SPAN" && /^\d+$/.test(clean(node.textContent))) {
            pages.push({number: clean(node.textContent), href: null});
        } else if (node.tagName === "A" && /^\d+$/.test(clean(node.textContent))) {
            pages.push({number: clean(node.textContent), href: node.getAttribute("href")});
        } else {
            return null;
        }
    }
    return {pages, prev, next};
}

// true when the board's topic list (MFL's `mb/board_show.pl`) was redrawn. MFL's table and bar stay
// on the page, hidden; a page with anything v2 doesn't know stays MFL's.
export function restyleBoard(doc = document) {
    const bar = doc.querySelector("th.messageboardbar");
    const options = bar && bar.closest("table");
    const cell = options && options.querySelector("td");
    const list = doc.querySelector("table.topiclist");
    const nav = doc.querySelector("span.nav");
    const allRows = list ? [...list.querySelectorAll(":scope > tbody > tr")] : [];
    const rows = allRows.slice(1);
    const topics = rows.map(readTopicRow);
    const link = (name) => {
        const found = cell && cell.querySelector(`:scope > a[href^='${name}']`);
        return found ? {href: found.getAttribute("href"), text: clean(found.textContent)} : null;
    };
    const add = link("topic_add");
    const pln = cell && cell.querySelector(":scope > span.pln");
    const pager = pln ? readPager(pln) : {pages: [], prev: null, next: null};
    const container = list && list.parentElement;
    const known = [nav, options, list];
    const blank = (node) => node.nodeType === 3 && !clean(node.textContent);
    if (!options || !cell || !list || !add || !pager || !allRows.length || !allRows[0].querySelector("th")
        || list.querySelector(":scope > caption, :scope > thead, :scope > tfoot") || topics.some((topic) => !topic) || (nav && nav.children.length)
        || [...cell.childNodes].some((node) => !blank(node) && node !== pln && !(node.tagName === "A" && BOARD_LINKS.some((name) => (node.getAttribute("href") || "").startsWith(name))))
        || [...container.childNodes].some((node) => !blank(node) && !known.includes(node) && node.tagName !== "BR")) {
        return false;
    }
    const messages = link("message_list");
    const unreadMessages = messages && Number((messages.text.match(/\((\d+) New\)/i) || [])[1] || 0);
    const quiet = [
        link("forum_search") && {...link("forum_search"), text: "Search"},
        link("user_options") && {...link("user_options"), text: "Options"},
        messages && {...messages, text: unreadMessages ? `Messages (${unreadMessages} new)` : "Messages"}
    ].filter(Boolean);
    const board = doc.createElement("div");
    board.id = "fuad-topics";
    board.innerHTML = `
        <div class="fuad-topic-head">
            <div class="fuad-topic-title">
                <h2>Message board</h2>
                <nav class="fuad-board-links" aria-label="Message board">${quiet.map((item) => `<a href="${esc(item.href)}">${esc(item.text)}</a>`).join("")}</nav>
            </div>
            <a class="fuad-chip" href="${esc(add.href)}">New topic</a>
        </div>
        <div class="fuad-panel">
            ${topics.length
                ? `<ul class="fuad-rows">${topics.map((topic) => `
                <li><a class="fuad-board-topic${topic.unread ? " fuad-unread" : ""}" href="${esc(topic.href)}">
                    <span class="fuad-row-text">
                        <span class="fuad-row-title">${esc(topic.title)}${topic.unread ? '<span class="fuad-unread-label"> (unread)</span>' : ""}</span>
                        <span class="fuad-meta">${esc(topic.poster)}${topic.posts === null ? "" : ` · ${plural(topic.posts, "post")}`}</span>
                    </span>
                    <span class="fuad-meta">${esc(topic.when)}</span>
                </a></li>`).join("")}</ul>`
                : '<p class="fuad-muted fuad-empty">No topics yet.</p>'}
        </div>
        ${pager.pages.length > 1 ? `
        <nav class="fuad-board-pages" aria-label="Pages">
            ${pager.prev ? `<a href="${esc(pager.prev)}">‹ Previous</a>` : ""}
            ${pager.pages.map((page) => (page.href ? `<a href="${esc(page.href)}">${esc(page.number)}</a>` : `<span aria-current="page">${esc(page.number)}</span>`)).join("")}
            ${pager.next ? `<a href="${esc(pager.next)}">Next ›</a>` : ""}
        </nav>` : ""}`;
    options.before(board);
    doc.documentElement.classList.add("fuad-board");
    return true;
}

// MFL's formatting buttons by the tag they insert, as v2 labels them; the smileys are left out
const FORMATS = {b: "B", i: "I", tt: "tt", "url=": "Link", img: "Image", video: "Video"};

// true when the reply or new topic page (MFL's `mb/topic_add.pl`) was restyled; a new topic's form
// is the reply's with a subject
export function restyleReply(doc = document) {
    const form = doc.querySelector("form.rpl, form[action='topic_add.pl']");
    const up = doc.querySelector("span.nav a[href*='topic_show'], span.nav a[href*='board_show']");
    const bars = [...doc.querySelectorAll("th.messageboardbar")].map((th) => th.closest("table"));
    const body = form && form.querySelector("textarea[name=body]");
    const post = form && form.querySelector("input[type=submit][name=add]");
    const preview = form && form.querySelector("input[type=submit][name=preview]");
    const notify = form && form.querySelector("input[type=checkbox][name=notify]");
    const subject = form && form.querySelector("input[type=text][name=subject]");
    if (!form || !up || !bars.length || bars.some((table) => !table) || !body || !post || !preview) {
        return false;
    }
    // a field v2 doesn't know would be lost, so such a form stays MFL's
    const known = [subject, body, post, preview, notify].filter(Boolean);
    if ([...form.querySelectorAll("input:not([type=hidden]), textarea, select, button:not(.tbt)")].some((field) => !known.includes(field))) {
        return false;
    }
    const formats = [...form.querySelectorAll("button.tbt")].map((button) => {
        const tag = ((button.getAttribute("onclick") || "").match(/insertTags\("([^"]+)"/) || [])[1];
        return tag && FORMATS[tag] ? {button, label: FORMATS[tag]} : null;
    }).filter(Boolean);
    const others = [...doc.querySelectorAll("div.frm")].filter((frm) => !form.contains(frm));
    const heading = (frm) => clean((frm.querySelector(".hcl") || {}).textContent);
    const answered = others.find((frm) => /^In Response to/i.test(heading(frm)));
    // Preview's copy of the post: a reply's in a box after the form, a new topic's loose after it
    const boxed = others.find((frm) => /^Preview$/i.test(heading(frm)));
    const after = [];
    for (let node = form.nextSibling; node; node = node.nextSibling) {
        after.push(node);
    }
    const firstAfter = after.find((node) => node.nodeType === 1 || clean(node.textContent));
    const loose = subject && firstAfter && firstAfter.tagName === "B" && /^Preview$/i.test(clean(firstAfter.textContent))
        ? after.slice(after.indexOf(firstAfter) + 1) : null;
    const looseBreak = loose && loose[0] && loose[0].tagName === "BR" ? loose.shift() : null;
    const kept = [answered, boxed, loose && firstAfter, looseBreak, ...(loose || [])].filter(Boolean);
    // anything else isn't part of the drawn page, so it stays MFL's
    if (others.some((frm) => !kept.includes(frm)) || after.some((node) => !kept.includes(node) && (node.nodeType === 1 || clean(node.textContent)))) {
        return false;
    }
    if (boxed && !boxed.querySelector(".ccl")) {
        return false;
    }
    const previewNodes = loose || (boxed ? [...boxed.querySelector(".ccl").childNodes] : null);
    const answeredText = answered && answered.querySelector(".ccl");
    const topic = clean([...bars[0].querySelector("th.messageboardbar").childNodes].filter((node) => !(node.classList && node.classList.contains("htt"))).map((node) => node.textContent).join(" "));

    const header = doc.createElement("div");
    header.className = "fuad-reply-head";
    header.innerHTML = subject
        ? `<a href="${esc(up.getAttribute("href"))}">‹ Message board</a><h2>New topic</h2>`
        : `<a href="${esc(up.getAttribute("href"))}">‹ ${esc(topic || "Back to the topic")}</a><h2>Reply</h2>`;
    let answeredCard = null;
    if (answered && answeredText) {
        answeredCard = doc.createElement("article");
        answeredCard.className = "fuad-reply-to";
        answeredCard.innerHTML = `<span class="fuad-label"></span><div class="fuad-post-text"></div>`;
        answeredCard.querySelector(".fuad-label").textContent = `In response to ${clean(answered.querySelector(".hcl").textContent.replace(/In Response to/i, ""))}`;
        answeredCard.querySelector(".fuad-post-text").append(...answeredText.childNodes);
    }
    let previewCard = null;
    if (previewNodes) {
        previewCard = doc.createElement("article");
        previewCard.className = "fuad-reply-to fuad-reply-shown";
        previewCard.innerHTML = `<span class="fuad-label">Preview</span><div class="fuad-post-text"></div>`;
        previewCard.querySelector(".fuad-post-text").append(...previewNodes);
    }
    const fields = doc.createElement("div");
    fields.className = "fuad-reply-form";
    fields.innerHTML = `${subject ? '<label class="fuad-reply-text fuad-reply-subject"><span class="fuad-label">Subject</span></label>' : ""}<div class="fuad-reply-formats" role="group" aria-label="Formatting"></div><label class="fuad-reply-text fuad-reply-body"><span class="fuad-label">${subject ? "Message" : "Your reply"}</span></label><div class="fuad-reply-buttons"></div>`;
    if (subject) {
        fields.querySelector(".fuad-reply-subject").append(subject);
    }
    formats.forEach(({button, label}) => {
        button.textContent = label;
        button.dataset.format = label;
        fields.querySelector(".fuad-reply-formats").append(button);
    });
    fields.querySelector(".fuad-reply-body").append(body);
    const buttons = fields.querySelector(".fuad-reply-buttons");
    if (notify) {
        const label = doc.createElement("label");
        label.className = "fuad-reply-notify";
        label.append(notify, " Email me replies");
        buttons.append(label);
    }
    preview.classList.add("fuad-reply-preview");
    post.classList.add("fuad-reply-post");
    // Post stays the form's first button, so Enter in Subject posts as on MFL's page; CSS shows Preview first
    buttons.append(post, preview);
    fields.append(...form.querySelectorAll("input[type=hidden]"));

    form.replaceChildren(fields);
    form.classList.add("fuad-compose");
    form.before(header);
    if (answeredCard) {
        form.before(answeredCard);
        answered.remove();
    }
    if (previewCard) {
        form.before(previewCard);
        if (boxed) {
            boxed.remove();
        } else {
            firstAfter.remove();
            if (looseBreak) {
                looseBreak.remove();
            }
        }
    }
    bars.forEach((table) => table.classList.add("fuad-topic-bar"));
    doc.documentElement.classList.add("fuad-reply");
    return true;
}

// the board's side pages, each titled as v2 names it; Send Message's form goes back to Messages
const SIDE_PAGES = {message_list: "Messages", message_add: "New message", user_options: "Options", forum_search: "Search"};
// what each page holds when MFL draws it as v2 has seen it; a preview or error page doesn't match
const SIDE_CONTENT = {
    message_list: "table.report",
    message_add: "form.msa",
    user_options: "form[action='user_options.pl']",
    forum_search: "form.sea"
};
const BAR_LINKS = {message_add: "New message"};

// true when one of the board's side pages (`mb/message_list.pl` …) was restyled: MFL's bar and up
// arrow become a back link and a title, its forms and tables stay
export function restyleSidePage(page, boardHref, doc = document) {
    const title = SIDE_PAGES[page];
    const bar = doc.querySelector("th.messageboardbar");
    const table = bar && bar.closest("table");
    const nav = doc.querySelector("span.nav");
    const up = nav && nav.querySelector("a[href]");
    const container = table && table.parentElement;
    const expected = (child) => child === nav || child === table || child.tagName === "BR" || child.matches(SIDE_CONTENT[page])
        || (page === "forum_search" && child.matches("table.report.nocaption"));
    if (!title || !table || !nav || !container || !container.querySelector(`:scope > ${SIDE_CONTENT[page]}`)
        || [...container.childNodes].some((node) => (node.nodeType === 1 ? !expected(node) : clean(node.textContent)))) {
        return false;
    }
    const links = [...table.querySelectorAll("a.messageboardlink[href]")].map((link) => {
        const name = (link.getAttribute("href").match(/^(\w+)\.pl/) || [])[1];
        return {href: link.getAttribute("href"), text: BAR_LINKS[name] || clean(link.textContent)};
    });
    const toMessages = up && /^message_list\.pl/.test(up.getAttribute("href"));
    const header = doc.createElement("div");
    header.className = "fuad-topic-head fuad-side-head";
    header.innerHTML = `
        <div class="fuad-topic-title">
            <a class="fuad-side-back" href="${esc(toMessages ? up.getAttribute("href") : boardHref)}">‹ ${toMessages ? "Messages" : "Message board"}</a>
            <h2>${esc(title)}</h2>
        </div>
        ${links.map((link) => `<a class="fuad-chip" href="${esc(link.href)}">${esc(link.text)}</a>`).join("")}`;
    nav.before(header);
    table.classList.add("fuad-topic-bar");
    doc.documentElement.classList.add("fuad-side");
    return true;
}
