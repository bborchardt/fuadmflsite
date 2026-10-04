# Working on this repo

docs/design.md and docs/mfl.md explain why things are as they are; MFL behaves in surprising ways.

## Easy to trip over
- `site/vN/` runs live in members' browsers as soon as master deploys. Visible or rule changes go in
  a new version; ask the maintainer before changing a live one in place.
- The daily job loads `lib/` from the version `RULES_VERSION` names: a new version must keep the
  exports it reads, or its flags silently stop.
- Members include older iPhones: a syntax error (e.g. regex lookbehind, Safari 16.4+) in a module
  `fuad.js` imports statically breaks every tab. Load such code with a dynamic `import()`.
- MFL throttles by machine and doesn't say how much: test against saved exports, make one live run
  at the end, and never send the job's registered User-Agent from a dev machine.
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
