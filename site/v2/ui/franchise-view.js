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
    // eslint-disable-next-line no-restricted-syntax -- the site's own snapshot on Pages, not MFL's
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

// as the league uses them for `season` (franchise tags, and its rookie draft's ranked scale): last
// season's deadline snapshot, or live where there's none
async function previousView(season, live, dataBase) {
    const previous = await loadSnapshot(season - 1, dataBase);
    if (previous) {
        return {topSalaries: previous, phase: "previous", note: `Franchise salaries for ${season}, set at the ${season - 1} trade deadline.`};
    }
    return {topSalaries: live, phase: "previous", missing: true, note: `Projected franchise salaries. No snapshot from the ${season - 1} trade deadline was found.`};
}

const TEST_LEAGUE = "Projected franchise salaries, live: a test league has no trade deadline snapshots.";

export async function franchiseView(season, league, dataBase) {
    const live = franchiseTopSalaries(league.rosteredPlayers);
    if (!leagueStatus.snapshots) {
        return {topSalaries: live, phase: "projected", note: TEST_LEAGUE};
    }
    const times = await kickoffs(season);
    const phase = franchisePhase(new Date(), times.start, times.deadline);
    if (phase === "previous") {
        return previousView(season, live, dataBase);
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

// the salaries `season`'s rookie draft is paid from, whenever in the season it's loaded: franchiseView's
// before week 1
export async function draftView(season, league, dataBase) {
    const live = franchiseTopSalaries(league.rosteredPlayers);
    return leagueStatus.snapshots ? previousView(season, live, dataBase) : {topSalaries: live, phase: "projected", note: TEST_LEAGUE};
}
