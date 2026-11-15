# Working on this repo

docs/design.md and docs/mfl.md explain why things are as they are; MFL behaves in surprising ways.

## Easy to trip over
- `site/vN/` runs live in members' browsers as soon as master deploys. Visible or rule changes go in
  a new version; ask the maintainer before changing a live one in place. A version offered only as
  the beta (not loaded by the header) changes in place.
- The daily job loads `lib/` from the version `RULES_VERSION` names (default v2, even while v2 is
  the beta): a change there reaches the job's writes to MFL on its next run, and a new version must
  keep the exports it reads, or its flags silently stop. It stops for a league not listed in that
  version's `settings.json`, so `MFL_LEAGUE_ID` must be listed; a dry run, the manual run's default, may
  name any league and writes nothing. A new chore that writes must go through `mflImport`, or `mflForm`
  for a commissioner's form the import can't replace; both refuse a dry run.
- Members' devices go back to Safari on iOS 14.5 and Chrome 88, 320 wide (docs/design.md: Devices;
  the list is `package.json`'s `browserslist`). v2 is one
  file (`tools/build.mjs`), so a syntax error anywhere in it breaks every tab: the build fails on
  syntax past ES2020, `npm run lint` keeps `site/` within it, and a regex lookbehind (Safari 16.4)
  isn't allowed outside the frozen v1, `mfl/` included (`tests/guards.test.mjs`). CSS or a browser API
  newer than the minimum may only add to a page that works without it (`@supports`, a feature check),
  with a lint disable comment saying why; the lint (ESLint's compat, stylelint) finds most, not all.
- Every change is checked as Devices says for its kind, the hand checks included: CI's checks don't
  draw as an old Safari does, nor see whether a page looks good. Say in the pull request which hand
  checks were done, or why none applied.
- Members' browsers keep what v2 loaded across deploys (`site/v2/ui/store.js`). A panel's saved copy
  that its render throws on is loaded afresh, but a `cached()` value is used as found until it
  expires (a year for a bid run): a change to the shape one holds changes its key too, which
  `tests/stored-shapes.test.mjs` checks for what v2 builds from MFL's pages.
- MFL throttles by machine and doesn't say how much: test against saved exports, make one live run
  at the end, and never send the job's registered User-Agent from a dev machine.
- The repo is public: a page saved from MFL goes in only through the capture bookmark (`site/capture/`),
  which takes out emails, phone numbers, owners' names, private messages, the apiKey and the board's
  `auth` token. Clean a page saved any other way the same way. `tests/saved-pages.test.mjs` fails on
  what it can recognize, but only that.
- Changes in MFL's header or tab messages are made by the commissioner by hand: give the exact lines
  to paste, tab messages first and the header last.
- `verify.py` can report "no differences" for an area it doesn't see: prove it notices a change first.
- A reader of an MFL page or feed returns null (the job: throws) on a page it doesn't recognise, never
  an empty result that reads as "none" (docs/design.md: Outside change); add it to
  `tests/readers.test.mjs`, which fails until it's listed. An export a chore, check or form relies on
  gets its fields in `lib/shapes.js`, and v2's read of it `check: strict`: `tests/export-shapes.test.mjs`
  fails on the job's read of an export with no rules, `tests/checked.test.mjs` on v2's without the check.
- Python tools run through uv (`uv run --no-project --with playwright …`), never global installs.

## Conventions
- A view that holds state a member sets (a week, a filter, a search) keeps it through `ui/kept.js`:
  its section's link starts it afresh, its tab finds it as left, Back restores it (docs/design.md).
- Before merging, a reviewer pass focused on functional breakage, repeated until no blockers.
- Comments only where the code is non-obvious, saying why. Docs describe the current state, with no
  history.
- With the commissioner: present options one at a time and wait for approval; verify claims against
  the live site rather than assuming.
