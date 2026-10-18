const entities = {"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#x27;", "`": "&#x60;", "=": "&#x3D;"};

// the characters Handlebars escaped, so output matches the old site
export function esc(value) {
    return String(value === undefined || value === null ? "" : value).replace(/[&<>"'`=]/g, (c) => entities[c]);
}

export function rowStriper() {
    let odd = false;
    return () => {
        odd = !odd;
        return odd ? "oddtablerow" : "eventablerow";
    };
}

export function fragment(markup) {
    const template = document.createElement("template");
    template.innerHTML = markup;
    return template.content;
}

// "All Hands on Beck" → "AH"
export function initials(name) {
    return String(name || "").split(/\s+/).filter((word) => /^[A-Za-z0-9]/.test(word)).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}
