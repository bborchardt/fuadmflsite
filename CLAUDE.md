# Working on this repo

Read `README.md` (what the repo is) and `docs/roadmap.md` (what's live, what's next, decisions,
league rules, MFL facts) before starting.

This is the **analysis branch** (`claude/fantasy-football-tier0-setup`): the roadmap, these notes
and the verification and skin preview tools. It is never merged. Code work branches from master;
update this branch's roadmap when decisions change.

## How changes ship

- master is protected: every change goes through a PR. The daily job writes only to `league-data`.
- New visible work goes in a new `site/vN/` folder. Small, low-risk fixes may change a live version
  in place, but that's the maintainer's call: ask.
- A new version is activated by the commissioner editing the MFL header message. Give them the exact
  lines to paste. When pasting several messages, tab messages go first and the header last.

## Testing

- `npm test`: unit tests for `site/vN/lib/` and the UI logic (Node 24+).
- `python3 tools/verify/verify.py compare --local vN` (on this branch; run it against a master
  checkout by copying it, or from a worktree): renders the live league page as published and
  with the working copy's version swapped in, then compares every area. Use `phases` to check the
  franchise salary phases with a faked clock. It needs the `playwright` Python package and Google
  Chrome. Prove a check can see a change before trusting a "no differences".
- `python3 tools/dev-server.py` plus `?fuadPreview=local` previews the working copy on the real site
  in one browser.

## How the commissioner likes to work

- Review options **one at a time**, and wait for explicit approval before moving on.
- Docs describe the **current state**: no history of earlier passes, and fresh numbering.
- The README describes what the repo is and does: no setup playbooks, nothing that goes stale, and
  MFL message slots described generically.
- Before merging, run a reviewer subagent at medium effort focused on functional breakage, and
  repeat until it finds no blockers.
- Verify claims against the live site or MFL's docs rather than assuming.
