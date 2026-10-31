// MFL's chat feed and pending trades, read into plain lists for Home. No DOM, so they're tested on
// saved copies.

import {asArray} from "../lib/mfl.js";
import {ORDINAL, TOPICS} from "./home-model.js";

const entities = {amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'"};
const decode = (text) => String(text || "").replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, code) => {
    if (code[0] === "#") {
        return String.fromCodePoint(code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : Number(code.slice(1)));
    }
    return entities[code] !== undefined ? entities[code] : whole;
});

function attributes(tag) {
    const found = {};
    for (const match of tag.matchAll(/([\w-]+)="([^"]*)"/g)) {
        found[match[1]] = decode(match[2]);
    }
    return found;
}

// The feed holds everyone's messages, private ones included: MFL's own script just skips those not
// to or from the viewer, so this does too (docs/mfl.md, Chat). The feed lists the newest first and
// writes `posted` as text ("Sat Oct 10 8:36:55 p.m. CT 2026"); each id starts with the post's time
// in seconds. Returned oldest first, as the panel shows them.
export function readChat(xml, {viewer}) {
    const messages = [];
    for (const match of String(xml).matchAll(/<message\b([^>]*?)(?:\/>|>([\s\S]*?)<\/message>)/g)) {
        const found = attributes(match[1]);
        const text = found.message !== undefined ? found.message : decode((match[2] || "").replace(/^<!\[CDATA\[|\]\]>$/g, ""));
        const to = found.to || "";
        const from = found.franchise_id || "";
        if (/^:clear:$/.test(text.trim()) || (to && to !== viewer && from !== viewer)) {
            continue;
        }
        const seconds = Number((String(found.id || "").match(/^\d{10}/) || [])[0]);
        messages.push({id: found.id || String(messages.length), from, to, text: text.trim(), at: seconds || null});
    }
    return messages.sort((a, b) => (a.at || 0) - (b.at || 0));
}

// MFL's board page (`mb/board_show.pl`), which guests can open though not the board's export: the
// newest topics first, as [{id, title, when}], `when` the day of the last post ("Oct 25")
export function pageTopics(html, limit = TOPICS) {
    const topics = [];
    for (const [, row] of String(html).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const id = (row.match(/href=["']?topic_show\.pl\?[^"'>]*\btid=(\d+)/i) || [])[1];
        const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => decode(cell[1].replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim());
        if (id && cells[0]) {
            topics.push({id, title: cells[0], when: (/^\w+ (\w+ \d+)\b/.exec(cells[3] || "") || [])[1] || ""});
        }
    }
    return topics.slice(0, limit);
}

const surname = (player) => String(player.fullName).split(" ").slice(1).join(" ") || player.fullName;

function assets(list, players) {
    return String(list || "").split(",").filter(Boolean).map((id) => {
        const pick = id.match(/^FP_\d{4}_(\d{4})_(\d+)$/);
        if (pick) {
            return `${pick[1]} ${ORDINAL[Number(pick[2])] || `round ${pick[2]}`}`;
        }
        const player = players.get(id);
        return player ? surname(player) : "a player";
    }).join(", ");
}

// Offers waiting for the viewer's answer: what the other team gives "for" what it asks.
export function tradeOffers(pendingTrades, {franchiseId, players, teams}) {
    return asArray(pendingTrades && pendingTrades.pendingTrade)
        .filter((trade) => trade.offeredto === franchiseId)
        .map((trade) => ({
            from: teams.get(trade.offeringteam) || "another team",
            summary: `${assets(trade.will_give_up, players) || "nothing"} for ${assets(trade.will_receive, players) || "nothing"}`,
            expires: Number(trade.expires) || null
        }));
}
