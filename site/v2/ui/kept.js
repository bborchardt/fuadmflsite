// What a screen shows (Scores' week, Players' filters, Draft's open rounds) as each way to it expects
// (docs/design.md): its section's link starts it afresh, its tab finds it as it was left, and Back
// returns to it as it was left, from its own history entry, even after another page.

const SECTION = "fuad-section";

// the screen's state as it was left in this history entry, if it was
export function keptHere(key) {
    const state = window.history.state;
    return (state && state.fuadKept && state.fuadKept[key]) || null;
}

export function keepHere(key, value) {
    const state = window.history.state || {};
    try {
        window.history.replaceState({...state, fuadKept: {...(state.fuadKept || {}), [key]: value}}, "");
    } catch (error) {
        // Safari throws past ~100 a short while: Back then finds the screen as its tab would
    }
}

// the frame's section links (Home, Lineup, League, Moves, Rosters), as they're tapped
export function sectionTapped(name) {
    window.dispatchEvent(new CustomEvent(SECTION, {detail: name}));
}

export function onSectionTap(name, reset) {
    window.addEventListener(SECTION, (event) => {
        if (event.detail === name) {
            reset();
        }
    });
}
