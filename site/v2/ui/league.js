// League, rebuilt on MFL's home page: Scores, Standings, Power and Winners, each under its own #
// (`#league-standings`) and loaded the first time it shows. Before week 1 the new site has no games,
// so Standings, Power and Winners show last season's final, which MFL keeps on the previous site.

import {API_BASE, asArray, exportUrl, fetchExport} from "../lib/mfl.js";
import {armRetry, drawPanel, failedMarkup} from "./panel.js";
import {cached} from "./store.js";
import {mflFetch, pageFetch} from "./page-fetch.js";
import {beforeWeek1} from "./context.js";
import {readProjections, readRules} from "./live-scoring.js";
import {careers, champions} from "./history.js";
import {titles} from "./history-model.js";
import {allPlayRecords, playoffPicture, playoffPlaces, positionPoints, readPowerPage, standings, winnings} from "./league-model.js";
import {championsMarkup, pictureMarkup, positionsMarkup, powerMarkup, standingsMarkup, winnersMarkup} from "./league-view.js";
import {drawScores, two} from "./scores.js";

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

export const VIEWS = ["scores", "standings", "power", "winners"];

const viewOf = (hash) => VIEWS.find((view) => hash === `#league-${view}`) || null;

function playersMap(players) {
    return new Map(asArray(players && players.player).map((player) => {
        const [last, first] = String(player.name).split(",").map((part) => part.trim());
        return [player.id, {name: first ? `${first} ${last}` : last, sortName: player.name, position: player.position, team: player.team}];
    }));
}

function namesOf(league) {
    const names = new Map(Object.values(window.franchiseDatabase || {}).filter((team) => team.id && team.id !== "0000").map((team) => [team.id, team.name]));
    for (const team of asArray(league && league.franchises && league.franchises.franchise)) {
        names.set(team.id, team.name);
    }
    return names;
}

// ---- The section ----

function wireToggles(root) {
    root.addEventListener("click", (event) => {
        const row = event.target.closest(".fuad-power-row");
        if (row) {
            const open = row.getAttribute("aria-expanded") !== "true";
            row.setAttribute("aria-expanded", String(open));
            row.closest("li").classList.toggle("fuad-open", open);
            document.getElementById(row.getAttribute("aria-controls")).hidden = !open;
        }
        const collapse = event.target.closest(".fuad-collapse");
        if (collapse) {
            const open = collapse.getAttribute("aria-expanded") !== "true";
            collapse.setAttribute("aria-expanded", String(open));
            collapse.textContent = open ? "Hide" : "Show";
            document.getElementById(collapse.getAttribute("aria-controls")).hidden = !open;
        }
    });
}

export function drawLeague({context, franchiseId, teamHref}) {
    const viewer = franchiseId && franchiseId !== "0000" ? franchiseId : null;
    const host = window.location.origin;
    const season = context.season;

    // one request per export per page (page-fetch.js); `fresh` asks MFL again
    const exp = (type, params = {}, {base = host, optional = false, fresh = false, year = season} = {}) => {
        const leagueParams = base === host ? {L: context.leagueId, ...params} : params;
        // the year to date comes back as `allWeeklyResults`
        const section = type === "weeklyResults" && params.W === "YTD" ? "allWeeklyResults" : type;
        const request = fetchExport(exportUrl(base, year, type, leagueParams), section, {fetchImpl: fresh ? mflFetch : pageFetch, init: {cache: "no-store"}});
        return optional ? request.catch((error) => {
            console.warn(`[fuad] couldn't load ${type}:`, error);
            return null;
        }) : request;
    };
    // MFL's live feeds (stats, projections), read as its live scoring page reads them
    const feed = async (name) => {
        const response = await mflFetch(`${host}/fflnetdynamic${season}/${name}?RANDOM=${Date.now()}`, {cache: "no-store"});
        if (!response.ok) {
            throw Object.assign(new Error(`${name} returned HTTP ${response.status}`), {status: response.status});
        }
        return response.text();
    };
    const once = (load) => {
        let value = null;
        return () => {
            if (!value) {
                value = load().catch((error) => {
                    value = null;
                    throw error;
                });
            }
            return value;
        };
    };

    // before week 1's kickoff the new site has no games: last season's final stands in. MFL's page
    // says so once a week is done; otherwise week 1's kickoff, and if that can't be had, in season.
    const beforeSeason = once(() => beforeWeek1(season));
    const players = once(async () => playersMap(await cached(`fuad.players.${season}`, DAY, async () => ({player: (await fetchExport(exportUrl(API_BASE, season, "players"), "players", {fetchImpl: mflFetch})).player}))));
    const rules = once(async () => readRules(await cached(`fuad.rules.${season}`, DAY, () => exp("rules"))));
    // the projections don't change during a week: read once, as MFL's page does
    const projected = new Map();
    const projections = (week) => {
        if (!projected.has(week)) {
            projected.set(week, feed(`live_proj_${two(week)}.txt`).then(readProjections).catch((error) => {
                projected.delete(week);
                throw error;
            }));
        }
        return projected.get(week);
    };
    const leagueOf = (year) => exp("league", {}, {year});
    const namesFor = (year = season) => leagueOf(year).catch(() => null).then(namesOf);
    // the season shown in Standings, Power and Winners: this one, or last one's final before week 1
    const shownSeason = () => beforeSeason().then((before) => (before ? season - 1 : season));

    const root = document.createElement("main");
    root.id = "fuad-league";
    root.innerHTML = VIEWS.map((view) => `<div class="fuad-league-view" data-view="${view}" hidden></div>`).join("");
    (document.querySelector(".pagebody") || document.body).prepend(root);
    wireToggles(root);

    const drawn = new Map();
    let visible = null;
    const views = {
        scores: async (mount) => {
            const before = await beforeSeason();
            const schedule = once(() => exp("schedule"));
            const lastScheduled = await schedule().then((found) => Math.max(0, ...asArray(found && found.weeklySchedule)
                .filter((week) => asArray(week.matchup).length).map((week) => Number(week.week))), () => 0);
            return drawScores(mount, {
                context, viewer, exp, feed, before, lastScheduled, teamHref, lastRegular: Number(window.standingsEndWeek) || 14,
                names: () => namesFor(), players, rules, projections, schedule, league: () => leagueOf(season),
                showing: () => document.documentElement.classList.contains("fuad-league-on") && viewOf(window.location.hash) === "scores"
            });
        },
        standings: async (mount) => {
            const year = await shownSeason();
            const final = year !== season ? String(year) : "";
            mount.innerHTML = '<div class="fuad-division-panels"></div><div class="fuad-picture-panel"></div>';
            const load = async () => {
                const [settings, standing, ytd] = await Promise.all([leagueOf(year), exp("leagueStandings", {}, {year}), exp("weeklyResults", {W: "YTD"}, {year, optional: true})]);
                const lastRegular = Number(settings.lastRegularSeasonWeek) || 14;
                const divisions = standings(standing, settings, namesOf(settings), ytd ? allPlayRecords(ytd, lastRegular) : null);
                const inPlayoffs = Boolean(final) || Number(window.liveScoringWeek) > lastRegular;
                return {divisions, picture: playoffPicture(divisions), inPlayoffs};
            };
            const shared = once(load);
            drawPanel(mount.firstElementChild, {
                what: "standings", key: `fuad.league.standings.${year}`, maxAge: 2 * MINUTE, rows: 10, load: shared,
                render: (value, body) => {
                    mount.firstElementChild.classList.remove("fuad-panel");
                    body.innerHTML = standingsMarkup(value.divisions, {viewer, final, teamHref});
                }
            });
            drawPanel(mount.lastElementChild, {
                what: "the playoff picture", key: `fuad.league.picture.${year}`, maxAge: 2 * MINUTE, rows: 6, load: shared,
                render: (value, body) => {
                    mount.lastElementChild.classList.remove("fuad-panel");
                    const title = final ? `${final} playoff seeds` : value.inPlayoffs ? "Playoff seeds" : "Playoff picture";
                    body.innerHTML = pictureMarkup(value.picture, {viewer, title, showHunt: !value.inPlayoffs, teamHref});
                }
            });
        },
        power: async (mount) => {
            const year = await shownSeason();
            const final = year !== season ? String(year) : "";
            mount.innerHTML = '<div class="fuad-power-panel"></div><div class="fuad-positions-panel"></div>';
            drawPanel(mount.firstElementChild, {
                what: "power rankings", key: `fuad.league.power.${year}`, maxAge: 10 * MINUTE, rows: 10,
                load: async () => {
                    const response = await pageFetch(`${host}/${year}/options?L=${context.leagueId}&O=101`, {credentials: "include"});
                    if (!response.ok) {
                        throw Object.assign(new Error(`HTTP ${response.status}`), {status: response.status});
                    }
                    const teams = readPowerPage(await response.text());
                    if (!teams) {
                        throw new Error("MFL's Power Rank page has changed");
                    }
                    return teams;
                },
                render: (teams, body) => {
                    mount.firstElementChild.classList.remove("fuad-panel");
                    body.innerHTML = powerMarkup(teams, {viewer, final, teamHref});
                }
            });
            drawPanel(mount.lastElementChild, {
                what: "starter points by position", key: `fuad.league.positions.${year}`, maxAge: 10 * MINUTE, rows: 10,
                load: async () => {
                    const [ytd, settings, known] = await Promise.all([exp("weeklyResults", {W: "YTD"}, {year}), leagueOf(year), players()]);
                    const positions = new Map([...known].map(([id, player]) => [id, player.position]));
                    return positionPoints(ytd, positions, namesOf(settings));
                },
                render: (rows, body) => {
                    mount.lastElementChild.classList.remove("fuad-panel");
                    body.innerHTML = positionsMarkup(rows, {viewer, teamHref});
                }
            });
        },
        winners: async (mount) => {
            const year = await shownSeason();
            const final = year !== season ? String(year) : "";
            mount.innerHTML = '<div class="fuad-winners-panel"></div><div class="fuad-champions-panel"></div>';
            const championsMount = mount.lastElementChild;
            drawPanel(championsMount, {
                what: "the champions", rows: 6,
                load: async () => {
                    const list = await champions(context);
                    // highlighting the viewer's titles is a nicety: without the careers, none
                    const career = viewer ? await careers(context).catch(() => null) : null;
                    return {list, mine: (viewer && titles(list, career)[viewer]) || []};
                },
                render: ({list, mine}, body) => {
                    championsMount.classList.remove("fuad-panel");
                    body.innerHTML = championsMarkup(list, mine);
                }
            });
            const winnersMount = mount.firstElementChild;
            drawPanel(winnersMount, {
                what: "winnings", key: `fuad.league.winners.${year}`, maxAge: 10 * MINUTE, rows: 10,
                load: async () => {
                    const [settings, accounting, ytd, standing, brackets] = await Promise.all([
                        leagueOf(year), exp("accounting", {}, {year, optional: true}), exp("weeklyResults", {W: "YTD"}, {year}),
                        exp("leagueStandings", {}, {year}), exp("playoffBrackets", {}, {year, optional: true})
                    ]);
                    const lastRegular = Number(settings.lastRegularSeasonWeek) || 14;
                    const lastWeek = Number(settings.endWeek) || 17;
                    const names = namesOf(settings);
                    const rows = standings(standing, settings, names, allPlayRecords(ytd, lastRegular)).flatMap((division) => division.rows);
                    // the places count once the last week has results
                    let places = null;
                    const played = asArray(ytd && ytd.weeklyResults).some((week) => Number(week.week) === lastWeek
                        && asArray(week.matchup).some((matchup) => asArray(matchup.franchise).some((team) => team.score !== undefined && team.score !== "")));
                    const list = asArray(brackets && brackets.playoffBracket);
                    if (played && list.length >= 2) {
                        const champion = list.find((bracket) => /champion/i.test(bracket.bracketWinnerTitle || "")) || list[0];
                        const third = list.find((bracket) => /3rd/i.test(`${bracket.bracketWinnerTitle} ${bracket.name}`)) || list[1];
                        const results = await Promise.all([champion, third].map((bracket) => exp("playoffBracket", {BRACKET_ID: bracket.id}, {year, optional: true})));
                        places = results.every(Boolean) ? playoffPlaces(results) : null;
                    }
                    return winnings({accounting, weeklyResults: ytd, standingRows: rows, lastRegularWeek: lastRegular, places, names});
                },
                render: (result, body) => {
                    winnersMount.classList.remove("fuad-panel");
                    body.innerHTML = winnersMarkup(result, {viewer, final, teamHref});
                }
            });
        }
    };

    const show = () => {
        const on = document.documentElement.classList.contains("fuad-league-on");
        const view = on ? viewOf(window.location.hash) : null;
        // the page's other classes change too (a dialog opening): only a change of view counts
        if (view === visible) {
            return;
        }
        visible = view;
        root.querySelectorAll(".fuad-league-view").forEach((mount) => {
            mount.hidden = mount.dataset.view !== view;
        });
        if (!view) {
            return;
        }
        if (!drawn.has(view)) {
            const mount = root.querySelector(`[data-view="${view}"]`);
            drawn.set(view, Promise.resolve().then(() => views[view](mount)).catch((error) => {
                console.error(`[fuad] couldn't draw League's ${view}:`, error);
                drawn.delete(view);
                mount.innerHTML = `<div class="fuad-panel">${failedMarkup("this page", error)}</div>`;
                armRetry(mount.querySelector("button"), error, () => {
                    visible = null;
                    show();
                });
            }));
        } else if (view === "scores") {
            drawn.get(view).then((scores) => scores && scores.resume());
        }
    };
    window.addEventListener("hashchange", show);
    new MutationObserver(show).observe(document.documentElement, {attributes: true, attributeFilter: ["class"]});
    show();
    return root;
}
