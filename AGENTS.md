# Working on this repo

docs/design.md and docs/mfl.md explain why things are as they are; MFL behaves in surprising ways.

## Easy to trip over
- `site/vN/` runs live in members' browsers as soon as master deploys. Visible or rule changes go in
  a new version; ask the maintainer before changing a live one in place. A version offered only as
  the beta (not loaded by the header) changes in place.
- The daily job loads `lib/` from the version `RULES_VERSION` names (default v2, even while v2 is
  the beta): a change there reaches the job's writes to MFL on its next run, and a new version must
  keep the exports it reads, or its flags silently stop. It stops for a league not listed in that
  version's `settings.json`, so `MFL_LEAGUE_ID` must be listed.
- Members include older iPhones: a syntax error (e.g. regex lookbehind, Safari 16.4+) in a file
  breaks every tab. v1 loads such code with a dynamic `import()`; v2 is published as one file
  (`tools/build.mjs`), where `import()` doesn't keep it out, so the build fails on syntax past
  ES2020 and turns a lookbehind into `new RegExp`, which throws where it runs: keep it in code loaded
  on demand. `npm run lint` keeps `site/` within ES2020 (iOS 14); newer browser APIs and CSS it can't
  see, so keep those to touches that can fail quietly.
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
- Python tools run through uv (`uv run --no-project --with playwright …`), never global installs.

## Conventions
- Before merging, a reviewer pass focused on functional breakage, repeated until no blockers.
- Comments only where the code is non-obvious, saying why. Docs describe the current state, with no
  history.
- With the commissioner: present options one at a time and wait for approval; verify claims against
  the live site rather than assuming.
