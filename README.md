# FUAD league site

Custom features for the Fuad Reveiz Fan Club Dynasty League on MyFantasyLeague (league 48571):
the Contracts tab, the Commish tab, the Links tab, and the roster and salary cap violations box on Main.

The code lives in this repo and is served from GitHub Pages. MFL's league header loads it on
every league page, so it runs inside MFL and reads league data as the logged-in member.

```
site/v1/          what's published, one folder per version
  fuad.js         entry point the MFL header loads
  fuad.css        league-wide styles (nav bar on phones, Contracts layout)
  lib/            league rules and logic, shared with the daily job
  ui/             the Main, Contracts, Commish and Links features
site/data/        franchise salary snapshots, one per season
mfl/              what gets pasted into MFL's admin screens
jobs/daily.mjs    the daily GitHub job
legacy/           the pre-v1 code, kept as an emergency fallback
tests/            unit tests for the shared league logic
tools/            local preview server
```

## One-time setup

1. **Turn on GitHub Pages:** repo Settings → Pages → Source: **GitHub Actions**. Every push to
   `master` that touches `site/` publishes it to `https://bborchardt.github.io/fuadmflsite/`.
2. **Add the commissioner login** for the daily job: Settings → Secrets and variables →
   Actions → New repository secret: `MFL_USERNAME` and `MFL_PASSWORD`.
3. **Run the daily job once by hand:** Actions → Daily chores → Run workflow. It creates the
   `chore-log` branch.
4. **Paste into MFL** (commissioner setup screens, current season):
   - **League header** (where fuadUtil used to be): replace everything with [`mfl/header.html`](mfl/header.html).
   - **Home Page Message 3** (the old data loader): delete its contents, or remove it from the Contracts tab.
   - **Home Page Message 4** (Contracts): replace with [`mfl/message-4-contracts.html`](mfl/message-4-contracts.html).
   - **Home Page Message 5** (Commish): replace with [`mfl/message-5-commish.html`](mfl/message-5-commish.html).
   - **Home Page Message 6** (Links): replace with [`mfl/message-6-links.html`](mfl/message-6-links.html).

## Versions

The header points at one version, e.g. `…/fuadmflsite/v1/fuad.js` and `…/v1/fuad.css`.

| To | Do |
|---|---|
| **Ship a low-risk tweak** | Change `site/vN/` in place and merge. It reaches every season using vN, archives included. Undo with `git revert`. |
| **Ship anything riskier, or a rule change** | Copy `site/vN/` to `site/vN+1/`, change the copy, merge. It's published but dark: nothing loads it yet. |
| **Activate a version** | Change `v1` to `v2` in both lines of the league header. |
| **Revert** | Change the header back. Instant, no git needed. |

Which to use is the maintainer's call. A new version gives you the instant header revert and
leaves past seasons as they were; changing a version in place is less clutter for small fixes.

**Past seasons pin themselves.** MFL keeps each season's site and copies the header forward at
renewal, so a past season keeps loading whatever version it ended on.

**Rules live in the version** ([`site/v1/lib/rules.js`](site/v1/lib/rules.js)): cap, roster
limits, rookie salaries, the cap penalty formula, franchise players, and which NFL weeks mark
the season start and trade deadline. When the league changes a rule, cut a new version so past
seasons keep the rules they were played under. Point the daily job at it with the repository
variable `RULES_VERSION` (Settings → Secrets and variables → Actions → Variables).

## Previewing

Add a parameter to any league page URL. The choice is remembered in **your browser only**;
everyone else keeps the version in the header.

| URL parameter | Loads |
|---|---|
| `?fuadPreview=v2` | a published (dark) version |
| `?fuadPreview=local` | your working copy, served by `python3 tools/dev-server.py` |
| `?fuadPreview=local:v2` | a specific folder of your working copy |
| `?fuadPreview=off` | back to the header's version |

An orange badge shows while previewing. For local previews, Chrome asks once whether the MFL
site may access devices on your local network; allow it.

## Franchise salaries

What the Contracts tab shows depends on where the season is. The page works this out from MFL's
NFL schedule, so there are no dates to maintain.

| When | Shows |
|---|---|
| Before the first kickoff of week 1 (a stand-in for the offline rookie draft) | Last season's snapshot, `site/data/franchise-<last season>.json` |
| From week 1 to the trade deadline (first kickoff of week 12) | A live projection from current salaries |
| After the deadline | This season's snapshot, `site/data/franchise-<season>.json` |

The snapshot has to be taken at the deadline. MFL shows today's salary for every past week, so
a player cut later would read $1.

## The daily job

[`.github/workflows/daily.yml`](.github/workflows/daily.yml) runs every morning at 11:00 UTC
(5–6 am Central). It logs in to MFL as commissioner and:

- **after the trade deadline**, writes this season's franchise snapshot, commits it and publishes it
- **keeps a chore log** on the `chore-log` branch: an entry whenever it does something, and a
  heartbeat at least once a month
- **re-enables itself** on every run, because GitHub turns off scheduled workflows after 60
  days without repo activity

If the snapshot is ever missing, the Commish tab says so, and its **Show franchise snapshot**
button produces the file to commit by hand as `site/data/franchise-<season>.json`.

## Season rollover

Nothing to do unless a rule changed. The season and league come from the page URL, and the
franchise salaries switch on their own. If MFL's renewal doesn't carry the header and home page
messages forward, paste them again from `mfl/`.

## Tests

```
npm test
```

Runs the unit tests for the shared league logic (Node 20+). They also run on every pull request.

## If GitHub Pages is down

MFL's own pages keep working. Our tabs show "League tools are temporarily unavailable", and on
phones MFL's nav bar goes back to hidden until Pages returns.

For a long outage, paste the files in [`legacy/`](legacy/) instead: `fuadUtil.html` into the
header and the others into messages 3–6, as before v1. Update its `year` and season settings
first. That's the old code: it needs jQuery and friends from cdnjs, and its franchise salaries
switch manually.

## Handing the site on

A new commissioner needs write access to this repo, the two `MFL_*` secrets updated to their
login, and commissioner access in MFL to edit the header and home page messages.
