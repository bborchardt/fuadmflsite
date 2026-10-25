// Rules' markup (rules.js draws it): the sections in order, each folding open, with what the filter
// matched shown and marked.

import {esc} from "./html.js";

const CHEVRON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>';

// `words` escaped, with each match of `query` (any case) marked
export function marked(words, query) {
    const q = query.trim();
    if (!q) {
        return esc(words);
    }
    const lower = words.toLowerCase();
    const find = q.toLowerCase();
    let out = "";
    let at = 0;
    for (let hit = lower.indexOf(find); hit >= 0; hit = lower.indexOf(find, at)) {
        out += `${esc(words.slice(at, hit))}<mark>${esc(words.slice(hit, hit + find.length))}</mark>`;
        at = hit + find.length;
    }
    return out + esc(words.slice(at));
}

function itemMarkup(item, query) {
    if (item.kind === "subhead") {
        return `<h4 class="fuad-label fuad-rules-subhead">${esc(item.text)}</h4>`;
    }
    if (item.kind === "score") {
        return `<div class="fuad-rules-score"><span>${marked(item.event, query)}</span><span class="fuad-rules-points">${marked(item.points, query)}</span></div>`;
    }
    if (item.kind === "rule") {
        return `<div class="fuad-rule fuad-rule-depth-${Math.min(item.depth, 3)}">${item.number ? `<span class="fuad-rule-number">${marked(item.number, query)}</span>` : ""}<span class="fuad-rule-text">${marked(item.text, query)}</span></div>`;
    }
    const values = item.values.map((value) => (value.href
        ? `<a href="${esc(value.href)}">${marked(value.text, query)}</a>`
        : `<span>${marked(value.text, query)}</span>`)).join("");
    return `<div class="fuad-setting"><span class="fuad-setting-label">${marked(item.label, query)}</span><span class="fuad-setting-value">${values || '<span class="fuad-muted">—</span>'}</span></div>`;
}

// `sections` from matching(): with a filter, only those with a match, open; without, `opened` keys open
export function rulesMarkup(sections, {query = "", opened = new Set()} = {}) {
    const filtering = Boolean(query.trim());
    const shown = filtering ? sections.filter((section) => section.count) : sections;
    if (!shown.length) {
        return '<p class="fuad-muted fuad-empty">No rule matches.</p>';
    }
    let group = "";
    return shown.map((section) => {
        const label = section.group && section.group !== group ? `<h3 class="fuad-label fuad-rules-group">${esc(section.group)}</h3>` : "";
        group = section.group;
        const open = filtering || opened.has(section.key);
        const modified = section.modified && !filtering ? `<p class="fuad-meta fuad-rules-modified">Last modified ${esc(section.modified)}</p>` : "";
        return `${label}<details class="fuad-rules-section" data-key="${esc(section.key)}"${open ? " open" : ""}>
            <summary><span class="fuad-rules-title">${esc(section.title)}</span>${filtering ? `<span class="fuad-meta fuad-rules-count">${section.count}</span>` : ""}<span class="fuad-chev">${CHEVRON}</span></summary>
            <div class="fuad-rules-body">${section.shown.map((item) => itemMarkup(item, query)).join("")}${modified}</div>
        </details>`;
    }).join("");
}
