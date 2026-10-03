# Roadmap

**League:** 48571 (contract dynasty) on MyFantasyLeague · **As of:** 3 Oct 2026

What's live, what comes next, the decisions already made, and the facts that constrain them.

## Live: v1

- Code is served from GitHub Pages (`site/v1/`). An all-pages home page message
  (`mfl/message-header.html`) loads it. The Contracts, Commish and Links messages are one-line
  mount points.
- It rebuilds the old jQuery/Handlebars features with no visible change. The one addition is a
  note naming which franchise salaries are shown.
- Franchise salaries switch automatically:
  - last season's snapshot before the week 1 kickoff (or while MFL hasn't published the schedule)
  - a live projection until the trade deadline (the first kickoff of week 12)
  - this season's snapshot after it
- **Daily job** (08:00 UTC):
  - logs in as commissioner
  - snapshots franchise salaries after the deadline to the `league-data` branch
  - publishes any new or changed snapshot
  - writes a chore log, and re-enables itself (GitHub's 60-day rule)
- Tier 0 is done:
  - MFL's nav bar is kept visible on phones
  - the redundant Live Scoring tab was removed
  - Power Rankings, League Chat, Poll and Trade Bait stay by choice
  - no skin change; members choose their own apps

## Next versions

Each one is built in a new `site/vN/` folder, previewed with `?fuadPreview=vN` (or `local:vN`),
checked with `tools/verify/verify.py`, and activated by editing the header message. The order isn't
decided. A and C change what members see, and the commissioner wants member feedback on those.

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
1. **Cap penalties on drops.** Today's Commish tab already detects these: a free agent still carrying
   a contract, last moved by a drop. Apply the `salaryAdj`, then reset the player to $1 / 0 years.
   Avoid double-applying by matching the adjustment description, e.g. "Name (2yrs@10)".
2. **Contract years on adds:**
   - **Blind bids:** the years are in the bid message, visible only on the logged-in Prior FA Bids page
     (`/<season>/processed_waivers?L=48571`), not in the API. **Need a saved copy of that page to build
     the parser.**
   - **First-come-first-served adds:** members post the years on the message board. **Open:** parse
     free-text posts, or add a structured "Set contract length" control that posts in a fixed format.
3. **Over-cap moves:** detect transactions that push a team over the cap, counting pending penalties.
   **Open:** flag with a one-click reverse (`fcfsWaiver` drop/re-add), or flag only.
4. **Season rollover routine** (manual today): decrement every contract year by 1, and set players who
   go from 1 to 0 years (new RFAs) to $0.01. MFL won't allow $0, and $0.01 shows as $0 on the roster
   report.
5. **Commish-tab chores queue** for anything needing a decision.
6. **Message board posts** of what the bot did: off for now, and the commissioner may turn them on
   after seeing the log.

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

## Known limits, accepted

- Snapshots reflect rosters at the next 08:00 UTC run, up to about a day after the deadline.
- A preview that loads but then crashes doesn't fall back. `?fuadPreview=off` recovers.
- Until A ships, the Contracts tab is long on phones. Until C ships, desktop shows three navigation
  rows.
