# Roadmap

**League:** 48571 (contract dynasty) on MyFantasyLeague · **As of:** 3 Oct 2026

What's live, what comes next, the decisions already made, and the facts that constrain them.

## Live: v1

- Code is served from GitHub Pages (`site/v1/`). An all-pages home page message
  (`mfl/message-header.html`) loads it. The Contracts, Commish and Links messages are one-line
  mount points.
- It rebuilds the old jQuery/Handlebars features with no visible change. The additions:
  - a note naming which franchise salaries are shown
  - the Main tab's violations box counts drop penalties not yet charged toward the cap, and says so
    ("…counting $8 in drop penalties not yet charged!"). Cap totals are rounded to the cent.
- Franchise salaries switch automatically:
  - last season's snapshot before the week 1 kickoff (or while MFL hasn't published the schedule)
  - a live projection until the trade deadline (the first kickoff of week 12)
  - this season's snapshot after it
- **Daily job** (08:00 UTC), on the newest league site (this year's once renewed, which happens in
  mid-March or later; last year's until then):
  - logs in as commissioner
  - snapshots franchise salaries after the deadline to the `league-data` branch, checking last
    season's too
  - publishes any new or changed snapshot
  - charges cap penalties on drops (`jobs/drop-penalties.mjs`): one `salaryAdj` per dropped player
    still carrying a contract, described like "Name (2yrs@10, 10/03)", then resets the player to
    $1 / 0 years. A penalty already charged (an adjustment naming the player since the drop, or a
    $0 one) is only reset. A team over the cap has its penalties held, so the commissioner can
    reverse the move. In dry run (log only) until the `DROP_PENALTIES` repository variable is
    `apply`
  - flags every team over the cap, all year (`jobs/over-cap.mjs`): the chore log names the team, its
    total and its moves in the last 7 days, and the run fails so the commissioner gets GitHub's
    email, daily until the team is back under. Flag only: nothing is reversed
  - the job and the violations box share one cap total from the league model
    (`franchise.capTotal`: salary, adjustments and uncharged drop penalties), so they flag the
    same teams
  - sets contract years for added players (`jobs/contract-years.mjs`), in dry run until the
    `CONTRACT_YEARS` repository variable is `apply`:
    - blind bids: from the bid comment, read from the logged-in Previously Processed Waivers page
      (one page per waiver run; the comments are in no API export). The commissioner decided this
      reading of their own league's page is within the spirit of MFL's terms
    - free agent and waiver adds: from the team's message board posts after the add, in any thread
      (the contract thread's name changes every season, and in 2023 owners used "Waiver Moves")
    - no length by the first run at least an hour after the add: 1 year, enforced on sight; the
      commissioner adjusts by hand for leniency
    - anything unclear is flagged and fails the run; teams over the cap are held
    - backtested on eight seasons (2019–2026): 294 of 320 adds match the commissioner's years, 12
      are flagged, and the rest are the rules applied (late or missing posts, bids without comments)
      plus two one-offs
  - writes a chore log, and re-enables itself (GitHub's 60-day rule)
- Tier 0 is done:
  - MFL's nav bar is kept visible on phones
  - the redundant Live Scoring tab was removed
  - Power Rankings, League Chat, Poll and Trade Bait stay by choice
  - no skin change; members choose their own apps

## Next versions

Each one is built in a new `site/vN/` folder, previewed with `?fuadPreview=vN` (or `local:vN`),
checked with `tools/verify/verify.py`, and activated by editing the header message. The daily job
loads league logic from the version `RULES_VERSION` names, so a new version's `lib/` must keep what
the job reads (`capTotal`, `unchargedPenalty`, `penaltyCharged`, `pendingDroppedPlayers`); without
`capTotal` the over-cap flag would silently never fire. The order isn't decided. A and C change what members see, and the commissioner wants member feedback on those.

### A. "My Team" Contracts

- Open with the viewer's franchise, which MFL's `franchise_id` identifies:
  - cap space against $300
  - roster count against 23–30
  - expiring contracts
  - what cutting each player costs
- Cards on phones, a table on desktop, from the same data.
- Contract state as badges (*RFA*, *Expiring*, *Signed thru 2028*) instead of "Years: 0".
- The full league roster one tap away. Reference tables (rookie salaries, franchise salaries,
  calculator) below the member's own view.
- Fixes the Contracts tab's length: about 18 phone screens today.

### C. League-wide look

- The commissioner dislikes all of MFL's stock skins.
- Our own stylesheet in `fuad.css`, which loads on every league page and outranks the skin: type,
  color, spacing, tables and module headers.
- Calmer desktop navigation: MFL's dropdown recedes, the nav bar reads as the main menu, and our tabs
  read as the league's own section. **Nothing gets hidden.**
- Best after A, so A sets the visual language.
- **Risk:** this styles MFL's markup (`#hsubmenu`, `.homepagemodule`, `.report`). If MFL changes it,
  the look degrades but nothing breaks.

### Chores: automating commissioner work

Added to the daily job, which already logs in as commissioner. MFL's import API lets the
commissioner write:
- `salaryAdj` for salary adjustments
- `salaries` for salaries and contract years (`APPEND=1`)
- `fcfsWaiver` with `FRANCHISE_ID` for add/drop moves on a team's behalf

Candidates:
1. **Commish-tab chores queue** for anything needing a decision.
2. **Message board posts** of what the bot did: off for now, and the commissioner may turn them on
   after seeing the log.

Deferred: the **season rollover** (decrement every contract year by 1; players going from 1 to 0
years, the new RFAs, get $0.01, since MFL won't allow $0 and $0.01 shows as $0 on the roster report).
It's once a year and part of the commissioner's routine when creating the new site, so automating it
saves little.

Guidance: apply deterministic things automatically, flag anything risky for a person, and log
everything.

### Optional, later

A small public league-history site (records, champions, bylaws), only after A and C.

### Ruled out

- **A separate companion site:** a second destination is a new navigation layer, and it can't tell
  who's viewing.
- **A proxy for MFL's API:** against MFL's terms.
- **Leaving MFL:** would give up the custom rules.

## Requirements

- Works well in a **phone browser**; members can't be assumed to use an app (MFL Modern fell short).
- **No new navigation layer**; the custom tabs stay as members know them.
- Within **MFL's rules**.
- **As few chores to remember as possible**, and stable year to year.

## League rules the code depends on

They live in `site/vN/lib/rules.js`; a rule change means a new version.

- **Salary cap:** $300.
- **Roster:** 23–30 players (checked through week 15). Injured or suspended starters are checked
  through week 14.
- **Cap penalty for dropping a player:** `max(ceil(max(1, 0.4 × salary × years)), years)`.
- **Rookie salaries:** first pick QB $6, RB $10, WR $10, TE $4, PK $1. Each later pick is 80% of the
  one before, never under $1.
- **Franchise salary next year:** the average of the top 5 salaries at the position, snapshotted at
  the trade deadline (the kickoff of the first game of week 12).
- **The rookie draft** is held offline on no fixed date. The week 1 kickoff stands in for "after the
  draft", and the contract form pre-fills $0.01 for 0-year players until then.
- **Contract length on adds:** 1 to 5 years. A blind bid's length goes in its comment (a bare count
  covers every player in a conditional bid); a free agent add's goes in a message board post right
  after the add, naming the player. None stated: 1 year.

## MFL facts learned the hard way

- **Data is same-origin only:** code must run inside an MFL page. Scripts and styles can be loaded
  from GitHub Pages, and the league page sends no CSP.
- **Hosts:** league exports go to `www44.myfantasyleague.com`. League-independent ones (`players`,
  `injuries`, `nflSchedule`, `myleagues`, `login`) go to `api.myfantasyleague.com`.
- **JSON quirks:** one-item lists come back as bare objects (use `asArray`). An unpublished season's
  `nflSchedule` returns 404.
- **Login:** `POST api…/<year>/login` returns `<status MFL_USER_ID="…">`, sent back as
  `Cookie: MFL_USER_ID=…`. Bad credentials return `<error>…</error>` with HTTP 200. The per-user
  `APIKEY` can't do commissioner actions.
- **Rosters by week** keep membership but always report today's salary: a player cut later reads $1.
  That's why snapshots are taken at the deadline.
- **Renewal:** MFL keeps past seasons' sites and copies home page messages forward, so each season
  pins the version its header names.
- **Nav bar on phones:** the BlueMesh skin hides MFL's nav bar below 54.25em; `fuad.css` overrides
  that. Wide MFL modules already scroll sideways on phones.
- **Tabs:** the commissioner can configure up to 10 custom tabs ("Main" is fixed). MFL's nav bar and
  dropdown menu can't be changed.
- **Local previews:** Chrome asks once before a public site may load from `localhost` (Local Network
  Access).
- **GitHub:** master is protected (PRs only), so the job writes only to `league-data`. Scheduled
  workflows are disabled after 60 days without activity.
- **Blind bid comments** appear only on the logged-in Previously Processed Waivers page
  (`/<season>/processed_waivers?LEAGUE_ID=…&PERIOD=…`), one page per waiver run; the period id is
  the `BBID_WAIVER` transaction's timestamp. Players without an NFL team show as "FA*".
- **Message boards:** the API (`messageBoard`, `messageBoardThread`) needs a login and returns
  nothing for 2024 and earlier. Past seasons' boards are a public archive at
  `/<season>/options?L=48571&O=28`.

## Known limits, accepted

- Snapshots reflect rosters at the next 08:00 UTC run, up to about a day after the deadline.
- Drop penalties are charged at the next 08:00 UTC run. Commissioner moves aren't in the move
  history the job reads, and a hand-entered charge must spell the player's name as MFL does to be
  recognized.
- The over-cap flag lists moves from the last 7 days, so a team over the cap for longer shows none.
  Reversing a move is left to the commissioner.
- The Commish tab's penalty form pre-fills every pending penalty, including ones already charged but
  not yet reset.
- Contract years: a player added and then traded before the job runs stays at 0 years without a flag,
  and a length written without a number or "year" ("Hill for two") isn't read. If the commissioner
  reverses an add for a team under the cap, the player's years must be set to 0 before the drop, or
  the drop chore charges a penalty. The bids page reader breaks if MFL changes that page; it fails
  loudly rather than defaulting.
- A preview that loads but then crashes doesn't fall back. `?fuadPreview=off` recovers.
- Until A ships, the Contracts tab is long on phones. Until C ships, desktop shows three navigation
  rows.
