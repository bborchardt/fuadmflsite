# Roadmap

**League:** 48571 (contract dynasty) on MyFantasyLeague · **As of:** 19 Oct 2026 (step 7 built, PR #35 awaiting its live run; step 8 next)

What comes next and what's waiting on the commissioner. What's live, why it works that way, the
league rules and MFL's quirks are on master: `README.md`, `docs/design.md`, `docs/mfl.md`.

## Commissioner to-do

- Save MFL pages for the v2 design (⌘S, "Webpage, HTML Only", logged in), when the chance comes up:
  - Add/Drop on a Thursday or Friday, after Wednesday night's blind-bid run, in the real league:
    whether free agents can be added outright then (the clone marks every free agent `#` even on
    Saturday night, so an open window hasn't been seen). Then one immediate add in the beta, as
    the live test step 6 couldn't make: the add, its length posted to the board, and Home's
    reminder reading it.
- At renewal (mid-March 2027 or later): confirm the job follows the new site, and look at League
  Alerts once for preseason noise.
- Each season, once it's set: add the final cut-down date to MFL's league calendar as an event
  whose name contains "cut" (e.g. "Final cut-down"), so v2's Home can show it and date its alerts.

## v2: the redesign

A new look and simpler navigation for the whole league site, not incremental fixes to v1. The
designs are on the canvas (claude.ai artifact "FUAD League Redesign",
https://claude.ai/artifact/QAr8Vy6ieYJdSixPvfDBwV), and keep evolving there before they're built.
Every current board is an interactive prototype (press Play; its row title names its Tweaks).

| Row | Boards | Status |
|---|---|---|
| 1–3 | Night Game, Front Office, Broadcast (phone, desktop) | style explorations; Night Game's look was chosen |
| 4 | Front Office ledger in the Night Game look | history; its cap ledger and contract ideas live on in Rosters (row 8) |
| 5 | Moves › Add, phone | current |
| 6 | Home, phone and desktop | current |
| 7 | League (Scores, Standings, Power, Winners), phone and desktop | current |
| 8 | Rosters (My team, Teams, Players, Draft), phone, phone before the draft, desktop | current |
| 9 | Moves › Trades, phone and desktop | current |
| 10 | Moves › IR, phone and desktop | current |
| 11 | Player popup, phone and desktop | current |
| 12 | Moves › Add, desktop | current |
| 13 | Site menu (☰) and the team sheet, phone and desktop | current |
| 14 | Lineup, phone and desktop (MFL's Submit Lineup restyled; week 6 from the saved page) | current |
| 15 | Moves › Drop, phone and desktop | current |
| 16 | Logged out, loading and error states: Home phone and desktop, Moves › Add phone | current |
| 17 | Message board topic: MFL's page restyled, phone and desktop | current |

### For a design review

What a reviewer needs beyond the sections below:
- **Scope:** the member's view, phone and desktop. The commissioner's view stays v1 for now.
- **Settled, not to relitigate:** the Night Game look; five sections with views; MFL's own forms
  doing the work underneath (v2 fills them, so MFL's rules still apply); Add on desktop as a
  table and a dialog; the site menu at top left.
- **Principles the boards follow** (check them against each other):
  - Phone first: designed at 360 px, checked at 320–430; names wrap rather than truncate.
  - Block only what the bylaws void (bids that could break the cap, 5.5; trades that break it,
    10.3; 30 active in bids; an IR violation), warn otherwise (a trade over the roster limits,
    10.5; lineup problems).
  - A blocked choice names its limit: "over cap", "over roster limit".
  - Every board talks in cap used ("$293 → $298"): totals as "Cap used", a move's effect as a signed
    "Cap change" against it ("−$40" green: cap used goes down; "+$5" red: up), the penalty as
    "Cut penalty" (review, 17 Oct 2026).
  - No partial lists or "show all" links; long lists scroll in their own box. On phones only when
    something follows the list (a Save bar, more panels), capped at about 60% of the screen; a list
    with nothing after it (Rosters › Players, a team's roster) uses the page's own scroll (review,
    17 Oct 2026; compared on canvas row 8).
  - Minimal labels: no helper sentences or page titles; the UI speaks for itself.
  - No confirmation steps after an action: the result shows in place, in one line; only a failure
    asks for a click.
  - Back returns to the screen just left; a detour (Edit, Change) closes back to where it opened.
  - Desktop: full-width bands; no side-by-side panels of different heights; tables fill their width.
    The exception is Home's two columns of variable panels (see Home).
  - MFL's mechanics stay out of sight: members see results, not the forms behind them.
- **Prototype limits, not design:** sample data from around week 5 (Oct 10), so some dates are past;
  only two other teams' rosters exist (Trades opens The Obliterators for any team but the one that
  sent the offer); claims, offers and saves are seeded or kept only until reload.
- **Deliberately not drawn:** the offseason auction and franchise tags in Moves.
- **Sources:** the bylaws and MFL's league settings (`docs/bylaws.md`, this branch); on master,
  `docs/design.md` (why the site works as it does) and `docs/mfl.md` (MFL's behavior, including the forms, chat feed and settings v2 uses).
- **Most worth challenging:** flows end to end across sections; consistency between boards (the
  earlier rows 6–8 predate some principles above); missing states (empty, loading, errors,
  offseason); accessibility; fit with the bylaws, e.g. the Lineup warnings against MFL's own
  settings (MFL already refuses bye-week starters), and bylaws v2 doesn't yet reflect (9.4–9.5 on
  re-adding a dropped player, 10.5's no adds or drops while over the roster limit, 16.5's backup
  starters posted to the board).

**Review of 17 Oct 2026** (done: 17 items on flows and rules, 10 on language and visual).
Decisions are recorded in the sections below and applied to the canvas's rows 5–13 (headers,
wording, cap words, colors, controls, type, wrapping, panels, sample data). Drawn since: Lineup (row 14), Drop
(row 15), logged out, loading and error states (row 16), the before-the-season states as phase
Tweaks, the offer card's pending-bids notice (row 9, Tweak "bidsAtRisk"), Add's "Game started" and
"Dropped by you · bid from …" rows (rows 5 and 12; Game started shows in the free agent window),
and the player popup from Add's "Adding …" line (row 5, the drop step). The canvas can't
show the 44 px tap areas, focus rings or the hidden h1s; those are build rules (Look and
navigation).

**The review prompt** (for a fresh session in this folder):

```text
Design review of the v2 league site redesign, before we start building it. You are an expert
product designer: use that judgment beyond the checklist below, and look up design principles
and current best practice where it helps.

Read first:
- CLAUDE.md, then docs/roadmap.md on this branch, starting with the v2 section's canvas map and
  "For a design review".
- docs/bylaws.md (the league's bylaws and MFL settings).
- On master (worktree ../fuadmflsite-master, or `git show origin/master:<path>`): docs/design.md
  and docs/mfl.md.
- The canvas: https://claude.ai/artifact/QAr8Vy6ieYJdSixPvfDBwV. Review rows 5-13 only (1-4 are
  history); read each board's file (project/<name>.dc.html): the markup and script are the
  design, Tweaks included.

Scope: the member's view, phone and desktop. The commissioner's view is out of scope. Don't
relitigate what the roadmap lists as settled.

Work in two passes, reported separately.

Pass 1, flows and rules:
- Flows end to end across sections (e.g. a free agent from Rosters › Players through Add; a
  trade offer through to its cap and roster effects elsewhere).
- Inconsistencies between boards: numbers, components, behavior, and the listed principles
  (rows 6-8 predate some of them).
- Missing states: empty, loading, errors, offseason and pre-draft, over-cap and over-roster teams.
- Fit with the bylaws and MFL's settings: what v2 blocks, warns or ignores versus what the rules
  say; cite the bylaw.

Pass 2, language and visual design:
- Language: no implementation details shown to members (MFL's forms, exports, how a move is
  carried out); short labels; plain, consistent words for the same thing on every board.
- Color: measure contrast for every text/background pair the boards use (WCAG 2.2: 4.5:1 body
  text, 3:1 large text and UI components) and list the ones that fail; check that color isn't
  the only signal (red/green, orange); judge whether the palette looks good and works as a system.
- Type, spacing, hierarchy and touch targets (44 px) at phone widths 320-430 px; desktop layout.
- Accessibility beyond color: labels, focus, semantics.

How to work:
- Read only: don't edit the canvas, the roadmap or any code during the review, and don't fetch
  from MFL (rate limits; everything needed is saved).
- Before reporting, skip anything that's a prototype limit listed in the roadmap.
- Report each pass's findings ranked by impact, each with: board and row, what's wrong or
  missing, the principle, guideline or bylaw it touches, and a suggested fix.
- Then walk me through them one at a time and wait for my call on each. Once I approve a change,
  update the roadmap (and the canvas if needed) as we go.
```

### Rollout

1. **v1 stays the default.** v2 is built in `site/v2/` (starting as a copy of v1) and offered with
   the beta toggle in League Alerts, which works both ways ("Try it"; in the beta, "Back to the
   classic site"); a member who turns it on keeps it until they leave the beta. The beta's floating
   bar shows only when something fails (live since PR #19). Feedback comes
   through the beta's feedback thread. At first the offer is limited to the commissioner's own
   team (`teams: ["0001"]`), so v2 is tried as a member; logged in as commissioner (0000) the site
   stays v1. The offer widens to the league only once v2 is fully built.
   **The commissioner's experience in v2 is designed later, and is low priority:** with most chores
   automated it's little used, so it stays v1 (the team sheet's Viewing as switch reaches it) while
   the member's view is iterated on.
   **Loader change first (v1, in place, approved):** a beta that's still offered, but not to the
   team viewing, is kept and not loaded, so switching to commissioner and back doesn't forget it.
2. **v2 changes in place while it's the beta,** an exception to "visible redesigns get a new
   version", added to `design.md` when v2 starts.
3. **Once v2 is stable,** it becomes the default for everyone, with a way back to v1. How is decided
   then; keeping v1's loader in the header (offering v2 by default) keeps the way back independent of
   v2's code.
4. **Later,** after a stretch as the default, the v1 fallback is retired.

v2's `lib/` keeps what the daily job reads (`capTotal`, `unchargedPenalty`, `penaltyCharged`,
`pendingDroppedPlayers`, `numPlayers`, `irPlayers`, `injuryStatus`, `injuryReportKnown`, and the
`violations.js`, `adds.js` and `contract-years.js` exports); the rules don't change, and the job
keeps following `RULES_VERSION`. Checked with master's `tools/verify/verify.py`.

### Build

**Where it starts** (master, 17 Oct 2026): `site/v2/` is v1's code in the Night Game look, holding up
over all 63 MFL skins, offered as the beta from League Alerts (PRs #18 and #19); the loader change
(Rollout 1) is in; step 0's docs are in (PR #20); step 1's frame is PR #21; step 2's Home is PR #23; step 3's League is PR #25; step 4's Rosters is PR #26; step 5's Lineup is PR #29; step 6's Add is PR #31, with beta fixes in PRs #32 and #33; the request volume review (Performance) is PR #34; step 7's Drop is PR #35. Everything below is new work in `site/v2/`: one branch and PR per step, each
tried in the beta (the commissioner's team only) before the next.

**For every step:**
- The spec is this roadmap's sections; the picture is the canvas (the row map at the top of v2).
  Where they disagree, the roadmap wins and the canvas gets fixed.
- Master's `AGENTS.md` rules apply: test against saved MFL exports and pages, one live run at the
  end of a step, never the job's User-Agent from a dev machine, no syntax newer than Safari 16 in
  statically imported modules, a reviewer pass before merging.
- `lib/` keeps the exports the daily job reads (Rollout, above).
- Colors are named tokens with one meaning each (Look and navigation), never values scattered
  through the code, so a light theme stays a swap of values.
- The build rules in Look and navigation hold on every page: tap areas, focus rings, hidden h1s,
  type sizes, names that wrap.

**Steps:**
0. **Docs on master** (done, PR #20): MFL's forms, chat feed, pending claims, API imports and league
   settings are in `docs/mfl.md`; `docs/design.md`'s goal is "one navigation layer" (v2's five
   sections replace the custom tabs); the beta-in-place exception was already there. **Next: step 1.**
1. **The frame** (done; canvas rows 13, 16; PRs #21, #22): the header (☰ site
   menu with MFL's menu in its groups and a filter; the wordmark and context line; the team button,
   or Log in), the team sheet (My team, Log out, Viewing as), the five sections, the redesign's
   views, the tokens, focus rings, hidden h1s and tap areas, the loading and error pattern
   (`ui/panel.js`), and the player popup, information only, in place of MFL's on MFL's own pages.
   Decided while building (17 Oct 2026):
   - Views keep linking to the nearest MFL page until their step rebuilds them (Drop is MFL's Drop
     Players page, `O=257`; Players the Contracts tab); Winners stays hidden until step 3. A rebuilt
     view lives on the home page under its own # (`#league-standings`), turned on per view
     (`rebuilt` in `ui/nav.js`).
   - The context line: "Week N" (MFL's `liveScoringWeek`) from week 1's kickoff; before it "Before
     the draft" until `draftResults` names a player, "Draft day" on a calendar event named for the
     draft (logged in only), else "Before week 1"; "Season over" after week 17 until the next site.
   - The popup reads MFL's player page (`player?L=…&P=…`), one request for the bio, status,
     contract, headlines and season by week, instead of the exports (`playerScores` takes a week per
     request); if MFL changes the page, MFL's own popup opens. A free agent shows no contract.
   - The popup's news at 16 px (PR #22), after trying it on a phone.
2. **Home** (done; rows 6, 16; PR #23): every panel of Home below, on the home page under
   MFL's own Home (`#fuad-home`, shown while the frame's section is Home; MFL's other home tabs stay
   as they were). Decided while building (17–18 Oct 2026):
   - The beta's way back ("A new version… Try it", or leaving the beta) sits under League alerts,
     replacing v1's violations panel, which v2 no longer has.
   - Recent moves keeps the current home page's last 10, a steadier size than a span of days, with
     "All moves" to MFL's transactions page; won blind bids read "won X for $N, dropped Y". This
     settles its follow-up; who lost a bid stays on MFL's processed waivers page.
   - Contract-length reminders are the member's own only; until step 6 their tap opens the
     contract topic (else the board), not Moves › Add.
   - Alerts link to MFL's own pages (Lineup, Add/Drop, Trades, IR) until their steps rebuild them.
   - Home asks MFL for nothing until it's shown, and each export is fetched once per page
     (`ui/page-fetch.js`); chat polls every 15 s only while Home shows.
   - Pending bids are invalid if every group's costliest claim could break the cap or 30 active
     (`lib/bids.js`, design.md 5.5).
   - Tested live in the clone league (50965): bid and trade-offer alerts, a chat post and a new
     topic. Pages and exports for the later steps were saved then (clone Add/Drop with pending
     claims, the edit-group pages, Trades with an offer, Lineup, IR, Drop, the trade proposal page,
     rosters, draft; the real league's scores, standings, brackets and accounting), outside git in
     the backtest repo's `samples/clone-2026-10-17`, `clone-2026-10-18` and `league-2026-10-17`.
3. **League** (done; row 7; PR #25): Scores with live scoring, Standings, Power, Winners, on the
   home page under `#league-scores` and the rest (`#fuad-league`, shown while the frame's section is
   League), each view loaded the first time it shows. Decided while building (18 Oct 2026):
   - Scores runs MFL's own method: the scores from MFL's stats feed scored with the `rules` export
     (it reproduces every official week 5 score), the projections and win % from a port of
     `mfl_win_prob.js` on the projections feed (`ui/live-scoring.js`). Its numbers can differ from
     MFL's page by a point or so (design.md, accepted limits). The feed is read every 40 s while a
     game is on, as MFL's page does; who starts (`liveScoring`) every 5 minutes. Feeds and exports
     are in master's `docs/mfl.md` ("Scores and standings").
   - No spread before kickoff: the projections and win bar say it, from the same simulation.
   - No link to MFL's live scoring page (the site menu has it).
   - All-play (seeds, Winners) counts weeks 1–14 from `weeklyResults`, since MFL's standings keep
     counting it through the playoffs; the computed 2025 seeds and places match MFL's bracket.
   - Starter points by position sums `weeklyResults` (`W=YTD`) starters by position, not MFL's home
     page module.
   - The pot without league-wide accounting entries is $100 × 10 teams (2025 had none, so its
     prizes read higher than paid; 2026 on has them).
   - Tested offline with a Playwright harness serving the saved pages and exports (no MFL
     requests); week 6 samples (live and final), week 5's feed and 2025's final are in the backtest
     repo's `samples/league-2026-10-18` and `league-2025-final`. Then live in the real league (local
     preview, the London game on): scores and win % as MFL's page; the bench needed `liveScoring`
     with `DETAILS=1`, which Home now asks for too.
   - To revisit: compare a card's win % with MFL's page during a full Sunday; playoff weeks
     (15–17) through `liveScoring` are untested until December.
4. **Rosters** (done, provisional; row 8; PR #26): My team, Teams (each team under
   `#rosters-teams/<id>`), Players, Draft; the popup's Rosters actions. Decided while building
   (18 Oct 2026):
   - Built as a provisional version to keep moving through the steps (the commissioner); the
     simplifications below are to revisit after the build.
   - The popup's actions (Drop, IR, Propose a trade, Add) open MFL's own Moves pages until steps
     6–9 rebuild them, without the player chosen; Propose a trade opens MFL's proposal page for
     the two teams.
   - Points are `playerScores` (`W=YTD`), which covers free agents too; byes `nflByeWeeks`.
   - Franchise tags reuse the Contracts tab's logic (`ui/franchise-view.js`): the deadline
     snapshot until week 1, live until the deadline, then fixed.
   - In the offseason a rostered player with no years left reads as an RFA; whether MFL shows
     them that way after the commissioner's rollover is for step 10.
   - Simplified for now: Draft's order is a list rather than tiles on desktop; the board's salary
     range shows as text, not on hover. The draft's rounds sit side by side on desktop (rounds
     across, picks down), as specced.
   - From the commissioner's desktop review: Teams' rows open their team (lime names, a chevron);
     Players scrolls with the page, its chips wrapping, nothing scrolling inside it.
   - A traded pick's original owner is the team holding that slot untraded in another round
     (every round keeps one order), by today's name; MFL's "Pick traded from …" comment keeps the
     name at the time of the trade.
   - Next year's order counts the playoffs once MFL's `completedWeek` reaches the last bracket week;
     what MFL's page sets it to after the season is for step 10.
   - Tested offline with the harness (saved `playerScores` YTD in `samples/league-2026-10-18`).
5. **Lineup** (done; row 14; PR #29): MFL's Submit Lineup page, with v2's rows, warnings and save
   bar drawn over MFL's own form (`ui/lineup.js`). Decided while building (18 Oct 2026):
   - Everything shown comes from MFL's page; the only export is the week's injury report, which
     tells IR and suspensions apart where MFL's one-letter Inj column doesn't (`I` is IR).
   - A tap sets MFL's checkbox; Save posts MFL's own form in place (no page reload), then confirms
     from MFL's answer (or the page read back): "Lineup saved.", "Not saved: MFL kept the lineup
     below." or, when MFL kept only part, "Saved, but MFL kept the lineup below.", with MFL's lineup
     shown. A save that went but couldn't be checked turns Save off until a reload.
   - A starter whose game has started stays checked and locked, and counts toward the total: MFL
     keeps him with a hidden input (master's `docs/mfl.md`), so posting MFL's form keeps him too.
   - Before the draft is told from `draftResults`, asked fresh before the note shows, and never
     after week 1.
   - On phones the row's tap starts or benches, so the popup isn't reached from Lineup there.
   - Tested offline with `harness/lineup.py` in the backtest repo (saved Saturday and Sunday pages
     in `samples/clone-2026-10-17` and `clone-2026-10-18`; flags for a refused save, a blank POST
     answer, logged out), then live in the clone league with `harness/live.py` (this checkout's v2
     in Chrome, the member saving by hand): a swap saved with the started starters kept.
   - To revisit: whether a carried-over starter on a bye gets MFL's hidden input like a started
     game (none seen yet); each tap redraws the whole page (fine at 30 rows).
   - After the commissioner's look at the beta (PR #30): Lineup's desktop columns spread evenly;
     Home's Coming up under the message board on desktop; Home's chat fields padded whatever the
     skin. The message board's topic and reply pages restyled (canvas row 17): posts as cards,
     replies indented, the post being answered above the reply form, MFL's icons and smileys gone;
     a page the script can't read (a new topic, Preview) stays MFL's.
   - To revisit, the message board (the commissioner, 18 Oct 2026): some of its buttons still show
     red and orange, and moving around it can land on pages in MFL's own, jarringly different style
     (the topic list, a new topic, Preview). Restyle them the same way, or rebuild the board in v2
     after the Moves steps.
6. **Moves › Add** (done; rows 5, 12; PR #31): MFL's Add/Drop page with v2's controls drawn over
   it (`ui/add.js`, `ui/add-model.js`). Decided while building (18 Oct 2026):
   - Picks go through MFL's own picker (`picker_select`) and form, posted in place, then read
     back (`pendingWaivers`, or the roster for an immediate add) before the page reloads to show
     them; a refused move shows "Not made: …", and if MFL changed anything anyway the page reloads
     to show it. Reorder and remove are MFL's links; edit is MFL's edit page (`O=255`).
   - A copy is a new claim through the add form, not MFL's `COPY_ROUND` (which only copies to a
     new group and may leave the length line behind).
   - Each group's comment is read back after a claim joins it and rewritten through the edit page
     if any line is missing. Live, MFL added a second claim's comment as a new line (now in
     master's `docs/mfl.md`). Remove takes out only a line in Add's own form ("Akins: 1 year"),
     never a member's note; lines use the full name when two claims in a group share a surname.
   - The window or blind-bids banner follows MFL's own marks (any free agent without one: the
     window is open), its times from the calendar's weekly events.
   - A free agent whose game has started is bid only, as MFL's page treats him (the
     commissioner); a bid may drop a started player, an immediate add can't.
   - An immediate add's length goes to the newest topic with "contract" in its name, else a new
     "Contract lengths" topic (the commissioner).
   - A move is blocked only when it takes cap used or the active count past its limit, or further
     past it: bids already invalid stay "Current bids invalid" without blocking a move that
     leaves them as they are (the clone team's are: 30 active and a no-drop claim). An immediate
     add's drop counts as gone for a pending claim that drops him too; two groups sharing a drop
     are allowed and noted, since MFL's help says the second can't then add a player.
   - Edit leaves a length it can't read ("Evans two years") as written unless the member picks
     one.
   - Rosters' popup Add opens Add with the player chosen (`#player-<id>`), Back returning to
     Rosters. The frame gained a phone detour: the screen's name in the context line, Back in the
     menu's spot (`window.fuadDetour`).
   - Tested offline with `harness/add.py` in the backtest repo (the saved clone pages with MFL's
     own `picker.js`, saved in `samples/mfl-scripts/`; flags for the window, a refused move, a
     failed post, roster and cap limits, logged out, MFL replacing a group's comment), three
     reviewer passes, then live in the clone on desktop: bids into a new and an existing group,
     edit, reorder, copy, remove, the clone left as it was.
   - Not yet live: an immediate add and its board post (commissioner to-do), and the phone
     screens (offline only).
   - After the commissioner's look at the beta (PRs #32, #33):
     - Home is `#home-page`, not `#home`. `#home` is the id of MFL's page body on the home
       page, so browsers scrolled to it, past the header. Safari did even with a scroll margin.
     - Lineup and Add hide MFL's page from the start, rather than once their code has loaded,
       so MFL's page doesn't flash first.
     - Add showed "Couldn't check your cap" in the real league: MFL answered one of its exports
       with HTTP 429. Add's five fresh exports now go one after another, and the league's
       settings are kept for a day. A refusal says MFL asked to wait. The rest of the site still
       asked in bursts, until the request volume review (Performance).
     - Phone chat: the 10 newest messages in the page, not in their own scroll box, which caught
       swipes meant for the page (Home, Chat).
7. **Moves › Drop** (done; row 15; PR #35): MFL's Drop Players page (`options?O=257`) with v2's
   roster drawn over it (`ui/drop.js`, `ui/drop-model.js`). Decided while building (18–19 Oct 2026):
   - Over MFL's page, as Add is, rather than on the home page: "Game started" is MFL's own `!` in
     that page's roster list, and Drop posts MFL's own form for one player, then reads the roster
     back before the page reloads with "Jackson dropped." A page v2 can't read stays MFL's.
   - The Drop button is filled lime, the screen's own action; Add's Remove is grey like Edit and
     Copy (it was outlined red). Red marks only limits, never a button (the commissioner).
   - A pending claim that drops the same player counts as no drop after the cut (as an immediate
     add's does), so the cut is blocked only if it's what takes cap used past the cap.
   - In season an active player can't go at 23 active, and no one can under 23 (10.5); an IR
     player can still go at exactly 23.
   - Add's data loading and form posting are shared (`ui/moves.js`).
   - Tested offline with `harness/drop.py` in the backtest repo (phone and desktop; a refused drop,
     a deep link, 23 active, logged out, a lower cap), one reviewer pass (no blockers).
   - Before merging: one live drop in the clone, checking cap used after the reload includes the
     penalty (the saved exports can't show it).
   **Next: step 8.**
8. **Moves › Trades** (row 9).
9. **Moves › IR** (row 10).
10. **Before the season:** every phase checked against saved exports with simulated dates, since
    none of it shows live until March.
11. **Widen the beta** to the league; ask in its feedback thread whether anyone wants a light theme.

**Open, to settle while building:** whether MFL runs a blind bid on a player whose game had started
(its page takes it), and whether it carries a lineup over unchecked (the beta).

**The build prompt** (for a fresh session on master, one per step):

```text
Build step N of the v2 redesign (the roadmap's Build section) for the FUAD league site.

Read first:
- AGENTS.md, docs/design.md and docs/mfl.md on master.
- docs/roadmap.md on the claude/fantasy-football-tier0-setup branch (git show
  origin/claude/fantasy-football-tier0-setup:docs/roadmap.md): the Build section, then the sections
  for this step; they are the spec.
- The canvas, https://claude.ai/artifact/QAr8Vy6ieYJdSixPvfDBwV: the boards for this step's rows
  (project/<name>.dc.html). They are the picture; the roadmap wins where they differ.

Work on a branch from master, in site/v2/. Test against saved exports and pages; make one live run
at the end. Present choices to me one at a time and wait for my call. When the step is done, update
the roadmap on its branch with what changed and what's next.
```

### Look and navigation

- **Night Game:** dark only for now (review, 17 Oct 2026: dark suits evening phone use, the beta's
  way back to the classic site covers anyone who dislikes it, and a light theme would double the
  visual checks over MFL's restyled pages and skins; colors are built as tokens so one can follow
  the phone's system setting later, if members ask when the beta widens). Dark, app-like. Barlow and Barlow Condensed, a lime accent, orange for tight cap,
  green and red for cap used going down and up. One meaning per color (review, 17 Oct 2026): **lime**
  yours, interactive, selected, live (buttons, links, the lit tab, your row, "Playing", seeds);
  **green** a good change (a "−$40" cap change, W, saved); **red** over a limit, blocked, a bad
  change ("$302 of $300", "+$5", L, "Blocked:"); **orange** caution (cap used within $10,
  Questionable, notices); **plain** white or grey for facts (cut penalty amounts, "from …" and
  "Traded to …" picks, You give and You get). Red and green always come with a sign, letter or word.
  Panels (#161B22) carry a 1 px #262D37 hairline, the header's border color, for a sharper edge
  on the #0D1117 page (1.36:1; compared on canvas row 6). Buttons: filled lime for a screen's own action (Post, Log in, Propose a trade on a team's page, Drop);
  outlined lime for an action that isn't the screen's point (the popup's Rosters actions; the
  commissioner, 18 Oct 2026); grey for quiet ones (Log out, Retry, Add's Edit, Copy and Remove); never red, which marks only limits (the commissioner, 19 Oct 2026). Controls meet 3:1 for state and edges (WCAG 1.4.11): chips, single or multi-select, everywhere as
  Add's (selected: white fill, dark text); view segments mark the selected view with lime
  text and a 2 px lime bar under the label, the fill subtle; fields have a #6B7583 border, lime on
  focus. Text meets 4.5:1: reasons, values, placeholders and disabled labels use the muted
  #9AA4B2, and an off row shows it by losing its tap (no hover, no chevron), not by fading;
  #6B7583 (3.4–4.1:1) only for separators, empty dashes and field borders. Every control has a
  44 px tap area, its drawn size free to stay smaller (the extra is invisible, reaching into the
  gaps around it); Add's claim order arrows sit side by side at 44 × 44, and text-only
  controls (Show bench, sort headings, Show all) become full-height rows or cells. Space grows only
  where controls are packed tight: about half a row above Rosters › Players. Text is 12 px at the
  least (tab labels, uppercase headings at 0.04 em spacing, lineup stat lines, tags), meta lines
  13 px. Text read as prose (the popup's news articles, and later the board's posts) is 16 px with
  1.55 line spacing, in full white, its headlines 16 px (`--fuad-read-size`; chosen on the canvas,
  17 Oct 2026, after 14 px read small on a phone).
- **Accessibility rules for the build** (review, 17 Oct 2026): a 2 px lime focus ring, offset 2 px,
  on `:focus-visible` for every control (no bare `outline: 0`); a visually hidden h1 per view
  ("Moves: Add"); views as links with `aria-current`, matching their URL (`#league-standings`);
  a row that opens the popup is a button; nothing only in a hover tooltip (desktop draft cells show
  their salary range, the phone position chart labels its segments or lists the values); dialogs
  (popup, menu, Add's) take focus, keep it until closed, return it to what opened them, and
  close on Esc.
- **Five sections on every page:** Home · Lineup · Moves · League · Rosters. Bottom tabs on phones, a
  top bar on desktop. A section's views sit in a row across the top (a segmented control; a row of
  chips that scrolls sideways if more than about four), on rebuilt and MFL pages alike.
- **No page titles:** the lit section already says where you are. Phones show the FUAD wordmark with a
  context line and the team button; desktop shows only the top bar. The context line is the week in
  season ("Week 5") and the phase in the offseason ("Before the draft", "Draft day", "Before week
  1"), the same in every section; a detour's screen name ("Review", "Your roster") takes its place,
  with Back in the ☰'s spot (review, 17 Oct 2026). (The live frame's phone title, `.fuad-title`,
  goes when v2 is built.)
- **Back returns to the screen the member was just on,** like the browser's back (each screen a
  history entry). A detour opened from a screen (Edit or Change from a review, a picker) closes back
  to it, by Done, by picking, or by Back.
- **The site menu (☰)**, top left (beside the FUAD wordmark on phones, before it on desktop), holds
  everything the sections don't, so "nothing gets hidden" becomes "nothing becomes unreachable"
  (below; canvas row 13). A drawer from the left on both.
- **The team button** (top right, the team's initials) holds only the member's own things (below).
- **MFL's pages are restyled, not rebuilt,** by v2's stylesheet: Lineup, Trades, IR and the
  fallback pages. **Risk:** this styles MFL's markup; if MFL changes it, the look degrades but MFL's
  controls still work.
- **A player popup everywhere:** a player name opens it in one click, so a member can research
  a player where they're deciding on him; where a row's tap already does something (a phone
  checkbox row, a free agent to pick, an alert), the popup is reached another way or not at all,
  as each section says (review, 17 Oct 2026). MFL's own (`launch_player_modal`) is desktop markup that
  doesn't fit a phone (values cut off, the stats table far too wide) and leads with the biography,
  so v2 draws its own (designed, canvas row 11): name, position, NFL team and number;
  injury status and expected return; owner, salary, years, bye; for the member's own
  players the cut's effect, "Cut now: $28 penalty · cap used $293 → $253"; **actions only when
  opened from Rosters**, where a member researches and acts on it (yours: Drop and IR; another
  team's: Propose a trade; a free agent: Add), each opening its Moves view with the player chosen,
  Back returning to Rosters. Elsewhere the popup is information only: in Moves the page already
  makes the move, and in League, Home and Lineup an action would pull the member out of what
  they're doing (review, 17 Oct 2026); the
  latest news headlines (from MFL's player page, with each article's ID), each opening in place
  to its source and time, update and analysis, read from MFL's article page
  (`view_news_article?L=…&ID=…`) when opened, the newest open at first; "More news" links
  to his 7-day news (`news_articles?L=…&PLAYERS=…&DAYS=7`); this season by week with opponent
  and points; the biography last; all but the articles from MFL's player page (`player?L=…&P=…`)
  in one request (built in step 1).
  A bottom sheet on phones, a two-column dialog on desktop.
- **Rebuilt:** Home, League, Rosters and Moves › Add and Drop. Home, League and Rosters live on MFL's home
  page (`home/48571`), so moving between them doesn't reload.
- **Owners' customizations don't reach v2.** Each owner can choose their own MFL skin (63 of them;
  the league's is only the default) and their own home page tabs and the modules in them. v2's
  stylesheet sets every background, border and shadow outright (checked against all 63 skins), and
  the rebuilt pages draw into v2's own area on the home page, hide MFL's tab contents, take their
  data from exports, and mark their views in the URL themselves (e.g. `#league-standings`), not by
  MFL's tab positions. Until then the frame's Home, League › Standings and Rosters › Players
  links open home page tabs by position, which can be wrong for an owner whose tabs differ.

The map:

| Section | Views |
|---|---|
| **Home** | one page: My alerts, League alerts, Chat, Message board, Recent moves, Coming up |
| **Lineup** | one page: MFL's lineup, restyled, with warnings |
| **Moves** | Add · Drop · Trades · IR |
| **League** | Scores · Standings · Power · Winners |
| **Rosters** | My team · Teams · Players · Draft |

**Logged out** (the home page and reports are public; review, 17 Oct 2026; drawn for Home and Add, canvas row 16): the
header shows Log in in place of the team button (MFL's login, then back to the same page). Home:
My alerts becomes one line, "Log in to see your alerts", with Log in; League alerts, the board's
topics, Recent moves and Coming up as usual; Chat hidden (private messages are in the public
feed); New topic asks to log in. Lineup: "Log in to set your lineup". Moves: Add, Drop, Trades and
IR show "Log in to make moves". League as usual, nothing highlighted. Rosters
opens on Teams, Players without the Mine chip; the popup has no actions.

**The team sheet** (slides up on phones, drops from the button on desktop): the team's name, My team,
Log in / Log out, and for the commissioner a "Viewing as: Member | Commissioner" switch that uses
MFL's own switch link, found in MFL's header.

**The site menu:**
- **MFL's own league menu** in full (nothing of ours: the bylaws, `options?O=26`, are reached from
  League › League Rules, MFL's scoring page, which links to them), read live from the page in its groups, collapsible, with a
  filter box that opens every group with a match. Anything important is already a section.
- No Commish group: the commissioner's view stays v1 (below).

Left to the menu or dropped from the home page: the Transactions tab (Trade Bait, Top 10 Free
Agents, Starter Points By Position; the last moves to Power), the Calendar tab, League Poll, Franchise
Owner Activity, MFL's Rosters, Starting Lineups, Fantasy Schedule, Weekly Results, Draft and NFL
Injury Report pages, and the cut calculator.

### Performance

Measured 10 Oct 2026 on v1, as a guest, on an emulated mid-range phone (slow 4G, 4× slower CPU):

| | First paint | League Alerts and Contracts drawn |
|---|---|---|
| Home, first visit | 4.0 s | 7.6–8.0 s |
| Home, returning visit | 0.5 s | 1.0 s |
| Standings page, first visit / returning | 1.5 s / 0.3 s | – |

- MFL builds its home page fast (14 KB in 0.3 s): its modules cost about 0.2 s over a bare page, so
  rebuilding on the home page is cheap. First visits are slow because of MFL's own ~1 MB of scripts
  and styles, which are cached after. The time that's ours is the data wait after MFL's page paints:
  about 0.5 s on a returning visit.
- Not yet measured logged in (chat and member modules) or on Add/Drop. The emulation likely left out
  the first response's latency: real 4G adds roughly 0.3–0.5 s.

**Request volume** (reviewed 18 Oct 2026, branch `v2-request-volume`): MFL throttles by machine,
doesn't say how much, refuses bursts with HTTP 429 and asks for about a second between requests
(master's `docs/mfl.md`). Add got a 429 after the commissioner moved quickly between views: Home then
sent 18 exports at once on every visit, Add 6 more. v1's home page sends 11–14 at once per load and
has never been refused, so the fix is fewer requests, not pacing.
- Counted offline with `harness/count.py` in the backtest repo (local v2 on the clone's saved pages,
  every request logged; `--version=v1`, `--refuse=TYPE` for a 429, `--shot=DIR`), then once live in
  the clone with `harness/live.py --count`: Home → Lineup → Home → Add → Home, all answered 200.
- What each view asks, first visit / returning: Home 20 + chat / 1 + chat within 2 minutes, 8 +
  chat after (was 18 every time); League's views 0–4 each; Rosters' 0–3; Lineup 1; Add 5, fresh and
  one at a time; any other page 0 (the frame's 4, once a day). Most of Home's 20 are League alerts'
  (12): the cap needs rosters, adjustments, transactions and free agents (uncharged drop
  penalties), the injury checks two reports and the results, the phase three NFL weeks.
- Kept in the browser, shared by every page (`ui/page-fetch.js`, master's `docs/design.md`): the
  NFL schedule, league settings and calendar a day; last week's injury report a day, today's 5
  minutes on game days and an hour otherwise; the week's results an hour; rosters, adjustments,
  transactions, free agents, pending bids and trades and the message board 2 minutes, cleared by a
  move made in v2. Each viewer's copies are their own, and an MFL error is never kept. Not kept:
  the draft results (Rosters › Draft shows picks as entered; Home stops asking after week 1), who
  starts (`liveScoring`, League › Scores), anything Moves checks.
- After a 429, v2 asks MFL nothing for 30 seconds, on any page; a panel with nothing to show says
  "MFL asked us to wait. Retry in a few seconds.", Retry off until then. A move, and the reads that
  confirm it, aren't held. No limit on requests at once: v1's bursts show it isn't needed.
- Seen live: MFL's own chat module, hidden under v2's Home, still polls the chat feed every 5
  seconds beside v2's every 15. Both are the feed, not exports; worth dropping MFL's once v1's
  modules go.

Rules for v2:
- **Readable within 1.5 s** for a returning member on a mid-range phone, checked against this
  baseline.
- **Each page fetches only what it shows,** in parallel, and reuses what's kept (request volume,
  above).
- **Cached for as long as it stays true:** players and the season calendar for a day, standings and
  power rankings until the next results, rosters and transactions for a minute or two. Pages that
  only display draw from the cache at once, then refresh.
- **Checks always use fresh data:** Moves' cap and roster blocks never rely on cached rosters,
  penalties or pending bids.
- **No flash of MFL's page.** v2 draws its own frame (menu, title, placeholders) as soon as its code
  starts, and from then on shows its own loading and error states. Until then, MFL's content stays
  hidden for at most about 10 s (v2's files arrived by 4.6 s on a first visit); past that, MFL's page
  shows, so a hung download never leaves a blank screen. Failures that come quickly fall back at once
  through the version loader. During the beta, the handover hides the page behind a dark background
  until v2's stylesheet applies; once v2 is in the header its stylesheet loads with the page.
- **Loading and error states, one pattern for every panel** (review, 17 Oct 2026; drawn for Home and Add, canvas row 16, the other pages following the same pattern):
  a first load shows each panel's heading over placeholder bars at its real size, so nothing
  jumps; a returning visit shows the cache at once and refreshes quietly; a failed refresh keeps
  the cache with "As of 7:42 p.m." under the heading; a failed load with nothing cached shows
  "Couldn't load standings." and Retry in the panel's place, the others unaffected. In Moves, the
  controls that need fresh data (rosters, penalties, pending bids) are disabled while it can't be
  had ("Couldn't check your cap." Retry); a move MFL refuses shows "Not made: …" with its reason.
- **What v2 still pays for v1:** only what MFL builds (the home page modules v1 members use) and
  v1's code download before the handover; none of v1's own code runs. The modules go when v1 is
  retired.

### Rosters

Views: **My team · Teams · Players · Draft.** My team, Players and Draft are designed (phone): the
canvas's row 8; Teams is the cap ledger (row 4).
**Desktop (row 8, under review):** My team, top to bottom, all full width: the cap panel (cap
used, "$293 of $300" over "$291 salaries + $2 penalties"; active and IR; used by season in boxes
as tall as the other two parts, so their tops and bottoms line up); the roster table grouped by position
("QB · 6 · $150" on each group's line), with Player, then the money (Salary, Years, Cut penalty,
Cap used after cut), then NFL, Bye, Pts, and this season's penalties as the last group (who, the amount
under Salary, then when cut and the terms); no clicks: the
name opens the player popup, with its Rosters actions; then two panels, one
per draft year, listing each round's pick (2027 numbered where today's order decides it, "from …"
in orange, "Traded to …" greyed). Teams is the ledger as a table, in cap used like My team (used now
with a bar; next year's picks held, "8 · 3 1sts", "4 · no 1st", plain 5 greyed; used each later
season; roster count; least used first). A team opens in My team's layout with "Propose a trade",
its table built for spotting trade targets: Player, Salary, Years, NFL, Bye, Pts (no cut columns). Every Rosters table puts the contract beside the name.
Players is every rostered player in one table (Player, then the
contract, Salary and Years, beside the name; then Pos, NFL, Bye, Pts, and the owning team last, in
plain grey so it doesn't read as a second name column) under the filter chips, in a scroll box, salary first; clicking Player,
Bye, Pts, Salary or Years sorts by it (again to reverse); names open the player popup. Draft on desktop: every panel full width, so none sits beside one of a different height: franchise
tags (five tiles across; clicking one shows its top 5 as five cells across, name over salary); the 2027 draft order as two rows of five tiles (picks 1–5, 6–10; each row one height, so long names wrap to two lines; review, 17 Oct 2026) (number, team, record, traded
picks; undecided picks unnumbered), or before the draft Your 2027 picks as one tile per round,
always five across whatever the team holds (several picks stack in a round's tile, each with its
salary range and "from …"; a round traded away shows greyed, "Traded to …"); then the
whole draft as one grid, rounds across and picks down, all 50 picks with no taps. In season, last
summer's results: each cell the pick, player and position, team, and salary today ("—" once
released). Before the draft, the board: each cell the pick, owner ("from …" in orange for traded
picks) and what the scale pays at that overall pick, lowest to highest across positions ("$1–8"; the
breakdown on hover). The member's picks are highlighted. Last, as on phones, the rookie scale turned on its side (positions down, picks 1–10 across). Full-width bands are the default fix for
desktop panels that would otherwise sit side by side at different heights.
- **My team** (the default): cap used ("$293 of $300", orange within $10 of the cap; "$291
  salaries + $2 penalties" under it), active of 30 and IR, and cap used for this season and the next
  four (boxes); the roster by position, ending with this season's penalties as its last group (from
  `salaryAdjustments`: the player cut, when, his contract then, the amount), each player with
  salary, years left ("1 yr", "2 yrs"; never "expiring", which reads like RFA in the offseason), NFL team, bye (`nflByeWeeks`) and YTD points
  (`playerScores` `W=YTD`), and an IR tag. Tapping a player opens the player popup, as on
  desktop (no cut panel); for the member's own players the popup shows what cutting costs ("Cut
  now: $28 penalty · cap used $293 → $253") beside Drop (to Moves › Drop, his row open) and IR (shown only when the NFL lists him on IR). Then the team's draft picks, a list per year like desktop's (each round's pick, 2027 numbered where today's order decides it, "from …" and "Traded to …"), from `futureDraftPicks`.
- **Teams** (designed, phone and desktop): every team by cap used, least first, the member's
  highlighted; on phones a row per team with cap used, a bar, next year's picks ("8 · 3 1sts") and
  roster count. Tapping a team opens its page in the My team layout (cap used, active and IR, used
  by season, the roster by position with NFL team, bye and points, its penalties, its draft picks)
  with "Propose a trade" (to Moves › Trades) on top and no cut columns.
- **Players** (under review): rostered players and the free-agent pool (`freeAgents`, 682 players
  at our positions, 501 on an NFL team; only those on a team are shown), so scouting works all
  year, including before the draft when nothing can be added. A **Find a player** box above the chips matches names
  as you type, together with the chips; when the chips hide a match, the empty list offers **Show
  all** (clears the chips, keeps the text). Three multi-select chip rows: position
  (All, QB, RB, WR, TE, PK), years left (All, 1–5; in the offseason All, FA, 1–4) and owner (All,
  Mine, Other teams, Free agents). A tap turns a chip on or off, All clears the row. **FA** (offseason
  only, in the years row) is anyone without a contract; the owner row then decides which: FA + Free agents is the
  UFAs, FA + Mine or Other teams is the RFAs (in the offseason; they stay with their old team, which
  can match), FA + All is everyone biddable. Mine + Free agents is the in-season scouting view.
  Free agents show "—" for salary and "—" for years in season ("UFA" in the offseason) and "Free
  agent" as the team. In the offseason every contract is a year shorter and the expiring players are
  RFAs: "—" for salary, "RFA" for years, their old team as the team; points are last season's. In
  season a Proj column (this week's projection, `projectedScores`) appears. The member picks the
  sort (column headings, tap again to reverse); the default follows the phase only, never the chips:
  Proj in season, last season's Pts before the draft. On phones a row has one shape whatever the
  filters, its two numbers set by the phase: Proj and Pts in season; Pts and Salary before the draft
  (production beside pay, for pricing RFAs at the auction); both headings sort. The grey line carries
  position, NFL team, the contract (salary in season, years; "RFA") and the owner, or "Free agent",
  wrapping rather than cut. The phone list shows everything by default; the chips narrow it.
  No team filter (Teams and My team cover one team).
- **Draft** (names in the tag top 5 and last draft's results open the player popup): franchise tags
  for next season (each position's tag, expanding to the top 5 salaries it
  averages; live until the trade deadline, then fixed), **next year's draft order** (below), the
  rookie scale for the next draft (picks 1–10), and **this year's rookie draft** (each league site shows its own year's), by round with
  round 1 open: each pick's team, player and salary today (— once released), from `draftResults`.
  The 2026 rookies signed under the old rules; the scale applies from the 2027 draft.
  **Next year's draft order** (bylaws 8.1–8.2: worst to first, the same order every round): picks
  1–4 the non-playoff teams, worst first by the league-wide standings sort (the playoff picture's);
  picks 5–10 by playoff finish: the two first-round losers by seed (the lower seed first), then the
  3rd-place game's loser and winner, the runner-up, the champion. In season it reads "if the season
  ended today": one list of all ten, picks 1–4 numbered, then the current seeds from lowest to
  highest with no number until their pick is decided; each playoff pick fills in as its game ends. Traded picks show under the
  original team in orange, from `futureDraftPicks` ("Round 1 → Not 100% A Dick"). Not accounted for, since
  they haven't happened in a decade: losses that don't count (13.2) and unpaid teams' wins (14.2).
  The same order breaks offseason blind-bid ties (5.3).
  **Over one league site's life** (the 2027 site as the example; headings put the year first; the
  rookie scale is static, shown in every phase without a year or explanation; tag prices only,
  never who is tagged, since tags are made on draft day and show up in the rosters after):
  1. **Site opens → the draft** (mid-March → August): 2027 franchise tags (fixed prices), **Your
     2027 picks** (each with what the scale pays at that overall pick, "QB $5 · RB $8 · WR $8 ·
     TE $3 · PK $1", or "$1 at every position" from pick 10 on; the scale counts overall picks across the whole draft, not per round; "from …" for traded ones), then the
     whole 2027 draft board (picks by round, owners, "from …", all empty, from this site's
     `draftResults`, rounds closed), the rookie scale.
  2. **After the draft → week 1 final:** the 2027 rookie draft (results). The draft is offline; the
     commissioner enters the picks and contracts the next day, so drafted players appearing in
     `draftResults` is the switch from board to results. No tags.
  3. **Week 1 → trade deadline:** 2028 franchise tags (live), 2028 draft order ("If the season ended
     today"), the scale, the 2027 rookie draft.
  4. **Deadline → end of the regular season:** the same, with tag prices fixed.
  5. **Playoffs:** picks 5–10 get their numbers as games end.
  6. **After the season → the 2028 site opens:** the order final, its label gone.
  **Same layout in every phase:** franchise tags, then your picks (before the draft) or next year's
  order (in season), then the board or last draft's results, the rookie scale always last.
  **On phones, short by phase:** franchise tags are one row of five prices (tap one for its top 5);
  the rookie scale closes to "Pick 1: QB $6 · RB $10 · WR $10 · TE $4 · PK $1" (tap for the table),
  in every phase; last summer's draft results have every round closed in season; the order or
  board stays open. Canvas row 8 has both: in season (Rosters › Draft) and phase 1 (beside it).
  Phase 1's tag prices come from the previous year's deadline salaries, on the old site: the daily
  job saves the five prices when the trade deadline passes, and the new site reads that copy.

From the Contracts design (canvas row 4):
- **The cap ledger:** every team's cap room for this season and the next four, sorted by room now.
  Room is $300 less salaries and cap penalties; penalties count this season only. Orange under $10.
- **Open a team** to see its players grouped by position (QB, RB, WR, TE, PK; then salary, then years
  left), each salary across the seasons it covers, and the team's penalties this season.
- **Cutting a player:** the penalty, then cap room now → after (green if higher, red if lower). On a
  phone, tapping a player opens it as a panel.

### Moves

Views: **Add · Drop · Trades · IR** (review, 17 Oct 2026: dropping got its own view, since Add's
page is built around free agents and bids; Recent's transactions live in Home's Recent moves).
- **Drop** (canvas row 15, phone and desktop): cap used and active on top, then the roster by
  position (desktop as a table: Player, NFL, Salary, Years, Cut penalty, Cap change), each row with
  its penalty and signed cap change. Clicking a row opens its review in place, "Cut now: $28 penalty
  · cap used $293 → $253" and Drop Jackson; no dialog, no second pick. The result is one line
  ("Jackson dropped."), the row gone. A row is off, with its reason, when the cut with the pending
  bids' max would break the cap ("over cap"), in season at 23 active ("under roster minimum"; not
  for IR players) or once his game has started ("Game started", MFL's mark); a player a pending
  bid drops is noted. Before the draft it's the useful view (Add says "Adds open after the draft.").
  Rosters' popup Drop and IR's Drop him instead land here with his row open. MFL's `add_drop` takes
  a drop with no add (the league allows dropping without adding).
- **Trades:** below.
- **IR** (designed, phone and desktop: the canvas's row 10): "Can go on IR" lists the member's active players the
  NFL lists on IR (injury, expected return; injuries export), "On your IR" the rest, each with a
  checkbox (Move to IR, Activate). When activating would make 31 active, "Pick a drop" lists all 30
  active players in a box that scrolls inside itself, lowest penalty first, each with its penalty and
  cap change. It shows only while activating needs a drop: when the IR checkboxes stop needing
  one, it goes and a drop picked earlier is let go. Desktop: the alert, then the bar (sticky, Save
  on its right), one IR table in the two groups (position, NFL team, salary, NFL status, expected
  back), and Pick a drop as a table (salary, years, cut penalty, cap change). The player popup:
  on desktop a name opens it, the checkbox its own control (not a label wrapping the link); on
  phones none, the whole row ticks its box, since the row already carries the NFL status and
  return and two targets in a row invite mis-taps. A bar shows active and cap used live and blocks over 30 active or a drop whose
  penalty breaks the cap; Save is MFL's one submit (`ir`: deactivate, activate and drop together),
  with no confirmation step: the lists update and one line says what was saved. A
  player the NFL no longer lists on IR "must come off IR" (bylaw 11.1): a notice, and his Activate
  box locked on ("Must activate"), so every IR save includes it: the bylaw sets no deadline, and MFL
  takes no lineup while it's unmet (league setting). MFL itself refuses players the NFL doesn't list on IR.
  The notice also offers **Drop him instead** (review, 17 Oct 2026): Moves › Drop with his row
  open (MFL's IR form drops only active players), Back returning to IR; Pick a drop stays for
  activating him and cutting someone else.

**Add** is MFL's Add/Drop page (`add_drop`) with v2's own controls, which fill in MFL's real
forms. Free agents are scouted on Rosters › Players (with the Mine + Free agents
chips), which works before the draft too; Add is where the move is made.
- **Adding:** they read MFL's player lists (`playerDatabaseObj`), select through MFL's own picker
  rows, and fill `BBID_AMT`, `ROUND` and `COMMENTS`; MFL's Submit does the rest, so MFL's rules still
  apply. Submit stays off until MFL's hidden `add_pid`/`drop_pid` and its "To Add"/"To Drop" lines
  match the choice; members aren't shown that check.
- **Confirming:** MFL shows no success message, only Add/Drop again with the claim in its table. The
  controls read the claims back from the `pendingWaivers` export: one entry per group, the claims in
  priority order (`add_bid_drop`, ...) and the group's comment.
- **Reordering, removing, copying:** MFL's own links in the claims table's Action column
  (`MOVE_UP`, `MOVE_DOWN`, `DELETE`, `COPY_ROUND`); each reloads the page.
- **Editing a group:** MFL's edit page (`options`, `O=255`, `ROUND`) changes each claim's bid and
  drop and the group's comment.
- If anything they need is missing, they stand aside and the page is MFL's own, restyled.
- Not MFL's `blindBidWaiverRequest` import: it has no comment field, so contract lengths would be
  lost.

How MFL runs it (league settings):
- Blind bids process Wednesdays at 11 p.m. CT. From then until Sunday noon CT, players are first come
  first served, except locked ones (dropped within the last two days), which take a blind bid; from
  Sunday noon every free agent is on waivers. MFL decides per player, and the controls follow it.
- No adds or drops for a player between the kickoff of that player's game and the end of the week's
  games.
- An IR violation (a player on IR the NFL no longer lists there) stops the owner's lineup: "In case
  of an IR violation, prevent owner from submitting lineup? Yes".
- Conditional bidding, up to 8 groups; bids from $1 in $1 steps; no bid budget beyond the cap; IR
  salaries count fully against the cap.
- Processing (MFL's blind bidding help): bids league-wide from the highest dollar amount down; within
  a group, the first valid claim from the top wins; groups have no priority. A claim whose drop is
  already gone (won by another group) is invalid, so a shared drop can't add a player.
- **The cap is soft:** MFL awards winning bids even over $300, and its own roster check uses its
  settings (80 players), not the league's 30 active. Both limits are ours to enforce.
- **One comment per group:** each claim's comment is added as a new line. Moving a claim doesn't move
  its line, so each claim writes a named line ("Akins: 1 year"), which the job's reader pairs by
  name; after a reorder, removal or copy, the controls rewrite the group's comment through the edit
  page.

The design (settled for now; the canvas's row 5 is the phone reference, row 12 the desktop one):
- **Free agents** sorted by this week's projection (MFL's WProj), with team, opponent and bye week.
  On phones a row tap picks the player (one tap to add); his name on the drop step ("Adding
  Higbee") and the review opens the player popup, Back returning there. On desktop the name in the
  table opens it and the row's Bid or Add button picks him.
- **Drops** grouped by position with the cut penalty and cap change, and a **No drop** row first, which
  says why it's off when it is ("over roster limit", "over cap"). Drops that
  would break the cap are greyed out ("over cap"); one already used in another group is allowed and
  noted.
- **A contract length picker (1–5 years)** on every add. A bid writes it as a named comment line; a
  free agent add posts it to the board ("Higbee: 2 years") through MFL's `messageBoard` import,
  behind the scenes: the submit button says so ("Add Higbee now · posts 'Higbee: 2 years'"), and the
  post goes only once the transactions confirm MFL made the add, since MFL can refuse it (a game
  kicked off) and a length posted for a player the member doesn't have would stand on the board. Each
  length shows its cut penalty ("Cut later: $10"). A member can't set contract years
  directly: MFL's `salaries` import is commissioner-only,
  so the job sets them, and the post is the league's public record.
- **Blind bid groups (conditional bidding):** each group wins at most one claim, independently of the
  others. A claim's cap change is its bid less what its drop frees; a group's max cap change is its
  largest claim, or $0 if all its claims lower cap used. The bid is
  capped so that, with the other groups' max bids, the cap holds.
- **Roster:** at 30 active a claim needs a drop. Below 30, a no-drop claim is allowed while active
  players plus the groups holding a no-drop claim stay at 30 or under.
- **Players whose game has started** (review, 17 Oct 2026): v2 computes no window of its own,
  since MFL's timing isn't documented and can change; it shows MFL's own mark (`!` in the
  `playerDatabaseObj` names; "Locked" on the IR page). A marked player's row says "Game started"
  and is disabled for the move MFL refuses, and opens again when the mark goes; no reopening time
  is shown. Blind bids follow what MFL's page still offers for him. A move MFL refuses anyway shows
  as one failure line, "Not made: …" with MFL's reason; the same in IR.
- **Re-adding a dropped player** (review, 17 Oct 2026): 9.4 is the league's rule, so v2 blocks it: a
  player the member dropped within 48 hours shows "Dropped by you · bid from Fri 3:12 p.m." (the
  drop's time, from the transactions, plus 48 hours) and can't be picked. 9.5 needs nothing of v2:
  MFL's lock ("until the first waivers run after 2 days") already makes him bid only.
- **Roster minimum** (in season; review, 17 Oct 2026): a drop that leaves 22 active is blocked,
  "under roster minimum" (9.2). Moving a player to IR may leave 22: allowed (9.2 is about waiving),
  then My alerts' "Under 23 active". Outside the limits only moves toward them are allowed (10.5),
  so a neutral add-with-drop isn't: over 30 active, no adds at all ("over roster limit"; drops and
  moves to IR are fine); under 23, no drops at all ("under roster minimum"; adds and activations
  are fine). These are v2's controls; the job's flags don't change.
- **Managing claims:** reorder with arrows; tap a claim to edit its bid or drop (the player added is
  fixed: MFL's edit page can't change it), remove it, or copy it to another group. Every action is
  checked against both limits first. Back returns to where the member came from.
- **No confirmation step** (phone and desktop). A bid lands back on Add with its new claim highlighted in Pending
  bids, comment line shown. A free agent add lands back with one line: "Higbee added, Waller dropped.
  Posted 'Higbee: 2 years'." Only a failed post asks for a click ("Couldn't post the length …; it's
  due within the hour", Post it now); League Alerts flags a length still unposted either way.
- **Desktop (canvas row 12):** Pending bids as one full-width table (#, Add, Drop, Comment,
  Bid, Cap change, order arrows, Edit · Copy · Remove), Projected cap and roster in its header; then
  the full free agent table (search, position chips, sortable by Player, Pts, Proj; a Bid or Add
  button per row). That button opens a two-column dialog like the player popup: the drop list on the
  left, group, bid, contract length and projected cap on the right.
- **One page in both periods.** A banner says which (free agent window open until Sunday noon CT,
  blind bids only until Wednesday 11 p.m. CT), and pending bids always show. During the window a
  locked player is marked "bid only" and goes through the bid flow, where the member picks a group;
  MFL's "submit as a waiver claim" box (a bid on an unlocked player while he could be added now)
  isn't offered: members don't use it.
- **Before the season** (review, 17 Oct 2026). "The draft" in member text means draft day: the
  free agent auction and the rookie draft together.
  - **Before the draft:** Add shows only the banner "Adds open after the draft." (dropping is in Drop). No
    roster limits then (2.5), so no 30-active checks; the cap still applies.
  - **Draft → final cut-down date:** blind bids only, the first round processed Wednesday of week 1
    ("Blind bids only until Wed Sep 9, 11 p.m. CT"); first come, first served starts only after it.
    Those bids are won after the cut-down date, so the in-season checks apply (30 active, counted
    against the roster as it stands: a team still at 34 can bid with drops, not without), and the
    length goes with the bid as in season (5.6). Lengths for players won on draft day are posted
    on the board by the cut-down date (12.5), outside Add.
  - **IR:** no 30-active check before the cut-down date; the cap check stays.
- **Prevent, don't warn.** League rule: a blind bid that could put a team over a limit is invalid and
  voided. So the controls block any move that would make pending bids able to break a limit: a bid
  over its max, an edit or copy, and an immediate free agent add, whose cap and roster checks include
  every pending group ("Blocked: with your pending bids, this add could exceed the salary cap").
- **Pending bids can still go bad outside our controls** (a trade, a penalty charged, a move on
  MFL's own pages): Moves re-checks them on every visit and shows "Current bids invalid".

Wording members see (no "worst case"):
- **Projected cap**, "If all high bids win": cap used out of $300, now → projected ($297 → $302), red
  past $300. Every board talks in cap used, so its totals read the same way as the signed changes beside them.
- **Projected roster** (30 → 31), only when a claim has no drop; red past 30.
- **Max cap change** on each group, and each claim's cap change under its bid: +$2 red, −$1 green, $0
  white.
- **Current bids invalid** as the warning when either limit could break; the red number says which.
- **A blocked choice names its limit:** "over cap" (a drop, or a group to copy a claim to), "over roster
  limit" (No drop, or copying a claim without a drop).
- **Over the max:** "with your other groups' max bids, $9 would exceed the cap", beside "max $8".

Enforcement, in layers: the controls stop a bad bid at the moment it's made; League Alerts warns about
the member's own pending bids before Wednesday night (for bids made anywhere, including MFL's own
pages, the classic site and MFL's app, which our controls can't reach); the daily job and the
commissioner void over-cap moves after waivers run, as today.

### Trades (Moves › Trades)

Designed (phone and desktop): the canvas's row 9. MFL's trade pages (`docs/mfl.md`, Forms) drive it; v2's own screens fill
their forms.
- **The Trades view:** offers to the member (each with what moves, its effect on the member's cap and
  roster, and Accept / Counter / Reject with a comment), the member's own offers (each with Withdraw,
  then "Withdraw this offer?" Keep / Withdraw), and "Propose a
  trade" (each team with its cap used, "$296 used") with the trade deadline above it.
- **Countering:** Counter opens the proposal pre-filled with the offer, seen from the member's side
  (on phones the usual steps, starting at You give with the offer ticked), and its button reads "Reject and counter"; the offer stays open until that's pressed. Sending posts
  the new offer, then answers the original with MFL's counter (which rejects it), in that order, so a
  failure can only leave the original open: then the offer card says "Your counter was sent, but this
  offer is still open" with Reject it. MFL's own counter rejects first and opens a blank proposal.
- **Desktop:** the Trades view in full-width bands (each offer as You get | You give | effect, the
  answer below; Your offers; teams as tiles with cap used). Proposing is one screen, not three steps:
  the effect on both teams in a bar that stays on screen, You give and You get side by side (both full
  rosters by position, then picks), then expiry, message and the button.
- **Proposing, in three steps, each with complete lists:** You give (the member's whole roster by
  position, IR tagged, then picks), You get (theirs), Review. A bar on every step shows the live effect
  on both teams (cap used, active), so a problem shows while picking.
- **The player popup in Trades** (information only): offer cards and Review open it from a name (on
  phones the player's whole line); in the pick lists, desktop names open it with the checkbox its
  own control, while on phones the whole row ticks its box, as in IR.
- **What's blocked and what isn't (bylaws):** a trade that puts either team over the cap is void (10.3),
  so it's blocked. 10.3's exception ("unless the team under violation clears space as part of the
  trade") is read as letting a team already over the cap (e.g. after an RFA win, 6.3) trade its way
  back under, which the block allows, not as letting a team stay over (commissioner's ruling, 16.3;
  review, 17 Oct 2026). A trade may take a team over or under the roster limits (10.5): allowed, with a
  notice that the team must comply within 12 hours, before the next NFL game, or by the next blind-bid
  deadline, whichever comes first, and that MFL won't take its lineup until then (league setting).
  Under 23 the notice gives the adds' shorter window (10.5: within 12 hours or before the next NFL
  game, whichever comes first): "You'd have 22 active. You must add players within 12 hours or
  before the next NFL game, whichever comes first." A
  trade that would let the member's pending bids exceed the cap gets a warning: those bids would be
  voided (5.5); lower them first. Only an owner sees their own pending bids, so the proposer's are
  checked when proposing and the other team's when answering: the offer card shows the same notice
  above its answer buttons ("Your pending bids: after this trade they could take you over the cap
  ($302), and would all be voided. Lower them in Add first.", the link to Add), and Accept
  stays allowed (review, 17 Oct 2026; not yet drawn).
- **Expiry:** MFL's date and hour, defaulting to before Sunday's games (the safer choice; MFL's own
  default is the league's 7 days), with quick choices that fill it in (before Sunday's games, before
  Thursday's game, in 7 days); when it stays open through game
  time: "Heads up: it can be accepted close to game time, which may leave little time to fix starting
  lineups."
- **Near kickoff:** MFL refuses accepting a trade with a player whose game has started, until 4 hours
  after the week's last kickoff (league setting on); the offer card says "Locked: Fairbairn's game has started.", with no reopening time (v2 computes none of MFL's windows; review, 17 Oct 2026).
  Accepting shortly before a traded player's kickoff isn't against the rules, so v2 warns ("games
  start in 40 minutes; both lineups need fixing"); a block would need a new bylaw.
- **Deadline (10.1):** the kickoff of week 12's first game (2026: Wed Nov 25, 7:00 p.m. CT); proposing
  closes after it until the offseason. Picks tradable for the next two drafts, rounds 1–5.
- **Offseason:** trades open at any time (10.1), with no deadline line and no roster notices (no
  limits until the cut-down date, 2.5); RFAs are tradable, shown as "RFA", until the draft (6.6).

### Lineup

MFL's Submit Lineup page (`lineup`; `docs/mfl.md`, Forms), restyled; designed for phones and desktop on canvas row 14 from
the page saved 17 Oct 2026 (week 6). Top to bottom: the header, a week picker (‹ Week 6 ›: this
week and later, MFL's week links), the warnings, the roster by position in MFL's order (QB, RB, WR,
TE, PK, alphabetical within; each group's heading "QB · start 1–2 · 2 starting"), "On IR: …" with
a link to Moves › IR, and a save bar above the tabs.
- **A row per player:** a round check (lime when starting), the name with a tag (Out or IR red,
  Questionable orange, Bye or Game started grey), "BAL · @CLE Sun 12:00 p.m.", the projection. A tap
  starts or benches him; a bye or a game that has started locks the row, as MFL disables its box.
- **The save bar:** "10 of 10 starting · QB 2 · RB 3 · WR 3 · TE 1 · PK 1" and Save lineup, off
  until the lineup is full and within the league's starter limits (QB 1–2, RB 1–3, WR 2–5, TE 1–3,
  PK 1; MFL takes no partial lineup), naming what's wrong instead ("Pick 1 more", "WR 1, start
  2–5"). Saved: one line, "Lineup saved."
- **Warnings, not blocks** (injury statuses change up to kickoff, and MFL's report can lag): a red
  card naming each starter who is out, on the NFL's IR, suspended or on a bye ("Lamar Jackson is
  out."), one line each, no consequence line on this page (review, 17 Oct 2026); Home's My alerts
  says "A loss won't count toward draft order (13.2)", in weeks 1–14 only. 13.2's exceptions don't
  remove a warning. MFL disables bye players' boxes, and on the saved page a week 5 starter on a
  week 6 bye wasn't carried over, so the Out warning is the one that clearly fires; the others stay
  in case a carried-over lineup holds one.
- **Before the season** (review, 17 Oct 2026; not drawn): before the draft one line, "Lineups open
  for week 1 after the draft."; from the draft, the page as in season for week 1.
- **Left out:** MFL's projection source menu (FantasySharks stays), the Optional Message box and
  last week's starters in bold. Backup starters (16.5) stay on the message board as today; a
  Backups panel posting to the designated thread is a later idea, not part of v2.
- **Desktop:** full-width bands: the week picker, the warnings, the save bar (sticky, Save on its
  right), then one table by position (Start as its own round button, Player with its tag and the
  popup link, NFL, Opponent, Opp rank (MFL's vs the position; higher is a weaker defense), YTD, Avg,
  Proj), starting rows shaded, and "On IR: …" last. % Start, Pos rank, opponent average and News are
  left out so it fits 1,240 px without scrolling.
- (v1 doesn't flag byes; v1 gets no more fixes, so this comes with v2.)

### Home

Rebuilt, one page, top to bottom (on desktop, the canvas's row 6: My alerts, League alerts and the
Message board on the left; Chat, Recent moves and Coming up on the right, so a quiet alerts week
doesn't leave the left column short; an exception to the full-width bands, since every panel's
content varies: the same gap between panels in both columns, and no stretching or padding to make
the columns' bottoms meet; review, 17 Oct 2026):
1. **My alerts:** the member's own, each one tappable to the page that fixes it (so a player named
   in one doesn't open the player popup); a quiet "All clear" when empty.
2. **League alerts:** every other team's (tap: that team in Rosters › Teams).
3. **Chat:** compact. On desktop it grows to about four messages, then scrolls inside itself, newest
   at the bottom of the box, opened scrolled to the newest. On phones the 10 newest show in the
   page, with "Older messages" to MFL's chat page: an inner box caught swipes meant for the page
   (the commissioner, 18 Oct 2026). One line when empty ("No messages yet."). A "To" picker sends to everyone or privately to one team; private messages carry a
   lock tag ("to you", "to The Obliterators"). Reads MFL's chat feed and posts through `chat_save`
   (`docs/mfl.md`, Chat). The league barely uses chat (3 messages this season, all private).
4. **Message board:** the newest topics, linking to MFL's board, and "New topic" (subject and
   message, posted with MFL's `messageBoard` import); replies on the topic's own page.
5. **Recent moves:** the league's latest transactions, the home for them now that Moves has no
   Recent view (review, 17 Oct 2026): the last 10, won blind bids with their amounts, and "All
   moves" to MFL's transactions page (18 Oct 2026).
6. **Coming up:** the next two or three one-off league dates (trade deadline, playoffs, rookie
   draft), from MFL's `calendar` export, routine weekly events left out; links to MFL's calendar. In
   the last few days before one, it shows in My alerts instead.

**Before the season** (canvas row 6, a phase Tweak; review, 17 Oct 2026):
- **Before the draft:** My alerts carries trade offers (nothing else needs a reminder then); Coming
  up shows draft day, the final cut-down and week 1's kickoff.
- **Draft → cut-down:** My alerts adds contract lengths still to post for draft-day players ("Post
  contract lengths for 3 players", by the cut-down date, $5 a day late, 12.5–12.6), opening the
  newest board topic whose subject contains "contract" (else the board; a post in any thread counts,
  as for the job), getting within 23–30 active by the cut-down date (to Drop or Add), and pending
  bids (they process Wednesday of week 1). Coming up: the cut-down, the first blind bids, week 1.
- **The cut-down date** changes yearly: read from MFL's calendar, the event whose name contains
  "cut" (commissioner's to-do); without one the alerts say "before the season" and Coming up leaves
  it out.
- League alerts drop the under-23 alert until the cut-down date (no limits before it, 2.5); chat,
  the board and Recent moves are as in season.

No playoff bracket panel: League › Scores shows the playoff games.

My alerts and where they go:

| Alert | Tap |
|---|---|
| Starter injured (IR or Out), suspended, on a bye or with no game; empty slot | Lineup |
| Under 23 active | Moves › Add |
| Current bids invalid (a pending bid could break a limit) | Moves › Add |
| Bid deadline, when the member has pending bids (Wed 11 p.m. CT) | Moves › Add |
| Contract length still to post for a free agent add (the automatic post failed) | Moves › Add (Post it now); until step 6, the contract topic |
| A player on IR the NFL no longer lists, and the drop it may need at 30 | Moves › IR |
| A trade offer waiting for an answer | Moves › Trades |
| Over the cap or 30 active from an add or trade: "the commissioner will reverse it" | not tappable |

**Designed:** phone and desktop, the canvas's row 6.

### League

Rebuilt, replacing the home page's Standings tab for v2 (the tab stays while v1 members use it).
Views: **Scores · Standings · Power · Winners.** Designed (phone and desktop): the canvas's row 7. On desktop
the cards sit in a two-column grid, each a "tug of war": the two scores face off (projections under
them), a split bar across the card shows the win chance, and live, each side has chips for playing,
to play and minutes left; final weeks say Final instead. An opened game moves to the top, across both
columns. Its header is a centered score bug: each team's name and live chips toward the middle, the
scores at 52 px beside a center column with the win bar and the projected final. Its lineups are a
head-to-head table, one line per player: position · player · game (state and stat line) · projection ·
points, then a dividing line, then the other team reversed (points · projection · game · player ·
position), so the points meet at the center; then "Show bench" (off by default on both, every bench player listed highest-scoring first, IR last
and tagged, in a box that scrolls itself after about eight rows; review, 17 Oct 2026; the export includes
non-starters). A player opens the player popup (information only), his news answering "why 0.0?"
during games: on desktop his name, on phones his whole line, since nothing else in it takes a tap.
No link to MFL's live scoring page; it stays reachable from the site menu. Phones
use the same tug of war, smaller (names wrapping to two lines, both names bottom-aligned in one
row so the scores stay level, and only a card with a long name grows a line; on desktop each row of
cards stretches to one height; review, 17 Oct 2026; scores at 30 px, the bar across, and playing / to
play / minutes as one small line per side), and a card opens in place; its lineups stay side by side:
ten starters a side (QB 1–2, RB 1–3, WR 2–5, TE 1–3, PK 1; league `starters`), each side in position
order and paired by order, since flex spots let the two teams' shapes differ. Players as
"R. Stevenson" (first initial, last name; full names on desktop), with a grey line under each that
leads with the position ("QB · Final · 21/30, 248 yds, 2 TD") and wraps; the projection as a bare
small number under the points. No team labels over the lineups: the face-off above names both teams.
**Names on phones:** designed for 360 px, checked at 320, 360, 390 and 430 before shipping; team and
player names and stat lines wrap (up to two lines) and are never cut with "…": a screen that only
works by cutting gets its design looked at again instead (review, 17 Oct 2026); Standings puts the full table (W-L-T, Pct, GB, Div, All-play, PF, Avg PF, PA, Avg
PA, Strk) with the Playoff picture below it, full width, seeds and the hunt list side by side; Power is one full-width table (rank, team, power with its bar, then every Power Rank figure as a column, no click) with the position chart below it, each segment labelled with its points.
- **Scores** (first: the most used page in season): a week picker (‹ Week 5 ›, with Final, Live or
  the kickoff under it) and a card per matchup, the member's first, raised and opened by default to
  both lineups side by side (each starter's points and game state: Final, "Playing · Q3" in lime, or
  kickoff). Before kickoff a card shows each side's projection and the win bar; live,
  the scores (leader bright, trailer dimmed) and "3 to play · proj 112–98". **Season** swaps the
  cards for the member's schedule (results, then opponents; weeks 15–17 playoffs) and hides the
  week picker. Each team on a card shows its projection and win probability ("proj 112.3 · 74% to
  win") before and during games; the footer, players playing / to play and minutes left per side;
  the open lineups, each starter's live stat line and projection. From `liveScoring` with DETAILS
  (team and player scores, game seconds left, playing / to play, stat lines; refreshed every 30–60 s
  during games only), `projectedScores` (FantasySharks-based) and `schedule`; win probability from
  MFL's own `mfl_win_prob.js` (400 simulations of the remaining games from projected stats), run on
  the same data so it matches MFL's page.
- **Standings:** West and East (W-L-T, PF, games back, streak; on phones a long team name wraps to
  two lines, its numbers on the first) from `leagueStandings`, the member's
  row highlighted; then the **Playoff picture**, "if the season ended today": 6 teams (MFL's bracket:
  starting week 15, two first-round games). **League rule: the division winners are seeds 1–2, with
  byes; the other four are the best all-play records, ties broken by standings order: one league-wide
order by the league's standings sort (`standingsSort`: win %, points for, head-to-head, division
win %, points against, power rank, …), even across divisions.** Seeds show
  why ("West winner", "24-11-1 all-play"); "In the hunt" lists the rest with all-play games back of
  seed 6. No link to MFL's bracket page (before the playoffs it can't know the league's seeding
rule), and no bracket: once the playoffs start the panel becomes "Playoff seeds", the final six with
their reasons and no hunt list, while Scores carries the playoff games.
- **Power:** MFL's power rankings (score, bar, all-play record; on phones the record sits on the
  grey line under the name, so the name has the full width), read from MFL's Power Rank page
  (`options?O=101`) since no export has them, cached until the next results; on phones, tapping a team shows
  what that page lists for it (points for and possible, efficiency, bench points, high and low score,
  all-play, coulda won / woulda lost, alternate rank), not a formula, which MFL doesn't show; then **Starter points
  by position**, a stacked bar per team (QB, RB, WR, TE, PK; its points for), open by default
  (collapsible on phones, always open on desktop). The data is in the home page's module as FusionCharts XML (`positionXML`); an export
  source is to find (`playerScores` by starter, summed, is the fallback). Position colors are the
  validated dark categorical slots (blue, orange, aqua, yellow, magenta).
- **Winners** (bylaws 1.6–1.8; designed phone and desktop, canvas row 7). First **Won so far**
  (what changes weekly), "if the season ended today": a row per team, sorted by total, with weeks
  won, weekly $, all-play record, all-play $ and the total (on phones, a grey line under the name
  carries the parts). Then **Playoff prizes**, also "if the season ended today": the math (the pot
  with its entries listed under it, minus weekly points, all 14 weeks × $15, known up front, minus
  all-play so far, leaving the amount for the playoffs) beside 1st 55%, 2nd 30%, 3rd 15%; one panel
  with two columns on desktop, stacked on phones. The pot is the league-wide (0000) entries in
  MFL's `accounting` export (entry fees in; site fee and recruiting bounties out), or 10 × the
  entry fee when there are none; the export is readable without logging in. Weekly winners come
  from the scores, not the accounting (which may lag); a tie splits the $15. All-play pays $0.75 ×
  (wins − losses), never below $0, and comes out of the pot before the playoff split, so the
  prizes shrink as the season goes on. No "still alive" marks in the playoffs. Once the playoffs
  are over, each prize names its winner ("1st · 55% · Smooth City Styles! · $329.91") and counts
  in the team's total, a Playoffs column on desktop and the grey line on phones (review, 17 Oct
  2026).
- **Before the season** (a phase Tweak on row 7; review, 17 Oct 2026): the new site has no games
  until week 1, so Scores shows week 1's matchups and kickoffs once MFL's schedule is set (until
  then the week picker's "Week 1 · Thu Sep 10"), with no scores, projections or lineups; Standings,
  Power and Winners show last season's final from the previous season's site (MFL keeps it), headed
  "West · 2026 final", "Power rankings · 2026 final", "2026 payouts", "2026 playoff prizes", the
  playoff panel as "2026 playoff seeds" with no hunt list and no "If the season ended today".

## Chores: automating commissioner work

Added to the daily job, which already logs in as commissioner. MFL's import API lets the
commissioner write:
- `salaryAdj` for salary adjustments
- `salaries` for salaries and contract years (`APPEND=1`)
- `fcfsWaiver` with `FRANCHISE_ID` for add/drop moves on a team's behalf
- `accounting` (`FRANCHISE`, `AMOUNT`, `DESCRIPTION`) for money records

Candidates:
1. **Prize accounting records** (noted 2026-10-11): the job adds an `accounting` record to a
   team when it wins something, using the same rules as League › Winners (bylaws 1.6–1.8):
   "Most Points Week N" ($15, split on a tie) once a week's scores are final; the all-play payout
   ($0.75 × (wins − losses), never below $0) once the regular season ends; 1st/2nd/3rd (55/30/15%
   of the pot left after both) once the playoffs end. The commissioner's own format is the model
   (league-wide 0000 entries for the pot, "Most Points Week 1" on the team). It checks the
   existing entries first so a record is never added twice, and leaves alone weeks the
   commissioner already entered by hand.
2. **Message board posts** of what the bot did: off for now, and the commissioner may turn them on
   after seeing the log.

Dropped: a **Commish-tab chores queue** for flags. Flags are rare (12 contract-year flags in eight
backtested seasons), the failed-run email links to the run's summary page listing them, and the
commissioner hopes not to need the tab once the bot runs smoothly. The Commish tab stays as it is,
the manual fallback for held and flagged cases, rookie and RFA contracts, and outages; whether to
slim or retire it is decided after a season with the chores on `apply`.

Deferred: the **season rollover** (decrement every contract year by 1; players going from 1 to 0
years, the new RFAs, get $0.01, since MFL won't allow $0 and $0.01 shows as $0 on the roster report).
It's once a year and part of the commissioner's routine when creating the new site, so automating it
saves little.

## Optional, later

- A small public league-history site (records, champions, bylaws), only after v2 is the default.
- **Optimal lineup in Scores** (after the build; the commissioner, 18 Oct 2026): what each team's
  best lineup would have scored, as MFL's live scoring page offers. For finished weeks
  `weeklyResults` already has each team's `optimal` starters and `opt_pts`.

## Reference: bylaws v2 relies on

Each moves into master's `docs/design.md` (League rules the code relies on) with the step that
enforces it. MFL's own details are in master's `docs/mfl.md`.

**Bylaws** (`options?L=48571&O=26`) the redesign relies on: roster 23–30 from the final cut-down
date to season's end, none in the offseason (2.4–2.5); violations voided by the commissioner (2.6,
with exceptions); bids that could exceed the cap void all that owner's bids (5.5); free agent pickups
cost $1 (5.7); trades 10.1–10.5 (above); IR doesn't count toward the roster limit (11.2); tanking
includes byes (13.2); playoff seeding (League, above); rookie draft order (8.1–8.2, Rosters above).
