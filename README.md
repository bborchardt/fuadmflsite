# FUAD league site

Custom features for the Fuad Reveiz Fan Club Dynasty League on MyFantasyLeague (MFL), and a daily
job that does the commissioner's routine chores. The site code is published to GitHub Pages and
runs inside MFL's own pages, loaded by a home page message.

## What it does

**For members**, on the league site: the version the header loads (`site/v<N>/`).
- **v2**, the beta: MFL's pages redrawn for phones, in sections (Home, Lineup, League, Moves,
  Rosters), with a team sheet, a player popup and a choice of looks. Home has the alerts (cap, roster
  limit, IR, injured starters, contract lengths due), the commissioner's results screen, and the form
  members send their contract lengths with; Moves keeps add, drop, IR and trades within the rules.
  A phone can add it to its home screen as an app.
- **v1**, the main version: the Contracts tab (salaries, contract years, a cut calculator, rookie and
  franchise salaries), League Alerts on the Main tab, and the Commish and Links tabs.

**For the commissioner**, a job every morning (about 07:40 UTC):
- snapshots franchise salaries at the trade deadline
- makes small stills of the team icons for v2's lists
- charges cap penalties for dropped players
- sets contract years for added players, from the bid comment or a message board post; before the
  season, for every player due one, from the lengths members send with v2's form
- records the payouts in MFL's accounting: each week's high score, all-play, and the places
- after the commissioner's contract-year rollover, sets the new RFAs (1 year to 0) to $0.01
- puts in members' backup starters for inactive starters (bylaw 16.5), from the "Conditional
  starters" thread, and recalculates the week
- flags rule problems (cap, roster limit, IR, anti-tanking) and anything it can't decide

A flag fails the run, so GitHub emails the commissioner. Chores that write to MFL only log what they
would do until they're switched on.

## How to use it

The [commissioner's guide](docs/commissioner.md) covers pasting into MFL, betas and versions, the
daily job's settings and runs, each season's steps, and what to do when something breaks.

## Developing

A second league can try the site with no code change, and any setting can be tried on one: see
"Test leagues" and "Forking" in docs/settings.md.

- `npm test` runs the unit tests (Node 24+); after `npm ci`, `npm run lint` runs ESLint's standard
  rules and checks that what runs in members' browsers stays within ES2020 (Safari since iOS 14).
- `npm run build` makes `dist/` as GitHub Pages publishes it, v2 bundled into one minified file.
- `uv run --no-project --with playwright python tools/app-icons.py` redraws v2's home screen icons.
- `python3 tools/dev-server.py`, then `?fuadPreview=local` on a league page, runs your working copy
  on the real site, unbundled.
- `uv run --no-project --with playwright python tools/verify/verify.py compare --local v1` renders the
  live league page with and without your working copy and compares every area.
- `uv run --no-project --with playwright python tools/verify/screens.py compare` uses v2's screens,
  loaded from pages saved from the clone league with no MFL requests, on master and on your working
  copy, and lists every step whose HTML or moves to MFL differ, and every move whose message doesn't
  match how MFL answered it (lands, fails, refuses, lags, can't be reached); `--built` uses the
  working copy as Pages publishes it, and `check` checks the messages alone.
- `uv run --no-project --with playwright python tools/verify/layout.py` draws the same screens in
  WebKit at a phone's width, just past where the desktop layout starts, an iPhone's app turned
  sideways and a desktop's, and lists text squeezed to a few letters a line, anything past the
  window's edge or cut off, controls drawn over each other, and heights left wrong after the window
  turns; `--shots DIR` saves a screenshot of each screen with a finding. About a minute.
- `uv run --no-project --with playwright python tools/verify/phases.py` draws every view on nine dates
  through the league's year (offseason, draft, cut-down, preseason, season, trade deadline, playoffs,
  season over), from the same saved pages reshaped for each date, with and without the trade
  deadline's franchise snapshot, on master and on your working copy, and lists every view that
  differs; a request no saved page answers fails it.
- `uv run --no-project --with playwright python tools/verify/requests.py` walks a member through every
  view twice, first with nothing stored and then again, on master and on your working copy, and
  fails if a step asks MFL for more than it did, listing what it adds.
- `uv run --no-project --with playwright python tools/verify/speed.py` times Lineup and Home from the
  same saved pages over a simulated slow phone connection, pictures, fonts and third-party scripts
  at typical sizes: when the page shows, how long MFL's own page shows first, when v2's screen is
  drawn and when its data is in; `--cache nextday` times a visit a day after the last, `--built`
  times the bundle, `--no-lookbehind` makes lookbehind regexes throw, as on iPhones before iOS 16.4.
- `uv run --no-project --with playwright python tools/verify/header.py --built` loads saved pages with
  `mfl/message-header.html` as their header, in Chromium and WebKit, through each beta, fallback and
  failure case, before the commissioner pastes it; `speed.py --header` times it.
- `uv run --no-project --with playwright python tools/verify/pages.py` loads every page the capture
  bookmark saved (`tests/fixtures/pages/`), as the guest, a member or the commissioner got it, with
  the working copy built and v2 as the main version, and checks which of v2's screens takes each one,
  or that MFL's page stays.
- `uv run --no-project --with playwright python tools/verify/skins.py` draws v2's screens in each look,
  with the look's MFL skin and without it, and lists every style the skin changes on v2's parts. MFL's
  stylesheets are fetched on the first run into `tools/verify/mfl-skins/`, which git ignores; `--refresh` fetches them again
  and updates their fingerprints in `tools/verify/skins.json`, so a skin MFL changed shows in git diff.
- On a pull request that touches the site, the header or the harness, GitHub runs `pages.py`,
  `header.py --built` and `requests.py --built` against the pull request's base
  (`.github/workflows/browser-checks.yml`); the others list differences to read, and are run by hand.

## What's where

| Path | What it is |
|---|---|
| `site/v<N>/` | One version of the site: `fuad.js` (entry point), `loader.js` (which version runs), `fuad.css` |
| `site/v<N>/lib/` | League rules and logic, shared with the daily job |
| `site/v<N>/ui/` | The Main, Contracts, Commish and Links features; in v2 also the frame (sections, site menu, team sheet) and the player popup |
| `mfl/` | What goes in MFL's home page messages |
| `site/capture/` | A bookmark that saves MFL's pages as the viewer gets them, private details taken out, for tests |
| `jobs/` | The daily job (`.github/workflows/daily.yml` runs `jobs/daily.mjs`) |
| `tests/` | Unit tests |
| `tools/` | The build for Pages, local preview server, the live-page comparison, and the offline comparison and timing of v2's screens with its saved pages |
| `docs/` | [Design decisions](docs/design.md), [MFL facts](docs/mfl.md), [league settings](docs/settings.md) and the [commissioner's guide](docs/commissioner.md) |

The `league-data` branch holds what the job writes: franchise salary snapshots, the team icons' stills
and its chore log.
