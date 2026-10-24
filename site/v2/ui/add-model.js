// Moves › Add's data and checks, from MFL's Add/Drop page (docs/mfl.md, Forms) and the league model:
// no DOM here, so each can be checked against saved pages. A bid that could put a team over a limit
// is invalid by league rule (5.5), so every move is checked with the pending bids as they could land.

import {asArray} from "../lib/mfl.js";
import {claimCapChange, projectBids} from "../lib/bids.js";
import {capPenalty, ROSTER_MAX, ROSTER_MIN, SALARY_CAP} from "../lib/rules.js";
import {clock, dayText, freeAgencyEnd, lastBidRun, nextWeekly} from "./home-model.js";

// the bylaws' contract lengths (lib/contract-years.js has them too, but its regular expressions
// need Safari 16.4+, so it isn't imported here)
export const LENGTHS = [1, 2, 3, 4, 5];
// MFL's conditional bidding (`maxWaiverRounds`)
export const MAX_GROUPS = 8;
// bylaw 9.4: a player the team dropped can't be re-added for this long
export const READD_HOURS = 48;
export const POSITIONS = ["QB", "RB", "WR", "TE", "PK"];

const SUFFIXES = /\s+(jr|sr|ii|iii|iv|v)\.?$/i;

// one `new Player2 (...)` call's arguments: quoted strings (names hold commas) and bare numbers
export function args(text) {
    return (text.match(/"(?:[^"\\]|\\.)*"|[^,\s][^,]*/g) || []).map((arg) => {
        const trimmed = arg.trim();
        return trimmed.startsWith("\"") ? trimmed.slice(1, -1).replace(/\\(.)/g, "$1") : trimmed;
    });
}

const number = (value) => {
    const parsed = parseFloat(String(value).replace(/[$,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
};

// "Montgomery, Tyren (R)#" → {mflName: "Montgomery, Tyren", mark: "#", rookie: true}. MFL's marks:
// `#` locked by the global player lock, `!` his game has started, `*` dropped recently.
export function readMarks(name) {
    let rest = String(name).trim();
    const mark = (rest.match(/[#!*]+$/) || [""])[0];
    rest = rest.slice(0, rest.length - mark.length).trim();
    const rookie = /\(R\)$/.test(rest);
    return {mflName: rest.replace(/\s*\(R\)$/, ""), mark: mark ? mark[mark.length - 1] : null, rookie};
}

// "Brown, A.J." → "A.J. Brown"
export const firstLast = (mflName) => {
    const [last, first] = String(mflName).split(",").map((part) => part.trim());
    return first ? `${first} ${last}` : last;
};

// "Harrison Jr., Marvin" → "Harrison": the name a comment line goes by, as the job's reader takes it
export const surname = (mflName) => String(mflName).split(",")[0].trim().replace(SUFFIXES, "");

// MFL's player lists on the Add/Drop page (`playerDatabaseObj["add"]` and `["drop"]`), from the
// page's script text: {add: [...], drop: [...]}, each player with his index in MFL's list
export function readPlayerLists(html) {
    const lists = {add: [], drop: []};
    const call = /pdb_(add|drop)\[(\d+)\]\s*=\s*new Player2\s*\(([^\n]*)\);/g;
    let found;
    while ((found = call.exec(html))) {
        const [id, name, nfl, pos, bye, sal, inj, roster, pts, opp, pwpts] = args(found[3]);
        const marks = readMarks(name);
        lists[found[1]].push({
            index: Number(found[2]),
            id,
            rawName: name,
            mflName: marks.mflName,
            name: firstLast(marks.mflName),
            mark: marks.mark,
            rookie: marks.rookie,
            nfl,
            pos,
            bye: number(bye),
            salary: number(sal) || 0,
            inj: inj || "",
            roster: roster || "",
            pts: number(pts),
            opp: opp || "",
            proj: number(pwpts)
        });
    }
    return lists;
}

// MFL's Inj column
const INJURIES = {O: "Out", Q: "Questionable", D: "Doubtful", I: "IR", S: "Suspended"};
export const injuryText = (code) => INJURIES[code] || "";

// what MFL's page does with a pick: the `#`, `!` and `*` players go in as blind bids
export const bidOnly = (player) => Boolean(player.mark);

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

// once free agency closes the next adds are the next draft's, on the next season's site
export const addsClosed = (phase) => phase === "closed" || phase === "over";

// free agency's end and the last bid run, worked out once per calendar
const ends = new WeakMap();
const waiverEnds = (calendar) => {
    if (!calendar) {
        return {closes: null, lastBid: null};
    }
    if (!ends.has(calendar)) {
        ends.set(calendar, {closes: freeAgencyEnd(calendar), lastBid: lastBidRun(calendar)});
    }
    return ends.get(calendar);
};

// whether a blind bid placed now still has a run to process it (in season, as above)
export const bidsLeft = (phase, calendar, now) => {
    const {lastBid} = waiverEnds(calendar);
    return phase !== "season" || lastBid === null || now <= lastBid;
};

// Free agency is over at the last waiver lock, or a bid run after it. Only in season: until the
// commissioner sets the new season's dates, the calendar may still hold last season's.
export function freeAgencyOver({phase, calendar, now}) {
    const {closes} = waiverEnds(calendar);
    return phase === "season" && Boolean(closes && now >= closes);
}

// "Sunday noon", "Wednesday 11 p.m."
const weekdayTime = (seconds) => `${new Date(seconds * 1000).toLocaleDateString("en-US", {weekday: "long", timeZone: "America/Chicago"})} ${timeText(seconds)}`;
const timeText = (seconds) => {
    const text = clock(seconds).replace(":00", "");
    return text === "12 p.m." ? "noon" : text;
};

// The banner: MFL decides per player, so the free agent window is open while any free agent can be
// added outright; the calendar says until when. `kind` is "window", "bids" or "closed".
export function banner({phase, freeAgents, calendar, now}) {
    if (addsClosed(phase)) {
        return {kind: "closed", text: "Adds open after the draft."};
    }
    const open = freeAgents.some((player) => !bidOnly(player));
    if (open) {
        const lock = nextWeekly(calendar, "WAIVER_LOCK", now);
        return {kind: "window", text: `Free agent window open${lock ? ` until ${weekdayTime(lock)} CT` : ""}`};
    }
    const run = nextWeekly(calendar, "WAIVER_BBID", now);
    // before week 1 the first run is a date to name
    const until = !run ? "" : phase === "preseason" ? ` until ${dayText(run)}, ${timeText(run)} CT` : ` until ${weekdayTime(run)} CT`;
    return {kind: "bids", text: `Blind bids only${until}`};
}

// The team's own drops within the last 48 hours (9.4): free agent id → when he can be bid on again,
// in seconds. `players` is the league model's, each with its transactions newest first.
export function droppedByTeam(players, franchiseId, now) {
    const blocked = new Map();
    for (const player of players.values()) {
        const latest = player.transactions && player.transactions[0];
        if (latest && !latest.added && latest.franchise && latest.franchise.franchiseId === franchiseId) {
            const until = latest.timestamp + READD_HOURS * 3600;
            if (until > now) {
                blocked.set(player.playerId, until);
            }
        }
    }
    return blocked;
}

export const reAddText = (seconds) => `Dropped by you · bid from ${new Date(seconds * 1000).toLocaleDateString("en-US", {weekday: "short", timeZone: "America/Chicago"})} ${clock(seconds)}`;

// MFL's `pendingWaivers` comment, its line breaks mangled to `br/`
export const commentLines = (comment) => String(comment || "").split(/\s*(?:<br\s*\/?>|br\/|\r?\n)\s*/).map((line) => line.trim()).filter(Boolean);

const yearsText = (years) => `${years} year${years === 1 ? "" : "s"}`;

// The named line a claim writes in its group's one comment ("Akins: 1 year"), so reordering can't
// move a length to another player; the full name when another claim in the group shares the surname.
export function lengthLine(mflName, years, otherNames = []) {
    const short = surname(mflName);
    const shared = otherNames.some((other) => other !== mflName && surname(other).toLowerCase() === short.toLowerCase());
    return `${shared ? firstLast(mflName) : short}: ${yearsText(years)}`;
}

const normalized = (text) => String(text).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// the comment line about a player, if any: one with his full name first, then his surname alone
// unless another of `otherNames` (the group's other claims) goes by it too
export function lineFor(lines, mflName, otherNames = []) {
    const has = (line, words) => ` ${normalized(line)} `.includes(` ${normalized(words)} `);
    const full = lines.find((line) => has(line, firstLast(mflName).replace(SUFFIXES, "")));
    if (full) {
        return full;
    }
    const short = surname(mflName);
    const shared = otherNames.some((other) => other !== mflName && surname(other).toLowerCase() === short.toLowerCase());
    return shared ? null : lines.find((line) => has(line, short)) || null;
}

// When a claim joins a group whose one other claim goes by the same surname, that claim's short
// line ("Harrison: 2 years", written while he was alone) takes his full name, so the two can't mix
export function fullNameLines(lines, joining, otherNames) {
    const short = surname(joining).toLowerCase();
    const sharing = otherNames.filter((other) => other !== joining && surname(other).toLowerCase() === short);
    if (sharing.length !== 1) {
        return lines;
    }
    return lines.map((line) => {
        const found = line.match(/^([^:]+):\s*(.*)$/);
        return found && normalized(found[1]) === normalized(surname(sharing[0])) ? `${firstLast(sharing[0])}: ${found[2]}` : line;
    });
}

// a line as Add writes it ("Akins: 1 year"), rather than a member's own note
export const isLengthLine = (line) => /^[^:\n]{1,60}:\s*[1-5]\s*years?$/i.test(String(line || "").trim());

// a line's length, when it gives one plainly
export function yearsIn(line) {
    const found = String(line || "").match(/\b([1-5])\s*(?:years?|yrs?)\b/i);
    return found ? Number(found[1]) : null;
}

// The group's comment with `mflName`'s line replaced by `line` (or added), or removed when `line`
// is null
export function rewriteComment(comment, mflName, line, otherNames = []) {
    const lines = commentLines(comment);
    const old = lineFor(lines, mflName, otherNames);
    const kept = lines.filter((entry) => entry !== old);
    if (line) {
        const at = old ? lines.indexOf(old) : kept.length;
        kept.splice(at, 0, line);
    }
    return kept.join("\n");
}

export const claimKey = (round, claim) => `${round}_${claim.add}_${claim.bid}_${claim.drop || "0000"}`;

// The team as Add checks it: cap used, active players, the pending groups (lib/bids.js), and the
// league model's players (for each drop's salary and cut penalty)
export function teamState(league, franchiseId, groups) {
    const franchise = league.franchises.get(franchiseId);
    return franchise ? {franchise, groups, players: league.players} : null;
}

// projectBids with `change` applied to the groups: {round, claim} added, `without` (a claim key)
// taken out first
function projectWith(team, {add = null, without = null} = {}) {
    let groups = team.groups.map((group) => ({round: group.round, claims: group.claims.filter((claim) => claimKey(group.round, claim) !== without)}));
    if (add) {
        const existing = groups.find((group) => group.round === add.round);
        if (existing) {
            existing.claims = existing.claims.concat([add.claim]);
        } else {
            groups = groups.concat([{round: add.round, claims: [add.claim]}]);
        }
    }
    return projectBids(team.franchise, groups.filter((group) => group.claims.length), team.players);
}

export const projection = (team) => projectBids(team.franchise, team.groups, team.players);

const isIR = (player) => player && player.status === "INJURED_RESERVE";

// Why the team can't add anyone now, or null. Outside the limits only moves toward them are allowed
// (10.5): over 30 active in season, no adds at all.
export function addBlock(team, {phase}) {
    if (phase === "season" && team.franchise.numPlayers > ROSTER_MAX) {
        return "over roster limit";
    }
    return null;
}

// The most a claim in `round` can bid with `drop`, so that with every other group's costliest claim
// the cap still holds, or (bids already over it) isn't taken further past it. `without` is the claim
// being edited.
export function maxBid(team, {round, drop, without = null}) {
    const others = team.groups.filter((group) => group.round !== round).map((group) => ({
        round: group.round, claims: group.claims.filter((claim) => claimKey(group.round, claim) !== without)
    })).filter((group) => group.claims.length);
    const othersCap = projectBids(team.franchise, others, team.players).cap;
    // the drop's own change to cap used: his salary off, his penalty on
    const dropChange = drop ? claimCapChange({bid: 0, drop}, team.players) : 0;
    return Math.max(0, Math.floor(Math.max(SALARY_CAP, projection(team).cap) - othersCap - dropChange));
}

// What a move does to a limit the pending bids could break: it's blocked only when it takes cap used
// or the roster past the limit, or further past it. Bids already over a limit are "Current bids
// invalid" until fixed; a move that leaves them as they are (a swap before the season, at 34 active)
// isn't what breaks them.
function worse(before, after) {
    return {
        cap: after.cap > SALARY_CAP && after.cap > before.cap,
        roster: after.roster > ROSTER_MAX && after.roster > before.roster
    };
}

// A bid's checks: {fits, why, cap: {from, to}, roster: {from, to}} for `claim` ({add, bid, drop}) in
// `round`. Each group awards one claim, so the group's costliest claim is what could land.
export function checkBid(team, {round, claim, without = null, phase}) {
    const before = projection(team);
    const after = projectWith(team, {add: {round, claim}, without});
    const dropped = claim.drop && team.players.get(claim.drop);
    let why = null;
    if (claim.bid < 1) {
        why = "Bids start at $1.";
    } else if (worse(before, after).cap) {
        why = "over cap";
    } else if (phase !== "over" && worse(before, after).roster) {
        why = "over roster limit";
    } else if (phase === "season" && team.franchise.numPlayers > ROSTER_MAX) {
        why = "over roster limit";
    } else if (phase === "season" && dropped && !isIR(dropped) && team.franchise.numPlayers < ROSTER_MIN) {
        // under 23 only moves toward the minimum: an add with an active player's drop isn't one
        why = "under roster minimum";
    }
    return {fits: !why, why, cap: {from: before.cap, to: after.cap}, roster: {from: before.roster, to: after.roster}};
}

// An immediate add's checks: it lands now, so every pending group still has to fit after it.
// `cost` is the free agent's salary on MFL's page.
export function checkAdd(team, {cost, drop, phase}) {
    const before = projection(team);
    const dropped = drop && team.players.get(drop);
    const frees = dropped ? dropped.salary - dropped.capPenalty : 0;
    const franchise = {
        ...team.franchise,
        capTotal: Math.round((team.franchise.capTotal + cost - frees) * 100) / 100,
        numPlayers: team.franchise.numPlayers + (dropped && !isIR(dropped) ? 0 : 1)
    };
    // a pending claim dropping the same player can't drop him after this: it counts as no drop
    const groups = !drop ? team.groups : team.groups.map((group) => ({
        round: group.round, claims: group.claims.map((claim) => (claim.drop === drop ? {...claim, drop: null} : claim))
    }));
    const after = projectBids(franchise, groups, team.players);
    let why = null;
    if (worse(before, after).cap) {
        why = "over cap";
    } else if (phase !== "over" && worse(before, after).roster) {
        why = "over roster limit";
    } else if (phase === "season" && team.franchise.numPlayers > ROSTER_MAX) {
        why = "over roster limit";
    } else if (phase === "season" && dropped && !isIR(dropped) && team.franchise.numPlayers < ROSTER_MIN) {
        why = "under roster minimum";
    }
    return {fits: !why, why, cap: {from: before.cap, to: after.cap}, roster: {from: before.roster, to: after.roster}};
}

// "Blocked: …" for a move that doesn't fit, naming the limit
export function blockedText(why, bids) {
    if (why === "over cap") {
        return bids ? "Blocked: with your other groups' max bids, this bid could exceed the salary cap." : "Blocked: with your pending bids, this add could exceed the salary cap. Lower a bid or remove a claim first.";
    }
    if (why === "over roster limit") {
        return bids ? "Blocked: with your other groups, this bid could make more than 30 active players. Pick a drop." : "Blocked: with your pending bids, this add could make more than 30 active players. Pick a drop, or remove a claim first.";
    }
    if (why === "under roster minimum") {
        return `Blocked: under ${ROSTER_MIN} active, an add can't drop an active player.`;
    }
    return why ? `Blocked: ${why}` : "";
}

// The team's roster for the drop step, by position: each player's cut penalty and the cap change a
// drop makes (his salary off, his penalty on), and whether the move can take him. `check(drop)`
// returns the move's checks with that drop; `marks` maps ids to MFL's drop list entries.
export function dropGroups(team, {marks, check, immediate, usedIn = new Map()}) {
    const mine = [...team.players.values()].filter((player) => player.franchise === team.franchise);
    return POSITIONS.concat([...new Set(mine.map((player) => player.nflPosition))].filter((pos) => !POSITIONS.includes(pos)))
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

// What one length would cost to cut later, at `salary`
export const cutLater = (salary, years) => capPenalty(years, salary);

// a signed cap change: "+$5" (cap used goes up), "−$40" (down), "$0"
export function signed(amount) {
    const rounded = Math.round(amount * 100) / 100;
    return rounded > 0 ? `+$${rounded}` : rounded < 0 ? `−$${-rounded}` : "$0";
}

export const changeTone = (amount) => (amount > 0 ? "bad" : amount < 0 ? "good" : "");

// cap used, red over the cap, green when it goes down
export const usedTone = (from, to) => (to > SALARY_CAP ? "bad" : to < from ? "good" : "");

// Free agents for the list, MFL's projection first. `blocked` is droppedByTeam's map.
export function freeAgentRows(freeAgents, {blocked = new Map(), text = "", pos = "ALL", sort = "proj", bids = true, watched = null}) {
    const query = normalized(text);
    const rows = freeAgents
        .filter((player) => (pos === "ALL" || player.pos === pos) && (!query || normalized(player.name).includes(query)) && (!watched || watched.has(player.id)))
        .map((player) => {
            const until = blocked.get(player.id);
            // with no bid run left, a bid-only player can't be had
            const late = !bids && bidOnly(player);
            return {player, bid: bidOnly(player), off: Boolean(until) || late, why: until ? reAddText(until) : late ? "No bid runs left" : player.mark === "!" ? "Game started" : ""};
        });
    const by = {
        proj: (a, b) => (b.player.proj || 0) - (a.player.proj || 0) || (b.player.pts || 0) - (a.player.pts || 0),
        pts: (a, b) => (b.player.pts || 0) - (a.player.pts || 0) || (b.player.proj || 0) - (a.player.proj || 0),
        name: () => 0
    };
    return rows.sort((a, b) => by[sort](a, b) || a.player.mflName.localeCompare(b.player.mflName));
}

// The groups for display: each claim's names, its line in the group's comment, its cap change
export function groupViews(team, pending, names) {
    return pending.map((group) => {
        const lines = commentLines(group.comment);
        const claims = group.claims.map((claim, i) => {
            const add = names(claim.add);
            const drop = claim.drop ? names(claim.drop) : null;
            const change = claimCapChange(claim, team.players);
            return {...claim, rank: i + 1, key: claimKey(group.round, claim), addName: add.name, addMfl: add.mflName,
                dropName: drop ? drop.name : null, line: lineFor(lines, add.mflName, group.claims.map((other) => names(other.add).mflName)), change};
        });
        return {round: group.round, comment: group.comment, claims, max: Math.max(0, ...claims.map((claim) => claim.change))};
    });
}

// MFL's `pendingWaivers` with each group's comment, for groupViews
export function pendingWithComments(pendingWaivers, groups) {
    const comments = new Map(asArray(pendingWaivers && pendingWaivers.blindBidWaiverRequest).map((entry) => [Number(entry.round), entry.comments || ""]));
    return groups.map((group) => ({...group, comment: comments.get(group.round) || ""}));
}

// The group a copy can go to: each other group and the next, whether the copy fits
export function copyTargets(team, {round, claim, rounds, phase}) {
    const next = Math.max(0, ...rounds) + 1;
    const targets = rounds.filter((other) => other !== round).concat(rounds.length < MAX_GROUPS ? [next] : []);
    return targets.map((target) => {
        const taken = (team.groups.find((group) => group.round === target) || {claims: []}).claims.some((other) => other.add === claim.add);
        const result = checkBid(team, {round: target, claim, phase});
        return {round: target, isNew: target === next, off: taken || !result.fits, why: taken ? "" : result.why};
    });
}
