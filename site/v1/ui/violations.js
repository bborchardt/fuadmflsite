// The "Roster and Salary Cap Violations" box at the top of the Main tab.

import {esc, fragment} from "./html.js";
import {INJURY_CHECK_LAST_WEEK, ROSTER_CHECK_LAST_WEEK, ROSTER_MAX, ROSTER_MIN, SALARY_CAP} from "../lib/rules.js";

export function ruleViolations(league) {
    const warnings = [];
    const week = Number(league.week);
    for (const franchise of league.franchises.values()) {
        if (franchise.salary > SALARY_CAP) {
            warnings.push(`${franchise.teamName} is over the salary cap with a total salary of ${franchise.salary}!`);
        }
        if (week <= ROSTER_CHECK_LAST_WEEK && franchise.numPlayers > ROSTER_MAX) {
            warnings.push(`${franchise.teamName} is over the roster limit with ${franchise.numPlayers} players!`);
        }
        if (week <= ROSTER_CHECK_LAST_WEEK && franchise.numPlayers < ROSTER_MIN) {
            warnings.push(`${franchise.teamName} is under the roster limit with ${franchise.numPlayers} players!`);
        }
        if (week <= INJURY_CHECK_LAST_WEEK) {
            for (const player of franchise.lineup.filter((starter) => starter.injured)) {
                warnings.push(`${franchise.teamName} started injured/suspended player ${player.fullName} in week ${league.week}!`);
            }
        }
    }
    return warnings;
}

/** Put the violations box at the top of the Main tab's first column (MFL's #tabcontent0). */
export function renderViolations(league) {
    const column = document.querySelector("#tabcontent0 #homepagecolumn1");
    if (!column) {
        return;
    }
    const warnings = ruleViolations(league);
    const items = warnings.length
        ? warnings.map((warning) => `<li><span class="warning">${esc(warning)}</span></li>`).join("")
        : "<li>No violations found.</li>";
    column.prepend(fragment(`
    <table class="homepagemodule report" cellspacing="1" align="center">
        <caption><span>Roster and Salary Cap Violations</span></caption>
        <tbody><tr class="oddtablerow"><td><ul>${items}</ul></td></tr></tbody>
    </table>`));
}
