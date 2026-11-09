// Backup starters (bylaw 16.5): reading members' posts in the board's "Conditional starters" thread,
// and the lineup a team's week should end with, for the daily job, which swaps the backups in; the
// rules are in docs/design.md. In site/, so no lookbehind (old iPhones).

import {SUFFIXES, normalize} from "./names.js";
import {postText as decode} from "./contract-years.js";
import {asArray} from "./mfl.js";

export const THREAD_TITLE = "Conditional starters";
// 16.5.4: due 5 minutes before the earlier kickoff of the two
export const DEADLINE_BEFORE_KICKOFF = 5 * 60;

// words a member puts beside a name: "Parker Washington WR", "Adams (LAR)"
const EXTRA = new Set(["qb", "rb", "wr", "te", "pk", "k", "please", "pls", "instead", "thanks", "thx", "then", "in", "his", "her", "their",
    "place", "spot", "for", "him", "the", "lineup", "starting", "start", "at", "flex", "and", "or", "ok", "is", "out", "if", "bench", "team"]);


// "Last, First" → its forms, as members write them
function forms(name) {
    const [last, first = ""] = String(name).split(",").map((part) => part.trim());
    const surname = normalize(last).split(" ").filter((word) => !SUFFIXES.has(word)).join(" ");
    const given = normalize(first);
    // "A.J." is also written "AJ"
    const joined = given.replace(/ /g, "");
    return {full: given ? `${given} ${surname}` : surname, joinedFull: joined ? `${joined} ${surname}` : surname, initial: given ? `${given[0]} ${surname}` : surname, surname, given, joined};
}

function distance(a, b) {
    const row = Array.from({length: b.length + 1}, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let previous = row[0];
        row[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const kept = row[j];
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
            previous = kept;
        }
    }
    return row[b.length];
}

const words = (text) => ` ${text} `;
const has = (text, phrase) => Boolean(phrase) && words(text).includes(words(phrase));

const near = (word, f) => word.length >= 4 && f.surname.split(" ").some((part) => part.length >= 4 && distance(word, part) <= (part.length >= 8 ? 2 : 1));

// The team's player a phrase names: by full name, then "P. Washington", surname, first name ("Puka"),
// then a surname a letter or two off ("Chabonnet"); a part name only when the phrase has no other
// name in it ("Malik Nabers" isn't Malik Washington). `{player}`, `{ambiguous: [...]}` or `{none: true}`.
export function matchPlayer(phrase, players) {
    const text = normalize(phrase);
    const named = text.split(" ").filter((word) => word && !EXTRA.has(word) && !SUFFIXES.has(word) && !/^\d+$/.test(word));
    const alone = (f) => named.every((word) => f.surname.split(" ").includes(word) || f.given.split(" ").includes(word)
        || word === f.joined || word === f.given[0] || near(word, f));
    const levels = [
        (f) => has(text, f.full) || has(text, f.joinedFull),
        (f) => has(text, f.initial),
        (f) => has(text, f.surname) && alone(f),
        (f) => Boolean(f.given) && has(text, f.given) && alone(f),
        (f) => named.some((word) => near(word, f)) && alone(f)
    ];
    for (const level of levels) {
        const found = players.filter((player) => level(forms(player.name)));
        if (found.length === 1) {
            return {player: found[0]};
        }
        if (found.length > 1) {
            // "Josh Allen" names one even where a surname alone would name two
            return {ambiguous: found};
        }
    }
    return {none: true};
}

// A post's text split where a member ends one request: a line, ";", a sentence's "." (not an
// initial's or a name's, as in "P. Washington", "St. Brown", "Harrison Jr."), or a second "if"
const ABBREVIATION = /(?:^|[^A-Za-z])(?:st|jr|sr|mr)$/i;
function clauses(text) {
    const out = [];
    let current = "";
    const flush = () => {
        if (current.trim()) {
            out.push(current.trim());
        }
        current = "";
    };
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === "\n" || ch === ";") {
            flush();
        } else if (ch === "." && /\s/.test(text[i + 1] || " ") && /[A-Za-z]{2,}$/.test(current) && !ABBREVIATION.test(current)) {
            flush();
        } else {
            current += ch;
        }
    }
    flush();
    // "If Puka is out start Parker, and if Kelce is out start Likely": a request each
    return out.flatMap((clause) => clause.split(/[\s,]*(?:\band\s+)?(?=\bif\b)/i)).map((each) => each.trim()).filter(Boolean);
}

// "Week4:", "Week 8", "wk 9"
const WEEK = /\b(?:week|wk)\s*(\d{1,2})\b/i;
const IF_OUT = /\bif\s+(.+?)\s+(?:is|isn'?t|isnt|doesn'?t|doesnt|does not|can'?t|cant|cannot|won'?t|wont|will not|was|gets|ends up|turns out)\b(.*)$/i;
// the last such verb: "doesn't play please start Malik Washington"
const START = /^.*\b(?:start|insert|play|use|sub(?:stitute)?|put in|swap in|plug in|go with)\s+(?:in\s+)?(.+)$/i;
const NO_BACKUP = /\bno\s+(?:backups?|conditionals?|conditional starters?)(?:\s+(?:for|on)\s+(.+))?/i;
const REMOVED = /\b(?:backups?|conditional starters?)\s+(?:were\s+|are\s+)?(?:removed|cancel+ed|withdrawn)\b/i;

// MFL's post HTML as text, its line breaks kept, a tag a space ("<b>If</b>Puka")
export function postText(html) {
    return decode(String(html).replace(/<(?!br\b)[^>]+>/gi, " ")).replace(/[ \t\u00a0]+/g, " ");
}

// a time as MFL's pages write it, "Sun Oct 25 7:27:31 p.m. CT 2026"
const MFL_TIME = /[A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2} \d{1,2}:\d{2}:\d{2} [ap]\.m\. [A-Z]+ \d{4}/;

// What a post asks, before names are matched: {week, weeks, requests: [{starter, backup}], removals:
// [phrase], removeAll, unreadable: [clause]}. Text without an "if" (a reminder, "done") asks nothing;
// an "if" it can't read is `unreadable`, for the commissioner.
export function readRequests(text) {
    const plain = String(text).replace(/’/g, "'");
    const weekMatch = WEEK.exec(plain);
    const weeks = new Set([...plain.matchAll(new RegExp(WEEK.source, "gi"))].map((match) => Number(match[1])));
    const result = {week: weekMatch ? Number(weekMatch[1]) : null, weeks: [...weeks], requests: [], removals: [], removeAll: false, unreadable: []};
    // "Start Parker if Puka is out": the backup comes first, the "if" a clause of its own
    let backupFirst = null;
    for (const clause of clauses(plain)) {
        const body = clause.replace(WEEK, " ").replace(/^[\s:,-]+/, "");
        const condition = IF_OUT.exec(body);
        const start = condition && START.exec(condition[2]);
        const before = backupFirst;
        backupFirst = !/\bif\b/i.test(body) && START.exec(body) ? {backup: START.exec(body)[1], clause} : null;
        if (condition && start) {
            result.requests.push({starter: condition[1], backup: start[1], text: clause});
            continue;
        }
        if (condition && before && !/\w/.test(condition[2].replace(/\b(?:out|inactive|active|playing|play|in|the|game)\b/gi, ""))) {
            result.requests.push({starter: condition[1], backup: before.backup, text: `${before.clause} ${clause}`});
            continue;
        }
        const none = NO_BACKUP.exec(body);
        if (none && none[1]) {
            result.removals.push(none[1]);
        } else if (none || REMOVED.test(body)) {
            result.removeAll = true;
        } else if (/\bif\b/i.test(body)) {
            result.unreadable.push(clause);
        }
    }
    return result;
}

// MFL's topic page, read without a DOM (the job's): each post's team (null for the commissioner),
// times in MFL's words, and its HTML. `pages`: the other pages' links, for a long topic.
export function readTopicPage(html) {
    const posts = [];
    // a post the login hasn't read yet is "frm pst new"
    const blocks = String(html).split(/<div class=['"]frm pst\b[^'"]*['"]/i).slice(1);
    for (const block of blocks) {
        const team = /F=(\d{4})&amp;O=01/.exec(block) || /F=(\d{4})&O=01/.exec(block);
        const head = /<td class="message">([\s\S]*?)<\/td>/i.exec(block);
        const body = /<tr class="eventablerow">[\s\S]*?<td class="message">([\s\S]*?)<\/td>/i.exec(block);
        if (!team || !head || !body) {
            throw new Error("MFL's topic page has a post without its team, time or text where expected");
        }
        const plainHead = head[1].replace(/<[^>]+>/g, " ");
        const [posted, edited] = plainHead.split(/\bEdited\b/);
        const time = (part) => (MFL_TIME.exec(part || "") || [])[0] || null;
        if (!time(posted) || (edited !== undefined && !time(edited))) {
            throw new Error("MFL's topic page has a post whose time can't be read");
        }
        posts.push({franchiseId: team[1] === "0000" ? null : team[1], posted: time(posted), edited: time(edited), html: body[1]});
    }
    const pager = /<span class=['"]pln['"]>([\s\S]*?)<\/span>/i.exec(html);
    const pages = pager ? [...new Set([...pager[1].matchAll(/href=['"]([^'"]*topic_show[^'"]*)['"]/gi)].map((match) => match[1].replace(/&amp;/g, "&")))] : [];
    return {posts, pages};
}

// "Smith, Geno NYJ QB", "Bills, Buffalo BUF Def" → {name, nfl, pos}
function lineupEntry(text) {
    const match = /^(.+?)\s+([A-Z]{2,3}\*?)\s+([A-Z][A-Za-z]{0,3})$/.exec(text.trim());
    return match ? {name: match[1].trim(), nfl: match[2].replace("*", ""), pos: match[3]} : null;
}

// MFL's Lineup Details (`options?O=210&FRANCHISE=…&W=…`): every submission of a team's lineup for
// the week, oldest first, failed ones too. `at` is MFL's time words; `unread`, a starter it couldn't
// read; `message`, the lineup's Optional Message as text.
export function readLineupDetails(html) {
    const table = /<table[^>]*class="report"[^>]*>([\s\S]*?)<\/table>/i.exec(html);
    if (!table || !/Lineup Submitted/i.test(table[1])) {
        throw new Error("MFL's Lineup Details page has no lineup table where expected");
    }
    const submissions = [];
    for (const row of table[1].match(/<tr\b[\s\S]*?<\/tr>/gi) || []) {
        const raw = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cell[1]);
        const cells = raw.map((cell) => postText(cell).replace(/\s+/g, " ").trim());
        if (cells.length < 4 || !/^\d+$/.test(cells[0])) {
            continue;
        }
        const failed = /Lineup Submission Failed/i.test(cells[2]);
        const starters = [];
        // MFL's notes ("Reserved … after kickoff") follow a <br>, and a failure's reasons follow
        // "Error(s)"; then "Smith, Geno NYJ QB, Stafford, …": a name's own comma, then the list's
        const list = postText(raw[2].split(/<br\s*\/?>/i)[0]).replace(/\s+/g, " ").replace(/\s*Error\(s\)[\s\S]*$/i, "");
        const parts = list.replace(/^\s*Lineup Submission Failed:\s*/i, "").split(",").map((part) => part.trim()).filter(Boolean);
        let unread = parts.length % 2 === 1;
        for (let i = 0; i + 1 < parts.length; i += 2) {
            const entry = lineupEntry(`${parts[i]}, ${parts[i + 1]}`);
            if (entry) {
                starters.push(entry);
            } else {
                unread = true;
            }
        }
        // the time is in the cell after the message, which could hold words like one
        const at = (MFL_TIME.exec(cells.slice(cells.length > 4 ? 4 : 3).join(" ")) || [])[0] || null;
        const message = cells.length > 4 ? postText(raw[3]).trim() : "";
        // one without its time can't be placed before or after a deadline
        submissions.push({week: Number(cells[0]), commish: /\(C\)/.test(cells[1]), failed, starters, unread: unread || !at, at, message});
    }
    return submissions;
}

// "1-2" → [1, 2]
const range = (limit) => {
    const [low, high = low] = String(limit).split("-").map(Number);
    return [low, high];
};

// MFL's lineup rules from its league export: {count, limits: {QB: [1, 2], …}}
export function lineupRules(league) {
    const starters = (league && league.starters) || {};
    const limits = {};
    for (const position of asArray(starters.position)) {
        limits[position.name] = range(position.limit);
    }
    return {count: Number(starters.count) || null, limits};
}

// whether starters at these positions make a lineup MFL takes
export function fits(positions, rules) {
    if (rules.count && positions.length !== rules.count) {
        return false;
    }
    return Object.entries(rules.limits).every(([pos, [low, high]]) => {
        const count = positions.filter((each) => each === pos).length;
        return count >= low && count <= high;
    });
}

// Where a lineup breaks MFL's ranges if `pairs`' starters are out, in the worst case at each
// position (every pair leaving it swapped, or every pair filling it): null if it keeps within them,
// else {pos, count, limit, over}, or {pos: null} when the lineup itself doesn't fit
export function pairsBreak(starters, pairs, positionOf, rules) {
    if (!fits(starters.map(positionOf), rules)) {
        return {pos: null};
    }
    for (const [pos, [low, high]] of Object.entries(rules.limits)) {
        const count = starters.filter((id) => positionOf(id) === pos).length;
        const leaving = pairs.filter((pair) => positionOf(pair.starter) === pos && positionOf(pair.backup) !== pos).length;
        const filling = pairs.filter((pair) => positionOf(pair.backup) === pos && positionOf(pair.starter) !== pos).length;
        if (count + filling > high) {
            return {pos, count: count + filling, limit: high, over: true};
        }
        if (count - leaving < low) {
            return {pos, count: count - leaving, limit: low, over: false};
        }
    }
    return null;
}

// What v2 writes in a lineup's message for the team's week, as readRequests reads it: `pairs`
// [{starter, backup}] and `removed` [starter] by name. Semicolons part them, as a name's "Jr." may
// end in a full stop.
export function backupText(week, pairs, removed) {
    const asks = [
        ...pairs.map((pair) => `if ${pair.starter} is out, start ${pair.backup}`),
        ...removed.map((name) => `no backup for ${name}`)
    ];
    const text = asks.length ? asks.join("; ") : "No backups";
    return `Week ${week}: ${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

// The lineup messages that ask for backups in `week`, from readLineupDetails' submissions of the
// week, oldest first: [{submission, asks}]. Whatever an app does with the box, one changes nothing
// when it isn't backups (empty, a note), names another week (carried from it), repeats the lineup's
// before it (MFL's own page refills the box), or is the commissioner's (the job's own lineups carry
// the last message forward). A failed lineup's isn't kept.
export function backupMessages(submissions, week) {
    const found = [];
    let before = "";
    for (const submission of submissions.filter((each) => !each.failed)) {
        const repeat = submission.message === before;
        before = submission.message;
        if (repeat || submission.commish || !submission.at) {
            continue;
        }
        const asks = readRequests(submission.message);
        const backups = asks.requests.length || asks.removals.length || asks.removeAll || asks.unreadable.length;
        if (backups && (!asks.weeks.length || asks.weeks.includes(week))) {
            found.push({submission, asks});
        }
    }
    return found;
}

// What a post on the thread asks, read the same for Lineup, Scores and the job
export const postAsks = (post) => readRequests(postText(post.html));

// a pair's deadline (16.5.4): five minutes before the earlier of its players' kickoffs, or null when
// either has no game; `kickoffOf(id)`, in seconds
export const pairDeadline = (kickoffOf) => (starter, backup) => {
    const [a, b] = [kickoffOf(starter), kickoffOf(backup)];
    return a && b ? Math.min(a, b) - DEADLINE_BEFORE_KICKOFF : null;
};

// the week a post names, if the season has it
export const namedWeek = (asks, championship) => (asks.week >= 1 && asks.week <= championship ? asks.week : null);

// The week a post's requests are for: the one it names, else the one it was posted in. One naming a
// week the season doesn't have is `badWeek`, taken as the week it was posted; one an edit moved into
// another week is `editedLate`, and counts for none, as a new week's backups go in a new post.
// `postedWeek`, `editedWeek`: the weeks whose games were still to come when it was posted and last
// edited (not needed for a post naming its week).
export function postWeek(asks, {postedWeek, editedWeek}, championship) {
    const named = namedWeek(asks, championship);
    if (named) {
        return {week: named, badWeek: false, editedLate: false};
    }
    return {week: editedWeek, badWeek: Boolean(asks.week), editedLate: editedWeek !== postedWeek};
}

// The requests a team's sources make, for standingPairs. A source: {at, asks}, a post's also with
// `editedLate`. `who(phrase, source)`: the player's id, or null. `flag(why, source, clause)` hears
// what keeps a source, or part of it, from counting: "edited-late", "bad-week" (counted, as its
// posted week's), "weeks" (it names more than one) and "unreadable" (each clause).
export function sourceRequests(sources, who, flag = () => {}) {
    const requests = [];
    for (const source of sources) {
        const {asks} = source;
        if (source.editedLate) {
            flag("edited-late", source);
            continue;
        }
        if (source.badWeek) {
            flag("bad-week", source);
        }
        if (asks.weeks.length > 1) {
            flag("weeks", source);
            continue;
        }
        for (const clause of asks.unreadable) {
            flag("unreadable", source, clause);
        }
        for (const ask of asks.requests) {
            const starter = who(ask.starter, source);
            const backup = who(ask.backup, source);
            if (starter && backup) {
                requests.push({at: source.at, starter, backup, source});
            }
        }
        for (const phrase of asks.removals) {
            const starter = who(phrase, source);
            if (starter) {
                requests.push({at: source.at, starter, remove: true, source});
            }
        }
        if (asks.removeAll) {
            requests.push({at: source.at, removeAll: true, source});
        }
    }
    return requests;
}

// The pair standing for each starter: per starter, the latest request before the deadline of the
// pair it would set and of the one it replaces (16.5.5 locks a pair at its deadline). `requests`:
// [{at, starter, backup}] or [{at, starter, remove: true}] or [{at, removeAll: true}], any order.
// `deadline(starter, backup)`: seconds, or null when either has no game that week.
export function standingPairs(requests, deadline) {
    const pairs = new Map();
    const late = [];
    for (const request of [...requests].sort((a, b) => a.at - b.at)) {
        const targets = request.removeAll ? [...pairs.keys()] : [request.starter];
        for (const starter of targets) {
            const current = pairs.get(starter);
            const currentDue = current ? current.deadline : Infinity;
            if (request.remove || request.removeAll) {
                if (current && request.at < currentDue) {
                    pairs.delete(starter);
                } else if (current && !request.removeAll) {
                    late.push(request);
                }
                continue;
            }
            const due = deadline(starter, request.backup);
            if (due === null) {
                late.push({...request, noGame: true});
            } else if (request.at < Math.min(due, currentDue)) {
                pairs.set(starter, {starter, backup: request.backup, at: request.at, deadline: due});
            } else {
                late.push(request);
            }
        }
    }
    return {pairs: [...pairs.values()], late};
}

// the lineup at a moment: the latest submission before it that went through, or `carried` (last
// week's, which MFL keeps without one) when the week had none by then
export function lineupAt(submissions, at, carried) {
    const done = submissions.filter((submission) => !submission.failed && submission.at !== null && submission.at < at);
    return done.length ? done.reduce((latest, submission) => (submission.at > latest.at ? submission : latest)).starters : carried;
}

// The week's lineup by 16.5: each pair's starter and backup as they were at its deadline (16.5.5:
// later changes to them are ignored), then the backups in for starters who were out, in order of
// kickoff. `pairs` are standing pairs, each with `starting` (the deadline's lineup, ids); `final` the
// lineup MFL has. Returns {lineup, swaps, restored, flags}; a change it can't place is flagged.
export function weekLineup({pairs, final, out, positionOf, rules, kickoff}) {
    let lineup = [...final];
    const swaps = [];
    const restored = [];
    const flags = [];
    const active = [];
    for (const pair of pairs) {
        if (!pair.starting.includes(pair.starter) || pair.starting.includes(pair.backup)) {
            // 16.5.3: a backup only for a starter, and only from the bench
            continue;
        }
        active.push(pair);
    }
    const shared = new Set(active.map((pair) => pair.backup).filter((id, i, all) => all.indexOf(id) !== i));
    for (const pair of active.filter((each) => shared.has(each.backup))) {
        flags.push({pair, why: "same-backup"});
    }
    const usable = active.filter((pair) => !shared.has(pair.backup));
    // swaps already in the lineup (an earlier run's), which a restore leaves alone
    const swapped = usable.filter((pair) => !lineup.includes(pair.starter) && lineup.includes(pair.backup) && out.has(pair.starter) && !out.has(pair.backup));
    const kept = new Set(swapped.flatMap((pair) => [pair.starter, pair.backup]));
    for (const pair of usable) {
        // a locked pair changed afterwards: back as it was, the change's other player undone
        const starterGone = !lineup.includes(pair.starter);
        const backupIn = lineup.includes(pair.backup);
        // as it is, or already swapped (by this job, or the commissioner by hand)
        if ((!starterGone && !backupIn) || (starterGone && backupIn && out.has(pair.starter) && !out.has(pair.backup))) {
            continue;
        }
        let next = lineup.filter((id) => id !== pair.backup);
        if (!next.includes(pair.starter)) {
            next.push(pair.starter);
        }
        if (next.length > lineup.length) {
            // the starter's place went to someone added after the deadline
            const added = next.filter((id) => !pair.starting.includes(id) && id !== pair.starter && !kept.has(id));
            const fitting = added.filter((id) => fits(next.filter((each) => each !== id).map(positionOf), rules));
            if (fitting.length !== 1) {
                flags.push({pair, why: "cant-restore"});
                continue;
            }
            next = next.filter((id) => id !== fitting[0]);
        } else if (next.length < lineup.length) {
            const removed = pair.starting.filter((id) => !next.includes(id) && id !== pair.backup && !kept.has(id));
            const fitting = removed.filter((id) => fits([...next, id].map(positionOf), rules));
            if (fitting.length !== 1) {
                flags.push({pair, why: "cant-restore"});
                continue;
            }
            next.push(fitting[0]);
        }
        if (!fits(next.map(positionOf), rules)) {
            flags.push({pair, why: "cant-restore"});
            continue;
        }
        lineup = next;
        restored.push(pair);
    }
    const byKickoff = usable.filter((pair) => out.has(pair.starter) && !out.has(pair.backup))
        .sort((a, b) => (kickoff(a.starter) || 0) - (kickoff(b.starter) || 0));
    for (const pair of byKickoff) {
        if (!lineup.includes(pair.starter) || lineup.includes(pair.backup)) {
            continue;
        }
        const next = lineup.map((id) => (id === pair.starter ? pair.backup : id));
        if (!fits(next.map(positionOf), rules)) {
            flags.push({pair, why: "wont-fit"});
            continue;
        }
        lineup = next;
        swaps.push(pair);
    }
    return {lineup, swaps, restored, flags};
}
