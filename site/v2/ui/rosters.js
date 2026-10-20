// Rosters, rebuilt on MFL's home page: My team, Teams (and each team's page under it), Players and
// Draft, each under its own # (`#rosters-teams/0004` for one team) and loaded the first time it shows.
// Names open the player popup with its Rosters actions (popup.js).

import {API_BASE, asArray, exportUrl, fetchExport, weekKickoff} from "../lib/mfl.js";
import {POSITIONS, SALARY_CAP, franchiseSalary, rookieSalary} from "../lib/rules.js";
import {esc} from "./html.js";
import {drawPanel} from "./panel.js";
import {cached, storage} from "./store.js";
import {pageFetch} from "./page-fetch.js";
import {REBUILT, sections, storedTabs} from "./nav.js";
import {franchiseView} from "./franchise-view.js";
import {allPlayRecords, playoffPicture, standings} from "./league-model.js";
import {
    FIRST_DIRECTION, SCALE_PICKS, byeWeeks, dollars, draftBoard, draftOrder, drafted, filterPlayers, pickNumbers, picksOf,
    playerPool, playoffFinish, pointsById, scaleRange, scaleText, sortPlayers, teamSheets, yearsText
} from "./rosters-model.js";

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

export const VIEWS = ["my-team", "teams", "players", "draft"];

// "#rosters-teams/0004" → {view: "teams", team: "0004"}
function routeOf(hash) {
    const match = String(hash).match(/^#rosters-([a-z-]+?)(?:\/(\d{4}))?$/);
    return match && VIEWS.includes(match[1]) ? {view: match[1], team: match[2] || null} : null;
}

const pts = (value) => (Number(value) || 0).toFixed(1);

// ---- Pieces shared by My team and a team's page ----

function capPanel(sheet) {
    return `<section class="fuad-panel fuad-cap" aria-label="Cap and roster">
        <div class="fuad-cap-figures">
            <div class="fuad-cap-figure">
                <span class="fuad-label">Cap used</span>
                <span class="fuad-cap-big"><span class="${sheet.tight ? "fuad-caution" : ""}">${esc(dollars(sheet.capUsed))}</span><span class="fuad-meta"> of $${SALARY_CAP}</span></span>
                <span class="fuad-meta">${esc(dollars(sheet.salaries))} salaries + ${esc(dollars(sheet.penaltyTotal))} penalties</span>
            </div>
            <div class="fuad-cap-figure">
                <span class="fuad-label">Active</span>
                <span class="fuad-cap-big">${sheet.active} / 30</span>
                <span class="fuad-meta">${sheet.ir ? `+ ${sheet.ir} on IR` : "None on IR"}</span>
            </div>
        </div>
        <div class="fuad-cap-seasons">
            <span class="fuad-label">Used by season</span>
            <ol class="fuad-season-boxes">${sheet.seasons.map((season) => `<li><span class="fuad-meta">’${String(season.season).slice(2)}</span><span class="${season.tight ? "fuad-caution" : ""}">${esc(dollars(season.used))}</span></li>`).join("")}</ol>
        </div>
    </section>`;
}

// the roster by position, then this season's penalties as its last group. `cut` adds the cut
// columns (the member's own team).
function rosterTable(sheet, {cut}) {
    const columns = cut ? 8 : 6;
    const player = (row) => `<tr>
        <th scope="row" class="fuad-team">
            <button type="button" class="fuad-name" data-player="${esc(row.id)}">${esc(row.name)}</button>${row.ir ? ' <span class="fuad-tag">IR</span>' : ""}
            <span class="fuad-meta fuad-phone-only">${esc(`${row.nfl || "FA"} · bye ${row.bye || "—"} · ${pts(row.points)} pts`)}</span>
        </th>
        <td class="fuad-num">${esc(dollars(row.salary))}</td>
        <td class="fuad-num fuad-muted">${row.years ? esc(yearsText(row.years)) : "—"}</td>
        ${cut ? `<td class="fuad-num fuad-wide">${row.cutPenalty ? esc(dollars(row.cutPenalty)) : "—"}</td><td class="fuad-num fuad-wide">${esc(dollars(row.capAfterCut))}</td>` : ""}
        <td class="fuad-wide">${esc(row.nfl || "FA")}</td><td class="fuad-num fuad-wide">${esc(row.bye || "—")}</td><td class="fuad-num fuad-wide">${esc(pts(row.points))}</td>
    </tr>`;
    const head = `<tr><th scope="col">Player</th><th scope="col" class="fuad-num">Salary</th><th scope="col" class="fuad-num">Years</th>
        ${cut ? '<th scope="col" class="fuad-num fuad-wide">Cut penalty</th><th scope="col" class="fuad-num fuad-wide">Cap used after cut</th>' : ""}
        <th scope="col" class="fuad-wide">NFL</th><th scope="col" class="fuad-num fuad-wide">Bye</th><th scope="col" class="fuad-num fuad-wide">Pts</th></tr>`;
    const penalties = sheet.penalties.length ? `<tbody>
        <tr class="fuad-group"><th scope="rowgroup">Penalties · ${sheet.penalties.length}</th><td class="fuad-num">${esc(dollars(sheet.penaltyTotal))}</td><td colspan="${columns - 2}"></td></tr>
        ${sheet.penalties.map((penalty) => `<tr>
            <th scope="row" class="fuad-team">${esc(penalty.who)}<span class="fuad-meta">${esc([penalty.when && `Cut ${penalty.when}`, penalty.terms].filter(Boolean).join(" · "))}</span></th>
            <td class="fuad-num">${esc(dollars(penalty.amount))}</td><td colspan="${columns - 2}"></td>
        </tr>`).join("")}
    </tbody>` : "";
    return `<section class="fuad-panel" aria-label="Roster">
        <div class="fuad-table-scroll"><table class="fuad-table fuad-roster">
            <thead>${head}</thead>
            ${sheet.groups.map((group) => `<tbody>
                <tr class="fuad-group"><th scope="rowgroup">${esc(group.position)} · ${group.players.length}</th><td class="fuad-num">${esc(dollars(group.salary))}</td><td colspan="${columns - 2}"></td></tr>
                ${group.players.map(player).join("")}
            </tbody>`).join("")}
            ${penalties}
        </table></div>
    </section>`;
}

function picksPanels(years, {nextYear, live}) {
    return `<div class="fuad-picks">${years.map((year) => `<section class="fuad-panel" aria-label="${year.year} draft picks">
        <h2 class="fuad-panel-heading">${year.year} draft picks</h2>
        ${year.year === nextYear && live ? '<p class="fuad-meta fuad-if">If the season ended today</p>' : ""}
        <ul class="fuad-rows fuad-pick-rows">${year.rows.map((row) => `<li class="${row.traded ? "fuad-muted" : ""}">
            <span>Round ${row.round}</span><span class="fuad-pick-number">${esc(row.number)}</span><span class="fuad-meta">${esc(row.note)}</span>
        </li>`).join("")}</ul>
    </section>`).join("")}</div>`;
}

// ---- Players ----

const POSITION_CHIPS = ["All", ...POSITIONS.map((position) => position.code)];
const OWNER_CHIPS = ["All", "Mine", "Other teams", "Free agents"];

function chipRow(label, names, chosen, key) {
    return `<div class="fuad-chip-row-group" role="group" aria-label="${esc(label)}">${names.map((name) => {
        const on = name === "All" ? !chosen.length : chosen.includes(name);
        return `<button type="button" class="fuad-filter" aria-pressed="${on}" data-chip="${esc(key)}" data-value="${esc(name)}">${esc(name)}</button>`;
    }).join("")}</div>`;
}

// ---- Draft ----

function tagsPanel(view, year) {
    const tags = POSITIONS.map((position) => ({position: position.code, top: view.topSalaries[position.code] || []}))
        .map((tag) => ({...tag, price: franchiseSalary(tag.top)}));
    return `<section class="fuad-panel" aria-labelledby="fuad-tags">
        <h2 class="fuad-panel-heading" id="fuad-tags">${year} franchise tags</h2>
        <div class="fuad-tags" role="group" aria-label="Tag prices">${tags.map((tag, i) => `<button type="button" class="fuad-tag-tile" aria-expanded="false" aria-controls="fuad-tag-${i}">
            <span class="fuad-label">${esc(tag.position)}</span><span class="fuad-tag-price">$${tag.price}</span>
        </button>`).join("")}</div>
        ${tags.map((tag, i) => `<ol class="fuad-tag-top" id="fuad-tag-${i}" hidden>${tag.top.map((player) => `<li><span>${esc(player.fullName)}</span><span class="fuad-meta">${esc(dollars(player.salary))}</span></li>`).join("")}</ol>`).join("")}
    </section>`;
}

function orderPanel(order, year, {final}) {
    return `<section class="fuad-panel" aria-labelledby="fuad-order">
        <h2 class="fuad-panel-heading" id="fuad-order">${year} draft order</h2>
        ${final ? "" : '<p class="fuad-meta fuad-if">If the season ended today</p>'}
        <ol class="fuad-rows fuad-order">${order.map((row) => `<li>
            <span class="fuad-seed">${row.pick || ""}</span>
            <span class="fuad-row-text"><span class="fuad-row-title">${esc(row.name)}</span><span class="fuad-meta">${esc(row.why)}</span>
                ${row.traded.map((line) => `<span class="fuad-caution fuad-traded">${esc(line)}</span>`).join("")}</span>
        </li>`).join("")}</ol>
    </section>`;
}

function boardPanel(board, {year, viewer, before, open}) {
    return `<section class="fuad-panel" aria-labelledby="fuad-board">
        <h2 class="fuad-panel-heading" id="fuad-board">${year} rookie draft</h2>
        <div class="fuad-rounds">${board.map((round) => `<div class="fuad-round">
            <button type="button" class="fuad-round-toggle" aria-expanded="${open(round.round)}" aria-controls="fuad-round-${round.round}"><span>Round ${round.round}</span><span class="fuad-meta" aria-hidden="true">${open(round.round) ? "Hide" : "Show"}</span></button>
            <ul class="fuad-rows fuad-board-picks" id="fuad-round-${round.round}"${open(round.round) ? "" : " hidden"}>${round.picks.map((pick) => `<li class="${pick.team === viewer ? "fuad-row-mine" : ""}">
                <span class="fuad-meta">${esc(pick.number)}</span>
                ${before
                    ? `<span class="fuad-row-text"><span class="fuad-row-title">${esc(pick.teamName)}</span>${pick.from ? `<span class="fuad-caution">from ${esc(pick.from)}</span>` : ""}</span><span class="fuad-meta">${esc(scaleRange(pick.overall))}</span>`
                    : `<span class="fuad-row-text"><span class="fuad-row-title">${pick.player ? `<button type="button" class="fuad-name" data-player="${esc(pick.player.id)}">${esc(pick.player.name)}</button> <span class="fuad-meta">${esc(pick.player.position)}</span>` : "—"}</span><span class="fuad-meta">${esc(pick.teamName)}</span></span><span class="fuad-num">${pick.salary === null ? "—" : esc(dollars(pick.salary))}</span>`}
            </li>`).join("")}</ul>
        </div>`).join("")}</div>
    </section>`;
}

function myPicksPanel(board, {viewer, year}) {
    const mine = board.flatMap((round) => round.picks).filter((pick) => pick.team === viewer);
    return `<section class="fuad-panel" aria-labelledby="fuad-my-picks">
        <h2 class="fuad-panel-heading" id="fuad-my-picks">Your ${year} picks</h2>
        ${mine.length ? `<ul class="fuad-rows fuad-my-picks">${mine.map((pick) => `<li><span class="fuad-pick-number">${esc(pick.number)}</span>
            <span class="fuad-row-text"><span>${esc(scaleText(pick.overall))}</span>${pick.from ? `<span class="fuad-caution">from ${esc(pick.from)}</span>` : ""}</span></li>`).join("")}</ul>`
            : '<p class="fuad-muted fuad-empty">No picks this year.</p>'}
    </section>`;
}

function scalePanel() {
    const rows = Array.from({length: SCALE_PICKS}, (_, i) => i + 1);
    return `<section class="fuad-panel fuad-scale" aria-labelledby="fuad-scale">
        <button type="button" class="fuad-scale-toggle fuad-phone-only" aria-expanded="false" aria-controls="fuad-scale-table">
            <span class="fuad-panel-heading" id="fuad-scale">Rookie scale</span><span class="fuad-meta fuad-scale-summary">Pick 1: ${esc(scaleText(1))}</span>
        </button>
        <h2 class="fuad-panel-heading fuad-desktop-only">Rookie scale</h2>
        <div class="fuad-table-scroll fuad-scale-table" id="fuad-scale-table" hidden><table class="fuad-table">
            <thead><tr><th scope="col">Pick</th>${POSITIONS.map((position) => `<th scope="col" class="fuad-num">${position.code}</th>`).join("")}</tr></thead>
            <tbody>${rows.map((pick) => `<tr><th scope="row">${pick}</th>${POSITIONS.map((position) => `<td class="fuad-num">$${rookieSalary(position.rookieBaseline, pick)}</td>`).join("")}</tr>`).join("")}</tbody>
        </table></div>
    </section>`;
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

    const exp = (type, params = {}, {base: from = host, optional = false} = {}) => {
        const leagueParams = from === host ? {L: context.leagueId, ...params} : params;
        const section = type === "weeklyResults" && params.W === "YTD" ? "allWeeklyResults" : type;
        const request = fetchExport(exportUrl(from, season, type, leagueParams), section, {fetchImpl: pageFetch, init: {cache: "no-store"}});
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
            exp("playerScores", {W: "YTD"}, {optional: true})
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
    const sheets = once(async () => {
        const [{built, salaryAdjustments, names}, {futureDraftPicks, byes, points}] = await Promise.all([league(), extras()]);
        return teamSheets(built, {salaryAdjustments, futureDraftPicks, byes, points, season, names});
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
    // `fromTeams`: opened from Teams, with the way back and Propose a trade
    const teamPage = (mount, teamId, {fromTeams}) => {
        drawPanel(mount, {
            what: teamId === viewer ? "your team" : "this team", key: `fuad.rosters.team.${season}.${teamId}`, maxAge: 2 * MINUTE, rows: 10,
            load: async () => {
                const [all, {futureDraftPicks}, {names}, before] = await Promise.all([sheets(), extras(), league(), beforeSeason()]);
                const sheet = all.find((entry) => entry.id === teamId);
                if (!sheet) {
                    throw new Error(`no team ${teamId}`);
                }
                return {sheet, picks: picksOf(teamId, futureDraftPicks, {names, nextYear: season + 1}), live: !before};
            },
            render: ({sheet, picks, live}, body) => {
                const own = teamId === viewer;
                mount.classList.remove("fuad-panel");
                body.innerHTML = `
                ${fromTeams ? `<div class="fuad-team-head">
                    <a class="fuad-back" href="#rosters-teams">‹ Teams</a>
                    <h2 class="fuad-team-name">${esc(sheet.name)}</h2>
                    ${viewer && !own ? `<a class="fuad-cta" href="${esc(actions.trade(teamId))}">Propose a trade</a>` : ""}
                </div>` : ""}
                ${capPanel(sheet)}
                ${rosterTable(sheet, {cut: own})}
                <div class="fuad-picks-mount">${picksPanels(picks, {nextYear: season + 1, live})}</div>`;
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
                load: async () => (await sheets()).map((sheet) => ({id: sheet.id, name: sheet.name, capUsed: sheet.capUsed, tight: sheet.tight, picksLine: sheet.picksLine, active: sheet.active, ir: sheet.ir, seasons: sheet.seasons})),
                render: (list, body) => {
                    mount.classList.remove("fuad-panel");
                    const later = list[0] ? list[0].seasons.slice(1) : [];
                    body.innerHTML = `<section class="fuad-panel" aria-label="Teams by cap used">
                        <ul class="fuad-rows fuad-team-list fuad-phone-only">${list.map((team) => `<li class="${team.id === viewer ? "fuad-row-mine" : ""}">
                            <a class="fuad-team-row" href="#rosters-teams/${esc(team.id)}">
                                <span class="fuad-team-line"><span class="fuad-row-title">${esc(team.name)}</span><span class="fuad-figure ${team.tight ? "fuad-caution" : ""}">${esc(dollars(team.capUsed))}</span></span>
                                <span class="fuad-power-bar" aria-hidden="true"><span class="${team.id === viewer ? "fuad-bar-mine" : ""}" style="width: ${Math.min(100, Math.round(team.capUsed / SALARY_CAP * 100))}%"></span></span>
                                <span class="fuad-meta">${season + 1} picks ${esc(team.picksLine)} · ${team.active} / 30${team.ir ? ` + ${team.ir} IR` : ""}</span>
                            </a></li>`).join("")}</ul>
                        <div class="fuad-table-scroll fuad-desktop-only"><table class="fuad-table fuad-teams">
                            <thead><tr><th scope="col">Team</th><th scope="col">Cap used</th><th scope="col" class="fuad-num">${season + 1} picks</th>
                                ${later.map((entry) => `<th scope="col" class="fuad-num">’${String(entry.season).slice(2)}</th>`).join("")}<th scope="col" class="fuad-num">Roster</th><th scope="col"><span class="fuad-hidden">Open</span></th></tr></thead>
                            <tbody>${list.map((team) => `<tr class="fuad-row-link${team.id === viewer ? " fuad-row-mine" : ""}" data-href="#rosters-teams/${esc(team.id)}">
                                <th scope="row" class="fuad-team"><a href="#rosters-teams/${esc(team.id)}">${esc(team.name)}</a></th>
                                <td><span class="fuad-power-cell"><span class="fuad-power-bar" aria-hidden="true"><span class="${team.id === viewer ? "fuad-bar-mine" : ""}" style="width: ${Math.min(100, Math.round(team.capUsed / SALARY_CAP * 100))}%"></span></span><span class="${team.tight ? "fuad-caution" : ""}">${esc(dollars(team.capUsed))}</span></span></td>
                                <td class="fuad-num">${esc(team.picksLine)}</td>
                                ${team.seasons.slice(1).map((entry) => `<td class="fuad-num ${entry.tight ? "fuad-caution" : "fuad-muted"}">${esc(dollars(entry.used))}</td>`).join("")}
                                <td class="fuad-num">${team.active} / 30${team.ir ? ` + ${team.ir}` : ""}</td>
                                <td class="fuad-chevron" aria-hidden="true">›</td>
                            </tr>`).join("")}</tbody>
                        </table></div>
                    </section>`;
                }
            });
        },
        players: (mount) => {
            const state = {positions: [], years: [], owners: [], text: "", sort: null, direction: null};
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
                    const yearChips = before ? ["All", "FA", "1", "2", "3", "4", "5"] : ["All", "1", "2", "3", "4", "5"];
                    // on phones two numbers: projection and points in season; points and salary before
                    const phoneKeys = before ? ["points", "salary"] : ["projected", "points"];
                    const columns = [["name", "Player"], ["position", "Pos", false], ["nfl", "NFL", false], ["bye", "Bye"], ...(before ? [] : [["projected", "Proj"]]), ["points", before ? `${season - 1} pts` : "Pts"], ["salary", "Salary"], ["years", "Years"], ["owner", "Team", false]];
                    body.innerHTML = `
                    <section class="fuad-panel fuad-players">
                        <label class="fuad-find"><span class="fuad-hidden">Find a player</span><input type="search" placeholder="Find a player" autocomplete="off" value="${esc(state.text)}"></label>
                        <div class="fuad-chips-block"></div>
                        <div class="fuad-table-scroll fuad-players-scroll"><table class="fuad-table fuad-player-table">
                            <thead><tr>${columns.map(([key, label, sortable = true]) => {
                                const phone = key === "name" || phoneKeys.includes(key) ? "" : " fuad-wide";
                                const numeric = ["bye", "projected", "points", "salary", "years"].includes(key) ? " fuad-num" : "";
                                return `<th scope="col" class="fuad-col-${key}${phone}${numeric}">${sortable ? `<button type="button" class="fuad-sort" data-sort="${key}">${esc(label)}<span class="fuad-sort-mark" aria-hidden="true"></span></button>` : esc(label)}</th>`;
                            }).join("")}</tr></thead>
                            <tbody></tbody>
                        </table></div>
                        <p class="fuad-muted fuad-empty fuad-none" hidden>No players match. <button type="button" class="fuad-quiet-link" data-show-all>Show all</button></p>
                    </section>`;
                    const tbody = body.querySelector("tbody");
                    const chips = body.querySelector(".fuad-chips-block");
                    const none = body.querySelector(".fuad-none");
                    const cell = (player, key) => {
                        const phone = key === "name" || phoneKeys.includes(key) ? "" : " fuad-wide";
                        switch (key) {
                            case "name": {
                                const contract = player.fa ? "Free agent" : player.rfa ? "RFA" : `${before ? "" : `${dollars(player.salary)} · `}${yearsText(player.years)}`;
                                return `<th scope="row" class="fuad-team"><button type="button" class="fuad-name" data-player="${esc(player.id)}">${esc(player.name)}</button>
                                    <span class="fuad-meta fuad-phone-only">${esc([player.position, player.nfl, contract, player.fa ? "" : player.ownerName].filter(Boolean).join(" · "))}</span></th>`;
                            }
                            case "position": return `<td class="${phone}">${esc(player.position)}</td>`;
                            case "nfl": return `<td class="${phone}">${esc(player.nfl)}</td>`;
                            case "bye": return `<td class="fuad-num${phone}">${esc(player.bye || "—")}</td>`;
                            case "projected": return `<td class="fuad-num${phone}">${player.projected === null ? "—" : esc(player.projected.toFixed(1))}</td>`;
                            case "points": return `<td class="fuad-num${phone}">${esc(pts(player.points))}</td>`;
                            case "salary": return `<td class="fuad-num${phone}">${player.salary === null ? "—" : esc(dollars(player.salary))}</td>`;
                            case "years": return `<td class="fuad-num fuad-muted${phone}">${player.fa ? (before ? "UFA" : "—") : player.rfa ? "RFA" : esc(yearsText(player.years))}</td>`;
                            default: return `<td class="fuad-muted${phone}">${esc(player.ownerName)}</td>`;
                        }
                    };
                    const redraw = () => {
                        chips.innerHTML = chipRow("Position", POSITION_CHIPS, state.positions, "positions")
                            + chipRow("Years left", yearChips, state.years, "years")
                            + (viewer ? chipRow("Owner", OWNER_CHIPS, state.owners, "owners") : chipRow("Owner", OWNER_CHIPS.filter((name) => name !== "Mine"), state.owners, "owners"));
                        const shown = sortPlayers(filterPlayers(pool, {...state, viewer}), state.sort, state.direction);
                        tbody.innerHTML = shown.map((player) => `<tr class="${player.owner && player.owner === viewer ? "fuad-row-mine" : ""}">${columns.map(([key]) => cell(player, key)).join("")}</tr>`).join("");
                        none.hidden = shown.length > 0;
                        none.querySelector("button").hidden = !(state.positions.length || state.years.length || state.owners.length);
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
                            redraw();
                        }
                    });
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
                    const done = drafted(board);
                    // the site's own draft: before it, the board; after, the results
                    const tagYear = tags && tags.phase === "previous" ? season : season + 1;
                    const parts = [];
                    if (tags && !(before && done)) {
                        parts.push(tagsPanel(tags, tagYear));
                    }
                    if (before && !done) {
                        if (viewer) {
                            parts.push(myPicksPanel(board, {viewer, year: season}));
                        }
                        parts.push(boardPanel(board, {year: season, viewer, before: true, open: () => true}));
                    } else {
                        if (!before && ordered) {
                            parts.push(orderPanel(ordered.rows, season + 1, {final: ordered.final}));
                        }
                        // in season the rounds start closed on phones; desktop shows them all
                        const phone = window.matchMedia && window.matchMedia("(max-width: 48em)").matches;
                        parts.push(boardPanel(board, {year: season, viewer, before: false, open: (round) => !before ? !phone : round === 1}));
                    }
                    parts.push(scalePanel());
                    body.innerHTML = parts.join("");
                }
            });
        }
    };

    const drawn = new Map();
    let visible = null;
    const show = () => {
        const on = document.documentElement.classList.contains("fuad-rosters-on");
        const route = on ? routeOf(window.location.hash) : null;
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
        // logged out or the commissioner: no team of your own, so Teams
        if (route.view === "my-team" && !viewer) {
            window.location.replace("#rosters-teams");
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
