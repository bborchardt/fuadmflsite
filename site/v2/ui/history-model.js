// The league's history from MFL's League History pages, which have no exports: champions (`O=194`),
// each team's career record (`O=208`) and its record against each opponent (`O=171`). MFL ties the
// years together through the commissioner's historical franchise links, which it doesn't publish.
// No drawing or fetching here, so each can be checked against saved pages.

import {text} from "./player-page.js";
import settings from "../lib/settings.js";

// Franchise numbers MFL moved when teams left: `was`, up to and including `through`, is today's `now`
export const RENUMBERED = settings.renumberedFranchises;

const record = (value) => {
    const [w, l, t] = text(value).split("-").map(Number);
    return {w: w || 0, l: l || 0, t: t || 0};
};

// each `<tr>` of the table whose caption starts with `caption` (the words alone are in MFL's menu
// too): {team, cells}, `team` the franchise number in its link (null for Total or Defunct Franchises)
function rows(html, caption) {
    const at = html.indexOf(`<caption><span>${caption}`);
    if (at < 0) {
        return [];
    }
    const table = html.slice(at, html.indexOf("</table>", at));
    return (table.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || []).map((row) => ({
        team: (row.match(/franchise_(\d{4})/) || [])[1] || null,
        cells: (row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || [])
    }));
}

// [{year, name, team}], newest first: each year's champion with that year's name and franchise
// number; null if the page isn't drawn as expected
export function readChampions(html) {
    const champions = String(html || "").split(/<th colspan="2">/).slice(1).flatMap((part) => {
        const year = (part.match(/^(\d{4})<\/th>/) || [])[1];
        const first = part.match(/<td class="rank">1\.<\/td>\s*<td class="franchisename">([\s\S]*?)<\/td>/);
        if (!year || !first) {
            return [];
        }
        return [{year: Number(year), name: text(first[1]), team: (first[1].match(/[?&;]F=(\d{4})/) || [])[1] || null}];
    });
    return champions.length ? champions : null;
}

// {team: {w, l, t, seasons}} for today's teams, `seasons` the years MFL links to each; null if the
// page isn't drawn as expected
export function readCareer(html) {
    const teams = {};
    for (const {team, cells} of rows(String(html || ""), "Career Records")) {
        if (team && cells.length >= 6) {
            const [w, l, t] = cells.slice(2, 5).map((cell) => Number(text(cell)) || 0);
            const seasons = text(cells[cells.length - 1]).split(",").map(Number).filter(Boolean);
            teams[team] = {w, l, t, seasons};
        }
    }
    return Object.keys(teams).length ? teams : null;
}

// {opponent: {w, l, t}}, one team's all-time record against each of today's other teams; null if
// the page isn't drawn as expected
export function readSeries(html) {
    const opponents = {};
    for (const {team, cells} of rows(String(html || ""), "Series Records For")) {
        // the last two cells are the total and the percentage
        if (team && cells.length >= 3) {
            opponents[team] = record(cells[cells.length - 2]);
        }
    }
    return Object.keys(opponents).length ? opponents : null;
}

// the team holding a year's franchise number today, before checking MFL links it to that year
function todaysNumber(year, number, renumbered) {
    const moved = renumbered.find((entry) => entry.was === number && year <= entry.through);
    if (moved) {
        return moved.now;
    }
    // that year the number was another team's
    return renumbered.some((entry) => entry.now === number && year <= entry.through) ? null : number;
}

// {team: [years]}, oldest first: each of today's teams' titles. A title counts when MFL links the
// team holding the champion's number to that year; the rest went to owners who've left.
export function titles(champions, career, renumbered = RENUMBERED) {
    const won = {};
    for (const champion of champions || []) {
        const team = champion.team && todaysNumber(champion.year, champion.team, renumbered);
        if (team && career && career[team] && career[team].seasons.includes(champion.year)) {
            (won[team] = won[team] || []).push(champion.year);
        }
    }
    Object.values(won).forEach((years) => years.sort((a, b) => a - b));
    return won;
}

// "Your record vs them 8–13–0", the viewer's record against a team, or "" if they've never met
export function versusLine(vs) {
    return vs && vs.w + vs.l + vs.t > 0 ? `Your record vs them ${vs.w}–${vs.l}–${vs.t}` : "";
}

// "All-time 93–67–3 · since 2016 · Champion 2020, 2022", or "" without a career record
export function historyLine(career, years = []) {
    if (!career) {
        return "";
    }
    const since = career.seasons.length ? Math.min(...career.seasons) : null;
    return [`All-time ${career.w}–${career.l}–${career.t}`, since && `since ${since}`, years.length && `Champion ${years.join(", ")}`].filter(Boolean).join(" · ");
}
