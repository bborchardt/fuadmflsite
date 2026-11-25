// A rule change means a new version, so past seasons keep the rules they were played under. The
// numbers are the league's settings (settings.json).

import settings from "./settings.js";
import {asArray} from "./mfl.js";

export const SALARY_CAP = settings.salaryCap;
export const ROSTER_MIN = settings.roster.min;
export const ROSTER_MAX = settings.roster.max;
export const OVER_AFTER_TRADE_HOURS = settings.roster.overAfterTradeHours;

// The season's weeks, from MFL's `league` export, which schedules the season by them: the playoffs
// start after its last regular season week, and its last week is the championship. Null if MFL
// doesn't say. The roster checks run through the championship, anti-tanking before the playoffs.
export function seasonWeeks(league) {
    const lastRegular = Number(league && league.lastRegularSeasonWeek);
    const championship = Number(league && league.endWeek);
    return lastRegular > 0 && championship > lastRegular ? {playoffsStart: lastRegular + 1, championship} : null;
}

// the championship week to assume when MFL's page or export doesn't give one
export const DEFAULT_END_WEEK = 17;

export const FRANCHISE_PLAYER_COUNT = settings.franchiseTag.averageOfTop;

// the trade deadline, when franchise salaries are snapshotted, is this week's first kickoff
export const TRADE_DEADLINE_WEEK = settings.weeks.tradeDeadline;

// last season's franchise salaries apply until this week's first kickoff: a stand-in for the rookie
// draft, held offline on no fixed date
export const PREVIOUS_FRANCHISE_UNTIL_WEEK = 1;

export const ROOKIE_DECAY = 1 - settings.rookieScale.dropPerPick;

// rookieScale.firstPickFromRank: each position's first pick is paid the salary at that rank among
// the position's at the trade deadline before the draft (a franchise snapshot, lib/franchise.js)
export const ROOKIE_RANKED = Boolean(settings.rookieScale.firstPickFromRank);

// each {code, rookieBaseline} (firstPick) or {code, rookieRank} (firstPickFromRank)
export const POSITIONS = ROOKIE_RANKED
    ? Object.entries(settings.rookieScale.firstPickFromRank).map(([code, rookieRank]) => ({code, rookieRank}))
    : Object.entries(settings.rookieScale.firstPick).map(([code, rookieBaseline]) => ({code, rookieBaseline}));

// how many salaries a position's snapshot keeps: the franchise tag's, or the rookie scale's deepest rank
export const SNAPSHOT_DEPTH = Math.max(FRANCHISE_PLAYER_COUNT, ...POSITIONS.map((position) => position.rookieRank || 0));

// each position's first-pick salary, by code: firstPick's, or the salary at its rank in `topSalaries`
// (franchiseTopSalaries' or a snapshot's), $1 where the position had fewer; null when the scale is
// ranked and there are none
export function rookieBaselines(topSalaries) {
    if (ROOKIE_RANKED && !topSalaries) {
        return null;
    }
    return Object.fromEntries(POSITIONS.map((position) => [position.code, position.rookieRank
        ? ((topSalaries[position.code] || [])[position.rookieRank - 1] || {salary: 1}).salary
        : position.rookieBaseline]));
}

// The league's positions in MFL's order, from its `league` export's starting lineup; the rookie
// scale's without it
export function lineupPositions(league) {
    const names = asArray(league && league.starters && league.starters.position).map((position) => position.name).filter(Boolean);
    return names.length ? names : POSITIONS.map((position) => position.code);
}

// `positions` first, in their order, then any other a list has, as MFL lists them
export const withOthers = (positions, found) => positions.concat([...new Set(found)].filter((pos) => pos && !positions.includes(pos)));

const positionRank = new Map(POSITIONS.map((position, index) => [position.code, index]));

export function positionOrder(code) {
    return positionRank.has(code) ? positionRank.get(code) : POSITIONS.length;
}

export function capPenalty(years, salary) {
    years = Number(years);
    salary = Number(salary);
    if (!(years > 0)) {
        return 0;
    }
    // rounded first: 0.4 × 3 × 5 is 6.000000000000001 in floating point, which would round up to 7
    const share = Math.round(settings.cutPenalty.shareOfRemainingContract * salary * years * 1e6) / 1e6;
    return Math.max(Math.ceil(Math.max(1, share)), years * settings.cutPenalty.minimumPerYear);
}

export function netCapSpace(years, salary) {
    return years === 0 ? 0 : salary - capPenalty(years, salary);
}

// `pick` is 1-based
export function rookieSalary(baseline, pick) {
    return Math.round(Math.max(1, baseline * Math.pow(ROOKIE_DECAY, pick - 1)));
}

// ties keep the order they arrive in
export function franchiseTopSalaries(rosteredPlayers) {
    const sorted = rosteredPlayers.slice().sort((a, b) =>
        positionOrder(a.nflPosition) - positionOrder(b.nflPosition) || b.salary - a.salary);
    const top = {};
    for (const player of sorted) {
        if (!positionRank.has(player.nflPosition)) {
            continue;
        }
        const list = top[player.nflPosition] || (top[player.nflPosition] = []);
        if (list.length < SNAPSHOT_DEPTH) {
            list.push({fullName: player.fullName, salary: player.salary});
        }
    }
    return top;
}

// the top FRANCHISE_PLAYER_COUNT's average, of a list that may hold more (SNAPSHOT_DEPTH)
export function franchiseSalary(topPlayers) {
    const total = (topPlayers || []).slice(0, FRANCHISE_PLAYER_COUNT).reduce((sum, player) => sum + player.salary, 0);
    return Math.round(total / FRANCHISE_PLAYER_COUNT);
}
