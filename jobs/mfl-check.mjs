// The daily job's check of what v2 reads from MFL that the chores don't (docs/design.md: Outside
// change): each export through its rules in lib/shapes.js, and each page or feed through v2's own
// reader, as the commissioner's login sees it, which is a member's view of the team it owns. Nothing
// is written; a page's text never leaves the run, as the run's log is public.

import {pathToFileURL} from "node:url";
import {join} from "node:path";
import {mflHomePage} from "./mfl-form.mjs";

// MFL's page as a browser's parser builds it; MFL's scripts aren't run. jsdom is loaded only by a run
// that checks pages, as it is most of the job's start-up.
const documentOfLoaded = async () => {
    const {JSDOM} = await import("jsdom");
    return (html) => new JSDOM(html).window.document;
};
const scripts = (doc) => [...doc.querySelectorAll("script")].map((script) => script.textContent).join("\n");
const two = (week) => String(week).padStart(2, "0");

// The exports, beyond the chores' own and the live scoring read first for the week: `when` leaves one
// out at a time it has nothing to give. {base: "api"} is MFL's shared host, otherwise the league's.
export function exportChecks({week, inSeason}) {
    return [
        {type: "rules"},
        {type: "schedule"},
        {type: "leagueStandings"},
        {type: "weeklyResults", params: {W: "YTD"}},
        {type: "playoffBrackets"},
        {type: "accounting"},
        {type: "pendingWaivers"},
        {type: "pendingTrades"},
        {type: "messageBoard", params: {COUNT: 20}},
        {type: "draftResults"},
        {type: "futureDraftPicks"},
        {type: "playerScores", params: {W: "YTD"}},
        {type: "nflByeWeeks", base: "api"},
        {type: "projectedScores", params: {W: week}, when: inSeason && week > 0},
        {type: "nflSchedule", params: {W: week}, base: "api", when: inSeason && week > 0}
    ].filter((each) => each.when !== false);
}

// The pages and feeds: `path` from the league's host, `read(text, found)` true when v2's readers
// (`uses`, which tests/readers.test.mjs holds to every reader) can read it. `when` as for exports.
// `name` is the file it's saved as, as the capture bookmark names it; `members`, a page with what only
// the league's members see, or the login's own team's (its pending bids and offers, its settings).
export async function pageChecks({season, leagueId, franchise, partner, playerId, week, inSeason}, version = "v2") {
    const documentOf = await documentOfLoaded();
    const ui = (name) => import(pathToFileURL(join(import.meta.dirname, "..", "site", version, "ui", name)).href);
    const [{readPlayerLists}, {readRoster}, {readBidRun}, {lineupForm, lineupRefusal, readLineupPage}, {readProposal, readTradesPage}, {readIRPage},
        {readScoring, readSettings}, {readPowerPage}, {readCareer, readChampions, readSeries}, {readSkinForm}, {readCustomizeForm},
        {readSetupNav}, {readArticle, readPlayerPage}, {readProjections, readStats}, {readChat}] = await Promise.all([
        "add-model.js", "drop-model.js", "bids-model.js", "lineup-model.js", "trades-model.js", "ir-model.js", "rules-model.js",
        "league-model.js", "history-model.js", "looks.js", "width.js", "setup.js", "player-page.js", "live-scoring.js", "home-feeds.js"
    ].map(ui));
    const L = encodeURIComponent(leagueId);
    const option = (number, more = "") => `/${season}/options?L=${L}&O=${number}${more}`;
    const onDoc = (read) => (html) => Boolean(read(documentOf(html)));
    return [
        // the fields add.js and drop.js post besides the lists they read; MFL's Add/Drop form is inside a
        // table, which jsdom, unlike a browser, doesn't give its fields to, so they're found on the page
        {uses: ["readPlayerLists"], what: "Add/Drop", name: "add_drop.html", members: true, path: `/${season}/add_drop?L=${L}`, read: onDoc((doc) => {
            const lists = readPlayerLists(scripts(doc));
            return lists && lists.add.length && ["#add_pid_field_id", "#drop_pid_field_id", "[name=ROUND]", "[name=COMMENTS]"].every((field) => doc.querySelector(field));
        })},
        {uses: ["readRoster"], what: "Drop Players", name: "options-O257.html", members: true, path: option("257"), read: onDoc((doc) => {
            const select = doc.querySelector("select[name=drop_pid]");
            return readRoster(scripts(doc)) && select && select.form && select.form.elements.OPTION && select.form.elements.OPTION.value === "257";
        })},
        {uses: ["readIRPage"], what: "Injured Reserve", name: "options-O18.html", members: true, path: option("18"), read: onDoc((doc) => readIRPage(doc, franchise))},
        // v2 draws Trades with teams to trade with, or MFL's note that trades are closed; with neither it
        // stands aside for MFL's page
        {uses: ["readTradesPage"], what: "Trades", name: "options-O05.html", members: true, path: option("05"), read: onDoc((doc) => {
            const page = readTradesPage(doc);
            return page && (page.partners.length || page.closed);
        })},
        {uses: ["readProposal"], what: "a trade proposal", name: "options-O05-propose.html", members: true, path: option("05", `&FRANCHISE=${franchise},${partner}`), when: Boolean(partner), read: onDoc((doc) => readProposal(doc, franchise))},
        // or MFL's refusal in its place, as lineup.js has it (the season over, a roster to fix first)
        {uses: ["readLineupPage"], what: "Submit Lineup", name: "lineup.html", members: true, path: `/${season}/lineup?L=${L}&F=${franchise}`, read: onDoc((doc) => {
            const page = readLineupPage(doc);
            return lineupRefusal(doc) || (lineupForm(doc) && page && page.players.length);
        })},
        {uses: ["readBidRun"], what: "Processed Waivers", name: "processed_waivers.html", members: true, path: `/${season}/processed_waivers?LEAGUE_ID=${L}`, read: (html) => Boolean(readBidRun(documentOf(html).body.innerHTML))},
        {uses: ["readScoring"], what: "League Rules", name: "options-O09.html", path: option("09"), read: onDoc(readScoring)},
        {uses: ["readSettings"], what: "League Settings", name: "options-O26.html", path: option("26"), read: onDoc(readSettings)},
        {uses: ["readPowerPage"], what: "Power Rankings", name: "options-O101.html", path: option("101"), read: (html) => Boolean(readPowerPage(html))},
        {uses: ["readChampions"], what: "League Champions", name: "options-O194.html", path: option("194"), read: (html) => Boolean(readChampions(html))},
        {uses: ["readCareer"], what: "Career Records", name: "options-O208.html", path: option("208"), read: (html) => Boolean(readCareer(html))},
        {uses: ["readSeries"], what: "All-Time Series Records", name: "options-O171.html", path: option("171", `&FID=${franchise}`), read: (html) => Boolean(readSeries(html))},
        {uses: ["readSkinForm", "readSetupNav"], what: "the skin form", name: "csetup-SKIN.html", members: true, path: `/${season}/csetup?L=${L}&C=SKIN`,
            read: onDoc((doc) => readSkinForm(doc) && readSetupNav(doc.querySelector("#withmenus > span.reportnavigation")))},
        {uses: ["readCustomizeForm"], what: "the customize form", name: "csetup-FCUSTOM.html", members: true, path: `/${season}/csetup?L=${L}&C=FCUSTOM`, read: onDoc(readCustomizeForm)},
        // the player's page names his news, whose first article is read after it
        {uses: ["readPlayerPage"], what: "a player's page", name: "player.html", path: `/${season}/player?L=${L}&P=${encodeURIComponent(playerId)}`, when: Boolean(playerId), read: (html, found) => {
            const player = readPlayerPage(html);
            found.article = player && player.news.length ? player.news[0].id : null;
            return Boolean(player);
        }},
        {uses: ["readArticle"], what: "a news article", name: "view_news_article.html", path: (found) => (found.article ? `/${season}/view_news_article?L=${L}&ID=${encodeURIComponent(found.article)}` : null),
            read: (html) => Boolean(readArticle(html))},
        // the feeds, as MFL's pages ask for them: the stats feed answers 403 without one as referrer
        // (docs/mfl.md). The week before's stats, which are final; this week's may have no games yet
        {uses: ["readStats"], feed: true, what: `the live stats feed for week ${week - 1}`, name: `live_stats_${two(week - 1)}.txt`, path: `/fflnetdynamic${season}/live_stats_${two(week - 1)}.txt`, when: inSeason && week > 1,
            read: (text) => Boolean(readStats(text))},
        {uses: ["readProjections"], feed: true, what: `the projections feed for week ${week}`, name: `live_proj_${two(week)}.txt`, path: `/fflnetdynamic${season}/live_proj_${two(week)}.txt`, when: inSeason && week > 0,
            read: (text) => Boolean(readProjections(text))},
        {uses: ["readChat"], feed: true, what: "the chat feed", name: "chat.xml", members: true, path: `/fflnetdynamic${season}/${L}_chat.xml`, read: (xml) => Boolean(readChat(xml, {viewer: franchise}))}
    ].filter((each) => each.when !== false);
}

// `context`: {season, leagueId, franchise (the login's team), partner (another), playerId (one of the
// team's), inSeason}. `exportRead(check)` resolves to the export's section, checked, or throws
// fetchExport's error; `pageRead(path, {referer})` to {status, body}, or throws when it couldn't be
// asked, `referer` the league's home page's path, to send as the referrer, for a feed.
// `keep(page, answer, changed)`, when given, is told of each page MFL answered, and gives true when it
// kept a copy, which a change's flag then says.
// Resolves to {changed, unchecked, count}: what v2 can't read, and what MFL didn't give this time (a
// refusal, an error, its home page), each flagged by the job. Without a franchise, only the exports.
export async function checkMfl(context, {exportRead, pageRead, version, keep = () => false}) {
    const changed = [];
    const unchecked = [];
    let count = 0;
    // a missing field, or an export MFL no longer has
    const failed = (error) => (error.changed || error.status === 404 ? changed : unchecked).push(error.message);
    let week = NaN;
    if (context.inSeason) {
        count++;
        try {
            week = Number((await exportRead({type: "liveScoring", params: {DETAILS: 1}})).week);
        } catch (error) {
            failed(error);
        }
    }
    const weekly = {...context, week};
    for (const each of exportChecks(weekly)) {
        count++;
        try {
            await exportRead(each);
        } catch (error) {
            failed(error);
        }
    }
    const found = {};
    for (const each of context.franchise ? await pageChecks(weekly, version) : []) {
        const path = typeof each.path === "function" ? each.path(found) : each.path;
        if (!path) {
            continue;
        }
        count++;
        let answer;
        try {
            answer = await pageRead(path, each.feed ? {referer: `/${context.season}/home/${encodeURIComponent(context.leagueId)}`} : {});
        } catch (error) {
            unchecked.push(`Couldn't load ${each.what}: ${error.message}`);
            continue;
        }
        if (answer.status === 404) {
            changed.push(`${each.what} (${path}): MFL answered HTTP 404`);
        } else if (answer.status !== 200) {
            unchecked.push(`Couldn't load ${each.what}: HTTP ${answer.status}`);
        } else if (mflHomePage(answer.body)) {
            unchecked.push(`Couldn't load ${each.what}: ${mflHomePage(answer.body)}`);
        } else {
            const read = Boolean(each.read(answer.body, found));
            const kept = keep({...each, path}, answer, !read);
            if (!read) {
                changed.push(`${each.what} (${path}): v2 can't read it${kept ? "; MFL's page is saved on the run" : ""}`);
            }
        }
    }
    return {changed, unchecked, count};
}
