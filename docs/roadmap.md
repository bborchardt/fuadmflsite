# Roadmap

**League:** 48571 (contract dynasty) on MyFantasyLeague · **As of:** 10 Oct 2026

What comes next and what's waiting on the commissioner. What's live, why it works that way, the
league rules and MFL's quirks are on master: `README.md`, `docs/design.md`, `docs/mfl.md`.

## Commissioner to-do

- Save MFL pages for the v2 design (view source, logged in), when the chance comes up:
  - Add/Drop between Sunday noon and Wednesday night CT, when every free agent is on waivers: whether
    the page behaves as it does while the free agent window is open
- Update bylaw 8.3 to the new rookie salary rule (fixed first-pick baselines, ×0.8 per pick), which
  applies from the 2027 draft; it still describes the old baselines from last year's salaries.
- Consider telling the league: in v1 today, reordering blind bids (MFL's Move Up/Down) doesn't
  reorder the group's comment, so bare lengths ("1 year", one per line) end up on the wrong players.
  Naming the player ("Akins: 1 year") is safe.
- At renewal (mid-March 2027 or later): confirm the job follows the new site, and look at League
  Alerts once for preseason noise.

## v2: the redesign

A new look and simpler navigation for the whole league site, not incremental fixes to v1. The
designs are on the canvas (claude.ai artifact "FUAD League Redesign", rows 4 and 5), and keep
evolving there before they're built.

### Open design to-dos (noted 2026-10-11)

1. **Leaving the beta the way you joined.** The beta toggle opts a member in from League alerts,
   but going back means opening the team sheet (the username button) and finding "Use the classic
   site". Leaving should work the same way as joining: a toggle in the same place.
2. **Where MFL's full menu lives.** Today "All MFL pages" sits in the team sheet behind the
   username/team button; a site menu behind a person's name isn't where members expect it from
   other apps. Revisit its home (and what else belongs in the team sheet) before building.

### Rollout

1. **v1 stays the default.** v2 is built in `site/v2/` (starting as a copy of v1) and offered with
   the beta toggle; a member who turns it on keeps it until they leave the beta. Feedback comes
   through the beta's feedback thread. At first the offer is limited to the commissioner's own
   team (`teams: ["0001"]`), so v2 is tried as a member; logged in as commissioner (0000) the site
   stays v1. The offer widens to the league only once v2 is fully built.
   **The commissioner's experience in v2 is designed later:** Moves and the rest are designed for
   members.
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

### Look and navigation

- **Night Game:** dark, app-like. Barlow and Barlow Condensed, a lime accent, orange for tight cap,
  green and red for cap room gained and lost.
- **Five sections on every page:** Home · Lineup · Moves · League · Rosters. Bottom tabs on phones, a
  top bar on desktop. A section's views sit in a row across the top (a segmented control; a row of
  chips that scrolls sideways if more than about four), on rebuilt and MFL pages alike.
- **No page titles:** the lit section already says where you are. Phones show the FUAD wordmark with a
  context line ("Week 5") and the team button; desktop shows only the top bar. (The live frame's phone
  title, `.fuad-title`, goes when v2 is built.)
- **The team button** (top right, the team's initials) opens a sheet with everything else, so
  "nothing gets hidden" becomes "nothing becomes unreachable" (below).
- **MFL's pages are restyled, not rebuilt,** by v2's stylesheet: Lineup, Trades, IR, Recent and the
  fallback pages. **Risk:** this styles MFL's markup; if MFL changes it, the look degrades but MFL's
  controls still work.
- **A player popup everywhere:** every player name opens it in one click, so a member can research
  a player where they're deciding on him. MFL's own (`launch_player_modal`) is desktop markup that
  doesn't fit a phone (values cut off, the stats table far too wide) and leads with the biography,
  so v2 draws its own from exports (designed, canvas row 11): name, position, NFL team and number;
  injury status and expected return (`injuries`); owner, salary, years, bye; the actions that fit
  (yours: drop and IR, with the cut's effect above them, "Cut now: $28 penalty · cap used $293 → $253"; another team's: propose a trade; a free agent: add); the
  latest news headlines (`playerProfile`, which gives each article's ID), each opening in place
  to its source and time, update and analysis, read from MFL's article page
  (`view_news_article?L=…&ID=…`) when opened, the newest open at first; "More news on MFL" links
  to his 7-day news (`news_articles?L=…&PLAYERS=…&DAYS=7`); this season by week with opponent
  and points (`playerScores` per week, `nflSchedule`); the biography last (`players` DETAILS=1).
  A bottom sheet on phones, a two-column dialog on desktop.
- **Rebuilt:** Home, League, Rosters and Moves › Add/Drop. Home, League and Rosters live on MFL's home
  page (`home/48571`), so moving between them doesn't reload.
- **Owners' customizations don't reach v2.** Each owner can choose their own MFL skin (63 of them;
  the league's is only the default) and their own home page tabs and the modules in them. v2's
  stylesheet sets every background, border and shadow outright (checked against all 63 skins), and
  the rebuilt pages draw into v2's own area on the home page, hide MFL's tab contents, take their
  data from exports, and mark their views in the URL themselves (e.g. `#league-standings`), not by
  MFL's tab positions. Until then the frame's Home, League › Standings and Rosters › All players
  links open home page tabs by position, which can be wrong for an owner whose tabs differ.

The map:

| Section | Views |
|---|---|
| **Home** | one page: My alerts, League alerts, Chat, Message board, Recent moves (undecided), Coming up |
| **Lineup** | one page: MFL's lineup, restyled, with warnings |
| **Moves** | Add/Drop · Trades · IR · Recent |
| **League** | Scores · Standings · Power · Winners |
| **Rosters** | My team · Teams · Players · Draft |

**The team sheet** (slides up on phones, a panel on desktop):
- **Header:** the team's name, My team, Log in / Log out, and for the commissioner a "Viewing as:
  Member | Commissioner" switch that uses MFL's own switch link, found in MFL's header.
- **League:** pages no section covers: League bylaws, Scoring system, League history, Player stats,
  Playoff bracket, Calendar, Accounting, Owner activity, Polls.
- **Commish** (0000 only): today's tools (Commish tab, Cap penalties, Set contracts) until the
  commissioner's v2 is designed.
- **All MFL pages:** MFL's own league menu, read live from the page in its groups, with a filter box.
- **Use the classic site:** the way back to v1.

Left to the sheet or dropped from the home page: the Transactions tab (Trade Bait, Top 10 Free
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

Rules for v2:
- **Readable within 1.5 s** for a returning member on a mid-range phone, checked against this
  baseline.
- **Each page fetches only what it shows,** in parallel.
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
Room after cut), then NFL, Bye, Pts, and this season's penalties as the last group (who, the amount
under Salary, then when cut and the terms); no clicks: the
name opens MFL's player details in one click, and dropping is done in Moves; then two panels, one
per draft year, listing each round's pick (2027 numbered where today's order decides it, "from …"
in orange, "Traded to …" greyed). Teams is the ledger as a table, in cap used like My team (used now
with a bar; next year's picks held, "8 · 3 1sts", "4 · no 1st", plain 5 greyed; used each later
season; roster count; least used first). A team opens in My team's layout with "Propose a trade",
its table built for spotting trade targets: Player, Salary, Years, NFL, Bye, Pts (no cut columns). Every Rosters table puts the contract beside the name.
Players is every rostered player in one table (Player, then the
contract, Salary and Years, beside the name; then Pos, NFL, Bye, Pts, and the owning team last, in
plain grey so it doesn't read as a second name column) under the filter chips, in a scroll box, salary first; clicking Player,
Bye, Pts, Salary or Years sorts by it (again to reverse); names open the player popup. Draft on desktop: every panel full width, so none sits beside one of a different height: franchise
tags (five tiles across; clicking one shows its top 5 as five cells across, name over salary); the 2027 draft order as ten tiles across (number, team, record, traded
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
  salary, years left (orange "expiring" at 1), NFL team, bye (`nflByeWeeks`) and YTD points
  (`playerScores` `W=YTD`), and an IR tag. Tapping a player opens the player popup, as on
  desktop (no cut panel); for the member's own players the popup shows what cutting costs ("Cut
  now: $28 penalty · cap used $293 → $253") beside Drop (to Moves › Add/Drop) and IR. Then the team's draft picks, a list per year like desktop's (each round's pick, 2027 numbered where today's order decides it, "from …" and "Traded to …"), from `futureDraftPicks`.
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
- **Draft:** franchise tags for next season (each position's tag, expanding to the top 5 salaries it
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
     TE $3 · PK $1", or "$1 at every position" from pick 11 on; the scale counts overall picks across the whole draft, not per round; "from …" for traded ones), then the
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

Views: **Add/Drop · Trades · IR · Recent.**
- **Trades:** below.
- **IR** (designed, phone: the canvas's row 10): "Can go on IR" lists the member's active players the
  NFL lists on IR (injury, expected return; injuries export), "On your IR" the rest, each with a
  checkbox (Move to IR, Activate). When activating would make 31 active, "Pick a drop" lists all 30
  active players in a box that scrolls inside itself, lowest penalty first, each with its penalty and
  net room change. A bar shows active and cap used live and blocks over 30 active or a drop whose
  penalty breaks the cap; Save is MFL's one submit (`ir`: deactivate, activate and drop together). A
  player the NFL no longer lists on IR "must come off IR" (bylaw 11.1): a notice, preselected, and
  saving blocked until he's activated. MFL itself refuses players the NFL doesn't list on IR.
- **Recent:** MFL's transactions page (`options?O=03`), restyled, with the processed blind bids
  (`processed_waivers`: who won and lost, and for how much).

**Add/Drop** is MFL's Add/Drop page (`add_drop`) with v2's own controls, which fill in MFL's real
forms. Free agents are scouted on Rosters › Players (with the Mine + Free agents
chips), which works before the draft too; Add/Drop is where the move is made.
- **Adding:** they read MFL's player lists (`playerDatabaseObj`), select through MFL's own picker
  rows, and fill `BBID_AMT`, `ROUND` and `COMMENTS`; MFL's Submit does the rest, so MFL's rules still
  apply. Submit stays off until MFL's hidden `add_pid`/`drop_pid` and its "To Add"/"To Drop" lines
  match the choice.
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

The design (settled for now; the canvas's row 5 is the reference):
- **Free agents** sorted by this week's projection (MFL's WProj), with team, opponent and bye week.
- **Drops** grouped by position with the cut penalty and cap freed, and a **No drop** row first, which
  says why it's off when it is ("roster full (30)", "could make 31 active", "over cap"). Drops that
  would break the cap are greyed out ("over cap"); one already used in another group is allowed and
  noted.
- **A contract length picker (1–5 years)** on every add. A bid writes it as a named comment line; a
  free agent add offers a one-tap post ("Higbee: 2 years") to the board through MFL's `messageBoard`
  import. Each length shows its cut penalty ("Cut later: $10"). A member can't set contract years
  directly: MFL's `salaries` import is commissioner-only,
  so the job sets them, and the post is the league's public record.
- **Blind bid groups (conditional bidding):** each group wins at most one claim, independently of the
  others. A claim's cap impact is what its drop frees less its bid; a group's max cap impact is its
  most negative claim, or $0 if all its claims free room. The bid is
  capped so that, with the other groups' max bids, the cap holds.
- **Roster:** at 30 active a claim needs a drop. Below 30, a no-drop claim is allowed while active
  players plus the groups holding a no-drop claim stay at 30 or under.
- **Managing claims:** reorder with arrows; tap a claim to edit its bid or drop (the player added is
  fixed: MFL's edit page can't change it), remove it, or copy it to another group. Every action is
  checked against both limits first. Back returns to where the member came from.
- **One page in both periods.** A banner says which (free agent window open until Sunday noon CT,
  blind bids only until Wednesday 11 p.m. CT), and pending bids always show. During the window a
  locked player is marked "bid only" and goes through the bid flow, where the member picks a group;
  MFL's "submit as a waiver claim" box isn't offered.
- **Prevent, don't warn.** League rule: a blind bid that could put a team over a limit is invalid and
  voided. So the controls block any move that would make pending bids able to break a limit: a bid
  over its max, an edit or copy, and an immediate free agent add, whose cap and roster checks include
  every pending group ("Blocked: with your pending bids, this add could exceed the salary cap").
- **Pending bids can still go bad outside our controls** (a trade, a penalty charged, a move on
  MFL's own pages): Moves re-checks them on every visit and shows "Current bids invalid".

Wording members see (no "worst case"):
- **Projected cap**, "If all high bids win": cap used out of $300, now → projected ($297 → $302), red
  past $300. Moves talks in cap used, so its totals can't be mistaken for the +/− changes beside them
  (Rosters talks in room).
- **Projected roster** (30 → 31), only when a claim has no drop; red past 30.
- **Max cap impact** on each group, and each claim's impact under its bid: −$2 red, +$1 green, $0
  white.
- **Current bids invalid** as the warning when either limit could break; the red number says which.
- **Over the max:** "with your other groups' max bids, $9 would exceed the cap", beside "max $8".

Enforcement, in layers: the controls stop a bad bid at the moment it's made; League Alerts warns about
the member's own pending bids before Wednesday night (for bids made anywhere, including MFL's own
pages, the classic site and MFL's app, which our controls can't reach); the daily job and the
commissioner void over-cap moves after waivers run, as today.

### Trades (Moves › Trades)

Designed (phone): the canvas's row 9. MFL's trade pages (Reference) drive it; v2's own screens fill
their forms.
- **The Trades view:** offers to the member (each with what moves, its effect on the member's cap and
  roster, and Accept / Counter / Reject with a comment), the member's own offers, and "Propose a
  trade" (each team with its cap room) with the trade deadline above it.
- **Proposing, in three steps, each with complete lists:** You give (the member's whole roster by
  position, IR tagged, then picks), You get (theirs), Review. A bar on every step shows the live effect
  on both teams (cap used, active), so a problem shows while picking.
- **What's blocked and what isn't (bylaws):** a trade that puts either team over the cap is void (10.3),
  so it's blocked. A trade may take a team over or under the roster limits (10.5): allowed, with a
  notice that the team must comply within 12 hours, before the next NFL game, or by the next blind-bid
  deadline, whichever comes first, and that MFL won't take its lineup until then (league setting). A
  trade that would let the member's pending bids exceed the cap gets a warning: those bids would be
  voided (5.5); lower them first. Only an owner sees their own pending bids, so the proposer's are
  checked when proposing and the other team's when answering.
- **Expiry:** MFL's date and hour, defaulting to the league's 7 days, with quick choices that fill it
  in (before Sunday's games, before Thursday's game, in 7 days); a note when it stays open through
  game time.
- **Near kickoff:** MFL refuses accepting a trade with a player whose game has started, until 4 hours
  after the week's last kickoff (league setting on); the offer card says so and when it reopens.
  Accepting shortly before a traded player's kickoff isn't against the rules, so v2 warns ("games
  start in 40 minutes; both lineups need fixing"); a block would need a new bylaw.
- **Deadline (10.1):** the kickoff of week 12's first game (2026: Wed Nov 25, 7:00 p.m. CT); proposing
  closes after it until the offseason. Picks tradable for the next two drafts, rounds 1–5.

### Lineup

MFL's lineup page, restyled, no views. Warnings, not blocks (injury statuses change up to kickoff,
and MFL's report can lag): a starter who is injured (IR or Out), suspended, or on a bye, named with
the rule (bylaw 13.2: such a loss doesn't count toward draft order; its exceptions noted), or an empty
slot. (v1 doesn't flag byes; v1 gets no more fixes, so this comes with v2.) Players whose game has started show
MFL's lock clearly.

### Home

Rebuilt, one page, top to bottom (on desktop, the canvas's row 6: My alerts, League alerts and the
Message board on the left; Chat, Recent moves and Coming up on the right, so a quiet alerts week
doesn't leave the left column short):
1. **My alerts:** the member's own, each one tappable to the page that fixes it; a quiet "All clear"
   when empty.
2. **League alerts:** every other team's (tap: that team in Rosters › Teams).
3. **Chat:** compact: grows to about four messages, then scrolls inside itself, newest at the bottom
   by the box, opened scrolled to the newest; one line when empty ("No messages yet. Say something to
   the league."). A "To" picker sends to everyone or privately to one team; private messages carry a
   lock tag ("to you", "to The Obliterators"). Reads MFL's chat feed and posts through `chat_save`
   (Reference). The league barely uses chat (3 messages this season, all private).
4. **Message board:** the newest topics, linking to MFL's board, and "New topic" (subject and
   message, posted with MFL's `messageBoard` import); replies on the topic's own page.
5. **Recent moves:** the last five, linking to Moves › Recent. **Undecided:** the commissioner
   decides after seeing a mockup.
6. **Coming up:** the next two or three one-off league dates (trade deadline, playoffs, rookie
   draft), from MFL's `calendar` export, routine weekly events left out; links to MFL's calendar. In
   the last few days before one, it shows in My alerts instead.

No playoff bracket panel: League › Scores shows the playoff games.

My alerts and where they go:

| Alert | Tap |
|---|---|
| Starter injured (IR or Out), suspended, on a bye or with no game; empty slot | Lineup |
| Under 23 active | Moves › Add/Drop |
| Current bids invalid (a pending bid could break a limit) | Moves › Add/Drop |
| Bid deadline, when the member has pending bids (Wed 11 p.m. CT) | Moves › Add/Drop |
| Contract length still to post for a free agent add | Moves › Add/Drop (the one-tap post) |
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
position), so the points meet at the center; then "Show bench" (off by default on both, the bench listed highest-scoring first; the export includes
non-starters). No link to MFL's live scoring page; it stays reachable from the team sheet. Phones
use the same tug of war, smaller (names cut short, scores at 30 px, the bar across, and playing / to
play / minutes as one small line per side), and a card opens in place; its lineups stay side by side:
ten starters a side (QB 1–2, RB 1–3, WR 2–5, TE 1–3, PK 1; league `starters`), each side in position
order and paired by order, since flex spots let the two teams' shapes differ. Players as
"R. Stevenson" (first initial, last name; full names on desktop), with a grey line under each that
leads with the position ("QB · Final · 21/30, 248 yds, 2 TD") and wraps; the projection as a bare
small number under the points. No team labels over the lineups: the face-off above names both teams.
**Names on phones:** designed for 360 px, checked at 320, 360, 390 and 430 before shipping; team and
player names wrap (up to two lines) where they identify something, and are cut with "…" only in
dense tables whose row opens the full name; Standings puts the full table (W-L-T, Pct, GB, Div, All-play, PF, Avg PF, PA, Avg
PA, Strk) with the Playoff picture below it, full width, seeds and the hunt list side by side; Power is one full-width table (rank, team, power with its bar, then every Power Rank figure as a column, no click) with the position chart below it, each segment labelled with its points.
- **Scores** (first: the most used page in season): a week picker (‹ Week 5 ›, with Final, Live or
  the kickoff under it) and a card per matchup, the member's first, raised and opened by default to
  both lineups side by side (each starter's points and game state: Final, "Playing · Q3" in lime, or
  kickoff), with "Full live scoring" to MFL's `ajax_ls`. Before kickoff a card shows the spread; live,
  the scores (leader bright, trailer dimmed) and "3 to play · proj 112–98". **Season** swaps the
  cards for the member's schedule (results, then opponents; weeks 15–17 playoffs) and hides the
  week picker. Each team on a card shows its projection and win probability ("proj 112.3 · 74% to
  win") before and during games; the footer, players playing / to play and minutes left per side;
  the open lineups, each starter's live stat line and projection. From `liveScoring` with DETAILS
  (team and player scores, game seconds left, playing / to play, stat lines; refreshed every 30–60 s
  during games only), `projectedScores` (FantasySharks-based) and `schedule`; win probability from
  MFL's own `mfl_win_prob.js` (400 simulations of the remaining games from projected stats), run on
  the same data so it matches MFL's page.
- **Standings:** West and East (W-L-T, PF, games back, streak) from `leagueStandings`, the member's
  row highlighted; then the **Playoff picture**, "if the season ended today": 6 teams (MFL's bracket:
  starting week 15, two first-round games). **League rule: the division winners are seeds 1–2, with
  byes; the other four are the best all-play records, ties broken by standings order: one league-wide
order by the league's standings sort (`standingsSort`: win %, points for, head-to-head, division
win %, points against, power rank, …), even across divisions.** Seeds show
  why ("West winner", "24-11-1 all-play"); "In the hunt" lists the rest with all-play games back of
  seed 6. No link to MFL's bracket page (before the playoffs it can't know the league's seeding
rule), and no bracket: once the playoffs start the panel becomes "Playoff seeds", the final six with
their reasons and no hunt list, while Scores carries the playoff games.
- **Power:** MFL's power rankings (score, bar, all-play record), read from MFL's Power Rank page
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
  prizes shrink as the season goes on. No "still alive" marks in the playoffs.

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

A small public league-history site (records, champions, bylaws), only after v2 is the default.

## Reference: MFL details gathered for v2

From pages the commissioner saved on 10 Oct 2026 (2026 site, logged in as 0001). Moves into master's
`docs/mfl.md` when v2 starts; the saved pages themselves aren't kept.

**Add/Drop (`add_drop?L=48571`)**, one form posted to `add_drop`:
- Fields: `L`, `add_pid` and `drop_pid` (hidden, `#add_pid_field_id`, `#drop_pid_field_id`),
  `FORCE_WAIVER` (checkbox), `BBID_AMT`, `ROUND` (a select of existing groups plus the next),
  `COMMENTS` (textarea), `SUBMIT` (`#add_drop_submit`; its label is "Perform Add/Drop" or "Submit
  Request"), plus `add_settings` and `PROJSRC`.
- Player lists are JavaScript data: `playerDatabaseObj["add"]` and `["drop"]`, arrays of `Player2`
  (`id, name, nfl_team, pos, bye_week, sal, inj, roster, pts, opp, pwpts, sort_sal`). `pts` is points
  scored so far, `pwpts` this week's projection. Names carry flags: `*` dropped recently, `!` game
  started, `(R)` rookie.
- MFL's `picker.js` draws the rows (`tr#add_<id>`, `tr#drop_<id>`); a click fills the hidden id and the
  "To Add"/"To Drop" cells (`#add_name_field_id`, `#drop_name_field_id`), then
  `picker_locked_check(...)` shows or hides the bid, group and comment rows (`#amt_field_id`,
  `#round_field_id`, `#comments_field_id`) and the `FORCE_WAIVER` row.
- After a submit MFL shows Add/Drop again, with no message; the claim appears in
  `#waiver_request_list`.
- Claims table (`#waiver_request_list`): Group, Add, Drop, Bid Amount, Action, Time Entered, Comments
  (one cell per group). Action links, with a claim written `ROUND_ADDID_BID_DROPID`:
  `add_drop?L=48571&F=0001&MOVE_UP=1_13308_1_16152`, `MOVE_DOWN=...`, `DELETE=...`,
  `COPY_ROUND=1_13753_1_16619_2` (the last part is the target group), and Edit:
  `options?L=48571&O=255&F=0001&ROUND=1`.

**Edit a group (`options?O=255&ROUND=n`)**, one form posted to `options`: `form_name=editwr`,
`LEAGUE_ID`, `O=255`, `ROUND`; per claim `amount_<i>` and `drop_<i>` (a select of the roster plus
"None"); `applyall` (checkbox); `comment` (the group's one comment); `SAVE` / `CANCEL`.

**`export?TYPE=pendingWaivers&L=48571&JSON=1`** (the logged-in owner's own claims):
`{"pendingWaivers":{"blindBidWaiverRequest":{"round":"1","addsDrops":"13753_1_16619,13308_1_16152",
"comments":"1 yearbr/2 years","timestamp":"..."}}}`: one entry per group (an object when there's
one, presumably an array when more), claims in priority order as `ADD_BID_DROP`, and the comment
with line breaks mangled to `br/`.

**Chat:** the Main tab module `#league_chat` and the chat page (`chat?L=48571&COUNT=40`) are both
drawn by `mfl_common.js` from one feed, `fflnetdynamic2026/48571_chat.xml`, polled every 5 seconds
(stopping after about 2 hours without posting); they differ only in `displayMessages` (9 or 40).
The feed's `<message>` elements carry `id`, `franchise_id` (sender), `to` (a team, for a private
message), `message` and `posted`; it holds the season's messages until someone posts `:clear:`.
**Private messages are in the public feed**: MFL's script just skips those not to or from the
viewer, so v2 must apply the same filter. Posting is a GET from the logged-in browser:
`chat_save?L=48571&MESSAGE=<escaped text>&TO_FID=<team, or empty for everyone>`.

**API (api_info):** `blindBidWaiverRequest` takes `PICKS` (`ADD_BID_DROP`, ...) and `ROUND` but no
comment; `messageBoard` (import) lets an owner post (`THREAD` + `BODY`, or `SUBJECT` + `BODY`);
`salaries` (import) needs the commissioner's cookie.

**IR (`options?L=48571&O=18`)**, one form posted to `ir`: `LEAGUE_ID`, `FRANCHISE_ID`; per player
checkboxes `deactivate<franchise>` (to IR), `activate<franchise>` (from IR) and `drop<franchise>`
(value: player id), all in one submit ("Perform Injured Reserve"), so an activation and a drop go
together. Two tables: "Select Players To Deactivate/Drop" (active players, with Starter?) and
"Select Players To Activate" (IR players). MFL itself refuses ineligible players ("Can not be
deactivated" instead of a checkbox) and marks players whose game has started "Locked".

**Trades (`options?L=48571&O=05`):** "Trades Offered By You", "Trades Offered To You", and a
"Select Franchise To Trade With" form (`options`, `OPTION=05`, `FRANCHISE` select) that opens the
proposal page.
- Propose: one form posted to `trade_offer`: `LEAGUE_ID`, `FRANCHISE_ID` (`0001,0002`: both teams),
  `input_expires`, checkboxes `drop<franchise>` per side whose value is a player id or a future pick
  (`FP_<owner>_<year>_<round>`, "Year 2027 Round 1 Draft Pick from …"), `TRADE_EXPIRES_MONTH`, `_DAY`,
  `_TIME`, `_YEAR`, `msg`, and `Propose` ("Propose Trade").
- Respond: per offer, a form posted to `trade_response`: `LEAGUE_ID`, `TRADE_ID`, radio `ACTION`
  (`accept`, `counter_proposal`, `reject`), `COMMENTS`, submit "Respond To Trade Offer" (off until a
  choice is made; accept asks to confirm). The offer row shows date, each side's players and picks,
  expiry, and "Compare Players".

**Commissioner switch:** MFL's menu has "Become Commissioner", `logout?L=48571&BECOME=0000`, when the
commissioner is logged in as a team; presumably `BECOME=<team>` the other way, not yet seen.

**Trades setup** (commissioner page, 2026): accepted trades process immediately; trades that create
invalid rosters go through, and that team can't submit a lineup until fixed; owners can't accept a
trade with a player whose game has kicked off until the week's games end (4 hours after the last
kickoff, per MFL's help); trade comments aren't shown to everyone; picks tradable 2 years out, rounds
1–5; no trading of blind-bid dollars; proposals expire after 7 days by default.

**Bylaws** (`options?L=48571&O=26`) the redesign relies on: roster 23–30 from the final cut-down
date to season's end, none in the offseason (2.4–2.5); violations voided by the commissioner (2.6,
with exceptions); bids that could exceed the cap void all that owner's bids (5.5); free agent pickups
cost $1 (5.7); trades 10.1–10.5 (above); IR doesn't count toward the roster limit (11.2); tanking
includes byes (13.2); playoff seeding (League, above); rookie draft order (8.1–8.2, Rosters above).

**League settings (`export?TYPE=league`):** `bbidConditional=Yes`, `maxWaiverRounds=8`,
`bbidMinimum=1`, `bbidIncrement=1`, `bbidSeasonLimit=999999`, `currentWaiverType=BBID_FCFS`,
`includeIRWithSalary=100`, `salaryCapAmount=300` (soft), `rosterSize=80`.
