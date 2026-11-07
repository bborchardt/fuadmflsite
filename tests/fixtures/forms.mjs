// linkedom has no `form.elements` or `field.form`, which MFL's pages are read by. Its parser keeps a
// form's fields inside the <form>, even where MFL opens one inside a table row (a browser ties them
// to it as the form last opened), so here a form's fields are the ones within it.
export function withForms(document) {
    for (const form of document.querySelectorAll("form")) {
        const fields = [...form.querySelectorAll("input, select, textarea, button")];
        const elements = [...fields];
        for (const field of fields) {
            const name = field.getAttribute("name");
            if (name && !(name in elements)) {
                elements[name] = field;
            }
            Object.defineProperty(field, "form", {value: form, configurable: true});
        }
        Object.defineProperty(form, "elements", {value: elements, configurable: true});
    }
    return document;
}
