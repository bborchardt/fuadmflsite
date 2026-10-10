# Roadmap

**League:** 48571 (contract dynasty) on MyFantasyLeague · **As of:** 10 Oct 2026

What comes next and what's waiting on the commissioner. What's live, why it works that way, the
league rules and MFL's quirks are on master: `README.md`, `docs/design.md`, `docs/mfl.md`.

## Commissioner to-do

- Drop penalties and contract years have been on `apply` since 8 Oct: keep an eye on the chore log.
- Save three MFL pages for the v2 design (view source, logged in), when the chance comes up:
  - Add/Drop with two or more blind bids in one group: what the claims table's Action column offers
    (remove, reorder)
  - Add/Drop when only blind bids are allowed: whether the page behaves as it does while the free
    agent window is open
  - the chat page (`chat?L=48571&COUNT=40`): its layout at phone width, and that it hides other
    teams' private messages
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

v2's own controls on MFL's Add/Drop page (`add_drop`), filling in MFL's real form:
- They read MFL's player lists (`playerDatabaseObj`), select through MFL's own picker rows, and fill
  `BBID_AMT`, `ROUND` and `COMMENTS`; MFL's Submit does the rest, so MFL's rules still apply.
- Submit stays off until MFL's hidden `add_pid`/`drop_pid` and its "To Add"/"To Drop" lines match the
  choice; afterwards the claims are read back from the `pendingWaivers` export.
- If anything they need is missing, they stand aside and the page is MFL's own, restyled.
- Not MFL's `blindBidWaiverRequest` import: it has no comment field, so contract lengths would be
  lost.

The design:
- **Free agents** sorted by this week's projection (MFL's WProj), with team, opponent and bye week.
- **Drops** grouped by position with the cut penalty and cap freed; drops that would break the cap
  are greyed out.
- **A contract length picker (1–5 years)** on every add. A bid writes it as the comment; a free agent
  add offers a one-tap post ("Higbee: 2 years") to the board through MFL's `messageBoard` import. A
  member can't set contract years directly: MFL's `salaries` import is commissioner-only, so the job
  sets them, and the post is the league's public record.
- **Blind bid groups (conditional bidding):** each group wins at most one claim, independently of the
  others. A group's worst-case impact is its costliest claim (the bid less what its drop frees; never
  below $0); worst-case room is the room less every group's impact. The bid is capped so the
  worst case stays under the cap. Claims can be reordered and removed within a group, through MFL's
  own controls (to be confirmed: see the to-do).

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
