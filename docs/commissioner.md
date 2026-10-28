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
   `<!-- a beta offer, if any, goes here -->` marks; leaving it out ends the beta.
4. When more than one file changed, paste the tab messages first and the header last. The header
   loads code that looks for the tabs' messages, so the tabs need to be in place before it.
5. Reload the league's home page and check that the site loads and the changed tab looks right.

## Betas and versions

The header's `MAIN` (in `mfl/message-header.html`) names the version everyone gets. A beta offers
another version to some or all members; they switch to it themselves from League Alerts, and can
switch back.

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

## The daily job

GitHub runs it every morning at about 07:40 UTC, as the "Daily chores" workflow under the repo's
Actions tab (GitHub can run it late on busy days). It:
- snapshots each franchise's salaries at the trade deadline;
- charges cap penalties for dropped players;
- sets contract years for added players, from the bid comment or a message board post;
- flags rule problems (cap, the roster limit, IR, anti-tanking) and anything it can't decide.

It records what it did in the chore log (`chore-log.md`, on the `league-data` branch).

- **Settings:** the repo's Settings › Secrets and variables › Actions.

  | Name | Kind | What it is |
  |---|---|---|
  | `MFL_USERNAME`, `MFL_PASSWORD` | secret | your commissioner login; without them it reads only public data |
  | `MFL_USER_AGENT` | secret | the client name registered with MFL; only for the job, never from your own computer |
  | `MFL_LEAGUE_ID` | variable | the league's id |
  | `MFL_HOST` | variable | the league's host, as `https://www44.myfantasyleague.com` |
  | `DROP_PENALTIES`, `CONTRACT_YEARS` | variable | `apply` to write that chore to MFL; anything else only logs what it would do |
  | `RULES_VERSION` | variable | which version's league rules it uses; `v2` when unset |

- **A flag:** anything it can't decide, or a rule problem, fails the run on purpose, so GitHub emails
  you. Open the run from the email: its summary lists what it did and what needs you. Then fix it in
  MFL by hand.
- **Run it now:** Actions › Daily chores › Run workflow.
- **A missing franchise snapshot:** the Commish tab's **Show franchise snapshot** button makes the
  file. Commit it to the `league-data` branch's `data/` folder, and the next run publishes it.
- **The schedule keeps itself on.** GitHub turns off a scheduled workflow after 60 days without
  activity in the repo, so each run switches it back on.

## Each season

The league renews in mid-March or later, never on a fixed date. MFL keeps past seasons' sites and
copies the home page messages forward, so the site keeps running without a paste.

**At renewal:**
- **The daily job** moves to the new season by itself: it uses the newest season the league has a
  site for. If MFL moves the league to another server, update the `MFL_HOST` variable. Then run the
  job by hand once (Actions › Daily chores › Run workflow) and check its summary.
- **The contract-year rollover:** in MFL, lower every player's contract years by 1. Players going
  from 1 year to 0 (the new RFAs) get a salary of $0.01, since MFL won't take $0; the roster report
  shows it as $0. The Commish tab's contract form fills in $0.01 for 0-year players from renewal
  until week 1's kickoff.
- **League Alerts:** look once for anything flagged wrongly before the season.

**On MFL's calendar:** Home's Coming up, and the alerts that date members' deadlines, read these
events from the calendar. Add each season's as soon as its date is set; the title words are what the
site looks for:

| Event | Title must contain | Notes |
|---|---|---|
| The rookie draft | "draft" | |
| The final cut-down | a word starting "cut", e.g. "Final cut-down" | A one-time event at a set time, not a week. The roster limits (23–30) start then; without it, from week 1's kickoff. |
| The rollover | "contract year ends" | Members' last chance to cut players so the penalties clear before next season. |

The trade deadline comes from MFL's own trade deadline setting, and the blind-bid and waiver times
from MFL's waiver settings, so neither needs an event.

**At the trade deadline:** nothing to do. The daily job snapshots each franchise's salaries.
