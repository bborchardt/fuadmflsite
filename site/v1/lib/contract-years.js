// Contract years for added players: a player a team adds gets 0 years from MFL, and the owner
// states the length (1 to 5 years) in the blind bid's comment or in a message board post. This
// reads those, decides each new player's years, and flags anything unclear for the commissioner.
// Shared by the daily job's contract years chore and League Alerts, which shows owners what was
// read while their hour is open, so the two always agree. No DOM and no fetching.

import {contractDeadline as deadline} from "./adds.js";

export const MIN_YEARS = 1;
export const MAX_YEARS = 5;
/** Years for an add whose owner stated none. */
export const DEFAULT_YEARS = 1;

const asList = (value) => value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

/** Lower case, no accents or apostrophes, other punctuation as spaces ("D.Booker" is "d booker"). */
function normalize(text) {
    return String(text).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
        .replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** The ways a post might name a player: "Last, First" gives "first last", "f last" and "last". */
function nameForms(name) {
    const [last, first = ""] = String(name).split(",").map((part) => part.trim());
    const surname = normalize(last).split(" ").filter((word) => !SUFFIXES.has(word)).join(" ");
    const given = normalize(first);
    return {full: normalize(`${first} ${surname}`), initial: given ? `${given[0]} ${surname}` : surname, surname};
}

/** Whether text names a player in full or by initial and surname ("D. Jones"). */
const inFull = (normalized, player) => hasWords(normalized, nameForms(player.name).full) || hasWords(normalized, nameForms(player.name).initial);

const hasWords = (text, words) => words && ` ${text} `.includes(` ${words} `);

/**
 * The candidates a stretch of text names: by full name first, then by surname. A surname match
 * is ruled out when the text names one of `others` (players who aren't candidates) in full and
 * that full name contains the surname: "Josh Allen 3 years" is about a rostered Josh Allen, not
 * a pending Keenan Allen. Returns null if the text names only `others`, and [] if it names
 * nobody the job knows.
 */
function named(text, candidates, others = []) {
    const normalized = normalize(text);
    const byFull = candidates.filter((candidate) => inFull(normalized, candidate));
    if (byFull.length) {
        return byFull;
    }
    const othersInFull = others.filter((other) => inFull(normalized, other));
    const bySurname = candidates.filter((candidate) => {
        const surname = nameForms(candidate.name).surname;
        return hasWords(normalized, surname) && !othersInFull.some((other) => hasWords(nameForms(other.name).full, surname));
    });
    if (bySurname.length) {
        // a surname another of the team's pending adds shares is ambiguous: "Williams 2 years".
        // A player already under contract isn't getting a length, so he doesn't count
        const sharing = others.filter((other) => other.pending && bySurname.some((candidate) =>
            nameForms(other.name).surname === nameForms(candidate.name).surname));
        return [...bySurname, ...sharing];
    }
    return othersInFull.length || others.some((other) => hasWords(normalized, nameForms(other.name).surname)) ? null : [];
}

const NUMBER_WORDS = {one: 1, two: 2, three: 3, four: 4, five: 5};
// a count right after a digit, "." or "-" is part of something else: "1.5 years", "2-3 years"
const YEARS = /(\$\s*)?(?<![\d.,-])\b(\d+|one|two|three|four|five)\s*-?\s*(?:years?|yrs?)\b/gi;
/**
 * Where a sentence ends: a full stop after a word of three or more letters or a number, a line
 * break, or ; ! ?. Not after an initial or short abbreviation ("D. Jones", "St. Brown", "Jr.").
 */
const SENTENCE_END = /(?<=\b[A-Za-z]{3,}|\d)\.\s|[\n;!?]/;
/** Words that can sit beside a bare count without naming anyone: "1 year contract please". */
const FILLER = new Set(["a", "for", "each", "both", "the", "contract", "length", "deal", "please", "pls", "thanks", "thx", "on", "of", "him"]);

/** The year counts a text states, with where they sit: "Wilson 2yrs, Palmer 1 year" gives 2 and 1. */
export function yearMentions(text) {
    const mentions = [];
    for (const match of String(text).matchAll(YEARS)) {
        if (match[1]) {
            // "$5 yr" is a salary, not a length
            continue;
        }
        const word = match[2].toLowerCase();
        mentions.push({years: NUMBER_WORDS[word] || Number(word), start: match.index, end: match.index + match[0].length});
    }
    return mentions;
}

/** Whether a text is only a year count, maybe with filler words: it names nobody. */
function bare(text, mention) {
    const rest = normalize(text.slice(0, mention.start) + " " + text.slice(mention.end));
    return rest.split(" ").filter(Boolean).every((word) => FILLER.has(word));
}

/**
 * Read contract years for `candidates` out of one comment or post. Each year count belongs to
 * the player named just before it ("Wilson 2yrs"), or just after it ("3 years for Wilson").
 * A count naming one of `known` that isn't a candidate (the team's other players) is about
 * them; a surname is ambiguous only with a `known` player marked `pending` (another add waiting
 * for years). A bare count ("1yr", "5 years please") belongs to the only candidate, if there's
 * exactly one and the text names nobody else; with `allowBare` false, bare counts are ignored,
 * and with `bareForAll` it belongs to every candidate (a conditional blind bid, where only one
 * player can be won). Returns {years: Map of playerId -> years, problems: [text], unplaced:
 * [years]}: a problem means the text couldn't be read with confidence, and an unplaced count
 * names nobody the job recognizes (a typo or a nickname).
 */
export function readYears(text, candidates, {allowBare = true, bareForAll = false, known = []} = {}) {
    const years = new Map();
    const problems = [];
    const unplaced = [];
    const others = known.filter((player) => !candidates.some((candidate) => candidate.playerId === player.playerId));
    const mentions = yearMentions(text);
    const set = (candidate, count) => {
        if (count < MIN_YEARS || count > MAX_YEARS) {
            problems.push(`${count} years for ${candidate.name} is outside ${MIN_YEARS}-${MAX_YEARS}`);
        } else if (years.has(candidate.playerId) && years.get(candidate.playerId) !== count) {
            problems.push(`it gives ${candidate.name} both ${years.get(candidate.playerId)} and ${count} years`);
        } else {
            years.set(candidate.playerId, count);
        }
    };
    // a bid comment of bare counts only, like "1 year" or "2 years / 1 year": the same count
    // covers every player in the bid, or one count per line goes with the players in order
    const rest = normalize(mentions.reduceRight((left, mention) => left.slice(0, mention.start) + " " + left.slice(mention.end), text));
    if (bareForAll && mentions.length && rest.split(" ").filter(Boolean).every((word) => FILLER.has(word))) {
        const counts = mentions.map((mention) => mention.years);
        if (new Set(counts).size === 1) {
            candidates.forEach((candidate) => set(candidate, counts[0]));
        } else if (counts.length === candidates.length) {
            candidates.forEach((candidate, i) => set(candidate, counts[i]));
        } else {
            problems.push(`"${text.trim()}" gives ${counts.join(", ")} years for ${candidates.map((candidate) => candidate.name).join(" and ")}`);
        }
        return {years, problems, unplaced};
    }
    mentions.forEach((mention, i) => {
        // a name pairs with a count in the same sentence: "Got Hill. Been here 5 years" isn't Hill's.
        // When the count's sentence is only the count, the name is the sentence before: "Hill. 1 year."
        const sentences = text.slice(i ? mentions[i - 1].end : 0, mention.start).split(SENTENCE_END);
        const onlyCount = normalize(sentences[sentences.length - 1]).split(" ").filter(Boolean).every((word) => FILLER.has(word));
        const before = sentences.slice(onlyCount ? -2 : -1).join(" ");
        const after = text.slice(mention.end, i + 1 < mentions.length ? mentions[i + 1].start : text.length);
        let who = named(before, candidates, others);
        if (who && !who.length) {
            // "3 years for Wilson": a name in the same sentence, or a list the count introduces
            // ("2 years each:" or "2 years:" followed by names)
            const sentence = after.split(SENTENCE_END)[0];
            who = named(/\b(each|both)\b|:\s*$/i.test(sentence) ? after : sentence, candidates, others);
        }
        if (who === null) {
            // about another of the team's players
            return;
        }
        const isBare = mentions.length === 1 && bare(text, mention);
        if (!who.length && isBare && allowBare && candidates.length === 1) {
            set(candidates[0], mention.years);
        } else if (!who.length && isBare && allowBare) {
            problems.push(`"${text.trim()}" gives ${mention.years} years without saying which of ${candidates.map((candidate) => candidate.name).join(" and ")}`);
        } else if (!who.length && !isBare) {
            unplaced.push(mention.years);
        } else if (who.length === 1) {
            set(who[0], mention.years);
        } else if (who.length > 1 && who.every((player) => candidates.includes(player))
            && /\b(each|both)\b/i.test(before + " " + after)) {
            // "2 years each: Ginn, Dissly, Edwards"
            who.forEach((candidate) => set(candidate, mention.years));
        } else if (who.length > 1) {
            problems.push(`"${text.trim()}" doesn't say which of ${who.map((candidate) => candidate.name).join(" and ")} gets ${mention.years} years`);
        }
    });
    return {years, problems, unplaced};
}

const decode = (text) => String(text)
    .replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

/** A message board post's text, as MFL's API escapes it. */
export const postText = decode;

/**
 * The blind bids on MFL's Previously Processed Waivers page for one period: one entry per
 * request, with its franchise, the players it asked to add ("Last, First") and the owner's
 * comment. Throws if the page doesn't look as expected, so a change on MFL's side stops the
 * chore rather than leaving every bid without a comment.
 */
export function readProcessedWaivers(html) {
    const table = /<table[^>]*class="report[^"]*"[^>]*>([\s\S]*?)<\/table>/i.exec(html);
    if (!table || !/Original Waiver Request/i.test(table[1])) {
        throw new Error("MFL's Previously Processed Waivers page has no waiver table where expected");
    }
    const requests = [];
    for (const row of table[1].match(/<tr\b[\s\S]*?<\/tr>/gi) || []) {
        const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cell[1]);
        if (cells.length < 5) {
            continue;
        }
        const franchise = /franchise_(\d{4})/.exec(cells[1]);
        if (!franchise) {
            throw new Error("MFL's Previously Processed Waivers page has a request without a franchise");
        }
        const request = decode(cells[4]);
        requests.push({
            franchiseId: franchise[1],
            // the player the request won, or null
            granted: (/^(.+?) \S+ [A-Za-z]{1,4} \(\$/.exec(decode(cells[2]).trim()) || [])[1] || null,
            adds: [...request.matchAll(/^Add (.+?) \S+ [A-Za-z]{1,4} for \$/gm)].map((match) => match[1]),
            // the comment runs to the end of the cell, over several lines if the owner wrote them
            comment: ((/^Comments:\s*([\s\S]*)$/m.exec(request) || [])[1] || "").trim()
        });
    }
    return requests;
}

/** Each team's rostered players, as Map of franchise id -> [{playerId, name}], for telling which posts name someone. */
export function teamPlayers({rosters, players}) {
    return new Map(asList(rosters.franchise).map((franchise) => [franchise.id, asList(franchise.player).map((entry) =>
        ({playerId: entry.id, name: (players.get(entry.id) || {name: ""}).name}))]));
}

/** "Last, First" as "First Last". */
const label = (name) => name.split(",").reverse().map((part) => part.trim()).join(" ");

/**
 * What one post says about a free agent or waiver add: {years, source}, {problem}, or null when
 * it isn't about the add. `team` is the team's players, the pending adds among them marked
 * `pending`, and `others` the team's other free agent and waiver adds made by then, which the
 * post may be about instead.
 */
function readPost(add, post, team, others) {
    const body = postText(post.body);
    // a post must name the player: a bare "1 yr" isn't a valid post
    const read = readYears(body, [add, ...others], {allowBare: false, known: team});
    const own = read.problems.filter((problem) => problem.includes(add.name));
    if (own.length) {
        return {problem: own.map((problem) => `post: ${problem}`).join("; ")};
    }
    if (read.years.has(add.playerId)) {
        return {years: read.years.get(add.playerId), source: `post "${body.trim()}"`};
    }
    const namesAdd = (named(body, [add], team.filter((player) => player.playerId !== add.playerId)) || []).length > 0;
    if (namesAdd && /\d|\b(yrs?|years?|seasons?)\b/i.test(body)) {
        // it names the player and looks like it gives a length, in a form the job can't read
        return {problem: `post "${body.trim()}" names the player but gives no length the job can read`};
    }
    if (read.unplaced.length) {
        return {problem: `post "${body.trim()}" gives ${read.unplaced.join(" and ")} years without naming a player on the team the job recognizes`};
    }
    return null;
}

/** One add's years, as {years, source, via: "bid" | "post" | "default"}, or {flag} when it's unclear. */
function decideOne(add, {pending, posts, bidRequests, teams, contractDeadline}) {
    if (add.type === "BBID_WAIVER") {
        // a blind bid's length must be in its comment; posts are for free agent and waiver adds
        const ours = bidRequests.filter((entry) => entry.franchiseId === add.franchiseId && entry.adds.includes(add.name)
            && (entry.period === undefined || entry.period === add.added));
        const request = ours.find((entry) => entry.granted === add.name) || ours[0];
        if (!request) {
            // never default a bid whose comment couldn't be checked
            return {flag: `${label(add.name)}: its blind bid isn't on MFL's processed waivers page, so its comment couldn't be read`};
        }
        if (!request.comment) {
            return {years: DEFAULT_YEARS, source: "no length stated: the default", via: "default"};
        }
        // the other players in a conditional bid are candidates too, so a comment giving each
        // its own length is read correctly; a bare count covers every player in the bid, since
        // only one can be won
        const candidates = request.adds.map((name) => ({playerId: name === add.name ? add.playerId : name, name}));
        const read = readYears(request.comment, candidates, {bareForAll: true});
        const own = read.problems.filter((problem) => problem.includes(add.name));
        if (own.length) {
            return {flag: `${label(add.name)}: ${own.map((problem) => `blind bid comment: ${problem}`).join("; ")}`};
        }
        if (!read.years.has(add.playerId)) {
            // problems about the bid's other players don't explain this one's missing length
            return {flag: `${label(add.name)}: blind bid comment "${request.comment.trim()}" gives no length the job can read`};
        }
        return {years: read.years.get(add.playerId), source: `blind bid comment "${request.comment.trim()}"`, via: "bid"};
    }
    const pendingIds = new Set(pending.map((entry) => entry.playerId));
    const team = (teams.get(add.franchiseId) || []).map((player) => ({...player, pending: pendingIds.has(player.playerId)}));
    // the latest post in the window that's about the add wins, so an owner can correct a
    // length by posting again or editing (MFL keeps an edited post's original time)
    let latest = null;
    const ownPosts = posts.filter((entry) => entry.franchise === add.franchiseId && Number(entry.postTime) >= add.added
        && Number(entry.postTime) <= contractDeadline(add)).sort((a, b) => Number(a.postTime) - Number(b.postTime));
    for (const post of ownPosts) {
        const others = pending.filter((other) => other.franchiseId === add.franchiseId && other.playerId !== add.playerId
            && other.type !== "BBID_WAIVER" && other.added <= Number(post.postTime));
        latest = readPost(add, post, team, others) || latest;
    }
    if (latest && latest.problem) {
        return {flag: `${label(add.name)}: ${latest.problem}`};
    }
    if (latest) {
        return {...latest, via: "post"};
    }
    // a length posted after the window doesn't count, but say so, for any leniency by hand
    const late = posts.find((entry) => entry.franchise === add.franchiseId && Number(entry.postTime) > contractDeadline(add)
        && readYears(postText(entry.body), [add], {allowBare: false}).years.has(add.playerId));
    return {years: DEFAULT_YEARS, via: "default", source: late
        ? `no length stated in time: the default; a post "${postText(late.body).trim()}" came after the hour`
        : "no length stated: the default"};
}

/**
 * Decide each pending add's years. `posts` are the message board's posts, from any thread
 * ({franchise, postTime, body}): owners have posted lengths in threads of every name. They're
 * matched by team, time and player name. `bidRequests` are the readProcessedWaivers entries
 * for the periods of pending blind bids (each with its `period`, the bid's timestamp), and
 * `teams` the teamPlayers map. `pending` is every add still waiting for years, including ones
 * whose window is open (default `adds`): a surname two of them share is ambiguous.
 * League rules: a blind bid's length must be in its comment, and a free agent or waiver add's in
 * a post within the posting window after the add (`contractDeadline(add)`), naming the player (a
 * bare "1 yr" post isn't valid, so it's ignored). A bare count in a bid comment covers every
 * player in the bid. The latest post in the window about the add decides: a length sets the
 * years, and an unreadable one flags the add. An add with no length stated in time gets
 * DEFAULT_YEARS (the commissioner adjusts by hand for leniency).
 * A comment, or a post naming the add, that gives no length the reader understands is flagged
 * too, as is a post after the add giving a length but naming no player on the team (a typo or
 * nickname), so a stated length is never replaced by the default.
 * Returns {contracts: [{...add, years, source}], flags: [text]}.
 */
export function decideYears({adds, pending = adds, posts, bidRequests, teams, contractDeadline = deadline}) {
    const contracts = [];
    const flags = [];
    for (const add of adds) {
        const decided = decideOne(add, {pending, posts, bidRequests, teams, contractDeadline});
        if (decided.flag) {
            flags.push(decided.flag);
        } else {
            contracts.push({...add, years: decided.years, source: decided.source});
        }
    }
    return {contracts, flags};
}

/**
 * What the message board says so far about each free agent or waiver add in `adds`, for League
 * Alerts while the owner's hour is open: Map of playerId -> {state: "read", years}, {state:
 * "problem"} or {state: "none"}. The same reading the job does when the hour is over, so an owner
 * sees what will be set. `pending`, `posts` and `teams` are as for decideYears.
 */
export function postReadings({adds, pending = adds, posts, teams}) {
    const readings = new Map();
    for (const add of adds.filter((entry) => entry.type !== "BBID_WAIVER")) {
        const decided = decideOne(add, {pending, posts, bidRequests: [], teams, contractDeadline: deadline});
        readings.set(add.playerId, decided.flag ? {state: "problem"}
            : decided.via === "post" ? {state: "read", years: decided.years} : {state: "none"});
    }
    return readings;
}
