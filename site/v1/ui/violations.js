import {esc, fragment} from "./html.js";
import {ruleViolations} from "../lib/violations.js";
import {withParam} from "../loader.js";

// Draws the box, or redraws it in place once `readings` load. Returns whether this page has it.
export function renderViolations(league, readings, beta) {
    const column = document.querySelector("#tabcontent0 #homepagecolumn1");
    if (!column) {
        return false;
    }
    const items = ruleViolations(league, {pendingAdds: league.pendingAdds || [], readings});
    const list = items.length
        ? items.map((item) => item.warning
            ? `<li><span class="warning">${esc(item.text)}</span></li>`
            : `<li>${esc(item.text)}</li>`).join("")
        : "<li>All clear.</li>";
    const invite = beta
        ? `<li class="fuad-beta-invite">A new version of the league site is in beta. <a href="${esc(withParam(window.location.href, "fuadBeta", "on"))}">Try it</a></li>`
        : "";
    const box = fragment(`
    <table id="fuad-alerts" class="homepagemodule report" cellspacing="1" align="center">
        <caption><span>League Alerts</span></caption>
        <tbody><tr class="oddtablerow"><td><ul>${invite}${list}</ul></td></tr></tbody>
    </table>`);
    const drawn = document.getElementById("fuad-alerts");
    if (drawn) {
        drawn.replaceWith(box);
    } else {
        column.prepend(box);
    }
    return true;
}
