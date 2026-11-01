import {esc} from "./html.js";

// A test league can't be taken for a real one, and its commissioner sees what's in force. A value set
// in the header that can't be used is named, as otherwise a test would seem to have failed.
export function testLeagueNote(status, values, commish) {
    if (!status.test) {
        return "";
    }
    const parts = commish ? [
        status.base ? `${status.baseName}’s rules` : `default rules: $${values.salaryCap} cap, ${values.roster.min}–${values.roster.max} players`,
        ...status.changes.filter((change) => change.path !== "wordmark").map((change) => `${change.path} ${JSON.stringify(change.value)}`),
        ...status.problems.map((problem) => `ignored: ${problem}`)
    ] : [];
    return `<p class="fuad-test-league">Test league${parts.length ? `: ${esc(parts.join("; "))}` : ""}</p>`;
}
