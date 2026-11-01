// Franchise salaries as the league uses them now: last season's deadline snapshot until week 1,
// live until this season's trade deadline, then this season's snapshot, for Rosters › Draft.

import {PREVIOUS_FRANCHISE_UNTIL_WEEK, TRADE_DEADLINE_WEEK, franchiseTopSalaries} from "../lib/rules.js";
import {league as leagueStatus} from "../lib/settings.js";
import {franchisePhase, readSnapshot, snapshotFileName} from "../lib/franchise.js";
import {kickoffAt} from "./context.js";
import {whenText} from "./home-model.js";

// null until MFL publishes the schedule
async function kickoffs(season) {
    const [start, deadline] = await Promise.all([PREVIOUS_FRANCHISE_UNTIL_WEEK, TRADE_DEADLINE_WEEK].map((week) => kickoffAt(season, week)));
    return {start: start && new Date(start * 1000), deadline: deadline && new Date(deadline * 1000)};
}

async function loadSnapshot(season, dataBase) {
    const response = await fetch(new URL(snapshotFileName(season), dataBase), {cache: "no-cache"});
    if (response.status === 404) {
        return null;
    }
    if (!response.ok) {
        throw new Error(`the ${season} franchise snapshot returned HTTP ${response.status}`);
    }
    return readSnapshot(await response.json(), season);
}

const deadlineText = (date) => (date ? whenText(Math.floor(date.getTime() / 1000)) : "the trade deadline");

export async function franchiseView(season, league, dataBase) {
    const live = franchiseTopSalaries(league.rosteredPlayers);
    if (!leagueStatus.snapshots) {
        return {topSalaries: live, phase: "projected", note: "Projected franchise salaries, live: a test league has no trade deadline snapshots."};
    }
    const times = await kickoffs(season);
    const phase = franchisePhase(new Date(), times.start, times.deadline);
    if (phase === "previous") {
        const previous = await loadSnapshot(season - 1, dataBase);
        if (previous) {
            return {topSalaries: previous, phase, note: `Franchise salaries for ${season}, set at the ${season - 1} trade deadline.`};
        }
        return {topSalaries: live, phase, missing: true, note: `Projected franchise salaries. No snapshot from the ${season - 1} trade deadline was found.`};
    }
    if (phase === "final") {
        const final = await loadSnapshot(season, dataBase);
        if (final) {
            return {topSalaries: final, phase, note: `Franchise salaries for ${season + 1}, set at the ${season} trade deadline.`};
        }
        return {topSalaries: live, phase, missing: true, note: `Provisional franchise salaries for ${season + 1}: the ${season} trade deadline snapshot hasn't been taken yet.`};
    }
    return {topSalaries: live, phase, note: `Projected franchise salaries for ${season + 1}, live until the trade deadline (${deadlineText(times.deadline)}).`};
}
