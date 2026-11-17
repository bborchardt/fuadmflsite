# Commissioner's guide

What the commissioner does, on MFL and GitHub, to run the league site from this repo. How the code
works is in `README.md` and `docs/`.

## Pasting into MFL

The site reaches members through MFL home page messages. Their text lives in `mfl/`:

| File | MFL message | Used by |
|---|---|---|
| `message-header.html` | The header: a message set to appear on all league pages. It loads the site's code. | v1 and v2 |
| `message-contracts.html` | The Contracts tab's message | v1 only |
| `message-commish.html` | The Commish tab's message | v1 only |
| `message-links.html` | The Links tab's message | v1 only |

v2 draws everything from the header and ignores the three tabs. They stay while v1 is in use: anyone
outside the beta, or falling back from it, gets v1. Once v1 is retired, the three tab messages can be
deleted from MFL.

MFL copies the messages forward when the league renews, so a message needs pasting only when a pull
request changes its file in `mfl/`, and that PR says which.

To paste one:
1. Open the file on GitHub, on `master`, and copy all of it.
2. In MFL, League › Setup › Messages Setup: open that message, replace its text with what you copied,
   and save.
3. For the header: the beta offer line (see Betas and versions) is only in MFL's copy, not the repo's.
   Copy it from the live header before replacing, and put it back on the line the comment
   `<!-- a beta offer, if any, goes here (docs/commissioner.md: Offer a beta) -->` marks; leaving it out ends the
   beta.
4. When more than one file changed, paste the tab messages first and the header last. The header
   loads code that looks for the tabs' messages, so the tabs need to be in place before it.
5. Reload the league's home page and check that the site loads and the changed tab looks right.
   For the header, open it again in Messages Setup and check that it still ends with
   `<div id="fuadlinksdiv"></div>`: MFL doesn't say how long a message may be.
   A change to the site's code shows a few minutes after its pull request merges; browsers keep the
   old copy up to 10 minutes more.

## Betas and versions

The header's `MAIN` (in `mfl/message-header.html`) names the version everyone gets. A beta offers
another version to some or all members; they switch to it themselves from the invitation on the
home page (League Alerts in v1, Home in v2), and can switch back.

- **Offer a beta:** in MFL's header, on the line the beta-offer comment marks, add:
  ```html
  <script>window.fuadBeta = {version: "v2", feedback: "<link to a feedback thread>", teams: ["0001"]};</script>
  ```
  - `feedback` links members to the board thread for comments.
  - `teams` limits the offer to those franchise ids; `"guest"` includes visitors who aren't logged
    in. Leave `teams` out to offer it to everyone, the commissioner (0000) included.
  - A member left out keeps the choice they made, so you can be in the beta as your team without
    being in it as the commissioner.
- **End a beta:** delete the line. Members in it go back to `MAIN`, with nothing for them to do.
- **Try a version yourself, without offering it:** add `?fuadPreview=v2` to any league page's
  address. It lasts in your browser only, until `?fuadPreview=off`.
- **Make a version the default:** change `MAIN` in `mfl/message-header.html` through a pull request,
  then paste the header. Past seasons keep the version they ended on.
- **Retire v1:** set the header's `OLDER` to `null` through a pull request, then paste the header. A
  browser older than the minimum (docs/design.md: Devices) then gets MFL's own pages with the
  unavailable note, instead of v1.
- MFL's app doesn't run home page messages, so members using it see MFL's own pages, whichever version.

## The daily job

GitHub runs it every morning at about 07:40 UTC, as the "Daily chores" workflow under the repo's
Actions tab. It:
- snapshots each franchise's salaries at the trade deadline;
- charges cap penalties for dropped players;
- sets contract years for players added after the cut-down date, from the bid comment or a message
  board post within the hour;
- before the season, sets the lengths members send with v2's form (Home › My alerts), and from week
  1's kickoff 1 year for any still missing. Left for you: a length posted by hand in a "contract" topic (flagged), and the
  $5 a day for teams it flags as late past the cut-down (bylaw 12.6);
- records the payouts in MFL's accounting, as League › Winners works them out: "Most Points Week N"
  once the next week has kicked off (split between the teams tied for it), "All-play (W-L)" once week 14's
  scores are, and "1st Place", "2nd Place", "3rd Place" once the championship's are. Left for you:
  the pot's league-wide entries, before the championship (the places need them);
- after your contract-year rollover, sets the new RFAs (1 year to 0) to $0.01, once a season, so a
  salary you set later stays. Left for you: nothing, unless it flags that too many look like RFAs;
- puts in the backup starters members give in their lineup's Optional Message, or post in the
  "Conditional starters" thread (bylaw 16.5): once a week's games are over, a starter who was on his
  team's inactive list gets his backup, the lineup is put back where it changed after a pair's
  deadline, and the week's standings are recalculated (no email to the owners); nothing is posted,
  and the chore log says what changed. Left for you: what it flags (a name it can't place, an
  inactive starter who scored);
- flags rule problems (cap, the roster limit, IR, anti-tanking) and anything it can't decide.

It records what it did in the chore log (`chore-log.md`, on the `league-data` branch).

A payout you enter by hand isn't recorded again if it's worded as the job words it, under any team:
"Most Points Week 4" pays that week to that team, and a list of weeks, "Most points weeks 3,8",
counts as those weeks paid; "All-play (…)" under that team; "2nd Place…". Other wording ("weeks 2-4", "All Play")
gets it recorded twice.

- **Settings:** the repo's Settings › Secrets and variables › Actions.

  | Name | Kind | What it is |
  |---|---|---|
  | `MFL_USERNAME`, `MFL_PASSWORD` | secret | your commissioner login; without them it reads only public data |
  | `MFL_USER_AGENT` | secret | the client name registered with MFL; only for the job, never from your own computer |
  | `MFL_LEAGUE_ID` | variable | the league's id |
  | `MFL_HOST` | variable | the league's host, as `https://www44.myfantasyleague.com` |
  | `DROP_PENALTIES`, `CONTRACT_YEARS`, `PAYOUTS`, `RFA_SALARIES`, `BACKUP_STARTERS` | variable | `apply` to write that chore to MFL; anything else only logs what it would do |
  | `RULES_VERSION` | variable | which version's league rules it uses; `v2` when unset |

- **A flag:** anything it can't decide, or a rule problem, fails the run on purpose, so GitHub emails
  you. Open the run from the email: its summary lists what it did and what needs you. Then fix it in
  MFL by hand.
- **Run it now:** Actions › Daily chores › Run workflow, unticking **Dry run**. Left ticked, it only
  reports what it would do, on the run's summary page, and can try another league or settings: fill
  in only what to change (league, host when that league is on another server, settings as a header
  line's for an unlisted league, version, season, time). Unticked, those are ignored. Each run reads
  as much from MFL as a daily one.
- **A missing franchise snapshot:** v1's Commish tab (as 0000, outside the beta) has a **Show
  franchise snapshot** button that shows the snapshot as text. Save that text as
  `franchise-<season>.json` (e.g. `franchise-2026.json`), commit it to the `league-data` branch's
  `data/` folder, and the next run publishes it.

## The devices form

The header sends a Google Form of yours rows saying which browsers members use and what errors they
hit (docs/design.md: Devices). Its responses sheet is the record; nothing reads it but you.

- **Setting it up (once):** a new Google Form with six Short answer questions, named Team, Ran,
  Browser, Screen, Errors and Page, with no sign-in and no emails collected. From its ⋮ menu, Get
  pre-filled link: type each question's own name as its answer, Get link, and put the form id and
  each `entry.` number into the header's `DEVICES` and `FIELDS` through a pull request.
- **Reading it, once a season and before a version becomes `MAIN`:** Ran says which version each team
  runs, so whether the league has moved to the beta; the oldest iOS in Browser (an iPhone's reads
  `iPhone OS 15_8`) says how far back the hand checks need to go; any row with Errors is a bug to look
  into; `-old` in Ran is a member below the minimum, getting `OLDER`. Your own browsers send rows
  too, as 0000 or the team you Become, so loading a league page shows the wiring works.

## Each season

The league renews in mid-March or later, never on a fixed date. The daily job moves to the new
season by itself.

**At renewal**, in order:
1. If MFL moved the league to another server, update the `MFL_HOST` variable.
2. Do the contract-year rollover in MFL: lower every player's contract years by 1.
3. Run the job by hand (Run it now). It sets the new RFAs (1 year to 0) to $0.01, since MFL won't
   take $0; the roster report shows it as $0.
4. Check the run's summary for that list.
5. Add the season's events to MFL's calendar (below).

**After the auction and the rookie draft:** as the commissioner (Become Commissioner), Home's My
alerts has **Load auction or rookie draft**. Copy the whole Franchises tab (or the Rookie tab) from
the league's sheet and paste it in; it lists, team by team, who is unloaded, loaded and set, and
asks about any owner or player name it can't place. **Send to MFL** goes through MFL's Load/Unload
Rosters, so no add rules or locks apply, then sets the salaries and years, clearing those of
players unloaded to no team; the rookie draft loads
the picks through MFL's draft import at the rookie scale, 0 years. Afterwards it reads MFL back and
lists anything still different; reading the sheet again sends just that.

**On MFL's calendar:** Home's Coming up, and the alerts that date members' deadlines, read these
events from the calendar. Add each season's as soon as its date is set; the title words are what the
site looks for:

| Event | Title must contain | Notes |
|---|---|---|
| The rookie draft | "draft" | |
| The final cut-down | a word starting "cut", e.g. "Final cut-down" | A one-time event at a set time, not a week. The roster limits (23–30) start then; without it, from week 1's kickoff. |
| The rollover | "contract year ends" | Members' last chance to cut players so the penalties clear before next season. |

No event is needed for the trade deadline or the blind-bid and waiver times: MFL puts its own on
the calendar from its trade and waiver settings. Without MFL's trade deadline event, the site uses
week 12's kickoff.

**At the trade deadline:** nothing to do. The daily job snapshots each franchise's salaries.

## When something breaks

- **The site doesn't load** (GitHub Pages down, or a bad deploy): MFL's own pages keep working. Where
  v1's custom tabs would be, members see "League tools are temporarily unavailable. MFL's own pages
  still work." A page still hidden behind "Loading…" shows MFL's page after 30 seconds. Nothing needs
  doing on MFL. Check the "Publish site" workflow under Actions: a failed run can be re-run from its
  page, and a GitHub outage clears on its own.
- **The beta fails to load or start:** that member gets `MAIN` instead, with a bar that leads out of
  the beta. To take the beta down for everyone, delete its offer line from MFL's header (Betas and
  versions).
- **An "MFL check" flag:** MFL changed a page, feed or export v2 reads; the flag names which, and
  the item and field for an export. Members see "—" or MFL's own page there until v2 is changed to
  read it again, which is a code change, with nothing to do in MFL. When the flag says "MFL's page is
  saved on the run", the run's page has it under Artifacts (`mfl-pages`, kept 14 days), cleaned, to
  fix v2 against. A page of your own team in the real league isn't saved, as the run's files are
  public: run a dry run of the test league with **Save pages** ticked to get it.
- **New saved pages for the tests:** at each stage of the season (preseason, the draft, the regular
  season, the playoffs), a dry run with **Save pages** ticked puts every page the check reads on the
  run, cleaned. Run it on the test league (league `50965`) for the team pages, and on the real league
  for history, rules, settings and Power. Each run's `mfl-pages` download goes into the tests as that
  stage's folder (`tests/fixtures/pages/stages/`), by pull request.
- **The daily job failed:** see The daily job, under "A flag". A run that fails for any other reason
  (MFL down, a login refused) shows in the same email and summary. The next morning's run tries
  again, or you can run it by hand.
