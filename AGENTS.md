# Working on this repo

Read README.md, then docs/design.md and docs/mfl.md before changing behavior.

## Changes
- master is protected: every change is a PR. The daily job writes only to `league-data`.
- Visible or rule changes go in a new `site/vN/` (a copy of the current one); small fixes may
  change a live version in place. Ask the maintainer which.
- A new version's `lib/` must keep the exports the daily job reads.
- Before merging: `npm test`, `verify.py compare --local vN`, and a reviewer pass focused on
  functional breakage, repeated until no blockers.

## Testing
- `npm test` (Node 24+).
- Python tools run with uv, never global installs:
  `uv run --no-project --with playwright python tools/verify/verify.py compare --local v1`
- Test against saved exports; MFL throttles heavy use. One live run at the end.
- Prove a check can see a change before trusting "no differences".

## Writing
- Comments only where code is non-obvious: why, not what. Brief.
- Docs describe the current state: no history, nothing that restates the code or goes stale.
- The README says what the repo is, what it does and how to use it; details go in docs/.

## Working with the commissioner
- Present options one at a time and wait for explicit approval.
- Verify claims against the live site or MFL's docs rather than assuming.
