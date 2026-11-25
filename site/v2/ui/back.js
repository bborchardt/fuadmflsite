// A screen shown again refreshes what it shows, once that's older than MFL's answers are kept for
// moves (MOVES_KEPT): its section tapped, the page's other view it was hidden behind left for it, the
// app or tab come back to, or Back to it from the browser's cache (docs/design.md). Nothing runs
// while it's away, and a screen in view refreshes only as its own polling does.

import {onSectionTap} from "./kept.js";
import {MOVES_KEPT} from "./page-fetch.js";

// `showing()`: whether the screen is the one in view. `section`: its section's name. `refresh()`
// redraws it from MFL, keeping what's shown until the new answer is in.
export function onBack({showing, section, refresh, after = MOVES_KEPT}) {
    let drawnAt = Date.now();
    let wasShowing = showing();
    const back = () => {
        if (showing() && Date.now() - drawnAt >= after) {
            drawnAt = Date.now();
            refresh();
        }
    };
    onSectionTap(section, back);
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            back();
        }
    });
    window.addEventListener("pageshow", (event) => {
        if (event.persisted) {
            back();
        }
    });
    // the frame marks the view in view on the page's root (`fuad-home-on`) as the # changes
    new MutationObserver(() => {
        const now = showing();
        if (now && !wasShowing) {
            back();
        }
        wasShowing = now;
    }).observe(document.documentElement, {attributes: true, attributeFilter: ["class"]});
}
