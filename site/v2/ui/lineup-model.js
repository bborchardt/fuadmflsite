// Lineup's data, read from MFL's Submit Lineup page (docs/mfl.md, Forms), and what the save bar and
// warnings say about a choice of starters. No exports: the page has everything it shows.

import {displayName} from "../lib/mfl.js";
import {clean} from "./html.js";

const number = (value) => {
    const parsed = parseFloat(clean(value));
    return Number.isFinite(parsed) ? parsed : null;
};

// MFL's Inj column, when the week's injury report can't be read
const INJURY_CODES = {O: "Out", I: "IR", Q: "Questionable", D: "Doubtful", S: "Suspended"};

export function lineupForm(doc) {
    return [...doc.querySelectorAll("form")].find((form) => /\/lineup$/.test(form.getAttribute("action") || "")
        && form.querySelector("input[name=WEEK]") && form.querySelector("input[name=FRANCHISE]")) || null;
}

// "Beck, Carson ARI QB" → {name: "Carson Beck", nfl: "ARI", pos: "QB"}
export function readName(label) {
    const match = clean(label).match(/^(.+?)\s+([A-Z]{2,3}\*?)\s+([A-Z]{1,3})$/);
    return match ? {name: displayName(match[1]), nfl: match[2], pos: match[3]} : {name: clean(label), nfl: "", pos: ""};
}

// "Select 1-2 QB:" → ["QB", [1, 2]]
function groupLimit(text) {
    const match = clean(text).match(/Select\s+(\d+)(?:\s*-\s*(\d+))?\s+([A-Z]{1,3})/i);
    return match ? [match[3].toUpperCase(), [Number(match[1]), Number(match[2] || match[1])]] : null;
}

// the week picker: this week and later, each a link to MFL's page for that week, by week
function weekLinks(doc) {
    const picker = [...doc.querySelectorAll(".reportnavigation")].find((span) => /Submit Lineup For Week/i.test(span.textContent));
    return new Map(picker ? [...picker.querySelectorAll("a[href*='WEEK=']")].map((a) => [Number((a.getAttribute("href").match(/WEEK=(\d+)/) || [])[1]), a.getAttribute("href")]) : []);
}

// {team, week, total, limits, players, ir, prev, next} from MFL's page, or null if it isn't the form
export function readLineupPage(doc) {
    const form = lineupForm(doc);
    if (!form) {
        return null;
    }
    const week = Number(form.querySelector("input[name=WEEK]").value);
    const table = form.querySelector("table.report");
    if (!table) {
        return null;
    }
    const rows = [...table.querySelectorAll("tr")];
    const header = rows.find((tr) => tr.querySelector("th") && !tr.querySelector("input"));
    const headings = header ? [...header.children].map((cell) => clean(cell.textContent)) : [];
    const column = (test) => headings.findIndex(test);
    const at = {
        opp: column((text) => /^Week \d+ Opp$/i.test(text)),
        inj: column((text) => /^Inj$/i.test(text)),
        bye: column((text) => /^Bye$/i.test(text)),
        oppRank: column((text) => /^Opp Rank/i.test(text)),
        ytd: column((text) => /^YTD/i.test(text)),
        avg: column((text) => /^Avg Pts/i.test(text)),
        proj: column((text) => /^Proj/i.test(text))
    };
    const totalMatch = clean(headings[0]).match(/Total Of (\d+)/i);
    const limits = {};
    const players = [];
    let group = null;
    for (const tr of rows) {
        const box = tr.querySelector("td input[type=checkbox]");
        const link = tr.querySelector("a[href*='launch_player_modal']");
        const lead = tr.querySelector("th");
        const limit = lead && groupLimit(lead.textContent);
        if (limit) {
            group = limit[0];
            limits[limit[0]] = limit[1];
        }
        if (!box || !link) {
            continue;
        }
        const cells = [...tr.children];
        const cell = (index) => (index >= 0 && cells[index] ? clean(cells[index].textContent) : "");
        const id = (link.getAttribute("href").match(/launch_player_modal\(\s*'[^']*'\s*,\s*'(\d+)'/) || [])[1];
        const named = readName(link.textContent);
        const opp = cell(at.opp).replace(/\s*\([^)]*\)\s*$/, "");
        const code = cell(at.inj);
        players.push({
            id,
            name: named.name,
            nfl: named.nfl,
            pos: named.pos || group,
            opp,
            onBye: /^Bye$/i.test(opp),
            code,
            injury: INJURY_CODES[code] || "",
            bye: cell(at.bye),
            oppRank: cell(at.oppRank),
            ytd: number(cell(at.ytd)),
            avg: number(cell(at.avg)),
            proj: number(cell(at.proj)),
            starter: box.checked || box.hasAttribute("checked"),
            // MFL disables the box for a bye and once his game has started, so neither can be changed
            locked: box.disabled || box.hasAttribute("disabled"),
            box
        });
    }
    const irTable = [...doc.querySelectorAll("table.report")].find((t) => /currently on your Injured Reserve/i.test(t.textContent));
    const ir = irTable ? [...irTable.querySelectorAll("a[href*='launch_player_modal']")].map((a) => readName(a.textContent).name) : [];
    const links = weekLinks(doc);
    return {
        team: form.querySelector("input[name=FRANCHISE]").value,
        week,
        total: totalMatch ? Number(totalMatch[1]) : Object.values(limits).reduce((sum, [, most]) => sum + most, 0),
        limits,
        players,
        ir,
        prev: links.get(week - 1) || null,
        next: links.get(week + 1) || null
    };
}

// the week's injury report wins over MFL's one-letter column: it tells IR from IR-R and names a suspension
export function applyInjuries(players, report) {
    if (!report) {
        return;
    }
    const statuses = new Map(report.map((injury) => [injury.id, injury.status || ""]));
    for (const player of players) {
        const status = statuses.get(player.id);
        if (status) {
            player.injury = /^IR/.test(status) ? "IR" : status;
        }
    }
}

// a bye and a game that has started both lock the row; the tag tells them apart
export function tagOf(player) {
    if (player.onBye) {
        return {text: "Bye", tone: "plain"};
    }
    if (player.locked) {
        return {text: "Game started", tone: "plain"};
    }
    if (/^(Out|IR|Suspended)$/.test(player.injury)) {
        return {text: player.injury, tone: "bad"};
    }
    if (/^(Questionable|Doubtful)$/.test(player.injury)) {
        return {text: player.injury, tone: "caution"};
    }
    return null;
}

export const rangeText = ([least, most]) => (least === most ? String(least) : `${least}–${most}`);

// what the save bar says about `on` (a Set of player ids), and whether Save may send it: MFL takes no
// partial lineup, so it must be full and within each position's limits
export function lineupStatus({players, limits, total}, on) {
    // every position MFL's page limits, in its order
    const counts = Object.fromEntries(Object.keys(limits).map((pos) => [pos, 0]));
    for (const player of players) {
        if (on.has(player.id) && player.pos in counts) {
            counts[player.pos] += 1;
        }
    }
    const starting = players.filter((player) => on.has(player.id)).length;
    const over = Object.keys(counts).filter((pos) => counts[pos] > limits[pos][1]);
    const broken = Object.keys(counts).filter((pos) => counts[pos] < limits[pos][0] || counts[pos] > limits[pos][1]);
    const limitText = (pos) => `${pos} ${counts[pos]}, start ${rangeText(limits[pos])}`;
    let line;
    if (starting < total) {
        line = [`Pick ${total - starting} more`, ...over.map(limitText)].join(" · ");
    } else if (starting > total) {
        line = `Over ${total} starters`;
    } else if (broken.length) {
        line = broken.map(limitText).join(" · ");
    } else {
        line = Object.keys(counts).map((pos) => `${pos} ${counts[pos]}`).join(" · ");
    }
    return {counts, starting, broken: starting === total ? broken : over, ok: starting === total && !broken.length, line};
}

// starters who can't play, one line each; a game that has started can't be changed, so it's left out.
// Warnings, not blocks: injury statuses change up to kickoff.
export function lineupWarnings(players, on) {
    return players.filter((player) => on.has(player.id) && !(player.locked && !player.onBye)).map((player) => {
        const why = player.onBye ? "is on a bye."
            : player.injury === "IR" ? "is on the NFL’s IR."
                : player.injury === "Out" ? "is out."
                    : player.injury === "Suspended" ? "is suspended."
                        : /^FA\*?$/.test(player.nfl) ? "has no NFL team." : null;
        return why && {name: player.name, why};
    }).filter(Boolean);
}

export const sameLineup = (a, b) => a.size === b.size && [...a].every((id) => b.has(id));
