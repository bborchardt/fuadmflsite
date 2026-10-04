// A rule change means a new version, so past seasons keep the rules they were played under.

export const SALARY_CAP = 300;
export const ROSTER_MIN = 23;
export const ROSTER_MAX = 30;

// MFL reports week 17 all offseason, so the roster and IR checks' end is timed from the NFL
// schedule. Anti-tanking covers the regular season, weeks 1-14.
export const ROSTER_CHECK_LAST_WEEK = 17;
export const INJURY_CHECK_LAST_WEEK = 14;
export const PLAYOFFS_START_WEEK = 15;

export const FRANCHISE_PLAYER_COUNT = 5;

// the trade deadline, when franchise salaries are snapshotted, is this week's first kickoff
export const TRADE_DEADLINE_WEEK = 12;

// last season's franchise salaries apply until this week's first kickoff: a stand-in for the rookie
// draft, held offline on no fixed date
export const PREVIOUS_FRANCHISE_UNTIL_WEEK = 1;

export const ROOKIE_PICKS_SHOWN = 15;
export const ROOKIE_DECAY = 0.8;

export const POSITIONS = [
    {code: "QB", rookieBaseline: 6},
    {code: "RB", rookieBaseline: 10},
    {code: "WR", rookieBaseline: 10},
    {code: "TE", rookieBaseline: 4},
    {code: "PK", rookieBaseline: 1}
];

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
    return Math.max(Math.ceil(Math.max(1, 0.4 * salary * years)), years);
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
