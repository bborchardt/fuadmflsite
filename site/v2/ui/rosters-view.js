// What Rosters draws, as HTML: My team and each team's page, Teams, Players and Draft, from what
// rosters.js loads (rosters-model.js's sheets, pool and board).

import {POSITIONS, SALARY_CAP, franchiseSalary, rookieSalary} from "../lib/rules.js";
import {esc} from "./html.js";
import {STAR} from "./watch.js";
import {historyLine, titles, versusLine} from "./history-model.js";
import {contractYears, drafted, scalePicks, scaleRange, scaleText} from "./rosters-model.js";
import {money} from "./format.js";
import {teamPicturesMarkup, withIcon} from "./team-pictures.js";

const pts = (value) => (Number(value) || 0).toFixed(1);

// ---- Pieces shared by My team and a team's page ----

export function capPanel(sheet) {
    return `<section class="fuad-panel fuad-cap" aria-label="Cap and roster">
        <div class="fuad-cap-figures">
            <div class="fuad-cap-figure">
                <span class="fuad-label">Cap used</span>
                <span class="fuad-cap-big"><span class="${sheet.tight ? "fuad-caution" : ""}">${esc(money(sheet.capUsed))}</span><span class="fuad-meta"> of $${SALARY_CAP}</span></span>
                <span class="fuad-meta">${esc(money(sheet.salaries))} salaries + ${esc(money(sheet.penaltyTotal))} penalties</span>
            </div>
            <div class="fuad-cap-figure">
                <span class="fuad-label">Active</span>
                <span class="fuad-cap-big">${sheet.active} / 30</span>
                <span class="fuad-meta">${sheet.ir ? `+ ${sheet.ir} on IR` : "None on IR"}</span>
            </div>
        </div>
        <div class="fuad-cap-seasons">
            <span class="fuad-label">Used by season</span>
            <ol class="fuad-season-boxes">${sheet.seasons.map((season) => `<li><span class="fuad-meta">’${String(season.season).slice(2)}</span><span class="${season.tight ? "fuad-caution" : ""}">${esc(money(season.used))}</span></li>`).join("")}</ol>
        </div>
    </section>`;
}

// the roster by position, then this season's penalties as its last group. `cut` adds the cut
// columns (the member's own team).
export function rosterTable(sheet, {cut, pointsLabel = "Pts"}) {
    const columns = cut ? 8 : 6;
    const player = (row) => `<tr>
        <th scope="row" class="fuad-team">
            <button type="button" class="fuad-name" data-player="${esc(row.id)}">${esc(row.name)}</button>${row.ir ? ' <span class="fuad-tag">IR</span>' : ""}
            <span class="fuad-meta fuad-phone-only">${esc(`${row.nfl || "FA"} · bye ${row.bye || "—"} · ${pts(row.points)} pts`)}</span>
        </th>
        <td class="fuad-num">${row.rfa ? "—" : esc(money(row.salary))}</td>
        <td class="fuad-num fuad-muted">${esc(contractYears(row))}</td>
        ${cut ? `<td class="fuad-num fuad-wide">${row.cutPenalty ? esc(money(row.cutPenalty)) : "—"}</td><td class="fuad-num fuad-wide">${esc(money(row.capAfterCut))}</td>` : ""}
        <td class="fuad-mid fuad-wide">${esc(row.nfl || "FA")}</td><td class="fuad-num fuad-wide">${esc(row.bye || "—")}</td><td class="fuad-num fuad-wide">${esc(pts(row.points))}</td>
    </tr>`;
    const head = `<tr><th scope="col">Player</th><th scope="col" class="fuad-num">Salary</th><th scope="col" class="fuad-num">Years</th>
        ${cut ? '<th scope="col" class="fuad-num fuad-wide">Cut penalty</th><th scope="col" class="fuad-num fuad-wide">Cap used after cut</th>' : ""}
        <th scope="col" class="fuad-mid fuad-wide">NFL</th><th scope="col" class="fuad-num fuad-wide">Bye</th><th scope="col" class="fuad-num fuad-wide">${esc(pointsLabel)}</th></tr>`;
    // a group's band, with the space above it as its own row (a table row takes no margin)
    const band = (name, note, total) => `<tr class="fuad-band-gap" aria-hidden="true"><td colspan="${columns}"></td></tr>
        <tr class="fuad-group"><th scope="rowgroup"><span class="fuad-band-pos">${esc(name)}</span><span>${esc(note)}</span></th><td class="fuad-num">${esc(money(total))}</td><td colspan="${columns - 2}"></td></tr>`;
    const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const penalties = sheet.penalties.length ? `<tbody>
        ${band("Penalties", count(sheet.penalties.length, "penalty", "penalties"), sheet.penaltyTotal)}
        ${sheet.penalties.map((penalty) => `<tr>
            <th scope="row" class="fuad-team">${esc(penalty.who)}<span class="fuad-meta">${esc([penalty.when && `Cut ${penalty.when}`, penalty.terms].filter(Boolean).join(" · "))}</span></th>
            <td class="fuad-num">${esc(money(penalty.amount))}</td><td colspan="${columns - 2}"></td>
        </tr>`).join("")}
    </tbody>` : "";
    return `<section class="fuad-panel" aria-label="Roster">
        <div class="fuad-table-scroll"><table class="fuad-table fuad-roster">
            <thead>${head}</thead>
            ${sheet.groups.map((group) => `<tbody>
                ${band(group.position, count(group.players.length, "player", "players"), group.salary)}
                ${group.players.map(player).join("")}
            </tbody>`).join("")}
            ${penalties}
        </table></div>
    </section>`;
}

export function picksPanels(years, {nextYear, live}) {
    return `<div class="fuad-picks">${years.map((year) => `<section class="fuad-panel" aria-label="${year.year} draft picks">
        <h2 class="fuad-panel-heading">${year.year} draft picks</h2>
        ${year.year === nextYear && live ? '<p class="fuad-meta fuad-if">If the season ended today</p>' : ""}
        <ul class="fuad-rows fuad-pick-rows">${year.rows.map((row) => `<li class="${row.traded ? "fuad-muted" : ""}">
            <span>Round ${row.round}</span><span class="fuad-pick-number">${esc(row.number)}</span><span class="fuad-meta">${esc(row.note)}</span>
        </li>`).join("")}</ul>
    </section>`).join("")}</div>`;
}

// ---- Players ----

export const OWNER_CHIPS = ["All", "Mine", "Other teams", "Free agents"];

// on phones, so the Owner row has room for the Watching star
const SHORT_CHIPS = {"Other teams": "Others", "Free agents": "FAs"};

// `extra`: more chips at the row's end (the Watching star after the owners)
export function chipRow(label, names, chosen, key, extra = "") {
    return `<div class="fuad-chip-row-group" role="group" aria-label="${esc(label)}">${names.map((name) => {
        const on = name === "All" ? !chosen.length : chosen.includes(name);
        const text = SHORT_CHIPS[name]
            ? `<span class="fuad-desktop-only">${esc(name)}</span><span class="fuad-phone-only">${esc(SHORT_CHIPS[name])}</span>`
            : esc(name);
        return `<button type="button" class="fuad-filter" aria-pressed="${on}" data-chip="${esc(key)}" data-value="${esc(name)}">${text}</button>`;
    }).join("")}${extra}</div>`;
}

// ---- Draft ----

export function tagsPanel(view, year) {
    const tags = POSITIONS.map((position) => ({position: position.code, top: view.topSalaries[position.code] || []}))
        .map((tag) => ({...tag, price: franchiseSalary(tag.top)}));
    return `<section class="fuad-panel" aria-labelledby="fuad-tags">
        <h2 class="fuad-panel-heading" id="fuad-tags">${year} franchise tags</h2>
        <div class="fuad-tags" role="group" aria-label="Tag prices">${tags.map((tag, i) => `<button type="button" class="fuad-tag-tile" aria-expanded="false" aria-controls="fuad-tag-${i}">
            <span class="fuad-label">${esc(tag.position)}</span><span class="fuad-tag-price">$${tag.price}</span>
        </button>`).join("")}</div>
        ${tags.map((tag, i) => `<ol class="fuad-tag-top" id="fuad-tag-${i}" hidden>${tag.top.map((player) => `<li><span>${esc(player.fullName)}</span><span class="fuad-meta">${esc(money(player.salary))}</span></li>`).join("")}</ol>`).join("")}
    </section>`;
}

const teamLink = (id, name) => `<a href="#rosters-teams/${esc(id)}">${esc(name)}</a>`;

export function orderPanel(order, year, {final}) {
    const list = (rows) => `<ol class="fuad-rows fuad-order">${rows.map((row) => `<li>
            <span class="fuad-seed">${row.pick || ""}</span>
            <span class="fuad-row-text"><span class="fuad-row-title">${teamLink(row.id, row.name)}</span><span class="fuad-meta">${esc(row.why)}</span>
                ${row.traded.map((line) => `<span class="fuad-caution fuad-traded">${esc(line)}</span>`).join("")}</span>
        </li>`).join("")}</ol>`;
    // the playoff teams' picks aren't numbered until the playoffs are played: they get a group of their own
    const open = order.findIndex((row) => !row.pick);
    const picks = (first, last) => first === last ? `Pick ${first}` : `Picks ${first}–${last}`;
    const groups = open < 0 ? list(order)
        : `${open ? `<h3 class="fuad-label fuad-subhead">${picks(1, open)} · out of the playoffs</h3>${list(order.slice(0, open))}` : ""}
        <h3 class="fuad-label fuad-subhead">${picks(open + 1, order.length)} · by playoff finish</h3>${list(order.slice(open))}`;
    return `<section class="fuad-panel" aria-labelledby="fuad-order">
        <h2 class="fuad-panel-heading" id="fuad-order">${year} draft order</h2>
        ${final ? "" : '<p class="fuad-meta fuad-if">If the season ended today</p>'}
        ${groups}
    </section>`;
}

export function boardPanel(board, {year, viewer, before, open}) {
    return `<section class="fuad-panel" aria-labelledby="fuad-board">
        <h2 class="fuad-panel-heading" id="fuad-board">${year} rookie draft</h2>
        <div class="fuad-rounds" style="--fuad-picks: ${Math.max(0, ...board.map((round) => round.picks.length))}">${board.map((round) => `<div class="fuad-round">
            <button type="button" class="fuad-round-toggle" aria-expanded="${open(round.round)}" aria-controls="fuad-round-${round.round}"><span>Round ${round.round}</span><span class="fuad-meta" aria-hidden="true">${open(round.round) ? "Hide" : "Show"}</span></button>
            <ul class="fuad-rows fuad-board-picks" id="fuad-round-${round.round}"${open(round.round) ? "" : " hidden"}>${round.picks.map((pick) => `<li class="${pick.team === viewer ? "fuad-row-mine" : ""}">
                <span class="fuad-meta">${esc(pick.number)}</span>
                ${before
                    ? `<span class="fuad-row-text"><span class="fuad-row-title">${teamLink(pick.team, pick.teamName)}</span>${pick.from ? `<span class="fuad-caution">from ${esc(pick.from)}</span>` : ""}</span><span class="fuad-meta">${esc(scaleRange(pick.overall))}</span>`
                    : `<span class="fuad-row-text"><span class="fuad-row-title">${pick.player ? `<button type="button" class="fuad-name" data-player="${esc(pick.player.id)}">${esc(pick.player.name)}</button> <span class="fuad-meta">${esc(pick.player.position)}</span>` : "—"}</span><span class="fuad-meta">${teamLink(pick.team, pick.teamName)}</span></span><span class="fuad-num">${pick.salary === null ? "—" : esc(money(pick.salary))}</span>`}
            </li>`).join("")}</ul>
        </div>`).join("")}</div>
    </section>`;
}

export function myPicksPanel(board, {viewer, year}) {
    const mine = board.flatMap((round) => round.picks).filter((pick) => pick.team === viewer);
    return `<section class="fuad-panel" aria-labelledby="fuad-my-picks">
        <h2 class="fuad-panel-heading" id="fuad-my-picks">Your ${year} picks</h2>
        ${mine.length ? `<ul class="fuad-rows fuad-my-picks">${mine.map((pick) => `<li><span class="fuad-pick-number">${esc(pick.number)}</span>
            <span class="fuad-row-text"><span>${esc(scaleText(pick.overall))}</span>${pick.from ? `<span class="fuad-caution">from ${esc(pick.from)}</span>` : ""}</span></li>`).join("")}</ul>`
            : '<p class="fuad-muted fuad-empty">No picks this year.</p>'}
    </section>`;
}

export function scalePanel() {
    const rows = scalePicks();
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

// ---- A team's page and Teams ----

// a team in My team's layout, headed by its picture, name, owner (filled in for a member, fillOwners)
// and record. `fromTeams`: opened from Teams (the browser's Back and the Teams view lead out), where
// `tradeHref` is Propose a trade, on another team's page for a member logged in
export function teamMarkup({sheet, picks, live, own, fromTeams, tradeHref, season}) {
    const {banner, icon} = teamPicturesMarkup(sheet.id);
    return `
<div class="fuad-team-head">
    ${banner}${icon}
    <div class="fuad-team-title">
        <h2 class="fuad-team-name">${esc(sheet.name)}</h2>
        <div class="fuad-meta fuad-owner" data-owner="${esc(sheet.id)}"></div>
        <div class="fuad-meta fuad-history" data-history></div>
    </div>
    ${fromTeams && tradeHref ? `<a class="fuad-cta" href="${esc(tradeHref)}">Propose a trade</a>` : ""}
</div>
${capPanel(sheet)}
${rosterTable(sheet, {cut: own, pointsLabel: live ? "Pts" : `${season - 1} pts`})}
<div class="fuad-picks-mount">${picksPanels(picks, {nextYear: season + 1, live})}</div>`;
}

// Each team's owner, and on a team's page their email, filled into the page's [data-owner] spots.
// They're for members only and are never part of a saved copy (store.js), which could be shown to
// whoever opens the page next on that device, so they're filled in after it's drawn.
export function fillOwners(root, owners) {
    for (const spot of root.querySelectorAll("[data-owner]")) {
        const owner = owners.get(spot.getAttribute("data-owner"));
        if (!owner) {
            continue;
        }
        const emails = spot.hasAttribute("data-name-only") ? [] : owner.emails;
        spot.innerHTML = [esc(owner.name), ...emails.map((email) => `<a href="mailto:${esc(encodeURI(email))}">${esc(email)}</a>`)].join(" · ");
    }
}

// {team: {name, emails}} from MFL's league export, which names owners only to a logged-in member; an
// owner may give more than one address
export function ownersOf(league) {
    const owners = new Map();
    for (const team of [].concat(((league || {}).franchises || {}).franchise || [])) {
        const name = team && typeof team.owner_name === "string" ? team.owner_name.trim() : "";
        const emails = (team && typeof team.email === "string" ? team.email : "").split(/[\s,;]+/)
            .filter((email) => /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/.test(email));
        if (team && team.id && name) {
            owners.set(team.id, {name, emails});
        }
    }
    return owners;
}

// the team's all-time record and titles, then on another team's page the viewer's record against it
export function historyMarkup(teamId, {career, champions, mine}) {
    return [historyLine(career[teamId], titles(champions, career)[teamId]), versusLine(mine && mine[teamId])]
        .filter(Boolean).map((line) => `<span>${esc(line)}</span>`).join("");
}

const capBar = (team, viewer) => `<span class="fuad-power-bar" aria-hidden="true"><span class="${team.id === viewer ? "fuad-bar-mine" : ""}" style="width: ${Math.min(100, Math.round(team.capUsed / SALARY_CAP * 100))}%"></span></span>`;

// every team by cap used: rows on phones, a table with the later seasons on desktop
export function teamsMarkup(list, {viewer, season}) {
    const later = list[0] ? list[0].seasons.slice(1) : [];
    return `<section class="fuad-panel" aria-label="Teams by cap used">
    <ul class="fuad-rows fuad-team-list fuad-phone-only">${list.map((team) => `<li class="${team.id === viewer ? "fuad-row-mine" : ""}">
        <a class="fuad-team-row" href="#rosters-teams/${esc(team.id)}">
            <span class="fuad-team-line"><span class="fuad-row-title">${withIcon(team.id, `${esc(team.name)}<span class="fuad-meta fuad-owner" data-owner="${esc(team.id)}" data-name-only></span>`)}</span><span class="fuad-figure ${team.tight ? "fuad-caution" : ""}">${esc(money(team.capUsed))}</span></span>
            ${capBar(team, viewer)}
            <span class="fuad-meta">${team.picksYear} picks ${esc(team.picksLine)} · ${team.active} / 30${team.ir ? ` + ${team.ir} IR` : ""}</span>
        </a></li>`).join("")}</ul>
    <div class="fuad-table-scroll fuad-desktop-only"><table class="fuad-table fuad-teams">
        <thead><tr><th scope="col">Team</th><th scope="col">Cap used</th><th scope="col" class="fuad-num">${list.length ? list[0].picksYear : season + 1} picks</th>
            ${later.map((entry) => `<th scope="col" class="fuad-num">’${String(entry.season).slice(2)}</th>`).join("")}<th scope="col" class="fuad-num">Roster</th><th scope="col"><span class="fuad-hidden">Open</span></th></tr></thead>
        <tbody>${list.map((team) => `<tr class="fuad-row-link${team.id === viewer ? " fuad-row-mine" : ""}" data-href="#rosters-teams/${esc(team.id)}">
            <th scope="row" class="fuad-team">${withIcon(team.id, `<a href="#rosters-teams/${esc(team.id)}">${esc(team.name)}</a><span class="fuad-meta fuad-owner" data-owner="${esc(team.id)}" data-name-only></span>`)}</th>
            <td><span class="fuad-power-cell">${capBar(team, viewer)}<span class="${team.tight ? "fuad-caution" : ""}">${esc(money(team.capUsed))}</span></span></td>
            <td class="fuad-num">${esc(team.picksLine)}</td>
            ${team.seasons.slice(1).map((entry) => `<td class="fuad-num ${entry.tight ? "fuad-caution" : "fuad-muted"}">${esc(money(entry.used))}</td>`).join("")}
            <td class="fuad-num">${team.active} / 30${team.ir ? ` + ${team.ir}` : ""}</td>
            <td class="fuad-chevron" aria-hidden="true">›</td>
        </tr>`).join("")}</tbody>
    </table></div>
</section>`;
}

// ---- Players ----

// the table's columns, the two a phone shows, and the Years left chips: before the season last
// season's points, no projections, and free agents' own chip
export function playerLayout({before, season}) {
    return {
        columns: [["name", "Player"], ["position", "Pos", false], ["nfl", "NFL", false], ["bye", "Bye"], ...(before ? [] : [["projected", "Proj"]]), ["points", before ? `${season - 1} pts` : "Pts"], ["salary", "Salary"], ["years", "Years"], ["owner", "Team", false]],
        phoneKeys: before ? ["points", "salary"] : ["projected", "points"],
        yearChips: before ? ["All", "FA", "1", "2", "3", "4", "5"] : ["All", "1", "2", "3", "4", "5"]
    };
}

const onPhone = (key, phoneKeys) => (key === "name" || phoneKeys.includes(key) ? "" : " fuad-wide");

// Players' frame: the search, the chips' place, the table's head; its rows come from playerRows
export function playersFrame({columns, phoneKeys}, text) {
    return `
<section class="fuad-panel fuad-players">
    <label class="fuad-find"><span class="fuad-hidden">Find a player</span><input type="search" placeholder="Find a player" autocomplete="off" value="${esc(text)}"></label>
    <div class="fuad-chips-block"></div>
    <div class="fuad-table-scroll fuad-players-scroll"><table class="fuad-table fuad-player-table">
        <thead><tr>${columns.map(([key, label, sortable = true]) => {
            const numeric = ["bye", "projected", "points", "salary", "years"].includes(key) ? " fuad-num" : ["position", "nfl"].includes(key) ? " fuad-mid" : "";
            return `<th scope="col" class="fuad-col-${key}${onPhone(key, phoneKeys)}${numeric}">${sortable ? `<button type="button" class="fuad-sort" data-sort="${key}">${esc(label)}<span class="fuad-sort-mark" aria-hidden="true"></span></button>` : esc(label)}</th>`;
        }).join("")}</tr></thead>
        <tbody></tbody>
    </table></div>
    <p class="fuad-muted fuad-empty fuad-none" hidden>No players match. <button type="button" class="fuad-quiet-link" data-show-all>Show all</button></p>
</section>`;
}

function playerCell(player, key, {phoneKeys, before}) {
    const phone = onPhone(key, phoneKeys);
    switch (key) {
        case "name": {
            const contract = player.fa ? "Free agent" : player.rfa ? "RFA" : `${before ? "" : `${money(player.salary)} · `}${contractYears(player)}`;
            return `<th scope="row" class="fuad-team"><button type="button" class="fuad-name" data-player="${esc(player.id)}">${esc(player.name)}</button>
    <span class="fuad-meta fuad-phone-only">${esc([player.position, player.nfl, contract, player.fa ? "" : player.ownerName].filter(Boolean).join(" · "))}</span></th>`;
        }
        case "position": return `<td class="fuad-mid${phone}">${esc(player.position)}</td>`;
        case "nfl": return `<td class="fuad-mid${phone}">${esc(player.nfl)}</td>`;
        case "bye": return `<td class="fuad-num${phone}">${esc(player.bye || "—")}</td>`;
        case "projected": return `<td class="fuad-num${phone}">${player.projected === null ? "—" : esc(player.projected.toFixed(1))}</td>`;
        case "points": return `<td class="fuad-num${phone}">${esc(pts(player.points))}</td>`;
        case "salary": return `<td class="fuad-num${phone}">${player.salary === null ? "—" : esc(money(player.salary))}</td>`;
        case "years": return player.fa && !before ? `<td class="fuad-num fuad-muted${phone}">—</td>` : `<td class="fuad-num${phone}">${player.fa ? "UFA" : player.rfa ? "RFA" : esc(contractYears(player))}</td>`;
        default: return `<td class="${phone}">${esc(player.ownerName)}</td>`;
    }
}

// the players shown, the viewer's own marked
export function playerRows(shown, {columns, phoneKeys}, {before, viewer}) {
    return shown.map((player) => `<tr class="${player.owner && player.owner === viewer ? "fuad-row-mine" : ""}">${columns.map(([key]) => playerCell(player, key, {phoneKeys, before})).join("")}</tr>`).join("");
}

// the filter chips, `positions` the league's (lib/rules.js lineupPositions); the Owner row has Mine and the Watching star only for a member logged in
export function playerChips(state, {positions, yearChips, viewer, watched}) {
    return chipRow("Position", ["All", ...positions], state.positions, "positions")
        + chipRow("Years left", yearChips, state.years, "years")
        + (viewer ? chipRow("Owner", OWNER_CHIPS, state.owners, "owners", watched ? `<button type="button" class="fuad-filter fuad-star-chip" aria-pressed="${state.watching}" data-chip="watching" data-value="Watching" aria-label="Watching" title="Watching">${STAR}</button>` : "")
            : chipRow("Owner", OWNER_CHIPS.filter((name) => name !== "Mine"), state.owners, "owners"));
}

// ---- Draft ----

// the site's own draft: before it, the board (and the viewer's picks); after, next year's order and
// the results, whose rounds start closed on phones in season. `tags`: franchise tag prices, if had.
export function draftMarkup({board, before, tags, order, viewer, season, phone}) {
    const done = drafted(board);
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
        if (!before && order) {
            parts.push(orderPanel(order.rows, season + 1, {final: order.final}));
        }
        parts.push(boardPanel(board, {year: season, viewer, before: false, open: (round) => !before ? !phone : round === 1}));
    }
    parts.push(scalePanel());
    return parts.join("");
}
