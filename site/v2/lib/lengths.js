// Contract lengths due before the season (bylaws 4.4, 12.4–12.6): every player a team gets in the
// offseason (the auction, the rookie draft, an add) needs one by the final cut-down date. Members
// send them with v2's form, which posts them to the board in the form below; the daily job reads
// only that form, as lengths posted by hand come in too many shapes to read (docs/design.md).

import settings from "./settings.js";
import {asArray} from "./mfl.js";

const MIN_YEARS = 1;
const MAX_YEARS = settings.contracts.maxYears;

export const FORM_HEADING = "Contract lengths, sent from the league site:";

// Players at 0 years with a salary: a restricted free agent the rollover left at 0 years has $0.01
// until the auction settles him, so only a salary of $1 or more is due a length
export function lengthsDue(rosters, franchiseId) {
    const team = asArray(rosters && rosters.franchise).find((franchise) => franchise.id === franchiseId);
    return asArray(team && team.player)
        .filter((entry) => Number(entry.contractYear) === 0 && Number(entry.salary) >= 1)
        .map((entry) => entry.id);
}

// "Mahomes, Patrick KCC QB": MFL's name for him, with his NFL team and position for a name two
// players share
const formName = (player) => `${player.name} ${player.team} ${player.position}`;

// `lines`: [{player, years}], player as MFL's players export has him
export function formPost(lines) {
    return [FORM_HEADING, ...lines.map(({player, years}) => `${formName(player)}: ${years} year${years === 1 ? "" : "s"}`)].join("\n");
}

const decode = (text) => String(text)
    .replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

// [{name, team, position, years}] from a post made with the form, or null for any other post. Each entry ends its
// own match, so it reads the same whether or not MFL kept the post's line breaks.
export function readFormPost(body) {
    const text = decode(body);
    if (!text.includes(FORM_HEADING)) {
        return null;
    }
    const entries = [];
    // MFL gives a free agent the team "FA" or "FA*"
    const pattern = /([^\n:]+?) ([A-Za-z]{2,3}\*?) ([A-Za-z]{1,3}): (\d+) years?/g;
    let found = pattern.exec(text);
    while (found) {
        entries.push({name: found[1].trim(), team: found[2], position: found[3], years: Number(found[4])});
        found = pattern.exec(text);
    }
    return entries;
}

// a post that looks like it gives a length: a figure or "year" in it
const looksLikeLengths = (text) => /\d|\byears?\b|\byrs?\b/i.test(text);

// What the board's form posts say about the players a team owes a length (`due`, ids):
// `{years: Map(id → years), unread: [posts]}`. The latest form post naming a player wins, whichever
// team sent it, as a length sent before a trade holds after it; another team's must name his NFL
// team and position too, so a namesake's isn't taken (one who changed NFL teams since stays due). `unread` are the team's own posts that look like lengths but weren't made with the
// form, while any player is still without one. `players` is MFL's players export by id.
export function formLengths({posts, franchiseId, due, players}) {
    const owed = due.map((id) => players.get(id)).filter(Boolean);
    // the team's own by name alone, as a player's NFL team can change between the post and its reading
    const named = (entry, own) => {
        const same = owed.filter((player) => player.name === entry.name);
        const exact = same.length > 1 || !own ? same.filter((player) => player.team === entry.team && player.position === entry.position) : same;
        return exact.length === 1 ? exact[0].id : null;
    };
    const years = new Map();
    const unread = [];
    for (const post of [...asArray(posts)].sort((a, b) => Number(a.postTime) - Number(b.postTime))) {
        const own = post.franchise === franchiseId;
        const entries = readFormPost(post.body);
        if (!entries) {
            if (own && looksLikeLengths(decode(post.body))) {
                unread.push(post);
            }
            continue;
        }
        for (const entry of entries) {
            const id = named(entry, own);
            if (id && entry.years >= MIN_YEARS && entry.years <= MAX_YEARS) {
                years.set(id, entry.years);
            }
        }
    }
    return {years, unread: due.every((id) => years.has(id)) ? [] : unread};
}

// Whether a player was added (a free agent, waiver or blind bid add, by any team) from `seconds` on,
// in a league as lib/league.js builds it: one added after the cut-down date owes his length within
// the hour, like an add in season, so the form isn't for him
export const addedSince = (league, playerId, seconds) => ((league.players.get(playerId) || {}).transactions || [])
    .some((move) => move.added && move.timestamp >= seconds);

// the board topics a form post may be in: any with "contract" in its name (home-model.js's
// contractTopic picks the newest for a new post)
export const lengthTopics = (messageBoard) => asArray(messageBoard && messageBoard.thread).filter((thread) => /contract/i.test(thread.subject || ""));
