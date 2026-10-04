// The "League Alerts" box at the top of the Main tab. The rules themselves
// are in lib/violations.js, shared with the daily job.

import {esc, fragment} from "./html.js";
import {ruleViolations} from "../lib/violations.js";

/** Put the violations box at the top of the Main tab's first column (MFL's #tabcontent0). */
export function renderViolations(league) {
    const column = document.querySelector("#tabcontent0 #homepagecolumn1");
    if (!column) {
        return;
    }
    const items = ruleViolations(league, {pendingAdds: league.pendingAdds || []});
    const list = items.length
        ? items.map((item) => item.warning
            ? `<li><span class="warning">${esc(item.text)}</span></li>`
            : `<li>${esc(item.text)}</li>`).join("")
        : "<li>All clear.</li>";
    column.prepend(fragment(`
    <table class="homepagemodule report" cellspacing="1" align="center">
        <caption><span>League Alerts</span></caption>
        <tbody><tr class="oddtablerow"><td><ul>${list}</ul></td></tr></tbody>
    </table>`));
}
