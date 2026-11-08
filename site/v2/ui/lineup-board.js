// Lineup's reads for backup starters (lineup-backups.js): the team's lineups for the week with their
// messages, from MFL's Lineup Details, and every "Conditional starters" thread on the board, each page
// of it, as the daily job reads them. Nothing is posted: Save puts the backups in the lineup's message.

import {THREAD_TITLE, readLineupDetails, readTopicPage} from "../lib/backups.js";
import {API_BASE, asArray, exportUrl, fetchExport} from "../lib/mfl.js";
import {mflTime} from "../lib/zone.js";
import {mflFetch, pageFetch} from "./page-fetch.js";

const topicPath = (season, leagueId, thread) => `/${season}/mb/topic_show.pl?bid=${season}${leagueId}&tid=${thread}`;

async function page(url) {
    const response = await mflFetch(url, {credentials: "include", cache: "no-store"});
    if (!response.ok) {
        throw new Error(`MFL answered HTTP ${response.status}`);
    }
    return response.text();
}

// the thread's posts, each readTopicPage's with `at` (its last edit) and `postedAt` in seconds
export async function readThreads({season, leagueId}) {
    const origin = window.location.origin;
    const board = await fetchExport(exportUrl(origin, season, "messageBoard", {L: leagueId, COUNT: 100}), "messageBoard", {fetchImpl: mflFetch, init: {cache: "no-store"}});
    const threads = asArray(board.thread).filter((thread) => String(thread.subject || "").trim().toLowerCase() === THREAD_TITLE.toLowerCase());
    const posts = [];
    for (const thread of threads) {
        const pages = new Map([["1", `${origin}${topicPath(season, leagueId, thread.id)}`]]);
        for (const url of pages.values()) {
            const topic = readTopicPage(await page(url));
            posts.push(...topic.posts.map((post) => ({...post, at: mflTime(post.edited || post.posted), postedAt: mflTime(post.posted)})));
            for (const href of topic.pages) {
                const next = new URL(href, url);
                const number = next.searchParams.get("page") || "1";
                if (!pages.has(number)) {
                    pages.set(number, next.href);
                }
            }
        }
    }
    return posts;
}

// the team's lineups for the week, oldest first, each readLineupDetails' with its message
export async function readLineups({season, leagueId}, team, week) {
    const url = `${window.location.origin}/${season}/options?L=${encodeURIComponent(leagueId)}&O=210&FRANCHISE=${encodeURIComponent(team)}&W=${week}`;
    return readLineupDetails(await page(url)).filter((submission) => submission.week === week);
}

// A week's NFL schedule: read fresh, as a kickoff MFL moves moves a deadline; `keep`, a past week's
// as v2 keeps it
export async function weekKickoffs(season, week, {keep = false} = {}) {
    return fetchExport(exportUrl(API_BASE, season, "nflSchedule", {W: week}), "nflSchedule", keep ? {fetchImpl: pageFetch} : {fetchImpl: mflFetch, init: {cache: "no-store"}});
}
