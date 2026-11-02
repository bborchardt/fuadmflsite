// What League draws, as HTML: Scores' cards and Season, Standings and the playoff picture, Power,
// Winners and Champions, from what league.js and scores.js load (league-model.js's shapes).

import {esc} from "./html.js";
import {clock, dayText} from "./home-model.js";
import {WEEKLY_PRIZE, gameText, ledger, pairLines, powerFacts, recordText, winningsLine} from "./league-model.js";
import {withIcon} from "./team-pictures.js";

// "R. Stevenson" on phones, the full name on desktop
const shortName = (name) => {
    const parts = String(name).split(" ");
    return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(" ")}` : name;
};
const pts = (value) => (value === null || value === undefined ? "—" : value.toFixed(1));
const kickoffText = (seconds) => `${dayText(seconds).split(" ")[0]} ${clock(seconds)}`;

// ---- Scores ----

function teamHead(team, {names, viewer, leader, side, started, preview}) {
    const tone = leader === null || leader === side ? "" : " fuad-trailing";
    const projection = team.actual !== undefined ? `actual ${team.actual.toFixed(1)}`
        : team.projected !== null ? `proj ${team.projected.toFixed(1)}` : team.done && team.started ? "Final" : "";
    return `<span class="fuad-face fuad-face-${side ? "right" : "left"}${tone}">
        <span class="fuad-face-name${team.id === viewer ? " fuad-face-mine" : ""}">${withIcon(team.id, esc(names.get(team.id) || team.id), {after: Boolean(side)})}</span>
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
    // no projections in Best's lineups (`tag` set)
    const projected = !bench && line.tag === undefined && typeof line.projected === "number" && line.game.state !== "over" ? line.projected.toFixed(1) : "";
    // Best's marks: "in" off the bench, "started" left out
    const tag = line.tag ? ` <span class="fuad-ln-tag fuad-ln-tag-${esc(line.tag)}">${esc(line.tag)}</span>` : "";
    const player = `<button type="button" class="fuad-ln fuad-ln-${side}" data-player="${esc(line.id)}">
            <span class="fuad-ln-pos">${esc(line.position)}</span>
            <span class="fuad-ln-name"><span class="fuad-short">${esc(shortName(line.name))}</span><span class="fuad-full">${esc(line.name)}</span></span>
            <span class="fuad-ln-meta fuad-ln-desk${live}">${esc([state, line.line].filter(Boolean).join(" · "))}${tag}</span>
            <span class="fuad-ln-meta fuad-ln-phone${live}">${esc([line.position, state, line.line].filter(Boolean).join(" · "))}${tag}</span>
        </button>`;
    const points = `<span class="fuad-ln-pts fuad-ln-pts-${side}">${esc(pts(line.points))}<span class="fuad-ln-proj">${esc(projected)}</span></span>`;
    return side === "a" ? player + points : points + player;
}

function lineupGrid(pairs, options) {
    return `<div class="fuad-lineup">${pairs.map(([a, b]) => `${lineCells(a, "a", options)}${lineCells(b, "b", options)}`).join("")}</div>`;
}

function cardMarkup(card, i, {names, viewer, open, benchOpen, preview, best = false}) {
    const [a, b] = card.teams;
    // once either side has a game going, both show points
    const started = card.teams.some((team) => team.started);
    const leader = started && b && a.score !== b.score ? (a.score > b.score ? 0 : 1) : null;
    const live = !best && card.teams.some((team) => team.playing);
    const showBar = !best && a.chance !== null && b;
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

export function seasonMarkup({lastRegular, endWeek, rows, names, current, live, title, line, teamHref}) {
    const tone = (result) => (/^Live/.test(result) ? "fuad-live" : /^W/.test(result) ? "fuad-good" : /^L/.test(result) ? "fuad-bad-text" : "fuad-muted");
    return `<section class="fuad-panel" aria-label="Your season">
        <div class="fuad-panel-head"><h2 class="fuad-panel-heading">${esc(title)}</h2><span class="fuad-meta">${esc(line)}</span></div>
        <ul class="fuad-rows">${rows.map((row) => {
            const result = row.week === current && live ? live : row.result || (row.week === current ? "This week" : "");
            return `<li class="fuad-season-row${row.week === current ? " fuad-row-mine" : ""}"><span class="fuad-meta">W${row.week}</span><span>${row.opponent ? `<a href="${esc(teamHref(row.opponent))}">${esc(names.get(row.opponent) || "")}</a>` : ""}</span><span class="${tone(result)}">${esc(result)}</span></li>`;
        }).join("")}
            <li class="fuad-season-row fuad-season-end"><span class="fuad-meta"></span><span class="fuad-muted">Weeks ${lastRegular + 1}–${endWeek}</span><span class="fuad-muted">Playoffs</span></li>
        </ul>
    </section>`;
}

// Scores' bar: Season (for a member) and Best, the week picker, and Season's title in its place;
// none of the toggles before week 1
export function scoresFrame({before, viewer}) {
    return `
<div class="fuad-scores-bar${before ? "" : " fuad-scores-toggles"}">
    ${before ? "" : `<div class="fuad-bar-toggles">
        ${viewer ? '<button type="button" class="fuad-toggle" aria-pressed="false" data-season>Season</button>' : ""}
        <button type="button" class="fuad-toggle" aria-pressed="false" data-best disabled>Best</button>
    </div>`}
    <div class="fuad-weekpicker">
        <button type="button" class="fuad-step" data-step="-1" aria-label="Previous week">‹</button>
        <div class="fuad-week-label" aria-live="polite"><span class="fuad-week-name"></span><span class="fuad-week-state fuad-label"></span></div>
        <button type="button" class="fuad-step" data-step="1" aria-label="Next week">›</button>
    </div>
    <div class="fuad-season-title" hidden><span class="fuad-week-name"></span><span class="fuad-label"></span></div>
</div>
<div class="fuad-scores-body"></div>`;
}

// a week's cards; `open` the cards shown open, `bench` those with their bench shown
export function cardsMarkup(cards, {names, viewer, open, bench, preview, best}) {
    return cards.length
        ? `<div class="fuad-cards">${cards.map((card, i) => cardMarkup(card, i, {names, viewer, open: open.has(i) && !preview, benchOpen: bench.has(i), preview, best})).join("")}</div>`
        : '<p class="fuad-muted fuad-empty">No games this week.</p>';
}

// ---- Standings ----

export function standingsMarkup(divisions, {viewer, final, teamHref}) {
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
                    <td class="fuad-num fuad-muted">${row.rank}</td><th scope="row" class="fuad-team">${withIcon(row.id, `<a href="${esc(teamHref(row.id))}">${esc(row.name)}</a>`)}</th>
                    <td class="fuad-num">${esc(`${row.h2h.w}-${row.h2h.l}-${row.h2h.t}`)}</td><td class="fuad-num fuad-wide">${esc(row.pct)}</td>
                    <td class="fuad-num fuad-muted">${esc(row.gamesBack)}</td><td class="fuad-num fuad-wide">${esc(row.divisionRecord)}</td>
                    <td class="fuad-num fuad-wide">${esc(recordText(row.allPlay))}</td><td class="fuad-num">${esc(row.pf.toFixed(1))}</td>
                    <td class="fuad-num fuad-wide">${esc(row.avgPf.toFixed(1))}</td><td class="fuad-num fuad-wide">${esc(row.pa.toFixed(1))}</td>
                    <td class="fuad-num fuad-wide">${esc(row.avgPa.toFixed(1))}</td><td class="fuad-num ${streak(row.streak)}">${esc(row.streak)}</td>
                </tr>`).join("")}</tbody>
            </table></div>
        </section>`).join("");
}

export function pictureMarkup({seeds, hunt}, {viewer, title, showHunt, teamHref}) {
    const lastSeed = seeds.length;
    return `<section class="fuad-panel" aria-labelledby="fuad-playoff-picture">
        <h2 class="fuad-panel-heading" id="fuad-playoff-picture">${esc(title)}</h2>
        <div class="fuad-picture">
            <div>
                <h3 class="fuad-label fuad-subhead">Seeds</h3>
                <ol class="fuad-rows fuad-seeds">${seeds.map((seed) => `<li${seed.team.id === viewer ? ' class="fuad-row-mine"' : ""}>
                    <span class="fuad-seed">${seed.seed}</span>
                    <span class="fuad-row-text"><span class="fuad-seed-name"><span class="fuad-row-title"><a href="${esc(teamHref(seed.team.id))}">${esc(seed.team.name)}</a></span>${seed.bye ? '<span class="fuad-tag fuad-tag-accent">Bye</span>' : ""}</span></span>
                    <span class="fuad-meta fuad-seed-why">${esc(seed.why)}</span>
                </li>`).join("")}</ol>
            </div>
            ${showHunt && hunt.length ? `<div>
                <h3 class="fuad-label fuad-subhead">In the hunt · all-play games back of seed ${lastSeed}</h3>
                <ul class="fuad-rows fuad-hunt">${hunt.map((entry) => `<li${entry.team.id === viewer ? ' class="fuad-row-mine"' : ""}>
                    <span class="fuad-row-title"><a href="${esc(teamHref(entry.team.id))}">${esc(entry.team.name)}</a></span><span class="fuad-meta">${esc(entry.record)} all-play</span><span class="fuad-hunt-back">${esc(entry.back)}</span>
                </li>`).join("")}</ul>
            </div>` : ""}
        </div>
    </section>`;
}

// ---- Power ----

export function powerMarkup(teams, {viewer, final, teamHref}) {
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
            <td class="fuad-num fuad-muted">${i + 1}</td><th scope="row" class="fuad-team"><a href="${esc(teamHref(team.id))}">${esc(team.name)}</a></th>
            <td><span class="fuad-power-cell">${bar(team)}<span class="fuad-power-score">${esc(team.power.toFixed(2))}</span></span></td>
            ${[team.pf, team.possible, team.efficiency, team.bench, team.high, team.low, team.allPlay, team.couldaWon, team.wouldaLost, team.alternate].map((value) => `<td class="fuad-num">${esc(value)}</td>`).join("")}
        </tr>`).join("")}</tbody>
    </table></div>`;
    return `<section class="fuad-panel">${heading}${phone}${desktop}</section>`;
}

// A position's chart color: its own for this league's five, then two more in the league's order,
// then grey (red is kept for limits)
const NAMED = ["QB", "RB", "WR", "TE", "PK"];
function positionClass(position, order) {
    if (NAMED.includes(position)) {
        return `fuad-pos-${position.toLowerCase()}`;
    }
    const extra = order.filter((other) => !NAMED.includes(other)).indexOf(position);
    return extra >= 0 && extra < 2 ? `fuad-pos-extra-${extra + 1}` : "fuad-pos-other";
}

export function positionsMarkup(rows, {viewer, teamHref}) {
    const top = Math.max(...rows.map((row) => row.total), 1);
    const order = rows.length ? rows[0].parts.map((part) => part.position) : [];
    const legend = `<span class="fuad-legend">${order.map((position) => `<span><span class="fuad-swatch ${positionClass(position, order)}" aria-hidden="true"></span>${esc(position)}</span>`).join("")}</span>`;
    return `<section class="fuad-panel fuad-positions">
        <div class="fuad-panel-head">
            <h2 class="fuad-panel-heading">Starter points by position</h2>
            <button type="button" class="fuad-collapse fuad-phone-only" aria-expanded="true" aria-controls="fuad-positions-body">Hide</button>
        </div>
        <div id="fuad-positions-body">
            ${legend}
            <ul class="fuad-position-rows">${rows.map((row) => `<li>
                <span class="fuad-position-name${row.id === viewer ? " fuad-strong" : ""}"><a href="${esc(teamHref(row.id))}">${esc(row.name)}</a></span>
                <span class="fuad-position-total">${row.total}</span>
                <span class="fuad-stack" style="width: ${Math.round(row.total / top * 100)}%" aria-hidden="true">${row.parts.map((part) => `<span class="${positionClass(part.position, order)}" style="flex: ${part.points} 1 0">${part.points}</span>`).join("")}</span>
                <span class="fuad-position-values">${esc(row.parts.map((part) => `${part.position} ${part.points}`).join(" · "))}</span>
            </li>`).join("")}</ul>
        </div>
    </section>`;
}

// ---- Winners ----

export function winnersMarkup(result, {viewer, final, teamHref}) {
    const today = final ? "" : '<p class="fuad-meta fuad-if">If the season ended today</p>';
    const named = result.prizes.some((prize) => prize.team);
    const phone = `<ul class="fuad-rows fuad-phone-only">${result.rows.map((row) => `<li class="fuad-won${row.id === viewer ? " fuad-row-mine" : ""}">
        <span class="fuad-row-text"><span class="fuad-row-title"><a href="${esc(teamHref(row.id))}">${esc(row.name)}</a></span><span class="fuad-meta">${esc(winningsLine(row))}</span></span>
        <span class="fuad-won-total${row.total > 0 ? "" : " fuad-muted"}">${esc(ledger(row.total))}</span>
    </li>`).join("")}</ul>`;
    const desktop = `<div class="fuad-table-scroll fuad-desktop-only"><table class="fuad-table fuad-winners">
        <thead><tr><th scope="col">Team</th><th scope="col" class="fuad-num">Weeks won</th><th scope="col" class="fuad-num">Weekly</th><th scope="col" class="fuad-num">All-play</th>
            <th scope="col" class="fuad-num">All-play $</th>${named ? '<th scope="col" class="fuad-num">Playoffs</th>' : ""}<th scope="col" class="fuad-num">Total</th></tr></thead>
        <tbody>${result.rows.map((row) => `<tr${row.id === viewer ? ' class="fuad-row-mine"' : ""}>
            <th scope="row" class="fuad-team"><a href="${esc(teamHref(row.id))}">${esc(row.name)}</a></th>
            <td class="fuad-num">${esc(row.weeks.join(", ") || "—")}</td><td class="fuad-num">${row.weekly ? esc(ledger(row.weekly)) : "—"}</td>
            <td class="fuad-num">${esc(row.record)}</td><td class="fuad-num">${row.allPlay ? esc(ledger(row.allPlay)) : "—"}</td>
            ${named ? `<td class="fuad-num">${row.prize ? esc(row.prize.amount === null ? row.prize.place : `${row.prize.place} ${ledger(row.prize.amount)}`) : "—"}</td>` : ""}
            <td class="fuad-num fuad-strong${row.total > 0 ? "" : " fuad-muted"}">${esc(ledger(row.total))}</td>
        </tr>`).join("")}</tbody>
    </table></div>`;
    const names = new Map(result.rows.map((row) => [row.id, row.name]));
    const prizes = `<div class="fuad-prizes">${result.prizes.map((prize) => `<div class="fuad-prize">
        <span class="fuad-prize-place${prize.team && prize.team === viewer ? " fuad-mine" : ""}">${esc(prize.place)} · ${Math.round(prize.share * 100)}%</span>
        ${prize.amount === null ? "" : `<span class="fuad-prize-amount">${esc(ledger(prize.amount))}</span>`}
        ${prize.team ? `<span class="fuad-prize-team"><a href="${esc(teamHref(prize.team))}">${esc(names.get(prize.team) || "")}</a></span>` : ""}
    </div>`).join("")}</div>`;
    // a result saved before the weekly prize was in it
    const weeklyPrize = result.weeklyPrize || WEEKLY_PRIZE;
    const pot = `<dl class="fuad-pot">
        <div class="fuad-pot-line"><dt>Pot</dt><dd${result.pot === null ? ' class="fuad-muted"' : ""}>${result.pot === null ? `Not in MFL’s accounting${final ? "" : " yet"}` : esc(ledger(result.pot))}</dd></div>
        ${result.potEntries.map((entry) => `<div class="fuad-pot-entry"><dt>${esc(entry.description)}</dt><dd>${esc(ledger(entry.amount))}</dd></div>`).join("")}
        <div class="fuad-pot-line"><dt>Weekly points · ${result.weeklyTotal / weeklyPrize} × ${esc(ledger(weeklyPrize).replace(/\.00$/, ""))}</dt><dd>${esc(ledger(-result.weeklyTotal))}</dd></div>
        <div class="fuad-pot-line"><dt>All-play${final ? "" : " so far"}</dt><dd>${esc(ledger(-result.allPlayPaid))}</dd></div>
        <div class="fuad-pot-line fuad-pot-total"><dt>For the playoffs</dt><dd>${result.forPlayoffs === null ? "—" : esc(ledger(result.forPlayoffs))}</dd></div>
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

// ---- Champions ----

// every year's champion under that year's name; the viewer's own titles highlighted
export function championsMarkup(list, mine) {
    return `<section class="fuad-panel" aria-labelledby="fuad-champions">
        <h2 class="fuad-panel-heading" id="fuad-champions">Champions</h2>
        ${list.length ? `<ol class="fuad-rows fuad-champions">${list.map((champion) => `<li${mine.includes(champion.year) ? ' class="fuad-row-mine"' : ""}>
            <span class="fuad-meta">${champion.year}</span><span class="fuad-row-title">${esc(champion.name)}</span>
        </li>`).join("")}</ol>` : '<p class="fuad-muted fuad-empty">No champions yet.</p>'}
    </section>`;
}
