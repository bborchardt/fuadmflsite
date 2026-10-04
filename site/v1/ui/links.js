import {esc} from "./html.js";

export function renderLinks(mount, {homeUrl, leagueId, isCommish}) {
    const url = (path) => `${homeUrl}/${path}`;
    const sections = [{
        name: "League",
        links: [
            ["Rosters", url(`options?L=${leagueId}&O=07`)],
            ["Prior FA Bids", url(`processed_waivers?L=${leagueId}`)],
            ["Future Draft Picks", url(`options?L=${leagueId}&O=100&SORT=FYR`)],
            ["Player Stats", url(`options?L=${leagueId}&O=08`)],
            ["Locked Players", url(`locked_players?L=${leagueId}`)],
            ["League History", url(`options?L=${leagueId}&O=156`)],
            ["Accounting Report", url(`accounting_report?L=${leagueId}`)],
            ["Scoring System", url(`options?L=${leagueId}&O=09`)],
            ["League Bylaws", url(`options?L=${leagueId}&O=26`)],
            ["Free Agents", url(`free_agents?L=${leagueId}`)]
        ]
    }];
    if (isCommish) {
        sections.push({
            name: "Commish",
            links: [
                ["Cap Penalties", url(`csetup?L=${leagueId}&C=SALADJ`)],
                ["Set Contracts", url(`csetup?L=${leagueId}&C=SALARIES`)]
            ]
        });
    }
    mount.innerHTML = `
    <table id="homepagecolumns" cellspacing="0" cellpadding="0" align="center">
        <tbody><tr><td class="homepagecolumn" width="50%" valign="top">
        ${sections.map((section) => `
            <table class="homepagemodule report" cellspacing="1" align="center">
                <caption><span>${esc(section.name)}</span></caption>
                <tbody><tr><td><ul>
                ${section.links.map(([text, link]) => `<li><a href="${esc(link)}">${esc(text)}</a></li>`).join("")}
                </ul></td></tr></tbody>
            </table>`).join("")}
        </td></tr></tbody>
    </table>`;
}
