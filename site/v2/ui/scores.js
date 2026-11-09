// League › Scores: each game's card for a week, live while games are on (MFL's stats feed every
// 40 s), the lineups opening under a card; Best puts each side's best lineup in place of its own,
// and Season the member's own results in place of the week.

import {API_BASE, asArray} from "../lib/mfl.js";
import {armRetry, drawPanel, failedMarkup, placeholders} from "./panel.js";
import {dayText} from "./home-model.js";
import {gameStates, readStats} from "./live-scoring.js";
import {bestCard, scoreCards, standings, starterLimits, teamSeason, weekState} from "./league-model.js";
import {cardsMarkup, scoresFrame, seasonMarkup} from "./league-view.js";
import {ordinal} from "./format.js";
import {allAtOnce} from "./page-fetch.js";
import {backupMarks, backupReader} from "./scores-backups.js";
import {keepHere, keptHere, onSectionTap} from "./kept.js";
import settings from "../lib/settings.js";

const MINUTE = 60 * 1000;
// MFL's live scoring page reads its stats feed this often
const LIVE_POLL = 40 * 1000;
// who starts can change until each game kicks off
const LINEUP_POLL = 5 * MINUTE;
// Scores' cards in two columns (fuad.css)
const TWO_COLUMNS = "(min-width: 57.01em)";

const weekday = (seconds) => dayText(seconds).split(" ")[0];
export const two = (week) => String(week).padStart(2, "0");

// `data`: what league.js loads for the section (exports, feeds, names, the season's facts); `showing()`
// whether Scores is the view on screen
export function drawScores(mount, data) {
    const {context, viewer, exp, feed, before, names: namesFor} = data;
    const currentWeek = before ? 1 : Number(window.liveScoringWeek) || 1;
    // `best`: each side's best lineup in place of its own (kept across weeks; off in Season)
    const state = {week: currentWeek, season: false, best: false, open: null, bench: new Set()};
    let timer = null;
    // who starts, per week, and when MFL was last asked
    const lineups = new Map();
    const twoColumns = window.matchMedia(TWO_COLUMNS);
    mount.innerHTML = scoresFrame({before, viewer});
    const body = mount.querySelector(".fuad-scores-body");
    const picker = mount.querySelector(".fuad-weekpicker");
    // Safari keeps a lineup's rows at their old heights when the width changes (a phone turned and
    // back), so they're laid out afresh
    let width = window.innerWidth;
    window.addEventListener("resize", () => {
        if (window.innerWidth === width) {
            return;
        }
        width = window.innerWidth;
        mount.querySelectorAll(".fuad-lineup").forEach((grid) => {
            grid.style.display = "none";
            grid.getBoundingClientRect();
            grid.style.display = "";
        });
    });
    const bestButton = mount.querySelector("[data-best]");
    // Best once the week's first game has kicked off, whoever plays in it
    const canBest = (shown) => Boolean(shown && !shown.preview && shown.limits && shown.limits.count
        && shown.cards.some((card) => card.teams.some((team) => team.starters.concat(team.bench).some((line) => ["playing", "over"].includes(line.game.state)))));
    let lastShown = null;
    // each open card's backup pairs (scores-backups.js): by `week|team`, the last read's, and when one
    // failed, so it's asked again only after a while
    const pairsOf = settings.backupStarters ? backupReader(context) : null;
    const pairs = new Map();
    const failed = new Map();
    const lastWeek = () => Math.max(currentWeek, data.lastScheduled || currentWeek);

    // who starts in a week: the page's own copy first (Home asks for the same), MFL again once it's
    // old or `fresh` (Refresh). DETAILS lists the bench too; without it only the starters
    const lineupOf = async (week, fresh = false) => {
        let lineup = lineups.get(week);
        if (fresh || !lineup || Date.now() - lineup.at > LINEUP_POLL) {
            lineup = {at: Date.now(), scoring: await exp("liveScoring", {W: week, DETAILS: 1}, {fresh: fresh || Boolean(lineup)})};
            lineups.set(week, lineup);
        }
        return lineup;
    };
    // a week MFL hasn't started a feed for yet reads as no stats, as MFL's page treats it
    const statsOf = (week) => feed(`live_stats_${two(week)}.txt`).then(readStats, (error) => {
        if (error.status === 404) {
            return readStats("");
        }
        throw error;
    });

    // what a week shows: its cards, from the lineups and the stats feed. Everything is asked at once,
    // as one after another kept Scores on placeholders; the projections too, though a week whose
    // games are over doesn't use them
    const loadWeek = async (week, {fresh = false} = {}) => {
        const preview = before || week > currentWeek;
        const [names, players, rules, limits, nflSchedule, lineup, stats, rosters, schedule, projected] = await allAtOnce([
            namesFor(), data.players(), data.rules(), data.league().then(starterLimits, () => null),
            exp("nflSchedule", {W: week}, {base: API_BASE, optional: true}),
            preview ? null : lineupOf(week, fresh),
            preview ? null : statsOf(week),
            !preview && week === currentWeek ? exp("rosters", {}, {optional: true}) : null,
            preview ? data.schedule() : null,
            !preview && week === currentWeek ? data.projections(week).catch(() => null) : null
        ]);
        if (preview) {
            const games = gameStates(nflSchedule, {players: new Map(), teams: new Map(), updated: 0});
            const matchups = asArray((asArray(schedule && schedule.weeklySchedule).find((entry) => Number(entry.week) === week) || {}).matchup);
            const cards = matchups.map((matchup) => ({
                mine: asArray(matchup.franchise).some((team) => team.id === viewer),
                teams: asArray(matchup.franchise).slice().sort((x, y) => Number(x.isHome) - Number(y.isHome)).map((team) => ({
                    id: team.id, score: 0, started: false, done: false, projected: null, chance: null, playing: 0, toPlay: 0, minutes: 0, starters: [], bench: []
                }))
            })).sort((x, y) => Number(y.mine) - Number(x.mine));
            const first = asArray(nflSchedule && nflSchedule.matchup).map((game) => Number(game.kickoff)).filter(Boolean);
            return {cards, names, state: {text: first.length ? dayText(Math.min(...first)) : "", live: false}, games, preview: true};
        }
        const games = gameStates(nflSchedule, stats);
        const anyLeft = !stats.updated || asArray(nflSchedule && nflSchedule.matchup).some((game) => games.of(asArray(game.team)[0] && asArray(game.team)[0].id).state !== "over");
        const projections = anyLeft ? projected : null;
        const ir = new Map(asArray(rosters && rosters.franchise).map((team) => [team.id, asArray(team.player).filter((player) => player.status === "INJURED_RESERVE").map((player) => player.id)]));
        const cards = scoreCards({live: lineup.scoring, players, stats, games, rules, projections, week, viewer, irOf: (id) => ir.get(id) || [], order: limits && Object.keys(limits.limits).length ? Object.keys(limits.limits) : undefined});
        return {cards, names, games, limits, state: weekState(cards, games, weekday)};
    };

    // a team's lines with its backups' marks, once read; asked for when not, the cards drawn again
    // once a read changes them
    const withBackups = (team, week) => {
        const key = `${week}|${team.id}`;
        if (!(Date.now() - (failed.get(key) || 0) < LINEUP_POLL)) {
            pairsOf(week, team.id, team.starters.concat(team.bench)).then((found) => {
                failed.delete(key);
                if (JSON.stringify(found) !== JSON.stringify(pairs.get(key))) {
                    pairs.set(key, found);
                    if (lastShown && state.week === week && !state.season) {
                        draw(lastShown);
                    }
                }
            }, (error) => {
                failed.set(key, Date.now());
                console.warn("[fuad] couldn't read the backups:", error);
            });
        }
        const marks = backupMarks(team, pairs.get(key) || []);
        const mark = (line) => (marks.has(line.id) ? {...line, ...marks.get(line.id)} : line);
        return marks.size ? {...team, starters: team.starters.map(mark), bench: team.bench.map(mark)} : team;
    };

    // what the cards' clicks act on: the week drawn and the cards open in it
    let drawn = null;
    const draw = (shown) => {
        lastShown = shown;
        const best = state.best && canBest(shown);
        const open = state.open || new Set(shown.preview ? [] : shown.cards.flatMap((card, i) => (card.mine ? [i] : [])));
        const cards = best ? shown.cards.map((card) => bestCard(card, shown.limits))
            : pairsOf && !shown.preview ? shown.cards.map((card, i) => (open.has(i) ? {...card, teams: card.teams.map((team) => withBackups(team, state.week))} : card))
                : shown.cards;
        drawn = {shown, open};
        body.innerHTML = cardsMarkup(cards, {names: shown.names, viewer, open, bench: state.bench, preview: Boolean(shown.preview), best});
    };

    // a card's head opens it, its button its bench; a player opens MFL's player page
    const onCard = {
        ".fuad-card-head": (index) => {
            const {shown, open} = drawn;
            // with two columns one game opens at a time and moves to the top; in one the others stay
            // open and an opened one stays put, so nothing above a tapped game moves
            if (twoColumns.matches) {
                state.open = new Set(open.has(index) ? [] : [index]);
            } else {
                state.open = new Set(open);
                state.open[open.has(index) ? "delete" : "add"](index);
            }
            draw(shown);
        },
        "[data-bench]": (index) => {
            state.bench[state.bench.has(index) ? "delete" : "add"](index);
            draw(drawn.shown);
        }
    };
    body.addEventListener("click", (event) => {
        const player = event.target.closest("[data-player]");
        if (player && body.contains(player)) {
            // MFL's own popup, should v2's frame (which installs v2's) not have drawn
            if (typeof window.fuadOpenPlayer === "function") {
                window.fuadOpenPlayer(player.dataset.player, {opener: player});
            } else if (typeof window.launch_player_modal === "function") {
                window.launch_player_modal(context.leagueId, player.dataset.player);
            }
            return;
        }
        for (const [selector, act] of Object.entries(onCard)) {
            const button = event.target.closest(selector);
            if (button && body.contains(button) && drawn) {
                const index = Number(button.closest(".fuad-card").dataset.card);
                act(index);
                // the button drawn again in its place keeps the focus
                const again = body.querySelector(`[data-card="${index}"] ${selector}`);
                if (again) {
                    again.focus();
                }
                return;
            }
        }
    });

    // Refresh only on the current week: a past week is final, and a later one is a preview with no lineups
    const showRefresh = () => {
        const refresh = mount.querySelector("[data-refresh]");
        if (refresh) {
            refresh.hidden = state.season || state.week !== currentWeek;
        }
    };

    const label = (shown) => {
        mount.querySelector(".fuad-weekpicker .fuad-week-name").textContent = `Week ${state.week}`;
        const stateLine = mount.querySelector(".fuad-weekpicker .fuad-week-state");
        stateLine.textContent = shown ? shown.state.text : "";
        stateLine.classList.toggle("fuad-live", Boolean(shown && shown.state.live));
        picker.querySelector('[data-step="-1"]').disabled = state.week <= 1;
        if (bestButton) {
            bestButton.disabled = !canBest(shown);
            bestButton.setAttribute("aria-pressed", String(state.best && canBest(shown)));
        }
        picker.querySelector('[data-step="1"]').disabled = state.week >= lastWeek();
        showRefresh();
    };

    const showing = () => data.showing() && !state.season;

    // while games are on, the feed again every 40 s; before the next kickoff, a wake-up for it
    const schedule = (shown) => {
        clearTimeout(timer);
        timer = null;
        if (!shown || shown.preview || state.week !== currentWeek) {
            return;
        }
        const next = shown.cards.flatMap((card) => card.teams.flatMap((team) => team.starters.concat(team.bench)))
            .filter((line) => line.game.state === "scheduled" && line.game.kickoff).map((line) => line.game.kickoff * 1000);
        const wait = shown.games.any ? LIVE_POLL : next.length ? Math.max(LIVE_POLL, Math.min(...next) - Date.now()) : null;
        if (wait !== null && wait < 12 * 60 * MINUTE) {
            timer = setTimeout(() => {
                if (!showing() || document.hidden) {
                    schedule(shown);
                    return;
                }
                loadWeek(state.week).then((fresh) => {
                    if (state.week === currentWeek && !state.season) {
                        label(fresh);
                        draw(fresh);
                    }
                    schedule(fresh);
                }, (error) => {
                    console.warn("[fuad] couldn't refresh scores:", error);
                    schedule(shown);
                });
            }, wait);
        }
    };

    // the panel pattern (ui/panel.js) for a week: placeholders, then the cards, or Retry
    const showWeek = () => {
        clearTimeout(timer);
        timer = null;
        label(null);
        const week = state.week;
        body.setAttribute("aria-busy", "true");
        body.innerHTML = `<div class="fuad-panel">${placeholders(6)}</div>`;
        loadWeek(week).then((shown) => {
            if (week !== state.week || state.season) {
                return;
            }
            body.removeAttribute("aria-busy");
            label(shown);
            draw(shown);
            schedule(shown);
        }, (error) => {
            console.warn("[fuad] couldn't load scores:", error);
            if (week !== state.week || state.season) {
                return;
            }
            body.removeAttribute("aria-busy");
            body.innerHTML = `<div class="fuad-panel">${failedMarkup("scores", error)}</div>`;
            armRetry(body.querySelector("button"), error, showWeek);
        });
    };

    const showSeason = async () => {
        clearTimeout(timer);
        // a week still loading is dropped, and its placeholders with it; the season's panel says its own
        body.removeAttribute("aria-busy");
        const panelMount = document.createElement("div");
        body.replaceChildren(panelMount);
        drawPanel(panelMount, {
            what: "your season",
            rows: 8,
            load: async () => {
                const [schedule, names, standing] = await Promise.all([data.schedule(), namesFor(), exp("leagueStandings", {}, {optional: true})]);
                let liveResult = "";
                try {
                    const shown = await loadWeek(currentWeek);
                    const card = shown.cards.find((entry) => entry.mine);
                    if (card && card.teams.every((team) => team.started) && shown.games.any) {
                        const [mine, other] = card.teams[0].id === viewer ? card.teams : [card.teams[1], card.teams[0]];
                        liveResult = `Live ${mine.score.toFixed(1)}–${other.score.toFixed(1)}`;
                    }
                } catch (error) {
                    // the season's results don't need this week's
                }
                const settings = await data.league();
                const rows = standings(standing, settings, names).flatMap((division) => division.rows.map((row) => ({...row, divisionName: division.name})));
                const me = rows.find((row) => row.id === viewer);
                return {
                    rows: teamSeason(schedule, viewer).filter((row) => row.week <= data.lastRegular),
                    names: [...names],
                    live: liveResult,
                    line: me ? `${me.h2h.w}-${me.h2h.l}-${me.h2h.t} · ${me.divisionName} ${ordinal(me.rank)}` : ""
                };
            },
            render: (value, inner) => {
                panelMount.classList.remove("fuad-panel");
                inner.innerHTML = seasonMarkup({lastRegular: data.lastRegular, endWeek: Number(window.endWeek) || 17, rows: value.rows, names: new Map(value.names), current: currentWeek, live: value.live, title: `${context.season} season`, line: value.line, teamHref: data.teamHref});
            }
        });
    };

    picker.addEventListener("click", (event) => {
        const step = event.target.closest("[data-step]");
        if (!step || step.disabled) {
            return;
        }
        state.week = Math.min(lastWeek(), Math.max(1, state.week + Number(step.dataset.step)));
        keep();
        state.open = null;
        state.bench = new Set();
        showWeek();
    });
    if (bestButton) {
        bestButton.addEventListener("click", () => {
            state.best = !state.best;
            bestButton.setAttribute("aria-pressed", String(state.best));
            keep();
            if (lastShown) {
                draw(lastShown);
            }
        });
    }
    // Refresh, in the iPhone's app (no pull to refresh there): the week again from MFL, its cards staying
    // up meanwhile; with none drawn (still loading, or Retry), the week afresh
    const refreshButton = mount.querySelector("[data-refresh]");
    if (refreshButton) {
        refreshButton.addEventListener("click", () => {
            if (refreshButton.hidden || refreshButton.getAttribute("aria-busy") === "true") {
                return;
            }
            if (body.getAttribute("aria-busy") === "true" || !body.querySelector(".fuad-cards, .fuad-empty")) {
                showWeek();
                return;
            }
            const week = state.week;
            clearTimeout(timer);
            timer = null;
            refreshButton.setAttribute("aria-busy", "true");
            loadWeek(week, {fresh: true}).then((shown) => {
                if (week === state.week && !state.season) {
                    label(shown);
                    draw(shown);
                    schedule(shown);
                }
            }, (error) => {
                console.warn("[fuad] couldn't refresh scores:", error);
                if (week === state.week && !state.season) {
                    schedule(lastShown);
                }
            }).finally(() => refreshButton.removeAttribute("aria-busy"));
        });
    }

    const seasonButton = mount.querySelector("[data-season]");
    if (seasonButton) {
        seasonButton.addEventListener("click", () => {
            state.season = !state.season;
            // Season leaves Best off
            state.best = false;
            showBar();
            keep();
            if (state.season) {
                showSeason();
            } else {
                showWeek();
            }
        });
    }
    // the bar as the state has it: the rest of it goes with the week picker in Season
    const showBar = () => {
        if (seasonButton) {
            seasonButton.setAttribute("aria-pressed", String(state.season));
        }
        picker.hidden = state.season;
        showRefresh();
        if (bestButton) {
            bestButton.hidden = state.season;
            bestButton.setAttribute("aria-pressed", String(state.best));
        }
    };

    // the week, Season and Best, as each way here expects (ui/kept.js): League's link starts afresh, the
    // tab finds them as they were, and Back as they were left
    const KEPT = "scores";
    const keep = () => keepHere(KEPT, {week: state.week, season: state.season, best: state.best});
    const fromKept = (kept) => (kept && Number.isInteger(kept.week) && kept.week >= 1 && kept.week <= lastWeek()
        ? {week: kept.week, season: Boolean(kept.season && seasonButton), best: Boolean(kept.best && !kept.season)}
        : null);
    const same = (view) => view.week === state.week && view.season === state.season && view.best === state.best;
    const setView = (view) => {
        if (view.week !== state.week) {
            state.open = null;
            state.bench = new Set();
        }
        Object.assign(state, view);
        showBar();
        if (state.season) {
            showSeason();
        } else {
            showWeek();
        }
    };
    // drawn as it shows next (resume), unless it's on screen
    let stale = false;
    onSectionTap("League", () => {
        const fresh = {week: currentWeek, season: false, best: false};
        if (!data.showing()) {
            stale = stale || !same(fresh);
            if (fresh.week !== state.week) {
                state.open = null;
                state.bench = new Set();
            }
            Object.assign(state, fresh);
            return;
        }
        // tapped on Scores itself, which stays in this entry
        if (!same(fresh)) {
            setView(fresh);
        }
        keep();
    });

    const start = fromKept(keptHere(KEPT));
    if (start) {
        setView(start);
    } else {
        showWeek();
    }
    return {
        // back on Scores from another view: as its entry has it (Back), or as it was (a tab, or League's
        // link, which started it afresh); refreshed at once if it's been waiting
        resume: () => {
            const kept = fromKept(keptHere(KEPT));
            if (kept && (stale || !same(kept))) {
                stale = false;
                setView(kept);
                return;
            }
            keep();
            if (stale) {
                stale = false;
                setView(state);
            } else if (!state.season && state.week === currentWeek && !timer) {
                showWeek();
            }
        }
    };
}
