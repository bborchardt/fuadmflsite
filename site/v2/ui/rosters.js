// Rosters, rebuilt on MFL's home page: My team, Teams (and each team's page under it), Players and
// Draft, each under its own # (`#rosters-teams/0004` for one team) and loaded the first time it shows.
// Names open the player popup with its Rosters actions (popup.js).

import {API_BASE, asArray, exportUrl, fetchExport} from "../lib/mfl.js";
import {drawPanel} from "./panel.js";
import {cached, storage} from "./store.js";
import {pageFetch} from "./page-fetch.js";
import {beforeWeek1} from "./context.js";
import {REBUILT, sections, storedTabs} from "./nav.js";
import {franchiseView} from "./franchise-view.js";
import {careers, champions, series} from "./history.js";
import {watchList, whenPopupClosed} from "./watch.js";
import {allPlayRecords, playoffPicture, standings} from "./league-model.js";
import {
    FIRST_DIRECTION, boardPicksOf, byeWeeks, draftBoard, draftOrder, drafted, filterPlayers, pickNumbers, picksOf, playerPool, playoffFinish, pointsById,
    sortPlayers, teamSheets
} from "./rosters-model.js";
import {draftMarkup, historyMarkup, picksPanels, playerChips, playerLayout, playerRows, playersFrame, teamMarkup, teamsMarkup} from "./rosters-view.js";

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

export const VIEWS = ["my-team", "teams", "players", "draft"];

// "#rosters-teams/0004" → {view: "teams", team: "0004"}
function routeOf(hash) {
    const match = String(hash).match(/^#rosters-([a-z-]+?)(?:\/(\d{4}))?$/);
    return match && VIEWS.includes(match[1]) ? {view: match[1], team: match[2] || null} : null;
}

// ---- The section ----

// `league()` is the page's one league load (app.js), shared with Home
export function drawRosters({context, franchiseId, dataBase, league: pageLeague}) {
    const viewer = franchiseId && franchiseId !== "0000" ? franchiseId : null;
    const host = window.location.origin;
    const season = context.season;
    const base = `${host}/${season}`;
    const nav = sections({base, leagueId: context.leagueId, franchiseId, tabs: storedTabs(storage), rebuilt: REBUILT});
    const moves = nav.find((section) => section.name === "Moves").views;
    const moveHref = (name) => (moves.find((view) => view.name === name) || {}).href || null;
    const actions = {
        drop: (playerId) => moveHref("Drop") && `${moveHref("Drop")}#player-${encodeURIComponent(playerId)}`,
        // Moves › IR opens with him ticked
        ir: (playerId) => moveHref("IR") && `${moveHref("IR")}#player-${encodeURIComponent(playerId)}`,
        // Moves › Add opens with him chosen
        add: (playerId) => `${moveHref("Add")}#player-${encodeURIComponent(playerId)}`,
        // Moves › Trades' proposal for the two teams, with the player chosen if one is named
        trade: (teamId, playerId = null) => (viewer ? `${base}/options?L=${context.leagueId}&O=05&FRANCHISE=${viewer},${teamId}${playerId ? `#player-${encodeURIComponent(playerId)}` : ""}` : null)
    };

    const exp = (type, params = {}, {base: from = host, optional = false, year = season} = {}) => {
        const leagueParams = from === host ? {L: context.leagueId, ...params} : params;
        const section = type === "weeklyResults" && params.W === "YTD" ? "allWeeklyResults" : type;
        const request = fetchExport(exportUrl(from, year, type, leagueParams), section, {fetchImpl: pageFetch, init: {cache: "no-store"}});
        return optional ? request.catch((error) => {
            console.warn(`[fuad] couldn't load ${type}:`, error);
            return null;
        }) : request;
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

    // before week 1: MFL's page says so once a week is done; else week 1's kickoff; in season on error
    const beforeSeason = once(() => beforeWeek1(season));
    // the league model with every team's contracts, cap and penalties (lib/league.js), from the
    // page's own load
    const league = once(async () => {
        const built = await pageLeague();
        const {league: settings, salaryAdjustments, freeAgents} = built.raw;
        const names = new Map(asArray(settings.franchises && settings.franchises.franchise).map((team) => [team.id, team.name]));
        return {built, settings, salaryAdjustments, freeAgents, names};
    });
    const extras = once(async () => {
        const [futureDraftPicks, byes, points] = await Promise.all([
            exp("futureDraftPicks", {}, {optional: true}),
            cached(`fuad.byes.${season}`, DAY, () => exp("nflByeWeeks", {}, {base: API_BASE})).catch(() => null),
            // before week 1 the new site has no points: last season's, from its own site
            beforeSeason().then((before) => exp("playerScores", {W: "YTD"}, {optional: true, year: before ? season - 1 : season}))
        ]);
        return {futureDraftPicks, byes: byeWeeks(byes), points: pointsById(points)};
    });
    // next year's draft order from the standings (and the bracket once the playoffs are played)
    const order = once(async () => {
        const [{settings, names}, standing, ytd, brackets, {futureDraftPicks}] = await Promise.all([
            league(), exp("leagueStandings"), exp("weeklyResults", {W: "YTD"}, {optional: true}), exp("playoffBrackets", {}, {optional: true}), extras()
        ]);
        const lastRegular = Number(settings.lastRegularSeasonWeek) || 14;
        const divisions = standings(standing, settings, names, ytd ? allPlayRecords(ytd, lastRegular) : null);
        let finish = null;
        const list = asArray(brackets && brackets.playoffBracket);
        if (Number(window.liveScoringWeek) > lastRegular && list.length >= 2) {
            const champion = list.find((bracket) => /champion/i.test(bracket.bracketWinnerTitle || "")) || list[0];
            const third = list.find((bracket) => /3rd/i.test(`${bracket.bracketWinnerTitle} ${bracket.name}`)) || list[1];
            const results = await Promise.all([champion, third].map((bracket) => exp("playoffBracket", {BRACKET_ID: bracket.id}, {optional: true})));
            finish = results.every(Boolean) ? playoffFinish(results, {completedWeek: Number(window.completedWeek) || 0}) : null;
        }
        const rows = draftOrder(playoffPicture(divisions), {finish, futureDraftPicks, names, nextYear: season + 1});
        return {rows, final: Boolean(finish)};
    });
    // this site's draft before it's held (its picks matter most then), else null
    const coming = once(async () => {
        if (!(await beforeSeason())) {
            return null;
        }
        const [{built, names}, results] = await Promise.all([league(), exp("draftResults", {}, {optional: true})]);
        const board = draftBoard(results, {names, players: built.players, salaries: new Map()});
        return board.length && !drafted(board) ? board : null;
    });
    const sheets = once(async () => {
        const [{built, salaryAdjustments, names}, {futureDraftPicks, byes, points}, board] = await Promise.all([league(), extras(), coming()]);
        return teamSheets(built, {salaryAdjustments, futureDraftPicks, byes, points, season, names, board});
    });

    const root = document.createElement("main");
    root.id = "fuad-rosters";
    root.innerHTML = VIEWS.map((view) => `<div class="fuad-rosters-view" data-view="${view}" hidden></div>`).join("");
    (document.querySelector(".pagebody") || document.body).prepend(root);

    // names open the popup with the Rosters actions; toggles open and close in place
    root.addEventListener("click", (event) => {
        const row = event.target.closest("tr[data-href]");
        if (row && !event.target.closest("a, button")) {
            window.location.hash = row.dataset.href;
            return;
        }
        const name = event.target.closest("[data-player]");
        if (name && typeof window.fuadOpenPlayer === "function") {
            window.fuadOpenPlayer(name.dataset.player, {opener: name, actions});
            return;
        }
        const toggle = event.target.closest(".fuad-tag-tile, .fuad-round-toggle, .fuad-scale-toggle");
        if (toggle) {
            const open = toggle.getAttribute("aria-expanded") !== "true";
            if (toggle.classList.contains("fuad-tag-tile")) {
                toggle.parentElement.querySelectorAll(".fuad-tag-tile").forEach((other) => {
                    other.setAttribute("aria-expanded", "false");
                    document.getElementById(other.getAttribute("aria-controls")).hidden = true;
                });
            }
            toggle.setAttribute("aria-expanded", String(open));
            document.getElementById(toggle.getAttribute("aria-controls")).hidden = !open;
            const word = toggle.querySelector('[aria-hidden="true"]');
            if (word) {
                word.textContent = open ? "Hide" : "Show";
            }
        }
    });

    // a team in My team's layout: yours with the cut columns, another's with Propose a trade
    // `fromTeams`: opened from Teams, with Propose a trade
    const teamPage = (mount, teamId, {fromTeams}) => {
        drawPanel(mount, {
            what: teamId === viewer ? "your team" : "this team", key: `fuad.rosters.team.${season}.${teamId}`, maxAge: 2 * MINUTE, rows: 10,
            load: async () => {
                const [all, {futureDraftPicks}, {names}, before, board] = await Promise.all([sheets(), extras(), league(), beforeSeason(), coming()]);
                const sheet = all.find((entry) => entry.id === teamId);
                if (!sheet) {
                    throw new Error(`no team ${teamId}`);
                }
                // before the draft its picks first, then the two years after it, also tradable
                // the board has this year's, should MFL still list them as future picks
                const later = picksOf(teamId, futureDraftPicks, {names, nextYear: season + 1}).filter((entry) => !board || entry.year > season);
                return {sheet, picks: board ? [boardPicksOf(teamId, board, season), ...later] : later, live: !before};
            },
            render: ({sheet, picks, live}, body) => {
                const own = teamId === viewer;
                mount.classList.remove("fuad-panel");
                body.innerHTML = teamMarkup({sheet, picks, live, own, fromTeams, tradeHref: fromTeams && viewer && !own ? actions.trade(teamId) : null, season});
                // the team's all-time record and titles (the record alone if the champions can't be had),
                // then on another team's page the viewer's record against it, from the viewer's series
                Promise.all([
                    careers(context), champions(context).catch(() => null),
                    viewer && !own ? series(context, viewer).catch(() => null) : null
                ]).then(([career, list, mine]) => {
                    const history = body.querySelector("[data-history]");
                    if (history) {
                        history.innerHTML = historyMarkup(teamId, {career, champions: list, mine});
                    }
                }).catch((error) => console.warn("[fuad] couldn't load the team's history:", error));
                // next year's pick numbers once the order is known (it needs the standings)
                if (live) {
                    order().then((ordered) => {
                        const mountPicks = body.querySelector(".fuad-picks-mount");
                        if (mountPicks && mount.contains(mountPicks)) {
                            return Promise.all([league(), extras()]).then(([{names}, {futureDraftPicks}]) => {
                                mountPicks.innerHTML = picksPanels(picksOf(teamId, futureDraftPicks, {names, numbers: pickNumbers(ordered.rows), nextYear: season + 1}), {nextYear: season + 1, live});
                            });
                        }
                    }).catch((error) => console.warn("[fuad] couldn't number the picks:", error));
                }
            }
        });
    };

    const views = {
        "my-team": (mount) => teamPage(mount, viewer, {fromTeams: false}),
        teams: (mount, route) => {
            if (route.team) {
                teamPage(mount, route.team, {fromTeams: true});
                return;
            }
            drawPanel(mount, {
                what: "teams", key: `fuad.rosters.teams.${season}`, maxAge: 2 * MINUTE, rows: 10,
                load: async () => (await sheets()).map((sheet) => ({id: sheet.id, name: sheet.name, capUsed: sheet.capUsed, tight: sheet.tight, picksLine: sheet.picksLine, picksYear: sheet.picksYear, active: sheet.active, ir: sheet.ir, seasons: sheet.seasons})),
                render: (list, body) => {
                    mount.classList.remove("fuad-panel");
                    body.innerHTML = teamsMarkup(list, {viewer, season});
                }
            });
        },
        players: (mount) => {
            const state = {positions: [], years: [], owners: [], watching: false, text: "", sort: null, direction: null};
            // the member's watch list (watch.js) for the Watching chip; a star in the player popup changes it
            let watched = null;
            let redrawn = () => {};
            if (viewer) {
                watchList(context).then((list) => {
                    watched = list;
                    redrawn();
                }, (error) => console.warn("[fuad] couldn't load the watch list:", error));
                window.addEventListener("fuad-watch", () => {
                    if (state.watching) {
                        whenPopupClosed(redrawn);
                    }
                });
            }
            drawPanel(mount, {
                what: "players", rows: 12,
                load: async () => {
                    const [{built, freeAgents, names}, {byes, points}, before, projected] = await Promise.all([
                        league(), extras(), beforeSeason(),
                        exp("projectedScores", {W: Number(window.liveScoringWeek) || 1}, {optional: true})
                    ]);
                    const projections = new Map(asArray(projected && projected.playerScore).map((entry) => [entry.id, Number(entry.score) || 0]));
                    return {pool: playerPool(built, {freeAgents, points, projections: before ? new Map() : projections, byes, names, offseason: before}), before};
                },
                render: ({pool, before}, body) => {
                    mount.classList.remove("fuad-panel");
                    state.sort = state.sort || (before ? "points" : "projected");
                    state.direction = state.direction || FIRST_DIRECTION[state.sort];
                    const layout = playerLayout({before, season});
                    body.innerHTML = playersFrame(layout, state.text);
                    const tbody = body.querySelector("tbody");
                    const chips = body.querySelector(".fuad-chips-block");
                    const none = body.querySelector(".fuad-none");
                    const redraw = () => {
                        chips.innerHTML = playerChips(state, {yearChips: layout.yearChips, viewer, watched});
                        const shown = sortPlayers(filterPlayers(pool, {...state, viewer, watched: state.watching ? watched : null}), state.sort, state.direction);
                        tbody.innerHTML = playerRows(shown, layout, {before, viewer});
                        none.hidden = shown.length > 0;
                        none.querySelector("button").hidden = !(state.positions.length || state.years.length || state.owners.length || state.watching);
                        body.querySelectorAll(".fuad-sort").forEach((button) => {
                            const on = button.dataset.sort === state.sort;
                            button.closest("th").setAttribute("aria-sort", on ? (state.direction > 0 ? "ascending" : "descending") : "none");
                            button.querySelector(".fuad-sort-mark").textContent = on ? (state.direction > 0 ? " ▲" : " ▼") : "";
                        });
                    };
                    body.querySelector("input").addEventListener("input", (event) => {
                        state.text = event.target.value;
                        redraw();
                    });
                    body.addEventListener("click", (event) => {
                        const chip = event.target.closest("[data-chip]");
                        if (chip && chip.dataset.chip === "watching") {
                            state.watching = !state.watching;
                            redraw();
                            body.querySelector('[data-chip="watching"]').focus();
                            return;
                        }
                        if (chip) {
                            const list = state[chip.dataset.chip];
                            const value = chip.dataset.value;
                            if (value === "All") {
                                list.length = 0;
                            } else if (list.includes(value)) {
                                list.splice(list.indexOf(value), 1);
                            } else {
                                list.push(value);
                            }
                            redraw();
                            body.querySelector(`[data-chip="${chip.dataset.chip}"][data-value="${CSS.escape(value)}"]`).focus();
                            return;
                        }
                        const sort = event.target.closest("[data-sort]");
                        if (sort) {
                            const key = sort.dataset.sort;
                            state.direction = key === state.sort ? -state.direction : FIRST_DIRECTION[key];
                            state.sort = key;
                            redraw();
                            body.querySelector(`[data-sort="${key}"]`).focus();
                            return;
                        }
                        if (event.target.closest("[data-show-all]")) {
                            state.positions.length = 0;
                            state.years.length = 0;
                            state.owners.length = 0;
                            state.watching = false;
                            redraw();
                        }
                    });
                    // a redraw from outside (the list arriving, a star changed) keeps focus on the chip or
                    // player it was on
                    redrawn = () => {
                        const active = document.activeElement;
                        const chip = active && active.dataset && active.dataset.chip ? `[data-chip="${active.dataset.chip}"][data-value="${CSS.escape(active.dataset.value || "")}"]` : null;
                        const player = active && active.dataset && active.dataset.player ? `[data-player="${CSS.escape(active.dataset.player)}"]` : null;
                        const had = (chip || player) && body.contains(active);
                        redraw();
                        // a player no longer on the list leaves focus on the Watching chip
                        const again = had && (body.querySelector(chip || player) || body.querySelector('[data-chip="watching"]'));
                        if (again) {
                            again.focus();
                        }
                    };
                    redraw();
                }
            });
        },
        draft: (mount) => {
            drawPanel(mount, {
                what: "the draft", rows: 10,
                load: async () => {
                    const [{built, names}, before, results, ordered] = await Promise.all([league(), beforeSeason(), exp("draftResults", {}, {optional: true}), order().catch(() => null)]);
                    const salaries = new Map(built.rosteredPlayers.map((player) => [player.playerId, player.salary]));
                    const board = draftBoard(results, {names, players: built.players, salaries});
                    let tags = null;
                    try {
                        tags = await franchiseView(season, built, dataBase);
                    } catch (error) {
                        console.warn("[fuad] couldn't load franchise salaries:", error);
                    }
                    return {board, before, tags, order: ordered};
                },
                render: ({board, before, tags, order: ordered}, body) => {
                    mount.classList.remove("fuad-panel");
                    // in season the rounds start closed on phones; desktop shows them all
                    const phone = window.matchMedia && window.matchMedia("(max-width: 48em)").matches;
                    body.innerHTML = draftMarkup({board, before, tags, order: ordered, viewer, season, phone});
                }
            });
        }
    };

    const drawn = new Map();
    let visible = null;
    const show = () => {
        const on = document.documentElement.classList.contains("fuad-rosters-on");
        const route = on ? routeOf(window.location.hash) : null;
        // redirected before anything shows, so the view left doesn't flash
        // logged out or the commissioner: no team of your own, so Teams
        if (route && route.view === "my-team" && !viewer) {
            window.location.replace("#rosters-teams");
            return;
        }
        // your own team, from any team link, is My team
        if (route && route.view === "teams" && viewer && route.team === viewer) {
            window.location.replace("#rosters-my-team");
            return;
        }
        const key = route ? `${route.view}/${route.team || ""}` : null;
        // the page's other classes change too (a dialog opening): only a change of view counts
        if (key === visible) {
            return;
        }
        visible = key;
        root.querySelectorAll(".fuad-rosters-view").forEach((mount) => {
            mount.hidden = !route || mount.dataset.view !== route.view;
        });
        if (!route) {
            return;
        }
        const mount = root.querySelector(`[data-view="${route.view}"]`);
        // a team's page and the list share Teams' mount: each change redraws it
        if (drawn.get(route.view) !== key) {
            drawn.set(route.view, key);
            try {
                views[route.view](mount, route);
            } catch (error) {
                console.error(`[fuad] couldn't draw Rosters' ${route.view}:`, error);
                drawn.delete(route.view);
            }
        }
        if (route.team) {
            window.scrollTo(0, 0);
        }
    };
    window.addEventListener("hashchange", show);
    new MutationObserver(show).observe(document.documentElement, {attributes: true, attributeFilter: ["class"]});
    show();
    return root;
}
