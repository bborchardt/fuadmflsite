// League, rebuilt on MFL's home page: Scores, Standings, Power and Winners, each under its own #
// (`#league-standings`) and loaded the first time it shows. Before week 1 the new site has no games,
// so Standings, Power and Winners show last season's final, which MFL keeps on the previous site.

import {API_BASE, asArray, exportUrl, fetchExport, weekKickoff} from "../lib/mfl.js";
import {esc} from "./html.js";
import {drawPanel, placeholders} from "./panel.js";
import {cached} from "./store.js";
import {pageFetch} from "./page-fetch.js";
import {clock, dayText} from "./home-model.js";
import {gameStates, readProjections, readRules, readStats} from "./live-scoring.js";
import {
    POSITION_ORDER, allPlayRecords, gameText, money, pairLines, playoffPicture, playoffPlaces, positionPoints, powerFacts,
    readPowerPage, recordText, scoreCards, standings, teamSeason, weekState, winnings, winningsLine
} from "./league-model.js";

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;
// MFL's live scoring page reads its stats feed this often
const LIVE_POLL = 40 * 1000;
// who starts can change until each game kicks off
const LINEUP_POLL = 5 * MINUTE;

export const VIEWS = ["scores", "standings", "power", "winners"];

const viewOf = (hash) => VIEWS.find((view) => hash === `#league-${view}`) || null;

// "R. Stevenson" on phones, the full name on desktop
const shortName = (name) => {
    const parts = String(name).split(" ");
    return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(" ")}` : name;
};
const pts = (value) => (value === null || value === undefined ? "—" : value.toFixed(1));
const kickoffText = (seconds) => `${dayText(seconds).split(" ")[0]} ${clock(seconds)}`;
const weekday = (seconds) => dayText(seconds).split(" ")[0];
const two = (week) => String(week).padStart(2, "0");

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

// ---- Scores ----

function teamHead(team, {names, viewer, leader, side, started, preview}) {
    const tone = leader === null || leader === side ? "" : " fuad-trailing";
    const projection = team.projected !== null ? `proj ${team.projected.toFixed(1)}` : team.done && team.started ? "Final" : "";
    return `<span class="fuad-face fuad-face-${side ? "right" : "left"}${tone}">
        <span class="fuad-face-name${team.id === viewer ? " fuad-face-mine" : ""}">${esc(names.get(team.id) || team.id)}</span>
        <span class="fuad-face-score">${started ? esc(team.score.toFixed(1)) : preview ? "" : "—"}</span>
        <span class="fuad-meta">${esc(projection)}</span>
    </span>`;
}

function chips(team, side) {
    return `<span class="fuad-chips fuad-chips-${side ? "right" : "left"}"><span class="fuad-chip-stat"><b class="${team.playing ? "fuad-live" : ""}">${team.playing}</b> playing</span><span class="fuad-chip-stat"><b>${team.toPlay}</b> to play</span><span class="fuad-chip-stat"><b>${team.minutes}</b> min</span></span>`;
}

function winBar(teams) {
    const [left, right] = teams.map((team) => team.chance);
    const tone = (value) => (value >= 50 ? "fuad-ahead" : "");
    return `<span class="fuad-winbar" role="img" aria-label="${esc(`Win chance ${left}% to ${right}%`)}">
        <span class="fuad-winbar-labels"><span class="${tone(left)}">${left}%</span><span class="fuad-label">to win</span><span class="${tone(right)}">${right}%</span></span>
        <span class="fuad-winbar-track" aria-hidden="true"><span class="${tone(left)}" style="flex: ${left} 1 0"></span><span class="${tone(right)}" style="flex: ${right} 1 0"></span></span>
    </span>`;
}

// a player in the lineups: the name opens the popup (on phones the whole line, since nothing else
// in it takes a tap). Side b's points come first, so the two sides' points meet in the middle.
function lineCells(line, side, {bench = false} = {}) {
    if (!line) {
        return `<span class="fuad-ln-empty"></span><span class="fuad-ln-empty"></span>`;
    }
    const state = line.ir ? "IR" : gameText(line.game, kickoffText);
    const live = line.game.state === "playing" ? " fuad-live" : "";
    const projected = !bench && typeof line.projected === "number" && line.game.state !== "over" ? line.projected.toFixed(1) : "";
    const player = `<button type="button" class="fuad-ln fuad-ln-${side}" data-player="${esc(line.id)}">
            <span class="fuad-ln-pos">${esc(line.position)}</span>
            <span class="fuad-ln-name"><span class="fuad-short">${esc(shortName(line.name))}</span><span class="fuad-full">${esc(line.name)}</span></span>
            <span class="fuad-ln-meta fuad-ln-desk${live}">${esc([state, line.line].filter(Boolean).join(" · "))}</span>
            <span class="fuad-ln-meta fuad-ln-phone${live}">${esc([line.position, state, line.line].filter(Boolean).join(" · "))}</span>
        </button>`;
    const points = `<span class="fuad-ln-pts fuad-ln-pts-${side}">${esc(pts(line.points))}<span class="fuad-ln-proj">${esc(projected)}</span></span>`;
    return side === "a" ? player + points : points + player;
}

function lineupGrid(pairs, options) {
    return `<div class="fuad-lineup">${pairs.map(([a, b]) => `${lineCells(a, "a", options)}${lineCells(b, "b", options)}`).join("")}</div>`;
}

function cardMarkup(card, i, {names, viewer, open, benchOpen, preview}) {
    const [a, b] = card.teams;
    // once either side has a game going, both show points
    const started = card.teams.some((team) => team.started);
    const leader = started && b && a.score !== b.score ? (a.score > b.score ? 0 : 1) : null;
    const live = card.teams.some((team) => team.playing);
    const showBar = a.chance !== null && b;
    const head = b
        ? `<span class="fuad-faces">${teamHead(a, {names, viewer, leader, side: 0, started, preview})}${teamHead(b, {names, viewer, leader, side: 1, started, preview})}</span>
           ${showBar ? `<span class="fuad-card-middle">${winBar(card.teams)}</span>` : ""}
           ${live ? `<span class="fuad-chip-row">${chips(a, 0)}${chips(b, 1)}</span>` : ""}`
        : `<span class="fuad-faces">${teamHead(a, {names, viewer, leader, side: 0, started, preview})}</span>`;
    const body = open && b ? `
        <div class="fuad-card-body">
            ${lineupGrid(pairLines(a.starters, b.starters))}
            <button type="button" class="fuad-bench-toggle" aria-expanded="${benchOpen}" data-bench>${benchOpen ? "Hide bench" : "Show bench"}</button>
            ${benchOpen ? `<div class="fuad-bench">${lineupGrid(pairLines(a.bench, b.bench), {bench: true})}</div>` : ""}
        </div>` : "";
    return `<article class="fuad-card${card.mine ? " fuad-card-mine" : ""}${open ? " fuad-card-open" : ""}" data-card="${i}">
        <button type="button" class="fuad-card-head" aria-expanded="${open}" aria-label="${esc(`${names.get(a.id) || a.id}${b ? ` versus ${names.get(b.id) || b.id}` : ""}`)}">${head}</button>
        ${body}
    </article>`;
}

function seasonMarkup({lastRegular, rows, names, current, live, title, line}) {
    const tone = (result) => (/^Live/.test(result) ? "fuad-live" : /^W/.test(result) ? "fuad-good" : /^L/.test(result) ? "fuad-bad-text" : "fuad-muted");
    return `<section class="fuad-panel" aria-label="Your season">
        <div class="fuad-panel-head"><h2 class="fuad-panel-heading">${esc(title)}</h2><span class="fuad-meta">${esc(line)}</span></div>
        <ul class="fuad-rows">${rows.map((row) => {
            const result = row.week === current && live ? live : row.result || (row.week === current ? "This week" : "");
            return `<li class="fuad-season-row${row.week === current ? " fuad-row-mine" : ""}"><span class="fuad-meta">W${row.week}</span><span>${esc(names.get(row.opponent) || "")}</span><span class="${tone(result)}">${esc(result)}</span></li>`;
        }).join("")}
            <li class="fuad-season-row fuad-season-end"><span class="fuad-meta"></span><span class="fuad-muted">Weeks ${lastRegular + 1}–${Number(window.endWeek) || 17}</span><span class="fuad-muted">Playoffs</span></li>
        </ul>
    </section>`;
}

function drawScores(mount, data) {
    const {context, viewer, exp, feed, before, names: namesFor} = data;
    const currentWeek = before ? 1 : Number(window.liveScoringWeek) || 1;
    const state = {week: currentWeek, season: false, open: null, bench: false};
    let timer = null;
    // who starts, per week, and when MFL was last asked
    const lineups = new Map();
    mount.innerHTML = `
        <div class="fuad-scores-bar">
            <div class="fuad-weekpicker">
                <button type="button" class="fuad-step" data-step="-1" aria-label="Previous week">‹</button>
                <div class="fuad-week-label" aria-live="polite"><span class="fuad-week-name"></span><span class="fuad-week-state fuad-label"></span></div>
                <button type="button" class="fuad-step" data-step="1" aria-label="Next week">›</button>
            </div>
            <div class="fuad-season-title" hidden><span class="fuad-week-name"></span><span class="fuad-label"></span></div>
            ${viewer && !before ? '<button type="button" class="fuad-toggle" aria-pressed="false" data-season>Season</button>' : ""}
        </div>
        <div class="fuad-scores-body"></div>`;
    const body = mount.querySelector(".fuad-scores-body");
    const picker = mount.querySelector(".fuad-weekpicker");
    const lastWeek = () => Math.max(currentWeek, data.lastScheduled || currentWeek);

    // what a week shows: its cards, from the lineups and the stats feed
    const loadWeek = async (week, {fresh = false} = {}) => {
        const [names, players, rules] = await Promise.all([namesFor(), data.players(), data.rules()]);
        const nflSchedule = await exp("nflSchedule", {W: week}, {base: API_BASE, optional: true});
        if (before || week > currentWeek) {
            const schedule = await data.schedule();
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
        let lineup = lineups.get(week);
        if (!lineup || Date.now() - lineup.at > LINEUP_POLL) {
            // the page's own copy first (Home asks for the same), MFL again once it's old
            // DETAILS lists the bench too; without it only the starters
            lineup = {at: Date.now(), scoring: await exp("liveScoring", {W: week, DETAILS: 1}, {fresh: Boolean(lineup)})};
            lineups.set(week, lineup);
        }
        // a week MFL hasn't started a feed for yet reads as no stats, as MFL's page treats it
        const stats = readStats(await feed(`live_stats_${two(week)}.txt`).catch((error) => {
            if (error.status === 404) {
                return "";
            }
            throw error;
        }));
        const games = gameStates(nflSchedule, stats);
        const anyLeft = !stats.updated || asArray(nflSchedule && nflSchedule.matchup).some((game) => games.of(asArray(game.team)[0] && asArray(game.team)[0].id).state !== "over");
        const [projections, rosters] = await Promise.all([
            week === currentWeek && anyLeft ? data.projections(week).catch(() => null) : null,
            week === currentWeek ? exp("rosters", {}, {optional: true}) : null
        ]);
        const ir = new Map(asArray(rosters && rosters.franchise).map((team) => [team.id, asArray(team.player).filter((player) => player.status === "INJURED_RESERVE").map((player) => player.id)]));
        const cards = scoreCards({live: lineup.scoring, players, stats, games, rules, projections, week, viewer, irOf: (id) => ir.get(id) || []});
        return {cards, names, games, state: weekState(cards, games, weekday)};
    };

    const draw = (shown) => {
        const {cards, names} = shown;
        const openIndex = state.open === null ? cards.findIndex((card) => card.mine && !shown.preview) : state.open;
        body.innerHTML = cards.length
            ? `<div class="fuad-cards">${cards.map((card, i) => cardMarkup(card, i, {names, viewer, open: i === openIndex && !shown.preview, benchOpen: state.bench, preview: Boolean(shown.preview)})).join("")}</div>`
            : '<p class="fuad-muted fuad-empty">No games this week.</p>';
        body.querySelectorAll(".fuad-card-head").forEach((button) => button.addEventListener("click", () => {
            const index = Number(button.closest(".fuad-card").dataset.card);
            state.open = index === openIndex ? -1 : index;
            draw(shown);
            const again = body.querySelector(`[data-card="${index}"] .fuad-card-head`);
            if (again) {
                again.focus();
            }
        }));
        const bench = body.querySelector("[data-bench]");
        if (bench) {
            bench.addEventListener("click", () => {
                state.bench = !state.bench;
                draw(shown);
                body.querySelector("[data-bench]").focus();
            });
        }
        body.querySelectorAll("[data-player]").forEach((button) => button.addEventListener("click", () => {
            if (typeof window.launch_player_modal === "function") {
                window.launch_player_modal(context.leagueId, button.dataset.player);
            }
        }));
    };

    const label = (shown) => {
        mount.querySelector(".fuad-weekpicker .fuad-week-name").textContent = `Week ${state.week}`;
        const stateLine = mount.querySelector(".fuad-weekpicker .fuad-week-state");
        stateLine.textContent = shown ? shown.state.text : "";
        stateLine.classList.toggle("fuad-live", Boolean(shown && shown.state.live));
        picker.querySelector('[data-step="-1"]').disabled = state.week <= 1;
        picker.querySelector('[data-step="1"]').disabled = state.week >= lastWeek();
    };

    const showing = () => document.documentElement.classList.contains("fuad-league-on") && viewOf(window.location.hash) === "scores" && !state.season;

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
            body.innerHTML = '<div class="fuad-panel"><div class="fuad-failed" role="alert"><span>Couldn’t load scores.</span><button type="button" class="fuad-quiet">Retry</button></div></div>';
            body.querySelector("button").addEventListener("click", showWeek);
        });
    };

    const showSeason = async () => {
        clearTimeout(timer);
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
                inner.innerHTML = seasonMarkup({lastRegular: data.lastRegular, rows: value.rows, names: new Map(value.names), current: currentWeek, live: value.live, title: `${context.season} season`, line: value.line});
            }
        });
    };

    picker.addEventListener("click", (event) => {
        const step = event.target.closest("[data-step]");
        if (!step || step.disabled) {
            return;
        }
        state.week = Math.min(lastWeek(), Math.max(1, state.week + Number(step.dataset.step)));
        state.open = null;
        showWeek();
    });
    const seasonButton = mount.querySelector("[data-season]");
    if (seasonButton) {
        seasonButton.addEventListener("click", () => {
            state.season = !state.season;
            seasonButton.setAttribute("aria-pressed", String(state.season));
            picker.hidden = state.season;
            if (state.season) {
                showSeason();
            } else {
                showWeek();
            }
        });
    }
    showWeek();
    return {
        // back on Scores: refresh at once if it's been waiting
        resume: () => {
            if (!state.season && state.week === currentWeek && !timer) {
                showWeek();
            }
        }
    };
}

const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;

// ---- Standings ----

function standingsMarkup(divisions, {viewer, final}) {
    const head = `<tr><th scope="col" class="fuad-num"><span class="fuad-hidden">Rank</span></th><th scope="col">Team</th><th scope="col" class="fuad-num">W-L-T</th>
        <th scope="col" class="fuad-num fuad-wide">Pct</th><th scope="col" class="fuad-num">GB</th><th scope="col" class="fuad-num fuad-wide">Div</th>
        <th scope="col" class="fuad-num fuad-wide">All-play</th><th scope="col" class="fuad-num">PF</th><th scope="col" class="fuad-num fuad-wide">Avg PF</th>
        <th scope="col" class="fuad-num fuad-wide">PA</th><th scope="col" class="fuad-num fuad-wide">Avg PA</th><th scope="col" class="fuad-num">Strk</th></tr>`;
    const streak = (text) => (/^W/.test(text) ? "fuad-good" : /^L/.test(text) ? "fuad-bad-text" : "fuad-muted");
    return divisions.map((division) => `
        <section class="fuad-panel">
            <h2 class="fuad-panel-heading">${esc(division.name)}${final ? ` · ${esc(final)} final` : ""}</h2>
            <div class="fuad-table-scroll"><table class="fuad-table fuad-standings">
                <thead>${head}</thead>
                <tbody>${division.rows.map((row) => `<tr${row.id === viewer ? ' class="fuad-row-mine"' : ""}>
                    <td class="fuad-num fuad-muted">${row.rank}</td><th scope="row" class="fuad-team">${esc(row.name)}</th>
                    <td class="fuad-num">${esc(`${row.h2h.w}-${row.h2h.l}-${row.h2h.t}`)}</td><td class="fuad-num fuad-wide">${esc(row.pct)}</td>
                    <td class="fuad-num fuad-muted">${esc(row.gamesBack)}</td><td class="fuad-num fuad-wide">${esc(row.divisionRecord)}</td>
                    <td class="fuad-num fuad-wide">${esc(recordText(row.allPlay))}</td><td class="fuad-num">${esc(row.pf.toFixed(1))}</td>
                    <td class="fuad-num fuad-wide">${esc(row.avgPf.toFixed(1))}</td><td class="fuad-num fuad-wide">${esc(row.pa.toFixed(1))}</td>
                    <td class="fuad-num fuad-wide">${esc(row.avgPa.toFixed(1))}</td><td class="fuad-num ${streak(row.streak)}">${esc(row.streak)}</td>
                </tr>`).join("")}</tbody>
            </table></div>
        </section>`).join("");
}

function pictureMarkup({seeds, hunt}, {viewer, title, showHunt}) {
    const lastSeed = seeds.length;
    return `<section class="fuad-panel" aria-labelledby="fuad-playoff-picture">
        <h2 class="fuad-panel-heading" id="fuad-playoff-picture">${esc(title)}</h2>
        <div class="fuad-picture">
            <div>
                <h3 class="fuad-label fuad-subhead">Seeds</h3>
                <ol class="fuad-rows fuad-seeds">${seeds.map((seed) => `<li${seed.team.id === viewer ? ' class="fuad-row-mine"' : ""}>
                    <span class="fuad-seed">${seed.seed}</span>
                    <span class="fuad-row-text"><span class="fuad-seed-name"><span class="fuad-row-title">${esc(seed.team.name)}</span>${seed.bye ? '<span class="fuad-tag fuad-tag-lime">Bye</span>' : ""}</span></span>
                    <span class="fuad-meta fuad-seed-why">${esc(seed.why)}</span>
                </li>`).join("")}</ol>
            </div>
            ${showHunt && hunt.length ? `<div>
                <h3 class="fuad-label fuad-subhead">In the hunt · all-play games back of seed ${lastSeed}</h3>
                <ul class="fuad-rows fuad-hunt">${hunt.map((entry) => `<li${entry.team.id === viewer ? ' class="fuad-row-mine"' : ""}>
                    <span class="fuad-row-title">${esc(entry.team.name)}</span><span class="fuad-meta">${esc(entry.record)} all-play</span><span class="fuad-hunt-back">${esc(entry.back)}</span>
                </li>`).join("")}</ul>
            </div>` : ""}
        </div>
    </section>`;
}

// ---- Power ----

function powerMarkup(teams, {viewer, final}) {
    const top = Math.max(...teams.map((team) => team.power), 1);
    const bar = (team) => `<span class="fuad-power-bar" aria-hidden="true"><span class="${team.id === viewer ? "fuad-bar-mine" : ""}" style="width: ${Math.round(team.power / top * 100)}%"></span></span>`;
    const heading = `<h2 class="fuad-panel-heading">Power rankings${final ? ` · ${esc(final)} final` : ""}</h2>`;
    const phone = `<ol class="fuad-rows fuad-power-list fuad-phone-only">${teams.map((team, i) => `<li${team.id === viewer ? ' class="fuad-row-mine"' : ""}>
        <button type="button" class="fuad-power-row" aria-expanded="false" aria-controls="fuad-power-${i}">
            <span class="fuad-power-rank">${i + 1}</span>
            <span class="fuad-row-text"><span class="fuad-row-title">${esc(team.name)}</span><span class="fuad-meta">${esc(team.allPlay)} all-play</span>${bar(team)}</span>
            <span class="fuad-power-score">${esc(team.power.toFixed(2))}</span>
        </button>
        <dl class="fuad-facts" id="fuad-power-${i}" hidden>${powerFacts(team).map(([name, value]) => `<div><dt>${esc(name)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>
    </li>`).join("")}</ol>`;
    const columns = ["PF", "PP", "Eff", "Bench", "High", "Low", "All-play", "Coulda won", "Woulda lost", "Alt rank"];
    const desktop = `<div class="fuad-table-scroll fuad-desktop-only"><table class="fuad-table fuad-power">
        <thead><tr><th scope="col" class="fuad-num"><span class="fuad-hidden">Rank</span></th><th scope="col">Team</th><th scope="col">Power</th>${columns.map((name) => `<th scope="col" class="fuad-num">${name}</th>`).join("")}</tr></thead>
        <tbody>${teams.map((team, i) => `<tr${team.id === viewer ? ' class="fuad-row-mine"' : ""}>
            <td class="fuad-num fuad-muted">${i + 1}</td><th scope="row" class="fuad-team">${esc(team.name)}</th>
            <td><span class="fuad-power-cell">${bar(team)}<span class="fuad-power-score">${esc(team.power.toFixed(2))}</span></span></td>
            ${[team.pf, team.possible, team.efficiency, team.bench, team.high, team.low, team.allPlay, team.couldaWon, team.wouldaLost, team.alternate].map((value) => `<td class="fuad-num">${esc(value)}</td>`).join("")}
        </tr>`).join("")}</tbody>
    </table></div>`;
    return `<section class="fuad-panel">${heading}${phone}${desktop}</section>`;
}

function positionsMarkup(rows, {viewer}) {
    const top = Math.max(...rows.map((row) => row.total), 1);
    const legend = `<span class="fuad-legend">${POSITION_ORDER.map((position) => `<span><span class="fuad-swatch fuad-pos-${position.toLowerCase()}" aria-hidden="true"></span>${position}</span>`).join("")}</span>`;
    return `<section class="fuad-panel fuad-positions">
        <div class="fuad-panel-head">
            <h2 class="fuad-panel-heading">Starter points by position</h2>
            <button type="button" class="fuad-collapse fuad-phone-only" aria-expanded="true" aria-controls="fuad-positions-body">Hide</button>
        </div>
        <div id="fuad-positions-body">
            ${legend}
            <ul class="fuad-position-rows">${rows.map((row) => `<li>
                <span class="fuad-position-name${row.id === viewer ? " fuad-strong" : ""}">${esc(row.name)}</span>
                <span class="fuad-position-total">${row.total}</span>
                <span class="fuad-stack" style="width: ${Math.round(row.total / top * 100)}%" aria-hidden="true">${row.parts.map((part) => `<span class="fuad-pos-${part.position.toLowerCase()}" style="flex: ${part.points} 1 0">${part.points}</span>`).join("")}</span>
                <span class="fuad-position-values">${row.parts.map((part) => `${part.position} ${part.points}`).join(" · ")}</span>
            </li>`).join("")}</ul>
        </div>
    </section>`;
}

// ---- Winners ----

function winnersMarkup(result, {viewer, final}) {
    const today = final ? "" : '<p class="fuad-meta fuad-if">If the season ended today</p>';
    const named = result.prizes.some((prize) => prize.team);
    const phone = `<ul class="fuad-rows fuad-phone-only">${result.rows.map((row) => `<li class="fuad-won${row.id === viewer ? " fuad-row-mine" : ""}">
        <span class="fuad-row-text"><span class="fuad-row-title">${esc(row.name)}</span><span class="fuad-meta">${esc(winningsLine(row))}</span></span>
        <span class="fuad-won-total${row.total > 0 ? "" : " fuad-muted"}">${esc(money(row.total))}</span>
    </li>`).join("")}</ul>`;
    const desktop = `<div class="fuad-table-scroll fuad-desktop-only"><table class="fuad-table fuad-winners">
        <thead><tr><th scope="col">Team</th><th scope="col" class="fuad-num">Weeks won</th><th scope="col" class="fuad-num">Weekly</th><th scope="col" class="fuad-num">All-play</th>
            <th scope="col" class="fuad-num">All-play $</th>${named ? '<th scope="col" class="fuad-num">Playoffs</th>' : ""}<th scope="col" class="fuad-num">Total</th></tr></thead>
        <tbody>${result.rows.map((row) => `<tr${row.id === viewer ? ' class="fuad-row-mine"' : ""}>
            <th scope="row" class="fuad-team">${esc(row.name)}</th>
            <td class="fuad-num">${esc(row.weeks.join(", ") || "—")}</td><td class="fuad-num">${row.weekly ? esc(money(row.weekly)) : "—"}</td>
            <td class="fuad-num">${esc(row.record)}</td><td class="fuad-num">${row.allPlay ? esc(money(row.allPlay)) : "—"}</td>
            ${named ? `<td class="fuad-num">${row.prize ? esc(`${row.prize.place} ${money(row.prize.amount)}`) : "—"}</td>` : ""}
            <td class="fuad-num fuad-strong${row.total > 0 ? "" : " fuad-muted"}">${esc(money(row.total))}</td>
        </tr>`).join("")}</tbody>
    </table></div>`;
    const names = new Map(result.rows.map((row) => [row.id, row.name]));
    const prizes = `<div class="fuad-prizes">${result.prizes.map((prize) => `<div class="fuad-prize">
        <span class="fuad-prize-place${prize.place === "1st" ? " fuad-mine" : ""}">${esc(prize.place)} · ${Math.round(prize.share * 100)}%</span>
        <span class="fuad-prize-amount">${esc(money(prize.amount))}</span>
        ${prize.team ? `<span class="fuad-prize-team">${esc(names.get(prize.team) || "")}</span>` : ""}
    </div>`).join("")}</div>`;
    const pot = `<dl class="fuad-pot">
        <div class="fuad-pot-line"><dt>Pot</dt><dd>${esc(money(result.pot))}</dd></div>
        ${result.potEntries.map((entry) => `<div class="fuad-pot-entry"><dt>${esc(entry.description)}</dt><dd>${esc(money(entry.amount))}</dd></div>`).join("")}
        <div class="fuad-pot-line"><dt>Weekly points · ${result.weeklyTotal / 15} × $15</dt><dd>${esc(money(-result.weeklyTotal))}</dd></div>
        <div class="fuad-pot-line"><dt>All-play${final ? "" : " so far"}</dt><dd>${esc(money(-result.allPlayPaid))}</dd></div>
        <div class="fuad-pot-line fuad-pot-total"><dt>For the playoffs</dt><dd>${esc(money(result.forPlayoffs))}</dd></div>
    </dl>`;
    return `<section class="fuad-panel" aria-labelledby="fuad-won">
            <h2 class="fuad-panel-heading" id="fuad-won">${final ? `${esc(final)} payouts` : "Won so far"}</h2>${today}
            ${phone}${desktop}
        </section>
        <section class="fuad-panel" aria-labelledby="fuad-prizes">
            <h2 class="fuad-panel-heading" id="fuad-prizes">${final ? `${esc(final)} playoff prizes` : "Playoff prizes"}</h2>${today}
            <div class="fuad-prize-columns">${prizes}${pot}</div>
        </section>`;
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

export function drawLeague({context, franchiseId}) {
    const viewer = franchiseId && franchiseId !== "0000" ? franchiseId : null;
    const host = window.location.origin;
    const season = context.season;

    // one request per export per page (page-fetch.js); `fresh` asks MFL again
    const exp = (type, params = {}, {base = host, optional = false, fresh = false, year = season} = {}) => {
        const leagueParams = base === host ? {L: context.leagueId, ...params} : params;
        // the year to date comes back as `allWeeklyResults`
        const section = type === "weeklyResults" && params.W === "YTD" ? "allWeeklyResults" : type;
        const request = fetchExport(exportUrl(base, year, type, leagueParams), section, {fetchImpl: fresh ? fetch : pageFetch, init: {cache: "no-store"}});
        return optional ? request.catch((error) => {
            console.warn(`[fuad] couldn't load ${type}:`, error);
            return null;
        }) : request;
    };
    // MFL's live feeds (stats, projections), read as its live scoring page reads them
    const feed = async (name) => {
        const response = await fetch(`${host}/fflnetdynamic${season}/${name}?RANDOM=${Date.now()}`, {cache: "no-store"});
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
    const beforeSeason = once(async () => {
        if (Number(window.completedWeek) > 0 || Number(window.liveScoringWeek) > 1) {
            return false;
        }
        try {
            const kickoff = await cached(`fuad.kickoff.${season}.1`, DAY, async () => {
                const date = await weekKickoff(season, 1, {fetchImpl: pageFetch});
                return date ? date.getTime() / 1000 : null;
            });
            return !kickoff || Date.now() / 1000 < kickoff;
        } catch (error) {
            return false;
        }
    });
    const players = once(async () => playersMap(await cached(`fuad.players.${season}`, DAY, async () => ({player: (await fetchExport(exportUrl(API_BASE, season, "players"), "players")).player}))));
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
                context, viewer, exp, feed, before, lastScheduled, lastRegular: Number(window.standingsEndWeek) || 14,
                names: () => namesFor(), players, rules, projections, schedule, league: () => leagueOf(season)
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
                    body.innerHTML = standingsMarkup(value.divisions, {viewer, final});
                }
            });
            drawPanel(mount.lastElementChild, {
                what: "the playoff picture", key: `fuad.league.picture.${year}`, maxAge: 2 * MINUTE, rows: 6, load: shared,
                render: (value, body) => {
                    mount.lastElementChild.classList.remove("fuad-panel");
                    const title = final ? `${final} playoff seeds` : value.inPlayoffs ? "Playoff seeds" : "Playoff picture";
                    body.innerHTML = pictureMarkup(value.picture, {viewer, title, showHunt: !value.inPlayoffs});
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
                        throw new Error(`HTTP ${response.status}`);
                    }
                    const teams = readPowerPage(await response.text());
                    if (!teams) {
                        throw new Error("MFL's Power Rank page has changed");
                    }
                    return teams;
                },
                render: (teams, body) => {
                    mount.firstElementChild.classList.remove("fuad-panel");
                    body.innerHTML = powerMarkup(teams, {viewer, final});
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
                    body.innerHTML = positionsMarkup(rows, {viewer});
                }
            });
        },
        winners: async (mount) => {
            const year = await shownSeason();
            const final = year !== season ? String(year) : "";
            drawPanel(mount, {
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
                    mount.classList.remove("fuad-panel");
                    body.innerHTML = winnersMarkup(result, {viewer, final});
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
                mount.innerHTML = '<div class="fuad-panel"><div class="fuad-failed" role="alert"><span>Couldn’t load this page.</span><button type="button" class="fuad-quiet">Retry</button></div></div>';
                mount.querySelector("button").addEventListener("click", () => {
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
