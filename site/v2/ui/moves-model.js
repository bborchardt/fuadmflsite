// What Moves' sections share (Add, Drop, IR, Trades, Bids, and moves.js): the league's contract
// lengths, MFL's player names and list entries, the season's phase for adds, the team as the checks
// take it, how a cap change shows, and MFL's waiver calendar (Home's dates read it too). No DOM or
// fetching, so the models that use it can be checked on saved pages.

import {asArray, displayName as firstLast} from "../lib/mfl.js";
import {projectBids} from "../lib/bids.js";
import {SALARY_CAP, withOthers} from "../lib/rules.js";
import {cents, money} from "./format.js";
import {SUFFIXES} from "../lib/names.js";
import {MAX_YEARS, MIN_YEARS} from "../lib/contract-years.js";
import {zoneOffset} from "../lib/zone.js";

const DAY = 24 * 60 * 60;

// the league's contract lengths
export const LENGTHS = Array.from({length: MAX_YEARS - MIN_YEARS + 1}, (_, i) => MIN_YEARS + i);
// one of them in a regular expression, the longest first so "10" isn't read as "1"
export const LENGTH_PATTERN = `(?:${LENGTHS.slice().reverse().join("|")})`;

// "Harrison Jr." → "Harrison"
export const SUFFIX = new RegExp(`\\s+(${[...SUFFIXES].join("|")})\\.?$`, "i");

// one `new Player2 (...)` call's arguments: quoted strings (names hold commas) and bare numbers
export function args(text) {
    return (text.match(/"(?:[^"\\]|\\.)*"|[^,\s][^,]*/g) || []).map((arg) => {
        const trimmed = arg.trim();
        return trimmed.startsWith("\"") ? trimmed.slice(1, -1).replace(/\\(.)/g, "$1") : trimmed;
    });
}

// "Montgomery, Tyren (R)#" → {mflName: "Montgomery, Tyren", mark: "#", rookie: true}. MFL's marks:
// `#` locked by the global player lock, `!` his game has started, `*` dropped recently.
export function readMarks(name) {
    let rest = String(name).trim();
    const mark = (rest.match(/[#!*]+$/) || [""])[0];
    rest = rest.slice(0, rest.length - mark.length).trim();
    const rookie = /\(R\)$/.test(rest);
    return {mflName: rest.replace(/\s*\(R\)$/, ""), mark: mark ? mark[mark.length - 1] : null, rookie};
}

export {firstLast};

// "Harrison Jr., Marvin" → "Harrison": the name a comment line goes by, as the job's reader takes it
export const surname = (mflName) => String(mflName).split(",")[0].trim().replace(SUFFIX, "");

// The season's phase for Add: "closed" before the draft, "preseason" from the draft to week 1's
// kickoff, "season", or "over" once week 17 is
export function addPhase({started, over, drafted}) {
    if (over) {
        return "over";
    }
    if (started) {
        return "season";
    }
    return drafted ? "preseason" : "closed";
}

// The team as Add checks it: cap used, active players, the pending groups (lib/bids.js), and the
// league model's players (for each drop's salary and cut penalty)
export function teamState(league, franchiseId, groups) {
    const franchise = league.franchises.get(franchiseId);
    return franchise ? {franchise, groups, players: league.players} : null;
}

export const projection = (team) => projectBids(team.franchise, team.groups, team.players);

export const isIR = (player) => Boolean(player && player.status === "INJURED_RESERVE");

// The team's roster for the drop step, by position: each player's cut penalty and the cap change a
// drop makes (his salary off, his penalty on), and whether the move can take him. `check(drop)`
// returns the move's checks with that drop; `marks` maps ids to MFL's drop list entries; `positions`
// the league's (lib/rules.js lineupPositions).
export function dropGroups(team, {marks, check, immediate, usedIn = new Map(), positions}) {
    const mine = [...team.players.values()].filter((player) => player.franchise === team.franchise);
    return withOthers(positions, mine.map((player) => player.nflPosition))
        .map((pos) => {
            const players = mine.filter((player) => player.nflPosition === pos)
                .sort((a, b) => b.salary - a.salary || b.years - a.years || a.fullName.localeCompare(b.fullName))
                .map((player) => {
                    const listed = marks.get(player.playerId) || {};
                    const result = check(player.playerId);
                    // an immediate add can't drop a player whose game has started; a bid drops him Wednesday
                    const started = immediate && listed.mark === "!";
                    return {
                        player,
                        listed,
                        penalty: player.capPenalty,
                        capChange: player.capPenalty - player.salary,
                        why: started ? "Game started" : result.why,
                        off: started || !result.fits,
                        usedIn: usedIn.get(player.playerId) || null
                    };
                });
            return {pos, players};
        })
        .filter((group) => group.players.length);
}

// a signed cap change: "+$5" (cap used goes up), "−$40" (down), "$0"
export function signed(amount) {
    const rounded = cents(amount);
    return rounded > 0 ? `+${money(rounded)}` : rounded < 0 ? `−${money(-rounded)}` : "$0";
}

export const changeTone = (amount) => (amount > 0 ? "bad" : amount < 0 ? "good" : "");

// cap used, red over the cap, green when it goes down
export const usedTone = (from, to) => (to > SALARY_CAP ? "bad" : to < from ? "good" : "");

// MFL's `pendingWaivers` with each group's comment, for groupViews
export function pendingWithComments(pendingWaivers, groups) {
    const comments = new Map(asArray(pendingWaivers && pendingWaivers.blindBidWaiverRequest).map((entry) => [Number(entry.round), entry.comments || ""]));
    return groups.map((group) => ({...group, comment: comments.get(group.round) || ""}));
}

// `weeks` after `first` at the same clock time in the league's zone: MFL's weekly runs stay at
// 11 p.m. when daylight time ends
const weeksLater = (first, weeks) => {
    const plain = first + weeks * 7 * DAY;
    return plain + zoneOffset(first) - zoneOffset(plain);
};

// MFL's weekly calendar events with a time: `happens` is how many weeks one repeats after the first
export const weeklyEvents = (calendar, types) => asArray(calendar && calendar.event).filter((event) => types.includes(event.type) && Number(event.start_time) > 1e9);
const lastRun = (event) => weeksLater(Number(event.start_time), Number(event.happens) || 0);

// Free agency ends with the last time free agents go on waivers, or the last bid run after it;
// null without a waiver lock on the calendar
export function freeAgencyEnd(calendar) {
    const waivers = weeklyEvents(calendar, ["WAIVER_LOCK", "WAIVER_BBID"]);
    return waivers.some((event) => event.type === "WAIVER_LOCK") ? Math.max(...waivers.map(lastRun)) : null;
}

// The first time after `now` of an event repeated weekly from `first`, `repeats` times after it;
// null once the last has passed
export function weeklyAfter(first, now, repeats) {
    let weeks = Math.max(0, Math.floor((now - first) / (7 * DAY)));
    for (;;) {
        if (weeks > repeats) {
            return null;
        }
        const at = weeksLater(first, weeks);
        if (at > now) {
            return at;
        }
        weeks += 1;
    }
}

// MFL's weekly event of a type after `now`, each repeated weekly as often as it says
export function nextWeekly(calendar, type, now) {
    const next = weeklyEvents(calendar, [type]).map((event) => weeklyAfter(Number(event.start_time), now, Number(event.happens) || 0)).filter(Boolean);
    return next.length ? Math.min(...next) : null;
}

// the last blind bid run on the calendar, null without one
export function lastBidRun(calendar) {
    const runs = weeklyEvents(calendar, ["WAIVER_BBID"]);
    return runs.length ? Math.max(...runs.map(lastRun)) : null;
}

// MFL's next blind bid run
export const nextBidRun = (calendar, now) => nextWeekly(calendar, "WAIVER_BBID", now);
