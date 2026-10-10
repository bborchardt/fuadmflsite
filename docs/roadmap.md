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
   through the beta's feedback thread.
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
  most negative claim (never above $0 as a cost: a group that frees room counts as $0). The bid is
  capped so that, with the other groups' max bids, the cap holds.
- **Roster:** at 30 active a claim needs a drop. Below 30, a no-drop claim is allowed while active
  players plus the groups holding a no-drop claim stay at 30 or under.
- **Managing claims:** reorder with arrows; tap a claim to edit its bid or drop (the player added is
  fixed: MFL's edit page can't change it), remove it, or copy it to another group. Every action is
  checked against both limits first. Back returns to where the member came from.
- **Pending bids can go bad later** (a free agent add, a trade, a penalty charged): Moves re-checks
  them on every visit.

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
