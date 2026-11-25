// A player's projection for the week is the live scoring page's everywhere in v2 (docs/design.md:
// Projections): MFL's projected stats feed scored by the league's rules. Scores and Lineup run MFL's
// simulation; Add's and Players' lists of hundreds score each player's average stat line
// (live-scoring.js averageProjection). A player MFL's injury report has ruled out is projected 0, as
// the feed doesn't. Where the feed or the rules can't be had, a page keeps the figures MFL gave it.

import {API_BASE, asArray, exportUrl, fetchExport, httpStatus} from "../lib/mfl.js";
import {lenient} from "./checked.js";
import {pageChanged} from "./panel.js";
import {pageFetch} from "./page-fetch.js";
import {cached} from "./store.js";
import {averageProjection, readProjections, readRules, simulatedProjections} from "./live-scoring.js";

const DAY = 24 * 60 * 60 * 1000;
// Out, suspended, retired and each kind of injured reserve (IR, IR-R, IR-PUP, IR-NFI); not
// Questionable or Doubtful, whom MFL's Fantasy Sharks figures still project
const RULED_OUT = /^(?:Out|Suspended|RETIRED|IR\b)/;

// the week's injury report, or null without it: then no one is taken as ruled out
export const weekInjuries = (context, week) => fetchExport(exportUrl(API_BASE, context.season, "injuries", {W: week}), "injuries", {fetchImpl: pageFetch, check: lenient})
    .catch((error) => {
        console.warn("[fuad] couldn't read the injury report:", error);
        return null;
    });

// `projections` (readProjections') with those ruled out given no stats, so 0
export function withoutRuledOut(projections, injuries) {
    for (const injury of asArray(injuries && injuries.injury)) {
        if (RULED_OUT.test(String(injury.status)) && projections.has(injury.id)) {
            projections.set(injury.id, {});
        }
    }
    return projections;
}

// the week's projections feed, read once a page and shared (Scores, Players)
export async function feedText(context, week) {
    const response = await pageFetch(`${window.location.origin}/fflnetdynamic${context.season}/live_proj_${String(week).padStart(2, "0")}.txt`, {cache: "no-store"});
    if (!response.ok) {
        throw Object.assign(new Error(`live_proj_${String(week).padStart(2, "0")}.txt returned ${httpStatus(response)}`), {status: response.status});
    }
    return response.text();
}

// {projections, rules, week} for `week`, or null; the rules shared with Scores (league.js)
export async function weekFeed(context, week) {
    if (!(week >= 1)) {
        return null;
    }
    const host = window.location.origin;
    try {
        const [text, rules, injuries] = await Promise.all([
            feedText(context, week),
            cached(`fuad.rules.${context.season}`, DAY, () => fetchExport(exportUrl(host, context.season, "rules", {L: context.leagueId}), "rules", {fetchImpl: pageFetch, init: {cache: "no-store"}, check: lenient})),
            weekInjuries(context, week)
        ]);
        const projections = readProjections(text);
        if (!projections) {
            pageChanged("projections feed");
            return null;
        }
        return {projections: withoutRuledOut(projections, injuries), rules: readRules(rules), week};
    } catch (error) {
        console.warn("[fuad] couldn't read the projections:", error);
        return null;
    }
}

// Lineup's: its starters as Scores simulates them, together in MFL's order (the page's), and the rest
// each alone. `players` are {id, pos, starter, onBye}; a map of id to points.
export function lineupProjections(feed, players) {
    const shown = players.filter((player) => !player.onBye).map((player) => ({playerId: player.id, position: player.pos, starter: player.starter}));
    return simulatedProjections({starters: shown.filter((player) => player.starter), others: shown.filter((player) => !player.starter)}, feed);
}

// a list's player's points from his average stat line, or null for one the feed doesn't project
export function listProjection(feed, id, position) {
    const stats = feed.projections.get(id);
    return stats ? averageProjection(stats, position, feed.rules) : null;
}
