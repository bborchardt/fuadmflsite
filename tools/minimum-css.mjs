// v2's stylesheet as a browser at the minimum (docs/design.md: Devices) reads it, so layout.py --minimum
// can draw v2 without what's newer, and a page that needs one of those extras shows up. Only what the
// stylesheet marks as newer (a stylelint disable comment, stylelint.config.mjs) is looked at, and only
// what such a browser drops goes: a declaration of a newer property, a rule whose selector it can't
// read (whole, as a browser drops it), an @supports block it fails. A mark that's a false alarm (a
// simple :not(), a font fallback list) leaves its rule as it is.
//
//   node tools/minimum-css.mjs < site/v2/fuad.css > minimum.css
import postcss from "postcss";

const MARK = /^stylelint-disable(-next-line)?\s+(plugin\/no-unsupported-browser-features|property-disallowed-list|function-disallowed-list)\b/;
// past the minimum: selectors a browser can't read, properties and functions it ignores
const SELECTORS = /:has\(|:focus-visible/;
const PROPERTIES = /^(scrollbar-width|scrollbar-color|overscroll-behavior(-[xy])?|resize|accent-color|aspect-ratio|container(-type|-name)?|text-wrap(-style)?|content-visibility|field-sizing)$/;
const FUNCTIONS = /\b(color-mix|light-dark|oklch|oklab|lab|lch)\(/;
const SUPPORTS = /subgrid|:has\(|container/;

const newer = (decl) => PROPERTIES.test(decl.prop) || FUNCTIONS.test(decl.value);

// what a browser at the minimum drops of `node`: the nodes to take out
function dropped(node) {
    if (node.type === "decl") {
        return newer(node) ? [node] : [];
    }
    if (node.type === "rule") {
        return SELECTORS.test(node.selector) ? [node] : node.nodes.filter((child) => child.type === "decl" && newer(child));
    }
    if (node.type === "atrule" && node.name === "supports") {
        return SUPPORTS.test(node.params) ? [node] : [];
    }
    return [];
}

export function minimumCss(css) {
    const root = postcss.parse(css);
    const gone = [];
    root.walkComments((comment) => {
        const mark = comment.text.match(MARK);
        if (!mark) {
            return;
        }
        if (mark[1]) {
            if (comment.next()) {
                gone.push(...dropped(comment.next()));
            }
            return;
        }
        // a block: everything up to its stylelint-enable
        for (let node = comment.next(); node && !(node.type === "comment" && /^stylelint-enable\b/.test(node.text)); node = node.next()) {
            gone.push(...dropped(node));
        }
    });
    gone.forEach((node) => node.remove());
    return {css: root.toString(), removed: gone.map((node) => (node.type === "decl" ? `${node.prop}: ${node.value}` : node.selector || `@${node.name} ${node.params}`))};
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const chunks = [];
    for await (const chunk of process.stdin) {
        chunks.push(chunk);
    }
    const {css, removed} = minimumCss(Buffer.concat(chunks).toString("utf8"));
    process.stdout.write(css);
    process.stderr.write(`taken out:\n${removed.map((what) => `  ${what.replace(/\s+/g, " ").slice(0, 100)}`).join("\n")}\n`);
}
