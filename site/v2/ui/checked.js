// An export a check or form relies on is held to lib/shapes.js, as the job's are: one MFL has changed
// fails as one that couldn't load does (Moves' "Couldn't check", a form's error), and is logged once
// a page (docs/design.md: Outside change).

import {MflError} from "../lib/mfl.js";
import {checkShape, markMissing} from "../lib/shapes.js";
import {pageChanged} from "./panel.js";

const logged = new Set();

// fetchExport's `check`, for a check or a form
export function strict(section, body) {
    try {
        return checkShape(section, body);
    } catch (error) {
        if (error.changed && !logged.has(section)) {
            logged.add(section);
            // the item and field, as lenient's are
            pageChanged(`${section} export`, error.message.split("export has changed: ")[1] || "");
        }
        throw error;
    }
}

// A `catch` for an export a check does without when MFL can't give it, but not when MFL has changed it
export const unlessChanged = (fallback) => (error) => {
    if (error && error.changed) {
        throw error;
    }
    return fallback;
};

// fetchExport's `check`, for a display panel: an item missing a field has it set to null, shown as
// "—" (lib/shapes.js markMissing); one whose every item is, or one missing which item it is, fails
// as a change does. Logged once a page, with the first item and field, for the commissioner.
export function lenient(section, body) {
    const {problem, every} = markMissing(section, body);
    if (problem && !logged.has(section)) {
        logged.add(section);
        pageChanged(`${section} export`, problem);
    }
    if (every) {
        throw Object.assign(new MflError(section, `MFL's export has changed: ${problem}`), {changed: true});
    }
    return body;
}
