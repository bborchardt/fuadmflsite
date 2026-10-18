// What League › Scores reads besides the exports: MFL's live stats feed (every stat, each game's
// quarter and clock), its projected stats feed, and the league's scoring rules, run through MFL's own
// win probability method (mfl_win_prob.js: 400 seeded simulations of what's left to play), so a
// card's projections and win % come out as MFL's live scoring page shows them.

import {asArray} from "../lib/mfl.js";

export const SIMULATIONS = 400;
const GAME_SECONDS = 3600;

// "0211|#R 2|CY 36|…" per player, "HOU|QUARTER 2|REMAINING 15:00|…" per NFL team, then DATE. MFL
// leaves carriage returns inside lines ("DIF 7\r|EA 1\r"), so every value is trimmed.
export function readStats(text) {
    const players = new Map();
    const teams = new Map();
    let updated = 0;
    for (const line of String(text).split("\n")) {
        const fields = line.split("|").map((field) => field.trim());
        if (fields[0] === "DATE") {
            updated = Number(fields[1]) || 0;
        } else if (fields[0] && !["REFRESH", "TICKER"].includes(fields[0])) {
            const stats = {};
            for (const field of fields.slice(1).filter(Boolean)) {
                const space = field.indexOf(" ");
                stats[space > 0 ? field.slice(0, space) : field] = space > 0 ? field.slice(space + 1).trim() : "";
            }
            (/^\d+$/.test(fields[0]) ? players : teams).set(fields[0], stats);
        }
    }
    return {players, teams, updated};
}

// MFL's minimum projected stats per position, so a sparse projection still has some chance
const MIN_PROJECTIONS = {
    QB: {"#P": 0.07, "#R": 0.03, "#C": 0.01, IN: 0.05, FL: 0.02, CC: 0.02, PC: 2, RA: 0.2, P2: 0.02, R2: 0.01, APY: 0.5, ARY: 0.1, ACY: 0.1, PA: 3, TGT: 0.05},
    RB: {"#P": 0.02, "#R": 0.08, "#C": 0.05, IN: 0.01, FL: 0.02, CC: 0.4, PC: 0.02, RA: 2, R2: 0.02, PA: 0.04, APY: 0.2, ARY: 0.2, ACY: 0.2, TGT: 0.8},
    WR: {"#P": 0.02, "#R": 0.02, "#C": 0.09, IN: 0.01, FL: 0.02, CC: 0.8, PC: 0.01, RA: 0.1, C2: 0.02, PA: 0.02, APY: 0.2, ARY: 0.1, ACY: 0.3, TGT: 1.0},
    TE: {"#P": 0.02, "#R": 0.02, "#C": 0.1, IN: 0.01, FL: 0.02, CC: 0.5, PC: 0.01, RA: 0.08, C2: 0.02, PA: 0.02, APY: 0.2, ARY: 0.1, ACY: 0.2, TGT: 0.9}
};

// "16619,WR,RA=0.18,CC=1.92,…" per player; team lines (defenses) aren't used by this league
export function readProjections(text) {
    const projections = new Map();
    for (const line of String(text).split("\n")) {
        const fields = line.replace(/\r$/, "").split(",");
        if (!/^\d+$/.test(fields[0])) {
            continue;
        }
        const stats = {...(MIN_PROJECTIONS[fields[1]] || {})};
        for (const field of fields.slice(2)) {
            const [stat, value] = field.split("=");
            stats[stat] = (stats[stat] || 0) + Number(value);
        }
        projections.set(fields[0], stats);
    }
    return projections;
}

// the `rules` export as [{positions, event, lower, upper, points}]
export function readRules(rules) {
    return asArray(rules && rules.positionRules).flatMap((group) => {
        const positions = String(group.positions || "").split("|");
        return asArray(group.rule).map((rule) => {
            const value = (field) => String(field && typeof field === "object" ? field.$t : field || "");
            const range = value(rule.range).match(/^(-?[\d.]+)-(-?[\d.]+)$/) || [];
            return {positions, event: value(rule.event), lower: range[1] || "0", upper: range[2] || "0", points: value(rule.points)};
        });
    });
}

// MFL's ls_get_points2: a stat's points under one rule, its integer math included ("1/30" is a
// whole point per full 30 yards)
function rulePoints(value, lower, upper, form) {
    if (value === undefined) {
        return 0;
    }
    const number = Number(value);
    let match;
    if (/^[A-Z]/.test(value)) {
        match = number == lower; // eslint-disable-line eqeqeq
    } else if (/&/.test(value)) {
        match = value.split("&").map(Number).every((part) => part >= Number(lower) && part <= Number(upper));
    } else {
        match = number >= Number(lower) && number <= Number(upper);
    }
    if (!match) {
        return 0;
    }
    if (/^\*/.test(form)) {
        return number * Number(form.slice(1));
    }
    if (/\//.test(form)) {
        const [perUnit, unitText] = form.split("/");
        const unit = Number(unitText || 1) || 1;
        const multiplier = Number(perUnit);
        const whole = !/\./.test(unitText || "");
        let points = whole ? (number / unit) | 0 : number / unit;
        if (perUnit !== "" && !Number.isNaN(multiplier) && multiplier !== 0) {
            points *= multiplier;
        }
        return points;
    }
    return Number(form);
}

// MFL lists some stats (field goal lengths) as "55,34", each scored on its own
function statPoints(value, rule) {
    if (value === undefined) {
        return 0;
    }
    const text = String(value);
    if (rule.event === "FG" || rule.event === "FR" || /,/.test(text)) {
        return text.split(",").reduce((sum, part) => sum + rulePoints(part, rule.lower, rule.upper, rule.points), 0);
    }
    return rulePoints(text, rule.lower, rule.upper, rule.points);
}

export function scoreStats(stats, position, rules) {
    if (!stats) {
        return 0;
    }
    return rules.reduce((sum, rule) => rule.positions.includes(position) ? sum + statPoints(stats[rule.event], rule) : sum, 0);
}

// Each NFL team's game: "bye", "scheduled" (with its kickoff), "playing" (quarter, seconds left,
// possession) or "over". `schedule` is the week's `nflSchedule` export.
export function gameStates(schedule, stats) {
    const games = new Map();
    for (const matchup of asArray(schedule && schedule.matchup)) {
        const teams = asArray(matchup.team);
        for (const team of teams) {
            const opponent = teams.find((other) => other !== team);
            games.set(team.id, {kickoff: Number(matchup.kickoff) || 0, opponent: opponent ? opponent.id : null, home: team.isHome === "1"});
        }
    }
    const states = new Map();
    for (const [team, game] of games) {
        const line = stats.teams.get(team);
        if (!game.kickoff || game.kickoff > stats.updated || !line) {
            states.set(team, {state: "scheduled", kickoff: game.kickoff});
        } else if (line.QUARTER === "" || line.QUARTER === "F" || line.QUARTER === undefined) {
            states.set(team, {state: "over", secondsLeft: 0});
        } else {
            const [minutes, seconds] = String(line.REMAINING || "0:0").split(":").map(Number);
            let secondsLeft = (minutes || 0) * 60 + (seconds || 0);
            let quarter = line.QUARTER;
            if (quarter === "O" || Number(quarter) > 4) {
                quarter = "OT";
            } else if (quarter === "H") {
                quarter = "Half";
                secondsLeft += 2 * 15 * 60;
            } else {
                secondsLeft += 15 * 60 * (4 - Number(quarter));
                quarter = `Q${quarter}`;
            }
            states.set(team, {state: "playing", quarter, secondsLeft, possession: Number(line.POSSESSION) > 0});
        }
    }
    return {
        of: (team) => states.get(team) || {state: "bye"},
        get any() {
            return [...states.values()].some((game) => game.state === "playing");
        }
    };
}

const plural = (count, word) => `${count} ${word}`;
const number = (value) => Number(value) || 0;

// "21/30, 248 yds, 2 TD; 9 rush yds": the stats a member looks for, by the position's usual order
export function statLine(stats, position) {
    if (!stats) {
        return "";
    }
    const groups = {};
    if (number(stats.PA) > 0) {
        groups.pass = [`${number(stats.PC)}/${number(stats.PA)}`, `${number(stats.PY)} yds`];
        if (number(stats["#P"])) {
            groups.pass.push(plural(number(stats["#P"]), "TD"));
        }
        if (number(stats.IN)) {
            groups.pass.push(plural(number(stats.IN), "INT"));
        }
    }
    if (number(stats.RA) > 0) {
        groups.rush = position === "RB"
            ? [plural(number(stats.RA), "car"), `${number(stats.RY)} yds`]
            : [`${number(stats.RY)} rush yds`];
        if (number(stats["#R"])) {
            groups.rush.push(plural(number(stats["#R"]), position === "RB" ? "TD" : "rush TD"));
        }
    }
    if (number(stats.CC) > 0 || number(stats.CY) !== 0) {
        groups.rec = [plural(number(stats.CC), "rec"), `${number(stats.CY)} yds`];
        if (number(stats["#C"])) {
            groups.rec.push(plural(number(stats["#C"]), "TD"));
        }
    }
    if (number(stats["#A"]) > 0 || number(stats.EA) > 0) {
        groups.kick = [];
        if (number(stats["#A"]) > 0) {
            groups.kick.push(`${number(stats["#F"])}/${number(stats["#A"])} FG`);
        }
        if (number(stats.EA) > 0) {
            groups.kick.push(`${number(stats.EP)}/${number(stats.EA)} XP`);
        }
    }
    const twoPoint = number(stats.P2) + number(stats.R2) + number(stats.C2);
    const order = {QB: ["pass", "rush", "rec"], RB: ["rush", "rec", "pass"], PK: ["kick"]}[position] || ["rec", "rush", "pass"];
    const parts = [...order, "kick"].filter((name, i, all) => all.indexOf(name) === i && groups[name]).map((name) => groups[name].join(", "));
    if (twoPoint) {
        parts.push(`${twoPoint} 2-pt`);
    }
    if (number(stats.FL)) {
        parts.push(`${number(stats.FL)} fum lost`);
    }
    return parts.join("; ");
}

// MFL's seeded random numbers, so a player's simulations are the same on every page
class Random {
    constructor() {
        this.spare = 0;
    }

    seed(playerId, week) {
        const seed = Number(playerId) * week;
        this.a = seed % (4294967087 - 1) + 1;
        this.b = seed % (4294965887 - 1) + 1;
        for (let i = 0; i < 5; i++) {
            this.uniform();
        }
    }

    uniform() {
        this.a = (this.a * 65539) % 4294967087;
        this.b = (this.b * 65537) % 4294965887;
        return ((this.a + this.b) % 0xffffffff) / 0xffffffff;
    }

    // one Box-Muller pair, the second kept for the next call (across players, as MFL's is)
    normal(mean, deviation) {
        let z;
        const sd = deviation === 0 ? mean / 3 : deviation;
        if (this.spare === 0) {
            const r = Math.sqrt(-2 * Math.log(this.uniform()));
            const angle = 2 * Math.PI * this.uniform();
            z = r * Math.cos(angle);
            this.spare = r * Math.sin(angle);
        } else {
            z = this.spare;
            this.spare = 0;
        }
        return sd * z + mean;
    }

    poisson(expected) {
        const u = this.uniform();
        let k = -1;
        let factorial = 1;
        let cumulative = 0;
        // capped, since rounding can keep the sum just short of a draw near 1
        while (cumulative < u && k < 500) {
            k++;
            if (k > 0) {
                factorial *= k;
            }
            cumulative += Math.pow(expected, k) * Math.exp(-expected) / factorial;
        }
        return k;
    }
}

// counted stats are Poisson draws; the rest normal
const EVENTS = new Set(["#P", "#R", "#C", "PC", "RA", "CC", "PA", "TGT", "PD", "IN", "FL", "P2", "R2", "C2", "IC", "FC", "#F", "EP", "EM"]);
const YARDS = [["PY", "APY", "PC", 2], ["RY", "ARY", "RA", 1], ["CY", "ACY", "CC", 2]];

function restOf(random, stat, projected, current, secondsLeft) {
    const mean = (projected * secondsLeft + current * (GAME_SECONDS - secondsLeft)) / GAME_SECONDS;
    if (EVENTS.has(stat)) {
        return random.poisson(mean / GAME_SECONDS * secondsLeft);
    }
    return Math.max(0, random.normal(mean, projected / 2.5) * secondsLeft / GAME_SECONDS);
}

// a player's points in each simulation, from his stats so far and his projected stats
function simulatePlayer(random, {playerId, position, secondsLeft, projected, current, rules, week}) {
    random.seed(playerId, week);
    const totals = [];
    const now = current || {};
    for (let i = 0; i < SIMULATIONS; i++) {
        const stats = {};
        const rest = {};
        for (const stat of Object.keys(projected)) {
            const sofar = Number.isNaN(Number(now[stat])) ? 0 : Number(now[stat] || 0);
            rest[stat] = restOf(random, stat, projected[stat], sofar, secondsLeft);
            stats[stat] = sofar + rest[stat];
        }
        for (const [yards, average, attempts, deviation] of YARDS) {
            const sofar = Number.isNaN(Number(now[yards])) ? 0 : Number(now[yards] || 0);
            if (rest[attempts] > 0) {
                stats[yards] = sofar + random.normal(projected[average], deviation) * rest[attempts];
            } else {
                stats[yards] = sofar;
            }
        }
        if (rest["#F"] > 0) {
            const lengths = now.FG !== undefined ? [String(now.FG)] : [];
            for (let kick = 1; kick < rest["#F"] + 0.5; kick++) {
                lengths.push(random.normal(41, 6).toFixed(0));
            }
            stats.FG = lengths.filter(Boolean).join(",");
        }
        totals.push(scoreStats(stats, position, rules));
    }
    return totals;
}

// One team's points in each simulation. Starters are {playerId, position, team, points, stats},
// in MFL's order (position, then name); `done` when none of them has minutes left. Each starter's
// average goes in `perPlayer`, his projection.
function simulateTeam(random, {starters, done, total, perPlayer = new Map()}, {games, projections, rules, week}) {
    if (done) {
        return new Array(SIMULATIONS).fill(total);
    }
    const totals = new Array(SIMULATIONS).fill(0);
    for (const starter of starters) {
        const game = games.of(starter.team);
        let points = null;
        if (!starter.team || starter.team === "FA" || game.state === "bye") {
            points = null;
        } else if (game.state === "over") {
            points = new Array(SIMULATIONS).fill(starter.points);
        } else {
            let secondsLeft = game.state === "scheduled" ? GAME_SECONDS : game.secondsLeft;
            if (game.state === "playing" && secondsLeft < 360) {
                // more happens at the end of a game: MFL's allowance
                secondsLeft += (game.possession ? 1 : 0.5) * secondsLeft * (360 - secondsLeft) / 360;
            }
            points = simulatePlayer(random, {
                playerId: starter.playerId, position: starter.position, secondsLeft,
                projected: projections.get(starter.playerId) || {}, current: starter.stats, rules, week
            });
        }
        if (points) {
            points.forEach((value, i) => {
                totals[i] += value;
            });
        }
        perPlayer.set(starter.playerId, points ? points.reduce((sum, value) => sum + value, 0) / SIMULATIONS : 0);
    }
    return totals;
}

// {away, home} each {projected, chance}: the average simulated final and the chance of winning,
// 1–99% while anyone has minutes left. Ties count for neither side, as MFL counts them.
export function winProbability({away, home}, context) {
    const random = new Random();
    const awayTotals = simulateTeam(random, away, context);
    const homeTotals = simulateTeam(random, home, context);
    let wins = 0;
    let losses = 0;
    awayTotals.forEach((value, i) => {
        if (value > homeTotals[i]) {
            wins++;
        } else if (value < homeTotals[i]) {
            losses++;
        }
    });
    let chance = wins + losses ? Math.round(100 * wins / (wins + losses)) : 50;
    if (!away.done || !home.done) {
        chance = Math.min(99, Math.max(1, chance));
    }
    const average = (totals) => totals.reduce((sum, value) => sum + value, 0) / SIMULATIONS;
    return {away: {projected: average(awayTotals), chance}, home: {projected: average(homeTotals), chance: 100 - chance}};
}
