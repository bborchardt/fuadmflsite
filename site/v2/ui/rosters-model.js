// Rosters' numbers, from MFL's exports and the league model (lib/league.js): each team's cap and
// roster, its penalties and draft picks, the player pool for Players, and the Draft view's order,
// board and rookie scale. No drawing here, so each can be checked against saved exports.

import {asArray} from "../lib/mfl.js";
import {POSITIONS, SALARY_CAP, positionOrder, rookieSalary} from "../lib/rules.js";

export const SEASONS_SHOWN = 5;
export const ROUNDS = 5;
export const TEAM_COUNT = 10;
export const SCALE_PICKS = 10;
// cap used within this much of the cap reads as tight
export const TIGHT = 10;

export const yearsText = (years) => `${years} yr${years === 1 ? "" : "s"}`;
export const dollars = (value) => `$${Number.isInteger(value) ? value : Number(value).toFixed(2)}`;

const centralDate = (seconds) => new Date(seconds * 1000).toLocaleDateString("en-US", {weekday: "short", month: "short", day: "numeric", timeZone: "America/Chicago"}).replace(",", "");

// `byes` is the `nflByeWeeks` export, `points` the `playerScores` export (W=YTD)
export function byeWeeks(nflByeWeeks) {
    return new Map(asArray(nflByeWeeks && nflByeWeeks.team).map((team) => [team.id, team.bye_week]));
}

export function pointsById(playerScores) {
    return new Map(asArray(playerScores && playerScores.playerScore).map((entry) => [entry.id, Number(entry.score) || 0]));
}

// "Ollie Gordon (2yrs@2)", "Harrison Mevis (2yrs@1, 10/15)", "Pat Freiermuth (1yr@1), Joe Mixon
// (1yr@1)": who was cut, and on what terms
function readAdjustment(adjustment) {
    const description = String(adjustment.description || "");
    const groups = [...description.matchAll(/\(([^)]*)\)/g)].map((match) => match[1].split(",")[0].trim());
    const who = description.replace(/\s*\([^)]*\)/g, "").trim();
    const contracts = groups.map((terms) => terms.match(/^(\d+)\s*yrs?\s*@\s*\$?([\d.]+)/i));
    let terms = groups.join(", ");
    if (contracts.length && contracts.every(Boolean)) {
        const same = contracts.every((contract) => contract[1] === contracts[0][1] && contract[2] === contracts[0][2]);
        terms = same
            ? `${yearsText(Number(contracts[0][1]))} left at $${contracts[0][2]}${contracts.length > 1 ? " each" : ""}`
            : contracts.map((contract) => `${yearsText(Number(contract[1]))} at $${contract[2]}`).join(", ");
    }
    return {
        who,
        when: Number(adjustment.timestamp) ? centralDate(Number(adjustment.timestamp)) : "",
        terms,
        amount: Number(adjustment.amount) || 0
    };
}

// a team's penalties this season: those MFL has charged, then cuts not charged yet
export function penaltiesOf(team, salaryAdjustments) {
    const charged = asArray(salaryAdjustments && salaryAdjustments.salaryAdjustment)
        .filter((adjustment) => adjustment.franchise_id === team.franchiseId)
        .map(readAdjustment);
    const pending = (team.pendingDroppedPlayers || []).filter((player) => player.capPenalty > 0)
        .map((player) => ({who: player.fullName, when: "", terms: `${yearsText(player.years)} left at ${dollars(player.salary)} · not yet charged`, amount: player.capPenalty}));
    return charged.concat(pending);
}

// Cap used this season (salaries and penalties), then each later season's contracts still running:
// a player with `years` left counts in this season and the next years − 1
export function usedBySeason(team, rosteredPlayers, season) {
    const players = rosteredPlayers.filter((player) => player.franchise === team);
    return Array.from({length: SEASONS_SHOWN}, (_, k) => {
        const used = k === 0 ? team.capTotal : players.filter((player) => player.years > k).reduce((sum, player) => sum + player.salary, 0);
        const rounded = Math.round(used * 100) / 100;
        return {season: season + k, used: rounded, tight: SALARY_CAP - rounded < TIGHT};
    });
}

// the roster by position, highest salary first; each player's cut penalty and cap used after a cut
export function rosterGroups(team, rosteredPlayers, {byes, points}) {
    const players = rosteredPlayers.filter((player) => player.franchise === team).map((player) => ({
        id: player.playerId,
        name: player.fullName,
        position: player.nflPosition,
        nfl: player.team,
        bye: byes.get(player.team) || "",
        points: points.get(player.playerId) || 0,
        salary: player.salary,
        years: player.years,
        ir: player.status === "INJURED_RESERVE",
        nflIr: /^IR/.test(player.injuryStatus || ""),
        cutPenalty: player.capPenalty,
        capAfterCut: Math.round((team.capTotal - player.salary + player.capPenalty) * 100) / 100
    }));
    const groups = new Map();
    for (const player of players.sort((a, b) => positionOrder(a.position) - positionOrder(b.position) || b.salary - a.salary || b.years - a.years || a.name.localeCompare(b.name))) {
        if (!groups.has(player.position)) {
            groups.set(player.position, []);
        }
        groups.get(player.position).push(player);
    }
    return [...groups].map(([position, list]) => ({
        position,
        players: list,
        salary: Math.round(list.reduce((sum, player) => sum + player.salary, 0) * 100) / 100
    }));
}

// Picks by year from `futureDraftPicks`: each team's held picks (its own and others'), and its own
// traded away. `numbers` maps an original owner to its place in next year's order, when decided.
export function picksOf(teamId, futureDraftPicks, {names, numbers = new Map(), nextYear}) {
    const held = asArray(futureDraftPicks && futureDraftPicks.franchise).flatMap((team) =>
        asArray(team.futureDraftPick).map((pick) => ({holder: team.id, year: Number(pick.year), round: Number(pick.round), original: pick.originalPickFor})));
    const years = [...new Set(held.map((pick) => pick.year))].sort((a, b) => a - b);
    return years.map((year) => {
        const rows = [];
        for (let round = 1; round <= ROUNDS; round++) {
            const inRound = held.filter((pick) => pick.year === year && pick.round === round);
            const own = inRound.find((pick) => pick.original === teamId);
            const number = (original) => (year === nextYear && numbers.has(original) ? `${round}.${String(numbers.get(original)).padStart(2, "0")}` : "");
            if (own && own.holder !== teamId) {
                rows.push({round, number: "", note: `Traded to ${names.get(own.holder) || own.holder}`, traded: true});
            } else if (own) {
                rows.push({round, number: number(teamId), note: "", traded: false});
            }
            inRound.filter((pick) => pick.holder === teamId && pick.original !== teamId)
                .forEach((pick) => rows.push({round, number: number(pick.original), note: `from ${names.get(pick.original) || pick.original}`, traded: false}));
        }
        return {year, rows};
    });
}

// "8 · 3 1sts", "4 · no 1st": next year's picks held
export function picksSummary(teamId, futureDraftPicks, year) {
    const mine = asArray(futureDraftPicks && futureDraftPicks.franchise).filter((team) => team.id === teamId)
        .flatMap((team) => asArray(team.futureDraftPick)).filter((pick) => Number(pick.year) === year);
    const firsts = mine.filter((pick) => Number(pick.round) === 1).length;
    return `${mine.length}${firsts === 1 ? "" : firsts === 0 ? " · no 1st" : ` · ${firsts} 1sts`}`;
}

// every team's sheet, least cap used first
export function teamSheets(league, {salaryAdjustments, futureDraftPicks, byes, points, season, names}) {
    return [...league.franchises.values()].map((team) => {
        const penalties = penaltiesOf(team, salaryAdjustments);
        const penaltyTotal = Math.round(penalties.reduce((sum, penalty) => sum + penalty.amount, 0) * 100) / 100;
        return {
            id: team.franchiseId,
            name: names.get(team.franchiseId) || team.teamName,
            capUsed: team.capTotal,
            salaries: Math.round((team.capTotal - penaltyTotal) * 100) / 100,
            penaltyTotal,
            tight: SALARY_CAP - team.capTotal < TIGHT,
            active: team.numPlayers,
            ir: team.irPlayers.length,
            seasons: usedBySeason(team, league.rosteredPlayers, season),
            groups: rosterGroups(team, league.rosteredPlayers, {byes, points}),
            penalties,
            picksLine: picksSummary(team.franchiseId, futureDraftPicks, season + 1)
        };
    }).sort((a, b) => a.capUsed - b.capUsed || a.name.localeCompare(b.name));
}

// ---- Players ----

// Every rostered player and every free agent on an NFL team. `offseason`: before week 1, when the
// expiring contracts are restricted free agents (0 years left, still on the roster).
export function playerPool(league, {freeAgents, points, projections, byes, names, offseason}) {
    const rostered = league.rosteredPlayers.map((player) => {
        const rfa = offseason && !(player.years > 0);
        return {
            id: player.playerId, name: player.fullName, position: player.nflPosition, nfl: player.team,
            bye: byes.get(player.team) || "", points: points.get(player.playerId) || 0,
            projected: projections.has(player.playerId) ? projections.get(player.playerId) : null,
            salary: rfa ? null : player.salary, years: rfa ? null : player.years, rfa, fa: false,
            owner: player.franchise.franchiseId, ownerName: names.get(player.franchise.franchiseId) || player.franchise.teamName
        };
    });
    const onRoster = new Set(rostered.map((player) => player.id));
    const free = asArray(freeAgents && freeAgents.leagueUnit && freeAgents.leagueUnit.player)
        .map((entry) => league.players.get(entry.id))
        .filter((player) => player && !onRoster.has(player.playerId) && player.team && !/^FA/.test(player.team) && positionOrder(player.nflPosition) < POSITIONS.length)
        .map((player) => ({
            id: player.playerId, name: player.fullName, position: player.nflPosition, nfl: player.team,
            bye: byes.get(player.team) || "", points: points.get(player.playerId) || 0,
            projected: projections.has(player.playerId) ? projections.get(player.playerId) : null,
            salary: null, years: null, rfa: false, fa: true, owner: null, ownerName: "Free agent"
        }));
    return rostered.concat(free);
}

// The chips: position, years left and owner rows, each a set (empty = All). In the offseason the
// years row has FA (no contract: RFAs and UFAs), and the owner row says which.
export function filterPlayers(pool, {positions = [], years = [], owners = [], text = "", viewer = null}) {
    const term = text.trim().toLowerCase();
    return pool.filter((player) => {
        if (positions.length && !positions.includes(player.position)) {
            return false;
        }
        if (years.length) {
            const key = player.fa || player.rfa ? "FA" : String(player.years);
            if (!years.includes(key)) {
                return false;
            }
        }
        if (owners.length) {
            const owner = player.fa ? "Free agents" : player.owner === viewer ? "Mine" : "Other teams";
            if (!owners.includes(owner)) {
                return false;
            }
        }
        return !term || player.name.toLowerCase().includes(term);
    });
}

const SORTS = {
    name: (a, b) => a.name.localeCompare(b.name),
    bye: (a, b) => (Number(a.bye) || 99) - (Number(b.bye) || 99),
    points: (a, b) => a.points - b.points,
    projected: (a, b) => (a.projected === null ? -1 : a.projected) - (b.projected === null ? -1 : b.projected),
    salary: (a, b) => (a.salary === null ? -1 : a.salary) - (b.salary === null ? -1 : b.salary),
    years: (a, b) => (a.years === null ? -1 : a.years) - (b.years === null ? -1 : b.years)
};
// names read A–Z first; the numbers highest first
export const FIRST_DIRECTION = {name: 1, bye: 1, points: -1, projected: -1, salary: -1, years: -1};

export function sortPlayers(list, key, direction = FIRST_DIRECTION[key]) {
    const compare = SORTS[key] || SORTS.points;
    return list.slice().sort((a, b) => direction * compare(a, b) || SORTS.name(a, b));
}

// ---- Draft ----

// what the scale pays at an overall pick: [QB, RB, WR, TE, PK]
export const scaleAt = (pick) => POSITIONS.map((position) => rookieSalary(position.rookieBaseline, pick));

export function scaleText(pick) {
    const values = scaleAt(pick);
    return values.every((value) => value === 1) ? "$1 at every position" : POSITIONS.map((position, i) => `${position.code} $${values[i]}`).join(" · ");
}

// "$1–8": the lowest and highest the scale pays at an overall pick
export function scaleRange(pick) {
    const values = scaleAt(pick);
    const low = Math.min(...values);
    const high = Math.max(...values);
    return low === high ? `$${low}` : `$${low}–${high}`;
}

// Next year's order (bylaws 8.1–8.2), worst to first: picks 1–4 the teams out of the playoffs,
// worst first by the standings order; then the playoff teams, numbered once their finish is known.
// `picture` is League's playoffPicture; `finish` the playoff teams' final order, worst first, when known
// (first-round losers by seed, the lower first; the 3rd place game's loser and winner; the runner-up;
// the champion).
export function draftOrder(picture, {finish = null, futureDraftPicks = null, names, nextYear}) {
    const out = picture.hunt.map((entry) => entry.team).sort((a, b) => b.order - a.order);
    const inOrder = finish || picture.seeds.slice().reverse().map((seed) => seed.team.id);
    const traded = (teamId) => asArray(futureDraftPicks && futureDraftPicks.franchise).flatMap((team) =>
        asArray(team.futureDraftPick).filter((pick) => Number(pick.year) === nextYear && pick.originalPickFor === teamId && team.id !== teamId)
            .map((pick) => `Round ${pick.round} → ${names.get(team.id) || team.id}`));
    const rows = [
        ...out.map((team, i) => ({pick: i + 1, id: team.id, name: team.name, why: `${team.h2h.w}-${team.h2h.l}-${team.h2h.t}`, traded: traded(team.id)})),
        ...inOrder.map((id, i) => {
            const seed = picture.seeds.find((entry) => entry.team.id === id);
            return {pick: finish ? out.length + i + 1 : null, id, name: names.get(id) || (seed && seed.team.name) || id, why: seed ? `Seed ${seed.seed}` : "", traded: traded(id)};
        })
    ];
    return rows;
}

// the original owner → pick number, for picks already decided
export const pickNumbers = (order) => new Map(order.filter((row) => row.pick).map((row) => [row.id, row.pick]));

// Playoff teams worst to best once every game is played: the first round's losers (lower seed
// first), then the 3rd place game's loser and winner, the runner-up and the champion. Null until then.
export function playoffFinish(brackets) {
    const [championship, third] = brackets;
    const rounds = asArray(championship && championship.playoffRound);
    const games = (round) => asArray(round && round.playoffGame);
    const decided = (game) => game && game.home && game.away && game.home.points !== undefined && game.away.points !== undefined;
    const loser = (game) => (Number(game.home.points) >= Number(game.away.points) ? game.away : game.home);
    const winner = (game) => (loser(game) === game.home ? game.away : game.home);
    const firstRound = games(rounds[0]);
    const final = games(rounds[rounds.length - 1])[0];
    const thirdGame = games(asArray(third && third.playoffRound)[0])[0];
    if (!firstRound.every(decided) || !decided(final) || !decided(thirdGame)) {
        return null;
    }
    const firstLosers = firstRound.map(loser).sort((a, b) => Number(b.seed || 0) - Number(a.seed || 0)).map((side) => side.franchise_id);
    return [...firstLosers, loser(thirdGame).franchise_id, winner(thirdGame).franchise_id, loser(final).franchise_id, winner(final).franchise_id];
}

// This site's draft from `draftResults`: rounds of picks, each with its team (and the original
// owner if traded), the player once picked, and his salary today ("—" once released)
export function draftBoard(draftResults, {names, players, salaries}) {
    const picks = asArray(draftResults && draftResults.draftUnit).flatMap((unit) => asArray(unit.draftPick));
    const rounds = new Map();
    picks.forEach((pick, index) => {
        const round = Number(pick.round);
        if (!rounds.has(round)) {
            rounds.set(round, []);
        }
        const player = pick.player ? players.get(pick.player) : null;
        rounds.get(round).push({
            overall: index + 1,
            number: `${round}.${pick.pick}`,
            team: pick.franchise,
            teamName: names.get(pick.franchise) || pick.franchise,
            player: player ? {id: player.playerId, name: player.fullName, position: player.nflPosition} : null,
            salary: player && salaries.has(player.playerId) ? salaries.get(player.playerId) : null
        });
    });
    return [...rounds].sort((a, b) => a[0] - b[0]).map(([round, list]) => ({round, picks: list}));
}

export const drafted = (board) => board.some((round) => round.picks.some((pick) => pick.player));
