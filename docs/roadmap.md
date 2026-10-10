# Roadmap

**League:** 48571 (contract dynasty) on MyFantasyLeague · **As of:** 10 Oct 2026

What comes next and what's waiting on the commissioner. What's live, why it works that way, the
league rules and MFL's quirks are on master: `README.md`, `docs/design.md`, `docs/mfl.md`.

## Commissioner to-do

- Drop penalties and contract years have been on `apply` since 8 Oct: keep an eye on the chore log.
- Save two MFL pages for the v2 design (view source, logged in), when the chance comes up:
  - Add/Drop between Sunday noon and Wednesday night CT, when every free agent is on waivers: whether
    the page behaves as it does while the free agent window is open
  - the chat page (`chat?L=48571&COUNT=40`): its layout at phone width, and that it hides other
    teams' private messages
- Consider telling the league: in v1 today, reordering blind bids (MFL's Move Up/Down) doesn't
  reorder the group's comment, so bare lengths ("1 year", one per line) end up on the wrong players.
  Naming the player ("Akins: 1 year") is safe.
- At renewal (mid-March 2027 or later): confirm the job follows the new site, and look at League
  Alerts once for preseason noise.

## v2: the redesign

A new look and simpler navigation for the whole league site, not incremental fixes to v1. The
designs are on the canvas (claude.ai artifact "FUAD League Redesign", rows 4 and 5), and keep
evolving there before they're built.

### Rollout

1. **v1 stays the default.** v2 is built in `site/v2/` (starting as a copy of v1) and offered with
   the beta toggle; a member who turns it on keeps it until they leave the beta. Feedback comes
   through the beta's feedback thread. At first the offer is limited to the commissioner's own
   team (`teams: ["0001"]`), so v2 is tried as a member; logged in as commissioner (0000) the site
   stays v1. The offer widens to the league once v2 is ready for members.
   **The commissioner's experience in v2 is designed later:** Moves and the rest are designed for
   members.
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
- **One menu on every page:** Home · Lineup · Moves · League · Contracts. Bottom tabs on phones, a top
  bar on desktop. MFL's menus move under More, so every MFL page stays reachable: "nothing gets
  hidden" becomes "nothing becomes unreachable".
- **MFL's pages are restyled, not rebuilt,** by v2's stylesheet. Lineup, trades and IR stay MFL's
  pages. **Risk:** this styles MFL's markup; if MFL changes it, the look degrades but MFL's controls
  still work.
- **Rebuilt:** Contracts, Moves, and Home.

### Contracts

- **The cap ledger:** every team's cap room for this season and the next four, sorted by room now.
  Room is $300 less salaries and cap penalties; penalties count this season only. Orange under $10.
- **Open a team** to see its players grouped by position (QB, RB, WR, TE, PK; then salary, then years
  left), each salary across the seasons it covers, and the team's penalties this season.
- **Cutting a player:** the penalty, then cap room now → after (green if higher, red if lower). On a
  phone, tapping a player opens it as a panel.
- **Still to design:** the Expiring, All players and Draft views. Draft holds the rookie scale,
  franchise tags and the cut calculator.

### Moves

The menu's Moves is MFL's Add/Drop page (`add_drop`) with v2's own controls, which fill in MFL's real
forms:
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
  import. A member can't set contract years directly: MFL's `salaries` import is commissioner-only,
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
  (Contracts talks in room).
- **Projected roster** (30 → 31), only when a claim has no drop; red past 30.
- **Max cap impact** on each group, and each claim's impact under its bid: −$2 red, +$1 green, $0
  white.
- **Current bids invalid** as the warning when either limit could break; the red number says which.
- **Over the max:** "with your other groups' max bids, $9 would exceed the cap", beside "max $8".

Enforcement, in layers: the controls stop a bad bid at the moment it's made; League Alerts warns about
the member's own pending bids before Wednesday night (for bids made anywhere, including MFL's own
pages, the classic site and MFL's app, which our controls can't reach); the daily job and the
commissioner void over-cap moves after waivers run, as today.

### Trades (to design)

Same principle as Moves: MFL's trade pages, restyled, with v2 controls that block a proposal or an
acceptance that would put a team over the cap or 30 active, counting the member's own pending bids.
A member can see only their own pending bids (`pendingWaivers` is per owner), so the proposer's side
is checked when proposing and the other team's side when they respond. Needs saved trade pages
(propose, respond) to see MFL's forms.

### Home

- **League chat** from MFL's chat page (about 40 messages, the whole season, live), in a scrolling
  panel; the fallback is MFL's chat module, which holds only the latest few, restyled.
- **Still to design:** the rest of Home: the member's cap and roster status, League Alerts, the
  week's matchup, recent league moves.

## Chores: automating commissioner work

Added to the daily job, which already logs in as commissioner. MFL's import API lets the
commissioner write:
- `salaryAdj` for salary adjustments
- `salaries` for salaries and contract years (`APPEND=1`)
- `fcfsWaiver` with `FRANCHISE_ID` for add/drop moves on a team's behalf

Candidates:
1. **Message board posts** of what the bot did: off for now, and the commissioner may turn them on
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

From pages the commissioner saved on 10 Oct 2026 (2026 site, logged in). Moves into master's
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

**Chat:** the Main tab module `#league_chat` is drawn by `mfl_common.js`, which polls
`fflnetdynamic2026/48571_chat.xml` every 5 seconds (it stops after about 2 hours without posting)
and keeps `displayMessages + 1` rows (`displayMessages = 9` on the page). The feed holds only recent
messages, private ones included (MFL hides them in the browser). The chat page
`chat?L=48571&COUNT=40` holds about a season.

**API (api_info):** `blindBidWaiverRequest` takes `PICKS` (`ADD_BID_DROP`, ...) and `ROUND` but no
comment; `messageBoard` (import) lets an owner post (`THREAD` + `BODY`, or `SUBJECT` + `BODY`);
`salaries` (import) needs the commissioner's cookie.

**League settings (`export?TYPE=league`):** `bbidConditional=Yes`, `maxWaiverRounds=8`,
`bbidMinimum=1`, `bbidIncrement=1`, `bbidSeasonLimit=999999`, `currentWaiverType=BBID_FCFS`,
`includeIRWithSalary=100`, `salaryCapAmount=300` (soft), `rosterSize=80`.
