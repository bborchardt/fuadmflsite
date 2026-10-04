// The contract years chore: a player a team adds gets 0 years from MFL, and the owner states
// the length (1 to 5 years) in the blind bid's comment or in the message board's contract
// thread. This reads those, decides each new player's years, and flags anything unclear for
// the commissioner. No fetching, so it can be tested on saved data; jobs/daily.mjs does the I/O.

export const MIN_YEARS = 1;
export const MAX_YEARS = 5;
/** Years for an add whose owner stated none. */
export const DEFAULT_YEARS = 1;
/** More contracts than this in one run looks like a bug rather than a busy day, so none are set. */
export const MAX_CONTRACTS_PER_RUN = 15;
/**
 * The message board threads owners post contract lengths in, by subject. The name changes
 * from season to season ("Free Agent Contracts", "Contracts", "Add/Drop Contracts..."), and
 * posts are matched by team, time and player name, so any thread about contracts is read.
 */
export const CONTRACT_THREAD = /contract/i;

const ADD_TYPES = new Set(["FREE_AGENT", "WAIVER", "BBID_WAIVER"]);
const ids = (list) => String(list || "").split(",").filter((id) => id && id !== "0000");
const asList = (value) => value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];

/** The player ids a transaction adds and drops, for the types that move players. */
function moves(transaction) {
    switch (transaction.type) {
    case "FREE_AGENT":
    case "LOAD_ROSTERS": {
        const [added, dropped] = String(transaction.transaction || "").split("|");
        return {added: ids(added), dropped: ids(dropped)};
    }
    case "WAIVER":
        return {added: ids(transaction.added), dropped: ids(transaction.dropped)};
    case "BBID_WAIVER": {
        const [added, , dropped] = String(transaction.transaction || "").split("|");
        return {added: ids(added), dropped: ids(dropped)};
    }
    case "TRADE":
        return {added: [...ids(transaction.franchise1_gave_up), ...ids(transaction.franchise2_gave_up)], dropped: []};
    default:
        return {added: [], dropped: []};
    }
}

/**
 * The rostered players waiting for contract years: 0 years, and last moved by an add (free
 * agent, waiver or blind bid) by the team that has them. That leaves out RFAs after the
 * rollover, drafted rookies and players the commissioner loaded, which aren't adds.
 * `rosters` is the rosters export, `transactions` the transactions export's list and `players`
 * a Map of id -> {name} from the players export ("Last, First").
 */
export function pendingAdds({rosters, transactions, players}) {
    const latest = new Map();
    for (const transaction of transactions) {
        const {added, dropped} = moves(transaction);
        for (const id of [...added, ...dropped]) {
            const seen = latest.get(id);
            if (!seen || Number(transaction.timestamp) >= Number(seen.timestamp)) {
                latest.set(id, transaction);
            }
        }
    }
    const pending = [];
    for (const franchise of asList(rosters.franchise)) {
        for (const entry of asList(franchise.player)) {
            const transaction = latest.get(entry.id);
            if (parseFloat(entry.contractYear) !== 0 || !transaction || !ADD_TYPES.has(transaction.type)
                || transaction.franchise !== franchise.id || !moves(transaction).added.includes(entry.id)) {
                continue;
            }
            pending.push({
                playerId: entry.id,
                name: (players.get(entry.id) || {name: `Player ${entry.id}`}).name,
                franchiseId: franchise.id,
                // the salary exactly as MFL has it, so writing the years leaves it unchanged
                salary: entry.salary,
                type: transaction.type,
                added: Number(transaction.timestamp)
            });
        }
    }
    return pending;
}

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

/** Lower case, no accents or punctuation, single spaces. */
function normalize(text) {
    return String(text).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
        .replace(/['’.]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** The ways a post might name a player: "Last, First" gives "first last" and "last". */
function nameForms(name) {
    const [last, first = ""] = String(name).split(",").map((part) => part.trim());
    const surname = normalize(last).split(" ").filter((word) => !SUFFIXES.has(word)).join(" ");
    return {full: normalize(`${first} ${surname}`), surname};
}

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
    const byFull = candidates.filter((candidate) => hasWords(normalized, nameForms(candidate.name).full));
    if (byFull.length) {
        return byFull;
    }
    const othersInFull = others.filter((other) => hasWords(normalized, nameForms(other.name).full));
    const bySurname = candidates.filter((candidate) => {
        const surname = nameForms(candidate.name).surname;
        return hasWords(normalized, surname) && !othersInFull.some((other) => hasWords(nameForms(other.name).full, surname));
    });
    if (bySurname.length) {
        return bySurname;
    }
    return othersInFull.length || others.some((other) => hasWords(normalized, nameForms(other.name).surname)) ? null : [];
}

const NUMBER_WORDS = {one: 1, two: 2, three: 3, four: 4, five: 5};
const YEARS = /(\$\s*)?\b(\d+|one|two|three|four|five)\s*-?\s*(?:years?|yrs?)\b/gi;
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
 * them. A bare count ("1yr", "5 years please") belongs to the only candidate, if there's
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
        const before = text.slice(i ? mentions[i - 1].end : 0, mention.start);
        const after = text.slice(mention.end, i + 1 < mentions.length ? mentions[i + 1].start : text.length);
        let who = named(before, candidates, others);
        if (who && !who.length) {
            who = named(after, candidates, others);
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

/**
 * Decide each pending add's years. `posts` are the contract thread's posts
 * ({franchise, postTime, body}), `bidRequests` the readProcessedWaivers entries for the
 * periods of pending blind bids, `teams` the teamPlayers map, and `threadFound` whether the
 * contract thread exists. League rules: a blind bid's length must be in its comment, and a
 * free agent or waiver add's in a post made after the add, naming the player (a bare "1 yr"
 * post isn't valid, so it's ignored). A bare count in a bid comment covers every player in the
 * bid. Agreeing posts set the years; disagreeing or unreadable ones flag the add. An add with
 * no length stated by the job's next run gets DEFAULT_YEARS (the commissioner adjusts by hand
 * for leniency), unless the thread it would be posted in is missing, which flags it instead.
 * A comment, or a post naming the add, that gives no length the reader understands is flagged
 * too, as is a post after the add giving a length but naming no player on the team (a typo or
 * nickname), so a stated length is never replaced by the default.
 * Returns {contracts: [{...add, years, source}], flags: [text]}.
 */
export function decideYears({adds, posts, bidRequests, teams, threadFound}) {
    const contracts = [];
    const flags = [];
    for (const add of adds) {
        const stated = [];
        const problems = [];
        if (add.type === "BBID_WAIVER") {
            const ours = bidRequests.filter((entry) => entry.franchiseId === add.franchiseId && entry.adds.includes(add.name));
            const request = ours.find((entry) => entry.granted === add.name) || ours[0];
            if (!request) {
                // never default a bid whose comment couldn't be checked
                problems.push(`its blind bid isn't on MFL's processed waivers page, so its comment couldn't be read`);
            } else if (request.comment) {
                // the other players in a conditional bid are candidates too, so a comment
                // giving each its own length is read correctly
                const candidates = request.adds.map((name) => ({playerId: name === add.name ? add.playerId : name, name}));
                // a bare count covers every player in the bid: only one can be won
                const read = readYears(request.comment, candidates, {bareForAll: true});
                problems.push(...read.problems.filter((problem) => problem.includes(add.name))
                    .map((problem) => `blind bid comment: ${problem}`));
                if (read.years.has(add.playerId)) {
                    stated.push({years: read.years.get(add.playerId), source: `blind bid comment "${request.comment.trim()}"`});
                } else if (!read.problems.length) {
                    problems.push(`blind bid comment "${request.comment.trim()}" gives no length the job can read`);
                }
            }
        }
        // a blind bid's length must be in its comment; posts are for free agent and waiver adds
        const ownPosts = add.type === "BBID_WAIVER" ? []
            : posts.filter((entry) => entry.franchise === add.franchiseId && Number(entry.postTime) >= add.added);
        for (const post of ownPosts) {
            const body = postText(post.body);
            const postTime = Number(post.postTime);
            const team = teams.get(add.franchiseId) || [];
            // the team's other free agent and waiver adds made by then can be what the post is about
            const others = adds.filter((other) => other.franchiseId === add.franchiseId && other !== add
                && other.type !== "BBID_WAIVER" && other.added <= postTime);
            // a post must name the player: a bare "1 yr" isn't a valid post
            const read = readYears(body, [add, ...others], {allowBare: false, known: team});
            const own = read.problems.filter((problem) => problem.includes(add.name));
            const namesAdd = (named(body, [add], team.filter((player) => player.playerId !== add.playerId)) || []).length > 0;
            if (read.years.has(add.playerId)) {
                stated.push({years: read.years.get(add.playerId), source: `post "${body.trim()}"`});
            } else if (!own.length && namesAdd) {
                problems.push(`post "${body.trim()}" names the player but gives no length the job can read`);
            } else if (!own.length && read.unplaced.length) {
                problems.push(`post "${body.trim()}" gives ${read.unplaced.join(" and ")} years without naming a player on the team the job recognizes`);
            }
            problems.push(...own.map((problem) => `post: ${problem}`));
        }
        const counts = [...new Set(stated.map((entry) => entry.years))];
        const label = add.name.split(",").reverse().map((part) => part.trim()).join(" ");
        if (problems.length) {
            flags.push(`${label}: ${problems.join("; ")}`);
        } else if (counts.length > 1) {
            flags.push(`${label}: the owner gave different lengths (${stated.map((entry) => `${entry.years} in ${entry.source}`).join("; ")})`);
        } else if (counts.length === 1) {
            contracts.push({...add, years: counts[0], source: stated[0].source});
        } else if (!threadFound && add.type !== "BBID_WAIVER") {
            flags.push(`${label}: no length stated, and the message board's contract thread wasn't found, so it wasn't defaulted`);
        } else {
            contracts.push({...add, years: DEFAULT_YEARS, source: "no length stated: the default"});
        }
    }
    return {contracts, flags};
}

const xmlAttr = (value) => String(value)
    .replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** DATA for MFL's salaries import setting contract years, salaries unchanged. Only send it with APPEND=1. */
export function contractsXml(contracts) {
    return `<salaries><leagueUnit unit="LEAGUE">${contracts.map((contract) =>
        `<player id="${xmlAttr(contract.playerId)}" salary="${xmlAttr(contract.salary)}" contractYear="${contract.years}"/>`).join("")}`
        + `</leagueUnit></salaries>`;
}
