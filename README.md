# FUAD league site

Custom features for the Fuad Reveiz Fan Club Dynasty League on MyFantasyLeague (MFL), and a daily
job that does the commissioner's routine chores. The site code is published to GitHub Pages and
runs inside MFL's own pages, loaded by a home page message.

## What it does

**For members**, on the league site:
- **Contracts tab:** every roster's salaries and contract years, a cut calculator, rookie salaries and
  franchise salaries (last season's, live, or this season's, depending on the date).
- **League Alerts** on the Main tab: teams over the salary cap or outside the 23–30 roster limit,
  players on IR the NFL doesn't list there, injured or suspended starters, and the one-hour window
  to post a free agent's contract length, with the length it read from the message board.
- **Commish tab:** forms for the commissioner's manual work. **Links tab:** league links.

**For the commissioner**, a job every morning (08:00 UTC):
- snapshots franchise salaries at the trade deadline
- charges cap penalties for dropped players
- sets contract years for added players, from the bid comment or a message board post
- flags rule problems (cap, roster limit, IR, anti-tanking) and anything it can't decide

A flag fails the run, so GitHub emails the commissioner. Chores that write to MFL only log what they
would do until they're switched on.

## How to use it

- **Switch versions:** the home page message on all pages loads one version (`site/v<N>/`). Edit
  the version in it to switch, or back to revert. Past seasons keep the version they ended on.
- **Offer a beta:** add a line before that message's script, and League Alerts invites members to
  try it:
  ```html
  <script>window.fuadBeta = {version: "v2", feedback: "<link to a feedback thread>", teams: ["0001"]};</script>
  ```
  `teams` limits it to those franchise ids; leave it out for everyone. Delete the line to end the
  beta.
- **Preview a version** in your browser only: add `?fuadPreview=v2` to any league page URL
  (`?fuadPreview=off` to stop).
- **Turn chores on:** set the repository variables `DROP_PENALTIES` and `CONTRACT_YEARS` to
  `apply`.
- **After a failed-run email:** open the run's summary page; it lists what was flagged and what the
  job did.
- **A missing franchise snapshot:** the Commish tab's **Show franchise snapshot** button produces the
  file; commit it to the `league-data` branch and the next run publishes it.
- **If GitHub Pages is down,** the custom tabs say so and MFL's own pages keep working.

## Developing

- `npm test` runs the unit tests (Node 24+).
- `python3 tools/dev-server.py`, then `?fuadPreview=local` on a league page, runs your working copy
  on the real site.
- `uv run --no-project --with playwright python tools/verify/verify.py compare --local v1` renders the
  live league page with and without your working copy and compares every area.

## What's where

| Path | What it is |
|---|---|
| `site/v<N>/` | One version of the site: `fuad.js` (entry point), `loader.js` (which version runs), `fuad.css` |
| `site/v<N>/lib/` | League rules and logic, shared with the daily job |
| `site/v<N>/ui/` | The Main, Contracts, Commish and Links features |
| `mfl/` | What goes in MFL's home page messages |
| `jobs/` | The daily job (`.github/workflows/daily.yml` runs `jobs/daily.mjs`) |
| `tests/` | Unit tests |
| `tools/` | Local preview server and the live-page comparison |
| `docs/` | [Design decisions](docs/design.md) and [MFL facts](docs/mfl.md) |

The `league-data` branch holds what the job writes: franchise salary snapshots and its chore log.
