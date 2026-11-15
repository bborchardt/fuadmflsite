// An export a check or form relies on is held to lib/shapes.js, as the job's are: one MFL has changed
// fails as one that couldn't load does (Moves' "Couldn't check", a form's error), and is logged once
// a page (docs/design.md: Outside change).

import {checkShape} from "../lib/shapes.js";
import {pageChanged} from "./panel.js";

const logged = new Set();

// fetchExport's `check`, for a check or a form
export function strict(section, body) {
    try {
        return checkShape(section, body);
    } catch (error) {
        if (error.changed && !logged.has(section)) {
            logged.add(section);
            pageChanged(`${section} export`);
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
