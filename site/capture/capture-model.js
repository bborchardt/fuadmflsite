// What the capture bookmarklet saves: the MFL pages v2 reads, draws or restyles, as MFL serves them to
// whoever is logged in, made safe for the public repo. Kept apart from capture.js so it can be tested.

export function viewerOf(franchiseId) {
    return franchiseId === "0000" ? "commish" : franchiseId ? "member" : "guest";
}

// the season and league of an MFL league page, or null; the board's pages name the league only in
// MFL's `league_id`
export function contextOf(location, franchiseId, pageLeagueId = null) {
    const season = (location.pathname.match(/^\/(\d{4})\//) || [])[1];
    const leagueId = (location.pathname.match(/\/home\/(\d+)/) || [])[1] || new URLSearchParams(location.search).get("L") || pageLeagueId;
    if (!season || !leagueId) {
        return null;
    }
    return {origin: location.origin, season, leagueId, franchiseId: franchiseId || null, viewer: viewerOf(franchiseId)};
}

// name: the page's address under /<season>/. A guest asking for a page MFL keeps for members is saved
// too: what MFL sends instead (its login page) is what v2 meets.
export function fixedPages({season, leagueId, franchiseId}) {
    const L = encodeURIComponent(leagueId);
    const other = franchiseId === "0001" ? "0002" : "0001";
    const pages = {
        "home": `home/${L}`,
        "lineup": `lineup?L=${L}`,
        "options-O02": `options?L=${L}&O=02`,
        "add_drop": `add_drop?L=${L}`,
        "options-O257": `options?L=${L}&O=257`,
        "options-O18": `options?L=${L}&O=18`,
        "options-O05": `options?L=${L}&O=05`,
        "options-O03": `options?L=${L}&O=03`,
        "options-O76": `options?L=${L}&O=76`,
        "processed_waivers": `processed_waivers?LEAGUE_ID=${L}`,
        "options-O09": `options?L=${L}&O=09`,
        "options-O26": `options?L=${L}&O=26`,
        "options-O101": `options?L=${L}&O=101`,
        "options-O194": `options?L=${L}&O=194`,
        "options-O208": `options?L=${L}&O=208`,
        "options-O171": `options?L=${L}&O=171&FID=${franchiseId && franchiseId !== "0000" ? franchiseId : "0001"}`,
        "options-O28": `options?L=${L}&O=28`,
        "csetup-SKIN": `csetup?L=${L}&C=SKIN`,
        // Franchise setup's other screens; Unlink Franchise is left out, as a page that unlinks a team
        "csetup-FRANCHISE": `csetup?L=${L}&C=FRANCHISE`,
        "csetup-FACCESS": `csetup?L=${L}&C=FACCESS`,
        "csetup-FCUSTOM": `csetup?L=${L}&C=FCUSTOM`,
        "csetup-FCONTACT": `csetup?L=${L}&C=FCONTACT`,
        "csetup-FMOBILE": `csetup?L=${L}&C=FMOBILE`,
        "csetup-HMPGMOD": `csetup?L=${L}&C=HMPGMOD`,
        "mb-board_show": `mb/board_show.pl?bid=${season}${L}`,
        "mb-topic_add": `mb/topic_add.pl?bid=${season}${L}`,
        // its subjects come out (scrub); no message itself is opened, as they're private
        "mb-message_list": "mb/message_list.pl",
        "mb-message_add": "mb/message_add.pl",
        "mb-user_options": "mb/user_options.pl",
        "mb-forum_search": "mb/forum_search.pl"
    };
    if (franchiseId && franchiseId !== "0000") {
        pages["options-O05-propose"] = `options?L=${L}&O=05&FRANCHISE=${franchiseId},${other}`;
    }
    return pages;
}

// Pages found from links on saved ones are only read: nothing that changes the board or signs out
// (the board's `_x.pl` scripts act)
export function safeLink(href) {
    return !/delete|logout|revoke|_x\.pl|ACTION=|prevnext/i.test(href);
}

const hrefs = (html, pattern) => [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1].replace(/&amp;/g, "&")).filter((href) => pattern.test(href) && safeLink(href));

// the first topic on the board, and the one with the most posts when that's another
export function topicsOn(html) {
    const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1]);
    const topics = rows.map((row) => {
        const href = hrefs(row, /^topic_show\.pl\?[^#]*tid=/)[0];
        const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1].replace(/<[^>]*>/g, "").trim());
        return href ? {href, posts: Number((cells[2] || "").replace(/,/g, "")) || 0} : null;
    }).filter(Boolean);
    if (!topics.length) {
        return {};
    }
    const longest = topics.reduce((most, topic) => (topic.posts > most.posts ? topic : most));
    return longest === topics[0] ? {"mb-topic_show": topics[0].href} : {"mb-topic_show": topics[0].href, "mb-topic_show-long": longest.href};
}

// a topic's reply form, an edit form when the viewer has a post there, and a later page of a long topic
export function topicLinks(html, suffix = "") {
    const found = {};
    const reply = hrefs(html, /^post_add\.pl\?/)[0];
    const edit = hrefs(html, /^post_edit\.pl\?/)[0];
    const later = hrefs(html, /^topic_show\.pl\?.*(page|start)=/i)[0];
    if (reply) {
        found[`mb-post_add${suffix}`] = reply;
    }
    if (edit) {
        found[`mb-post_edit${suffix}`] = edit;
    }
    if (later) {
        found[`mb-topic_show${suffix}-page2`] = later;
    }
    return found;
}

// a player MFL links to from the page, else the one tests/fixtures already has
export function playerPage(htmls, leagueId) {
    for (const html of htmls) {
        const id = (html.match(/player\?[^"']*P=(\d+)/) || [])[1];
        if (id) {
            return `player?L=${encodeURIComponent(leagueId)}&P=${id}`;
        }
    }
    return `player?L=${encodeURIComponent(leagueId)}&P=13593`;
}

// each team's owner, from MFL's league export (JSON), for scrub
export function ownersOf(leagueExport) {
    const teams = ((((leagueExport || {}).league || {}).franchises || {}).franchise) || [];
    return (Array.isArray(teams) ? teams : [teams])
        .filter((team) => team && team.id && team.owner_name && String(team.owner_name).trim())
        .map((team) => ({id: team.id, name: String(team.owner_name).trim()}));
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// An owner's name becomes "Owner 0004": a full name wherever it is, as MFL writes it (an
// apostrophe or ampersand raw or as an entity), and a one-word name only as an owner, as elsewhere it may be part
// of a player's name. Longest first, so "Dana" can't take the start of "Dana O'Toole".
export function withoutOwners(text, owners) {
    let out = text;
    for (const {id, name} of [...owners].sort((a, b) => b.name.length - a.name.length)) {
        const pattern = escapeRegExp(name).replace(/&/g, "(?:&|&amp;)").replace(/['\u2019]/g, "(?:'|\u2019|&#0?39;|&apos;)").replace(/ +/g, "(?:\\s|&nbsp;)+");
        // the name's end isn't followed by more of a word; \b fails after "Jr." or "Zoë"
        const end = "(?![A-Za-z0-9_\u00C0-\u024F])";
        const placeholder = `Owner ${id}`;
        out = /\s/.test(name)
            ? out.replace(new RegExp(`(^|[^A-Za-z0-9_\u00C0-\u024F])${pattern}${end}`, "g"), `$1${placeholder}`)
            : out.replace(new RegExp(`(Owner:\\s*|"owner_name"\\s*:\\s*"|owner_name=["'])${pattern}${end}`, "g"), `$1${placeholder}`);
    }
    return out;
}

// pages whose fields hold a member's own contact details, in forms scrub can't recognize
export const PRIVATE_FIELDS = new Set(["csetup-FCONTACT", "csetup-FMOBILE"]);

// The repo is public: members' email addresses, phone numbers, owners' names, private message
// subjects, MFL's apiKey and the board's per-member token (`auth`, which signs its actions) come out.
// MFL's own support address stays, as it's on every page; `logo@2x.png` isn't an address. With
// `fields`, every value typed into a field comes out too.
export function scrub(html, owners = [], {fields = false} = {}) {
    const SECRET = "auth|sid|session|token|apikey";
    const typed = fields
        ? html.replace(/<input\b[^>]*>/gi, (input) => (/\btype\s*=\s*["']?(?:hidden|radio|checkbox|submit|button|image|reset)\b/i.test(input)
            ? input
            : input.replace(/(\bvalue\s*=\s*)(["'])[^"']*\2/i, "$1$2$2").replace(/(\bvalue\s*=\s*)(?!["'])[^\s>]+/i, '$1""')))
            .replace(/(<textarea\b[^>]*>)[\s\S]*?(<\/textarea>)/gi, "$1$2")
        : html;
    return withoutOwners(typed, owners)
        .replace(/[A-Za-z0-9._%+-]+(@|%40|&#64;|&#x40;)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gi, (address, at) => (/(myfantasyleague\.com|\.(png|jpe?g|gif|svg|webp))$/i.test(address) ? address : `owner${at}example.com`))
        .replace(/(apiKey\s*[=:]\s*)(["'])[^"']*\2/gi, "$1$2saved-sample$2")
        .replace(new RegExp(`([?&;](?:${SECRET})=)[^&;#"'\\s]+`, "gi"), "$1saved-sample")
        .replace(/<input\b[^>]*>/gi, (input) => (new RegExp(`\\bname\\s*=\\s*["']?(?:${SECRET})\\b`, "i").test(input)
            ? input.replace(/(\bvalue\s*=\s*)(["'])[^"']*\2/i, "$1$2saved-sample$2")
            : input))
        // MFL's list gives each message's opening as the link's title, as well as its subject
        .replace(/(<a\b[^>]*message_show\.pl[^>]*>)[\s\S]*?(<\/a>)/gi, (link, open, close) => `${open.replace(/\btitle\s*=\s*(["'])[\s\S]*?\1/i, "title='A message'")}A message${close}`)
        .replace(/tel:[^"'\s>]+/gi, "tel:5550100")
        .replace(/\(?\b\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b/g, "555-555-0100");
}

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c >>> 0;
    }
    return table;
})();

export function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

// An uncompressed zip of {path: text}: the browser has no zip writer, and a stored zip is all a
// handful of pages needs
export function zip(files) {
    const encoder = new TextEncoder();
    const local = [];
    const central = [];
    let offset = 0;
    for (const [path, text] of Object.entries(files)) {
        const name = encoder.encode(path);
        const data = encoder.encode(text);
        const crc = crc32(data);
        const head = new DataView(new ArrayBuffer(30));
        head.setUint32(0, 0x04034b50, true);
        head.setUint16(4, 20, true);
        // bit 11: the name is UTF-8
        head.setUint16(6, 0x0800, true);
        // 1980-01-01, the earliest a zip can say
        head.setUint16(12, 0x0021, true);
        head.setUint32(14, crc, true);
        head.setUint32(18, data.length, true);
        head.setUint32(22, data.length, true);
        head.setUint16(26, name.length, true);
        local.push(new Uint8Array(head.buffer), name, data);
        const entry = new DataView(new ArrayBuffer(46));
        entry.setUint32(0, 0x02014b50, true);
        entry.setUint16(4, 20, true);
        entry.setUint16(6, 20, true);
        entry.setUint16(8, 0x0800, true);
        entry.setUint16(14, 0x0021, true);
        entry.setUint32(16, crc, true);
        entry.setUint32(20, data.length, true);
        entry.setUint32(24, data.length, true);
        entry.setUint16(28, name.length, true);
        entry.setUint32(42, offset, true);
        central.push(new Uint8Array(entry.buffer), name);
        offset += 30 + name.length + data.length;
    }
    const size = central.reduce((sum, part) => sum + part.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, Object.keys(files).length, true);
    end.setUint16(10, Object.keys(files).length, true);
    end.setUint32(12, size, true);
    end.setUint32(16, offset, true);
    const parts = [...local, ...central, new Uint8Array(end.buffer)];
    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let at = 0;
    for (const part of parts) {
        out.set(part, at);
        at += part.length;
    }
    return out;
}
