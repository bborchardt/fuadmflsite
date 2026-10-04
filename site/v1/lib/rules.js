// League rules for this version. Plain functions with no DOM, so the page and the
// daily job (Node) share them and can't disagree. A rule change means a new version.

export const SALARY_CAP = 300;
export const ROSTER_MIN = 23;
export const ROSTER_MAX = 30;

// The roster-limit, injured reserve and injured-starter (anti-tanking) checks run through the
// championship, week 17.
// MFL keeps reporting week 17 all offseason, so these checks also end at the kickoff of the
// next NFL week (SEASON_OVER_WEEK); the cap is checked all year.
export const ROSTER_CHECK_LAST_WEEK = 17;
export const SEASON_OVER_WEEK = 18;
export const INJURY_CHECK_LAST_WEEK = 17;

// Franchise salary next year is the average of the top salaries at each position.
export const FRANCHISE_PLAYER_COUNT = 5;

// The trade deadline is the first kickoff of this NFL week; that's when the
// franchise salaries are snapshotted.
export const TRADE_DEADLINE_WEEK = 12;

// Last season's franchise salaries apply until the first kickoff of this NFL week,
// a stand-in for the rookie draft, which is held offline on no fixed date.
export const PREVIOUS_FRANCHISE_UNTIL_WEEK = 1;

// Rookie salaries: the first pick at each position earns the baseline, and each
// later pick earns 80% of the one before, never less than $1.
export const ROOKIE_PICKS_SHOWN = 15;
export const ROOKIE_DECAY = 0.8;

// Positions in display order, with each one's first-pick rookie salary.
export const POSITIONS = [
    {code: "QB", rookieBaseline: 6},
    {code: "RB", rookieBaseline: 10},
    {code: "WR", rookieBaseline: 10},
    {code: "TE", rookieBaseline: 4},
    {code: "PK", rookieBaseline: 1}
];

const positionRank = new Map(POSITIONS.map((position, index) => [position.code, index]));

/** Sort order for a position; anything the league doesn't use sorts last. */
export function positionOrder(code) {
    return positionRank.has(code) ? positionRank.get(code) : POSITIONS.length;
}

/** What it costs against the cap to drop a player: 40% of salary per remaining year, at least $1 and at least one dollar per year. */
export function capPenalty(years, salary) {
    years = Number(years);
    salary = Number(salary);
    if (!(years > 0)) {
        return 0;
    }
    return Math.max(Math.ceil(Math.max(1, 0.4 * salary * years)), years);
}

/** Cap space freed by dropping a player: salary less the penalty. Nothing for an expiring contract. */
export function netCapSpace(years, salary) {
    return years === 0 ? 0 : salary - capPenalty(years, salary);
}

/** Salary for a rookie taken at this pick (1-based) at a position with this baseline. */
export function rookieSalary(baseline, pick) {
    return Math.round(Math.max(1, baseline * Math.pow(ROOKIE_DECAY, pick - 1)));
}

/**
 * The top salaries at each position, from a list of rostered players
 * ({fullName, nflPosition, salary}). Ties keep the order they arrive in.
 * Returns {QB: [{fullName, salary}, ...], ...}.
 */
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

/** Next year's franchise salary at a position: the average of its top salaries, rounded. */
export function franchiseSalary(topPlayers) {
    const total = (topPlayers || []).reduce((sum, player) => sum + player.salary, 0);
    return Math.round(total / FRANCHISE_PLAYER_COUNT);
}
