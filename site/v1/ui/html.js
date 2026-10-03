// Tiny helpers for building markup with template strings.

const entities = {"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#x27;", "`": "&#x60;", "=": "&#x3D;"};

/** Escape text for HTML (the same characters Handlebars escaped, so output matches the old site). */
export function esc(value) {
    return String(value === undefined || value === null ? "" : value).replace(/[&<>"'`=]/g, (c) => entities[c]);
}

/** Alternating MFL row classes, starting with an odd row. */
export function rowStriper() {
    let odd = false;
    return () => {
        odd = !odd;
        return odd ? "oddtablerow" : "eventablerow";
    };
}

/** Parse markup into a fragment. */
export function fragment(markup) {
    const template = document.createElement("template");
    template.innerHTML = markup;
    return template.content;
}
