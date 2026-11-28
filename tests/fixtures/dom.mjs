// A page as the tests read it, through jsdom, the job's parser too (REVIEW.md: one DOM parser). Its
// scripts don't run, and it's a page in view (`document.hidden` false), as a member's is.
import {JSDOM} from "jsdom";

// {window, document} for `html`, at `url` (where window.location says it is)
export function parseHTML(html, {url} = {}) {
    const {window} = new JSDOM(html, {pretendToBeVisual: true, ...(url ? {url} : {})});
    return {window, document: window.document};
}

export const {DOMParser} = new JSDOM("").window;
