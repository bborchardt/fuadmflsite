# REVIEW.md: review charter for fuadmflsite

## Purpose and users
Custom features and a daily chores job for the Fuad Reveiz Fan Club Dynasty League on MFL, which
other leagues can fork or try.
Users: ~12 league members on phones (down to 320px, iOS 14.5, Chrome 88), using v2 (beta) or v1
(frozen); one commissioner who is also the only developer; other leagues' commissioners who fork
the site or try it on a test league (docs/settings.md: Test leagues, Forking); AI agents working
from AGENTS.md.

## Priorities
1. Never write wrong data to MFL (dry run by default, chores off until `apply`, per-run caps).
2. Members' pages keep working on old devices; a bug costs a feature, never the page.
3. Outside changes at MFL are caught before members hit them.
4. Keep the load on MFL low (it throttles by machine).
5. Simplicity for one maintainer.
6. Other leagues can use it through settings alone, without a code change.

## Human interfaces
- Member UI: sentence case, plain league terms. A failed move reads "Couldn't <verb> <player>:
  <MFL's reason>." Done lines use `role=status` and failures `role=alert`. State is kept through
  ui/kept.js. Contrast is tested per look (tests/looks.test.mjs).
- League settings (site/vN/settings.json, and a test league's settings line in its header): an
  interface for forks and test leagues, documented in docs/settings.md. Keys and their meanings stay
  stable; a change that would break an existing league's settings needs a new key or a new version.
- Daily job: repository variables in UPPER_SNAKE; a chore writes only on `apply`. A flag fails the
  run and says what to do by hand. A flag that hands work back names MFL's own page for it, not one
  of the site's tabs.
- MFL pastes: the whole file from master, tab messages first, header last (not yet: the header's
  beta offer line, kept by hand, #324).
- Dev CLI: Python argparse tools run through uv; `--built`, `--base`, `--ref`, and `--only` as a
  comma list.

## Architecture
- `site/vN/lib/`: rules and export helpers shared with the job; no DOM, no ui/ imports.
- `ui/*-model.js`: pure state and readers for its own feature, with no DOM or fetch. Other sections
  don't import a model for general helpers. `*-view.js`: HTML strings through `esc`.
  `ui/<feature>.js`: wiring and fetches.
- Shared display formatting (times, money, names) goes in `ui/format.js`. What Moves' sections share
  goes in `ui/moves-model.js` (no DOM or fetching, so models can use it) or `ui/moves.js` (fetches
  and forms). MFL's calendar, which Home and Add both read, is `ui/calendar.js`.
- `ui/page-fetch.js`: every request to MFL goes through it, `mflFetch` for reads, `mflConfirm` for
  the reads that confirm a move or finish one under way, and `mflSend` for moves, so a 429 holds reads on every page. A direct
  `fetch` is only for the site's own files on Pages. `ui/store.js`: localStorage.
- `jobs/daily.mjs` only sequences: it reads the environment, runs the chores in order, collects
  flags and writes the summary and outputs. The MFL transport and session (login, request spacing,
  timeouts, waiting out refusals) are `jobs/mfl-session.mjs`, the run's log and flags
  `jobs/run-log.mjs`. Each chore is `jobs/<chore>.mjs`, taking the context `jobs/chore-context.mjs`
  makes (lib, the MFL session, log, choreLog, needsAttention, dryRun, the shared reads and the
  import); a new chore starts that way. A value one chore needs from another is passed in
  explicitly. No chore module, nor the session or the run log, holds a run's state at module level. `jobs/<chore>.mjs` import no lib/:
  they take the version's from the context, as `const {names} = lib.<name>;`, the form
  `tests/guards.test.mjs` reads.
- Writes to MFL go only through `jobs/mfl-import.mjs` / `jobs/mfl-form.mjs`. No import cycles.
- Outside services: members' pages depend only on MFL and GitHub Pages. The one exception is the
  devices form (Google Forms), which only receives error reports after the page has run. The daily
  job depends on MFL, GitHub, and, for backup starters, nflverse's weekly rosters and
  DynastyProcess's player IDs. Any new outside service is a decision recorded under Accepted
  decisions, saying what happens while it's down.
- Design docs: docs/design.md, docs/mfl.md.

## Complexity budget
- Defending against outside change at MFL (readers that return null, shape checks, saved pages,
  fallbacks) is accepted cost.
- A settings mode for another league is welcome, with tests for each mode. It stays in lib/ where
  it can, so ui/ reads computed results rather than branching on the mode.
- The old-device minimum (ES2020, one bundled file) is a fixed constraint.
- New runtime dependencies are rare (today jsdom and sharp).
- One DOM parser outside a real browser: jsdom, the one the job reads MFL's pages with, while the
  job needs it. Tests use it too, through `tests/fixtures/dom.mjs`.
- Cost is measured in one maintainer's reading time.
- Logging for the devices form is to see that something fails, where, and roughly how often. Exact
  counts aren't worth code: a failure logged more than once, or logged by each caller, is left as it
  is (the header merges identical labels into one, with a count) unless it takes rows or labels
  another error would need (the header's limits: `mfl/message-header.html`, `report` and
  `noteError`).

## Performance
- Hot paths: the first view of Lineup and Home on an old iPhone on a slow connection, the direct
  path (v2 as the main version) first.
- Most important: the number of requests to MFL, guarded in CI by requests.py against the base
  branch. Then round trips, hence one bundle.
- Budget: v2's fuad.js at most 200 KB gzipped, raised only on purpose, as "more requests" is.
- Nothing a member waits on comes from a third party: before v2's screen is drawn, the page fetches
  only from MFL and GitHub Pages (no outside stylesheet, `@import`, font or script; not yet:
  fuad.css's Barlow fonts, #320).
- The job's speed doesn't matter; its request count does.

## Testing strategy
- Node unit and DOM tests (`npm test`), parsing pages with jsdom.
- tests/daily.test.mjs: end-to-end runs of the job against a fake MFL (tests/fixtures/fake-mfl.mjs);
  end to end is preferred over mocks.
- Guard tests for the repo's own rules (readers, export shapes, stored shapes, saved pages, the
  regex guard).
- Playwright browser checks: pages, header, requests and layout run in CI on site/mfl/tools
  changes; screens, phases, speed and skins are run by hand.
- TZ pinned, no network, no skipped tests.
- The highest-risk code is the job's writes to MFL. Each condition that decides a write has a test
  that fails without it, and each deadline or limit that decides one is tested at its edge. The
  per-run caps are exempt: a slip there only makes the job refuse to write.
- Each outside service the job uses has a test for it being unreachable.

## Documentation
- README: an overview plus a reference for the developer tools. docs/commissioner.md: the
  commissioner's how-to, and the one full list of the job's chores. design.md and mfl.md: the
  reasons for the design, and MFL facts. settings.md: the settings reference. AGENTS.md: rules and
  traps for agents.
- Each fact has one home doc; other docs give a line and link to it, never a second copy.
- docs/settings.md is the contract for league settings: a change to a settings.json key, default or
  meaning changes it in the same PR.
- Voice: the present state, no history, plain words, the UI's own names; the guide speaks to "you".
  Comments give the why only.

## Accepted decisions
- Settings modes for leagues not listed in settings.json (forks, test leagues) are accepted, each
  covered by tests, while supporting forks is a goal. Dismisses the complexity finding on
  `playoffs.rounds`, `allPlayTop`/`placeAmounts`, `rookieScale.firstPickFromRank` and
  `allPlayThenPlayoffFinish`.
- Devices form (Google Forms): members' error reports go there after the page has run. While it's
  down, reports are lost and the page is unaffected. (mfl/message-header.html: the devices form,
  `DEVICES`)
- nflverse weekly rosters and DynastyProcess player IDs: backup starters reads them, and only when a
  week has backups waiting. While either is down, the run flags, nothing is written for unsettled
  weeks, payouts wait, and the next run tries again. (jobs/backup-starters.mjs: `loadNflverse`, and
  daily.mjs giving payouts the chore's first open week)
- v2 is bundled into one file, for round trips on slow phones; code splitting measured no faster on
  "slow" and slower on "3g". (design.md)
- v1 is frozen with its own lib/. (AGENTS.md)
- The morning check (jobs/mfl-check.mjs) loads the version's ui/ readers, so it catches an MFL
  change to a page or feed before a member meets it, judged by the same code members' browsers run.
  (design.md: Outside change)
- A write to MFL is made once per run, never retried: a write that timed out may have landed, so
  the next run re-reads MFL and does only what's still due. A failed write waits for that run.
- The Moves fallback line keeps its own wording ("Error loading cap and roster data. Rule checks are
  disabled; …", Reload Page): a warning that the rule checks are off, louder on purpose than v2's
  routine failures. (site/v2/ui/moves.js: `FALLBACK_TEXT`; the commissioner's wording)
