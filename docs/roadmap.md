# Roadmap

**League:** 48571 (contract dynasty) on MyFantasyLeague · **As of:** 4 Oct 2026

What comes next and what's waiting on the commissioner. What's live, why it works that way, the
league rules and MFL's quirks are on master: `README.md`, `docs/design.md`, `docs/mfl.md`.

## Commissioner to-do

- Before switching `CONTRACT_YEARS` to `apply`: post a message board topic telling the league what
  the bot does and how to work with it, with the recommended formats (also shown in League Alerts;
  the reader understands more, but only these are advertised):
  - message board post: the player's name and length, one player per line (`Hill: 3 years`); a last
    name is enough unless two players you just added share it
  - blind bid comment: one length per line, in the order of the players in the bid (`1 year`,
    `2 years`, `3 years`); update the comment if you change the bid
- Watch the dry-run lines, clear any 0-year backlog, then set `DROP_PENALTIES` and `CONTRACT_YEARS`
  to `apply`. The first apply runs are the first real MFL writes: check the chore log.
- At renewal (mid-March 2027 or later): confirm the job follows the new site, and look at League
  Alerts once for preseason noise.

## Next versions

Each is built in a new `site/vN/` (a copy of the current one), checked with master's
`tools/verify/verify.py`, offered as a beta (the commissioner first, then everyone) and activated by
editing the header message. A new version's `lib/` must keep what the daily job reads: `capTotal`,
`unchargedPenalty`, `penaltyCharged`, `pendingDroppedPlayers`, `numPlayers`, `irPlayers`,
`injuryStatus`, `injuryReportKnown`, and the `violations.js`, `adds.js` and `contract-years.js`
exports. The order isn't decided; A and C change what members see, so their feedback comes through
the beta's feedback thread.

### A. "My Team" Contracts

- Open with the viewer's franchise, which MFL's `franchise_id` identifies:
  - cap space against $300
  - roster count against 23–30
  - expiring contracts
  - what cutting each player costs
- Cards on phones, a table on desktop, from the same data.
- Contract state as badges (*RFA*, *Expiring*, *Signed thru 2028*) instead of "Years: 0".
- The full league roster one tap away. Reference tables (rookie salaries, franchise salaries,
  calculator) below the member's own view.
- Fixes the Contracts tab's length: about 18 phone screens today.
- Shipped as a beta for member feedback.

### C. League-wide look

- The commissioner dislikes all of MFL's stock skins.
- Our own stylesheet in `fuad.css`, which loads on every league page and outranks the skin: type,
  color, spacing, tables and module headers.
- Calmer desktop navigation: MFL's dropdown recedes, the nav bar reads as the main menu, and our tabs
  read as the league's own section. **Nothing gets hidden.**
- Best after A, so A sets the visual language. Until then, desktop shows three navigation rows.
- **Risk:** this styles MFL's markup (`#hsubmenu`, `.homepagemodule`, `.report`). If MFL changes it,
  the look degrades but nothing breaks.

### Chores: automating commissioner work

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

### Optional, later

A small public league-history site (records, champions, bylaws), only after A and C.
