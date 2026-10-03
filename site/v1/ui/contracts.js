// The Contracts tab: every rostered player's contract, the cap penalty calculator,
// rookie salaries and franchise salaries.

import {esc, rowStriper} from "./html.js";
import {POSITIONS, ROOKIE_PICKS_SHOWN, FRANCHISE_PLAYER_COUNT, capPenalty, franchiseSalary, positionOrder, rookieSalary} from "../lib/rules.js";

// Same key the old site used, so members keep their "Group Players By Year" choice.
const groupByYearKey = (season) => "playersByContractYearChecked" + season;

// Plain < and > comparison, as the old site sorted names.
function compareText(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}

function playerTable(title, players) {
    const rowClass = rowStriper();
    return `
    <table align="center" cellspacing="1" class="homepagemodule report">
        <caption><span>${esc(title)}</span></caption>
        <tbody>
        <tr>
            <th class="player">Player</th>
            <th>Position</th>
            <th class="salary">Salary</th>
            <th class="contractyear">Years</th>
            <th class="salary">Cap Penalty (if waived)</th>
            <th class="salary">Net Cap Space (if waived)</th>
            <th>Franchise</th>
        </tr>
        ${players.map((player) => `
            <tr class="${rowClass()}">
                <td class="player">${esc(player.fullName)}</td>
                <td>${esc(player.nflPosition)}</td>
                <td class="salary">$${esc(player.salary)}</td>
                <td class="contractyear">${esc(player.years)}</td>
                <td class="salary">$${esc(player.capPenalty)}</td>
                <td class="salary">$${esc(player.netCapSpace)}</td>
                <td>${esc(player.franchise ? player.franchise.teamName : "")}</td>
            </tr>`).join("")}
        </tbody>
    </table>`;
}

function playersByYearTables(rosteredPlayers) {
    const byYear = new Map();
    for (const player of rosteredPlayers) {
        const key = String(player.years);
        if (!byYear.has(key)) {
            byYear.set(key, []);
        }
        byYear.get(key).push(player);
    }
    return [...byYear.keys()].sort().map((year) => {
        const players = byYear.get(year).slice().sort((a, b) =>
            positionOrder(a.nflPosition) - positionOrder(b.nflPosition)
            || b.salary - a.salary
            || compareText(a.fullName, b.fullName));
        return playerTable(Number(year) === 0 ? "Restricted Free Agents" : `${year} Year Players`, players);
    }).join("");
}

function allPlayersTable(rosteredPlayers) {
    const players = rosteredPlayers.slice().sort((a, b) =>
        positionOrder(a.nflPosition) - positionOrder(b.nflPosition)
        || b.salary - a.salary
        || b.years - a.years
        || compareText(a.fullName, b.fullName));
    return playerTable("Rostered Players", players);
}

function rookieTable() {
    const rowClass = rowStriper();
    const rows = [];
    for (let pick = 1; pick <= ROOKIE_PICKS_SHOWN; pick++) {
        rows.push(`
            <tr class="${rowClass()}">
                <td>${pick}</td>
                ${POSITIONS.map((position) => `<td class="salary">$${rookieSalary(position.rookieBaseline, pick)}</td>`).join("\n")}
            </tr>`);
    }
    return `
    <table align="center" cellspacing="1" class="homepagemodule report">
        <caption><span>Rookie Salaries</span></caption>
        <tbody>
        <tr>
            <th>Overall Pick #</th>
            ${POSITIONS.map((position) => `<th>${position.code}</th>`).join("\n")}
        </tr>
        ${rows.join("")}
        </tbody>
    </table>`;
}

function franchiseTables(topSalaries) {
    return POSITIONS.map(({code}) => {
        const rowClass = rowStriper();
        const players = topSalaries[code] || [];
        return `
    <table align="center" cellspacing="1" class="homepagemodule report">
        <caption><span>Top ${FRANCHISE_PLAYER_COUNT} ${code} Salaries</span></caption>
        <tbody>
        <tr>
            <th class="player">Player</th>
            <th class="salary">Salary</th>
        </tr>
        ${players.map((player) => `
            <tr class="${rowClass()}">
                <td class="player">${esc(player.fullName)}</td>
                <td class="salary">$${esc(player.salary)}</td>
            </tr>`).join("")}
        <tr>
            <th class="player">Franchise ${code} Salary Next Year</th>
            <th class="salary">$${franchiseSalary(players)}</th>
        </tr>
        </tbody>
    </table>`;
    }).join("");
}

/**
 * Render the tab into its mount point.
 * `franchise` is {topSalaries, note}: which salaries to show and the line describing them.
 */
export function renderContracts(mount, {league, season, franchise, storage}) {
    mount.innerHTML = `
    <table align="center" cellPadding="0" cellSpacing="0" id="homepagecolumns">
        <tr>
            <td valign="top" class="homepagecolumn" width="65%">
                <label><input id="playersByYearCheckBox" type="checkbox"/>Group Players By Year</label>
                <div id="contractscolumn1"></div>
            </td>
            <td valign="top" class="homepagecolumn" width="35%">
                <table align="center" cellspacing="1" class="homepagemodule report">
                    <caption><span>Cap Penalty Calculator</span></caption>
                    <tbody><tr class="oddtablerow"><td>
                        &nbsp;&nbsp;&nbsp;&nbsp;$<input id="calculator_salary" type="text" size="3"/> for <input id="calculator_years" type="text" size="3"/> Years =
                        $<input id="calculator_result" type="text" size="3" readonly="true"/> Penalty for Dropping
                    </td></tr></tbody>
                </table>
                <div id="contractscolumn2">
                    ${rookieTable()}
                    <p class="fuad-note">${esc(franchise.note)}</p>
                    ${franchiseTables(franchise.topSalaries)}
                </div>
            </td>
        </tr>
    </table>`;

    const checkbox = mount.querySelector("#playersByYearCheckBox");
    const column = mount.querySelector("#contractscolumn1");
    checkbox.checked = storage.get(groupByYearKey(season)) === "true";
    const showPlayers = () => {
        column.innerHTML = checkbox.checked
            ? playersByYearTables(league.rosteredPlayers)
            : allPlayersTable(league.rosteredPlayers);
        storage.set(groupByYearKey(season), checkbox.checked ? "true" : "");
    };
    checkbox.addEventListener("change", showPlayers);
    showPlayers();

    const salaryInput = mount.querySelector("#calculator_salary");
    const yearsInput = mount.querySelector("#calculator_years");
    const result = mount.querySelector("#calculator_result");
    const calculate = () => {
        const salary = Number(salaryInput.value);
        const years = Number(yearsInput.value);
        result.value = salary > 0 && years > 0 ? capPenalty(years, salary) : "";
    };
    salaryInput.addEventListener("input", calculate);
    yearsInput.addEventListener("input", calculate);
}
