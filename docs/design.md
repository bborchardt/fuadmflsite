# Design

Why the league site and the daily job work the way they do. MFL's own behavior is in
[mfl.md](mfl.md).

## Goals

- Works well in a **phone browser**; members can't be assumed to use an app.
- **One navigation layer:** v2's five sections (Home, Lineup, Moves, League, Rosters) replace the
  custom tabs rather than adding to them; whatever they leave out stays reachable from MFL's own
  menu, inside v2's site menu (☰). v1 keeps the custom tabs as members know them.
- Within **MFL's rules**.
- **As few chores as possible** for the commissioner, stable year to year.

## How it fits together

- **The code runs inside MFL's pages,** loaded by a home page message from GitHub Pages. MFL's data
  is only readable from its own pages, and running there means it sees the league as the viewer
  does.
- **One folder per version, pinned per season.** MFL keeps each season's site and copies the
  messages forward at renewal, so a past season keeps the version, and the rules, it was played
  under. Rule changes and visible redesigns get a new version; small fixes go in place. A version
  offered only as the beta changes in place, redesigns included: only its testers run it.
- **League rules live once, in `lib/`,** shared by the page and the daily job, so League Alerts and
  the job's flags can't disagree. The job loads them from the version `RULES_VERSION` names, so a
  new version's `lib/` must keep the exports the job reads.
- **The job writes only to the `league-data` branch,** because master is protected.

## The daily job

- **Dry run first:** each chore that writes to MFL only logs until its repository variable is
  `apply`, so the commissioner can check its decisions first.
- **Apply what's deterministic, flag what's risky, log everything.** A flag fails the run, so
  GitHub emails the commissioner, with the run's summary page listing the flags.
- **Nothing is reversed automatically.** A team over the cap or 30 players has its drop penalties
  and contract years held, so the commissioner can reverse the move cleanly.
- **Franchise salaries are snapshotted at the trade deadline,** because MFL reports today's salary
  for every past week.
- **Contract lengths:**
  - blind bids: read from the bid comment on MFL's Previously Processed Waivers page, the only
    place comments appear (the commissioner judged reading their own league's page within the
    spirit of MFL's terms)
  - free agent and waiver adds: from the team's posts in any thread, since the contract thread's
    name changes yearly
  - the latest post within the hour decides, so owners can correct a length; a later unreadable
    post flags rather than keep the earlier length
  - a last name is ambiguous only with another add waiting for years, not a player under contract
  - nothing stated in time: 1 year, applied on sight; the commissioner adjusts by hand for leniency
  - anything unclear is flagged, never defaulted
- **League Alerts (in v2, the owner's My alerts) confirms a free agent add's length** with the job's
  own reader while the hour is open, so owners see what will be set.

## Previews and the beta

- Previews and the beta swap the whole version in one browser, so the commissioner and members can
  try a version on the real site before it's switched in the header.
- The header's version draws the beta's bar before handing over, so the way back never depends on
  the beta's code; a beta that can't load or start falls back to the current site.
- League Alerts is the toggle both ways: it invites members to the beta, and in the beta it leads
  back to the classic site. A beta can hide the bar while it runs well, so v2 does, and shows it once
  anything fails, including a home page whose League Alerts couldn't be drawn.
- A beta choice holds only while the header offers that version, so ending or promoting it needs no
  member action. Viewing as a team the offer leaves out (the commissioner as 0000) keeps the choice
  without loading the beta, so switching back needs no new opt-in.
- The header hides the page while a stored beta or preview loads, for at most 10 seconds, so MFL's
  page doesn't flash before the other version draws; whichever version runs shows it again.
- A beta changes how things look, not the rules: the job follows `RULES_VERSION`.

## League rules the code relies on

They're in `lib/rules.js` and `lib/violations.js`; a rule change means a new version.

- **Salary cap:** $300, counting adjustments and drop penalties not yet charged.
- **Roster:** 23–30 active players (IR doesn't count), from week 1's kickoff until week 17 is over.
  Going over 30 voids the move, as going over the cap does; under 23 must be fixed but voids
  nothing.
- **Injured reserve:** only players the NFL lists on IR (and its variants). One who comes off must
  move back to the active roster.
- **Anti-tanking:** starting an injured (IR or Out) or suspended player is flagged in weeks 1–14.
- **Drop penalty:** `max(ceil(max(1, 0.4 × salary × years)), years)`.
- **Rookie salaries:** first pick QB $6, RB $10, WR $10, TE $4, PK $1; each later pick 80% of the
  one before, never under $1.
- **Franchise salary:** the average of the position's top 5 salaries at the trade deadline (the first
  kickoff of week 12).
- **Rookie draft:** offline, on no fixed date; the week 1 kickoff stands in for "after the draft".
- **Pending blind bids** that could take a team over the cap, or past 30 active, void that owner's
  bids (5.5). "Could" counts each claim group's costliest claim winning: groups have no priority
  and each awards one claim.
- **Moves › Add** (v2, `ui/add-model.js`) blocks a move that takes cap used or the active count
  past its limit, or further past it, with every pending group's costliest claim counted; bids
  already over a limit stay "Current bids invalid" until fixed, without blocking a move that leaves
  them as they are. Over 30 active in season no adds at all, and under 23 no add drops an active
  player (10.5); a player the team dropped can't be re-added for 48 hours (9.4).
- **Moves › Drop** (v2, `ui/drop-model.js`) blocks a cut whose penalty takes cap used past the
  cap, or further past it, with every pending group's costliest claim counted (a claim dropping the
  same player counts as no drop after it); in season, an active player's at 23 active (9.2) and any
  under 23 (10.5); and a player whose game has started (MFL's mark).
- **Moves › Trades** (v2, `ui/trades-model.js`) blocks a trade, proposed or accepted, that leaves
  either team over the cap (10.3; a team already over may trade back under, not stay over). Taking
  a team past 30 or under 23 active is allowed with a notice, once the roster limits apply (10.5).
  The member's own pending bids are checked as for a cut: a notice if the trade lets them break a
  limit (5.5). Proposing closes at the deadline (10.1). "Locked" comes from the NFL schedule;
  MFL decides whether it still holds.
- **Contract length on adds:** 1 to 5 years, in the bid comment or a post within an hour of a free
  agent add; none in time means 1 year.
- **Playoff seeds and payouts** (v2's League, `ui/league-model.js`, display only): the division
  winners are seeds 1–2, the other four the best all-play records, ties by standings order (1.1–1.3);
  $15 to each regular season week's high score, ties split; all-play pays $0.75 × (wins − losses),
  never below $0 (1.6–1.7); what's left of the pot goes 55/30/15 (1.8). All-play counts weeks 1–14
  only, from the weekly results, since MFL's standings keep counting it through the playoffs. The
  pot is the accounting's league-wide entries, or $100 × 10 teams before they're recorded.

## Ruled out

- **A separate companion site:** a second destination is a new navigation layer, and it can't tell
  who's viewing.
- **A proxy for MFL's API:** against MFL's terms.
- **Leaving MFL:** it would give up the custom rules.

## Accepted limits

- Chores run once a day (08:00 UTC): snapshots, penalties and contract years land up to a day late.
- The commissioner's own moves aren't in the history the job reads, and a hand-entered penalty must
  spell the player's name as MFL does to be recognized.
- The over-cap flag lists the last 7 days' moves, so a team over for longer shows none.
- The Commish tab's penalty form pre-fills penalties already charged but not yet reset.
- Contract years:
  - a player added and traded before the job runs stays at 0 years, unflagged
  - a length without a digit or "year" ("Hill for two") isn't read
  - before reversing an add for a team under the cap, set the player's years to 0, or the drop is
    charged a penalty
  - a length edited after the hour still counts: MFL keeps an edited post's original time
  - blind bid readings aren't shown in League Alerts
- IR: MFL doesn't say when a designation changed, so an add made after a player came off NFL IR
  isn't caught as a void.
- While an add's hour is open, each Main tab view reads the message board once.
- To stay within MFL's limits, v2 keeps what it reads in the browser, shared by every page
  (`ui/page-fetch.js`): the NFL schedule, the league's settings and the calendar for a day; last
  week's injury report for a day, today's for 5 minutes on a game day and an hour otherwise; the
  week's results for an hour; rosters, adjustments, transactions, free agents, pending bids and
  trades, and the message board for 2 minutes, which a move made in v2 clears. So a move made on
  MFL's own pages, or by another team, can take 2 minutes to show. Moves' checks and who starts in
  League › Scores always ask MFL.
- After MFL refuses a request (HTTP 429), v2 asks it nothing for 30 seconds, on any page; a panel
  with nothing to show says MFL asked us to wait, with Retry off until then. Moves aren't held.
- League › Scores runs MFL's own win probability on the same feeds, but its numbers can differ from
  MFL's page by a point or so: MFL's simulation carries a random value across every lineup it has
  shown since the page loaded.
- Moves › Trades' "Locked" note shows for the rest of the NFL week once a traded player's game has
  kicked off, after MFL's own lock has lifted: Accept stays on, so MFL takes or refuses it.
- A preview or beta whose features fail after starting shows their errors, with its bar there to
  leave. The beta is per browser, isn't in MFL's app, and nothing reports who's using it.
