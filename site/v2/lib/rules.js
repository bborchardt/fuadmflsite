// A rule change means a new version, so past seasons keep the rules they were played under. The
// numbers are the league's settings (settings.json).

import settings from "./settings.js";

export const SALARY_CAP = settings.salaryCap;
export const ROSTER_MIN = settings.roster.min;
export const ROSTER_MAX = settings.roster.max;

// MFL reports week 17 all offseason, so the roster and IR checks' end is timed from the NFL
// schedule. Anti-tanking covers the regular season.
export const PLAYOFFS_START_WEEK = settings.weeks.playoffsStart;
export const CHAMPIONSHIP_WEEK = settings.weeks.championship;
export const ROSTER_CHECK_LAST_WEEK = CHAMPIONSHIP_WEEK;
export const INJURY_CHECK_LAST_WEEK = PLAYOFFS_START_WEEK - 1;

export const FRANCHISE_PLAYER_COUNT = settings.franchiseTag.averageOfTop;

// the trade deadline, when franchise salaries are snapshotted, is this week's first kickoff
export const TRADE_DEADLINE_WEEK = settings.weeks.tradeDeadline;

// last season's franchise salaries apply until this week's first kickoff: a stand-in for the rookie
// draft, held offline on no fixed date
export const PREVIOUS_FRANCHISE_UNTIL_WEEK = 1;

export const ROOKIE_DECAY = 1 - settings.rookieScale.dropPerPick;

export const POSITIONS = Object.entries(settings.rookieScale.firstPick).map(([code, rookieBaseline]) => ({code, rookieBaseline}));

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
    return Math.max(Math.ceil(Math.max(1, settings.cutPenalty.shareOfRemainingContract * salary * years)), years * settings.cutPenalty.minimumPerYear);
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
        if (list.length < FRANCHISE_PLAYER_COUNT) {
            list.push({fullName: player.fullName, salary: player.salary});
        }
    }
    return top;
}

export function franchiseSalary(topPlayers) {
    const total = (topPlayers || []).reduce((sum, player) => sum + player.salary, 0);
    return Math.round(total / FRANCHISE_PLAYER_COUNT);
}
