// Reads MFL's two rules pages: League Rules (`options?O=09`, the scoring tables) and League Settings
// (`options?O=26`, MFL's settings in groups, then the commissioner's own rules in "Additional League
// Rules Setup"). Nothing is reworded: v2 only lays them out. MFL's markup leaves rows and cells
// unclosed, so cells are read in order rather than by row.

const BYLAWS_TITLE = /^additional league rules/i;

const text = (node) => String(node ? node.textContent : "").replace(/[\s\u00a0]+/g, " ").trim();

// the cells of a table, not those of a table inside one
const ownCells = (table) => [...table.querySelectorAll("td")].filter((cell) => cell.closest("table") === table);

// `{title, rows: [{event, range, points}]}` per table, and MFL's "last modified" line; null when the
// page has no scoring tables
export function readScoring(doc) {
    const groups = [...doc.querySelectorAll("table.report")]
        .filter((table) => table.querySelector("td.event"))
        .map((table) => ({
            title: text(table.querySelector("caption")).replace(/^rules for\s+/i, ""),
            rows: [...table.querySelectorAll("td.event")].map((cell) => {
                const row = cell.parentElement;
                return {event: text(cell), range: text(row.querySelector("td.range")), points: text(row.querySelector("td.points"))};
            })
        }));
    if (!groups.length) {
        return null;
    }
    const modified = text(doc.querySelector(".reportnavigation")).replace(/^.*last modified:\s*/i, "");
    return {groups, modified};
}

// A setting's value: its text, or a list (Franchise Abilities, the waiver calendar's events), with
// a mail or web link kept
function valueOf(cell) {
    const nested = cell.querySelector("table");
    if (nested) {
        const rows = [...nested.querySelectorAll("tr")].filter((row) => row.querySelector("td"));
        const heads = [...nested.querySelectorAll("th")].map(text);
        return rows.map((row) => ({text: [...row.querySelectorAll("td")].map((td, i) => (/^repeat/i.test(heads[i] || "") && text(td) ? `repeats ${text(td)}` : text(td))).filter(Boolean).join(" · ")}));
    }
    const link = cell.querySelector("a[href]");
    const href = link && link.getAttribute("href");
    return [{text: text(cell), href: href && /^(mailto:|https?:)/i.test(href) ? href : null}];
}

// The commissioner's rules: a section per bold paragraph ("1. Playoffs"), a rule per list item, its
// number the item's leading bold text and its depth the number's parts ("2.6.1." under "2.6.").
// Rules written outside any list are kept as rules without a number.
function readBylaws(cell) {
    const sections = [];
    const current = () => {
        if (!sections.length) {
            sections.push({title: "", rules: []});
        }
        return sections[sections.length - 1];
    };
    for (const node of cell.querySelectorAll("p, li")) {
        if (node.tagName === "P") {
            const words = text(node);
            if (!words || node.closest("li")) {
                continue;
            }
            const bold = node.querySelector("b, strong");
            if (bold && text(bold) === words) {
                sections.push({title: words, rules: []});
            } else {
                current().rules.push({number: "", text: words, depth: 0});
            }
            continue;
        }
        // the item's own words, without its sub-list
        const own = node.cloneNode(true);
        own.querySelectorAll("ul, ol").forEach((list) => list.remove());
        const first = own.querySelector("b, strong");
        const words = text(own);
        const number = first && words.startsWith(text(first)) && /^\d+(\.\d+)*\.?$/.test(text(first)) ? text(first) : "";
        if (words) {
            current().rules.push({
                number,
                text: number ? words.slice(number.length).trim() : words,
                depth: number ? Math.max(0, number.replace(/\.$/, "").split(".").length - 2) : 0
            });
        }
    }
    return sections.filter((section) => section.title || section.rules.length);
}

// `{settings: [{title, rows: [{label, values}]}], bylaws: [{title, rules}]}`; null when the page has
// no settings tables
export function readSettings(doc) {
    const settings = [];
    let bylaws = [];
    for (const table of doc.querySelectorAll("table.rulestable")) {
        const title = text(table.querySelector("th"));
        if (BYLAWS_TITLE.test(title)) {
            const cell = ownCells(table)[0];
            bylaws = cell ? readBylaws(cell) : [];
            continue;
        }
        const rows = [];
        const cells = ownCells(table);
        for (let i = 0; i < cells.length; i += 1) {
            const cell = cells[i];
            const next = cells[i + 1];
            if (cell.classList.contains("inputlabel")) {
                // a setting whose value MFL left out of its cell ("Track Contract Year" with no value cell)
                const value = next && !next.classList.contains("inputlabel") ? valueOf(next) : [];
                rows.push({label: text(cell).replace(/:$/, ""), values: value.filter((item) => item.text)});
                if (next && !next.classList.contains("inputlabel")) {
                    i += 1;
                }
            } else if (!text(cell) && next && rows.length) {
                // a blank first cell continues the setting above (Franchise Abilities' list)
                rows[rows.length - 1].values.push(...valueOf(next).filter((item) => item.text));
                i += 1;
            }
        }
        if (title) {
            settings.push({title, rows});
        }
    }
    return settings.length || bylaws.length ? {settings, bylaws} : null;
}

// MFL's kicker lines name the distance in the range column: "Field goal 0–39 yds"
export function scoringLine(row) {
    return /^length of field goal made$/i.test(row.event) && row.range
        ? {event: `Field goal ${row.range.replace("-", "–")} yds`, points: row.points}
        : {event: row.event, points: row.points};
}

// The page's sections, in order: Scoring, the bylaws' sections, then MFL's settings groups. Each is
// `{key, group, title, items}`, an item `{kind, …, words}` where `words` is what the filter searches.
export function ruleSections({scoring, settings}) {
    const sections = [];
    if (scoring) {
        sections.push({key: "scoring", group: "", title: "Scoring", modified: scoring.modified, items: scoring.groups.flatMap((group) => [
            {kind: "subhead", text: group.title, words: ""},
            ...group.rows.map((row) => {
                const line = scoringLine(row);
                // the group's positions are searched too ("TE")
                return {kind: "score", event: line.event, points: line.points, words: `${group.title} ${line.event} ${line.points}`};
            })
        ])});
    }
    if (settings) {
        settings.bylaws.forEach((section, i) => sections.push({key: `bylaws-${i}`, group: "Bylaws", title: section.title || "Bylaws",
            items: section.rules.map((rule) => ({kind: "rule", ...rule, words: `${rule.number} ${rule.text}`}))}));
        settings.settings.forEach((group, i) => sections.push({key: `settings-${i}`, group: "League settings", title: group.title,
            items: group.rows.map((row) => ({kind: "setting", ...row, words: `${row.label} ${row.values.map((value) => value.text).join(" ")}`}))}));
    }
    return sections;
}

// the items matching `query` (any case), by section, each under its subhead (which positions a
// scoring line is for); every item without one
export function matching(sections, query) {
    const q = query.trim().toLowerCase();
    return sections.map((section) => {
        if (!q) {
            return {...section, shown: section.items, count: null};
        }
        const shown = [];
        let subhead = null;
        let count = 0;
        for (const item of section.items) {
            if (item.kind === "subhead") {
                subhead = item;
            } else if (item.words.toLowerCase().includes(q)) {
                if (subhead) {
                    shown.push(subhead);
                    subhead = null;
                }
                shown.push(item);
                count += 1;
            }
        }
        return {...section, shown, count};
    });
}
