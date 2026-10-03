// The Commish tab: pre-filled MFL forms for cap penalties and contracts, and the
// franchise snapshot backup. Members see a one-line notice instead.

import {esc, rowStriper} from "./html.js";

function penaltyForm({homeUrl, leagueId, league}) {
    const rowClass = rowStriper();
    const rows = [...league.franchises.values()]
        .filter((franchise) => franchise.penaltyReason)
        .map((franchise) => `
            <tr class="${rowClass()}">
                <td>${esc(franchise.teamName)}</td>
                <td><input type="text" id="ADJ_${esc(franchise.franchiseId)}" name="ADJ_${esc(franchise.franchiseId)}" size="7" value="${esc(franchise.pendingPenalty)}"></td>
                <td><input type="text" id="EXP_${esc(franchise.franchiseId)}" name="EXP_${esc(franchise.franchiseId)}" size="45" value="${esc(franchise.penaltyReason)}"></td>
            </tr>`).join("");
    const action = `${homeUrl}/csetup?LEAGUE_ID=${leagueId}&C=SALADJ&form_name=adj&L=${leagueId}`;
    return `
    <div style="border: 1px solid black; padding-top: 1em;" align="left">
        <form action="${esc(action)}" method="post">
            <input type="hidden" name="LEAGUE_ID" value="${esc(leagueId)}">
            <table align="center" cellspacing="1" class="report">
                <caption><span>Create New Salary Adjustments</span></caption>
                <tbody>
                <tr>
                    <th>Franchise</th>
                    <th>Amount</th>
                    <th>Explanation</th>
                </tr>
                ${rows}
                </tbody>
            </table>
            <p class="form_buttons"><input type="submit" name="ASUBMIT" value="Update Salary Adjustments"></p>
        </form>
    </div>`;
}

function contractForm({homeUrl, leagueId, league, beforeDraft}) {
    const rowClass = rowStriper();
    const franchises = [...league.franchises.values()];
    const droppedRows = franchises.flatMap((franchise) => franchise.pendingDroppedPlayers).map((player) => `
            <tr class="${rowClass()}">
                <td>Free Agent</td>
                <td>${esc(player.fullName)}</td>
                <td><input type="text" id="SAL_${esc(player.playerId)}" name="SAL_${esc(player.playerId)}" value="" size="9"></td>
                <td><input type="text" id="CY_${esc(player.playerId)}" name="CY_${esc(player.playerId)}" value="" size="4"></td>
            </tr>`).join("");
    const signedRows = franchises.flatMap((franchise) => franchise.signedPlayers.map((player) => `
            <tr class="${rowClass()}">
                <td>${esc(franchise.teamName)}</td>
                <td>${esc(player.fullName)}</td>
                <td><input type="text" id="SAL_${esc(player.playerId)}" name="SAL_${esc(player.playerId)}" value="${beforeDraft ? "0.01" : esc(player.salary)}" size="9"></td>
                <td><input type="text" id="CY_${esc(player.playerId)}" name="CY_${esc(player.playerId)}" value="" size="4"></td>
            </tr>`)).join("");
    const action = `${homeUrl}/csetup?LEAGUE_ID=${leagueId}&C=SALARIES&form_name=salaries&L=${leagueId}`;
    return `
    <div style="border: 1px solid black; padding-top: 1em;" align="left">
        <form action="${esc(action)}" method="post">
            <input type="hidden" name="LEAGUE_ID" value="${esc(leagueId)}">
            <input type="hidden" name="DISPLAY" value="LEAGUE">
            <table align="center" cellspacing="1" class="report">
                <tbody>
                <tr>
                    <th>Team</th>
                    <th>Player</th>
                    <th>Salary</th>
                    <th>Contract Year</th>
                </tr>
                ${droppedRows}${signedRows}
                </tbody>
            </table>
            <p class="form_buttons"><input type="submit" name="SUBMIT" value="Save Salary/Contract Information"></p>
        </form>
    </div>`;
}

// Backup for the daily job: shows the snapshot as it would be taken now, to commit by hand.
function snapshotBackup(snapshotStatus) {
    return `
    <div style="border: 1px solid black; padding: 1em;" align="left" class="fuad-snapshot">
        <p><b>Franchise salary snapshot.</b> ${esc(snapshotStatus)}</p>
        <p class="form_buttons"><input type="button" id="fuadSnapshotButton" value="Show franchise snapshot"></p>
        <textarea id="fuadSnapshotText" rows="12" cols="60" readonly hidden></textarea>
    </div>`;
}

export function renderCommish(mount, {homeUrl, leagueId, league, isCommish, beforeDraft, snapshotStatus, snapshotJson}) {
    if (!isCommish) {
        mount.innerHTML = "<div>This tab is for commissioner use only.</div>";
        return;
    }
    mount.innerHTML = penaltyForm({homeUrl, leagueId, league})
        + contractForm({homeUrl, leagueId, league, beforeDraft})
        + snapshotBackup(snapshotStatus);
    const text = mount.querySelector("#fuadSnapshotText");
    mount.querySelector("#fuadSnapshotButton").addEventListener("click", () => {
        text.value = snapshotJson();
        text.hidden = false;
        text.select();
    });
}
