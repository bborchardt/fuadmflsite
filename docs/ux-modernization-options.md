# UI/UX modernization — plan

**League:** 48571 (contract dynasty) · **Live site:** `https://www44.myfantasyleague.com/2026/home/48571`
**As of:** 3 Oct 2026, Week 4 · **Summary:** [`findings.md`](findings.md)

The plan for the league site: what it is today, what MFL allows, what's been decided, and
what ships when.

---

## 1. The site today

- MFL's BlueMesh skin, with three navigation rows: MFL's dropdown menu, MFL's nav bar, and
  seven custom tabs (Main, Standings, Transactions, Contracts, Calendar, Commish, Links).
- On phones, the dropdown menu and the custom tabs each collapse to a "+" bar, and MFL's nav
  bar shows as a swipeable row on every league page.
- The league's own features are custom code: a rules-violation check on Main, plus the
  Contracts, Commish and Links tabs. It's pasted into the shared page header (fuadUtil) and
  home page messages 3–6, and the repo matches what's deployed.

| Problem | Evidence |
|---|---|
| **The site looks dated**, and none of MFL's stock skins fix that | BlueMesh dates from MFL's 2017 skin set |
| **The Contracts tab is a reference document, not a tool** | 15,226px on a phone, about 18 screens, listing every rostered player in the league |
| **Three navigation rows on desktop** | Phones show one swipeable nav row; desktop shows all three, and MFL's two can't be removed |
| **Deploying means pasting into five places** | The repo goes out of date whenever a paste is missed |
| **Commissioner chores are manual** | Contract years on adds, cap penalties on drops, watching for over-cap moves, and a post-deadline franchise-salary paste via the browser console |
| **2012-era code underneath** | jQuery 1.8, Underscore 1.4, Modernizr 2.6 and Handlebars 1.0 RC. Eight data requests run one after another, and no response is checked. |

---

## 2. What MFL allows

| Fact | Consequence |
|---|---|
| MFL's data API is **same-origin only** for browsers, and its terms forbid JavaScript access from other domains. | Page code must **run inside an MFL page**. |
| Rate limits are per IP; MFL exempts "calls from within league pages". | In-page code is unaffected. A once-a-day server job is far below any limit. |
| Loading scripts and stylesheets from another domain is unrestricted, and the league page sends **no Content-Security-Policy**. | Code can be hosted on GitHub Pages and run inside MFL. |
| **fuadUtil sits in the shared header of every league page.** | One header reaches every page, and CSS there outranks the skin. |
| MFL keeps each past season's site, and **copies the header forward** at renewal. | Each season's header can pin its own code version. |
| The commissioner's login can **write**: salary adjustments, contract years and salaries, and add/drop moves on a team's behalf. | Commissioner chores can be automated with MFL's documented import API. |
| Bid messages appear on the logged-in **Prior FA Bids** page (`processed_waivers`), not in the API. | Contract years from bids can be read from that page, which is not a documented API. |
| MFL's rosters by week keep membership, but **salaries always show current values**: a cut player reads $1. | Franchise salaries must be **snapshotted at the deadline**, not recomputed later. |
| MFL's NFL schedule gives every kickoff time. | Week 1 and the week 12 trade deadline can be computed, never entered. |
| GitHub disables **scheduled** jobs after 60 days without repo activity. | A daily job needs a keepalive. |

**Your requirements:** works well in a phone browser; no new navigation layer; the custom
tabs stay; within MFL's rules; stable year to year with as few chores to remember as possible.

---

## 3. Decisions

### Delivery: versioned code on GitHub Pages

- The MFL header holds a stylesheet link and a script tag pointing at a **version**:
  `https://bborchardt.github.io/fuadmflsite/v1/fuad.js`. Messages 4–6 hold one-line mount
  points.
- **Versions** live in `site/v1/`, `site/v2/`… and are published on every push.
- **New versions start dark.** Activating one means changing the version in the header, and
  reverting means changing it back.
- **Archives pin themselves.** Each season's site keeps the header it ended with.
- **Changing an active version in place** is the maintainer's call. It's fine for low-risk
  tweaks, but it reaches every season using that version and is undone with `git revert`, not
  a header switch.
- **Preview:** a setting stored only in your browser loads a dark version or your laptop's
  copy on the live site. It's limited to `localhost` and this repo's versions.
- **Resilience:** a "league tools unavailable" message if Pages is down, and a paste-able
  fallback build in the repo.

### Franchise salaries: automatic

| On a season's site | Shows |
|---|---|
| Before the week 1 kickoff (a stand-in for the offline rookie draft) | Last season's snapshot |
| Week 1 → the week 12 trade deadline (first kickoff of week 12) | Live projection |
| After the deadline | This season's snapshot |

Each phase is labeled on the page. The commissioner button stays as a manual backup.

### A daily GitHub job

- Runs early each morning (Central time) and logs in as commissioner, with the password in
  GitHub's encrypted secrets.
- **v1:** takes the franchise snapshot after the deadline and publishes it.
- **Chore log** on its own `chore-log` branch: an entry when something happens, plus a monthly
  heartbeat.
- **Keepalive:** the job re-enables itself through GitHub's API on every run, so a quiet
  offseason can't switch it off.
- **No message board posts for now.** That can be turned on after seeing the log in action.

### League logic written once

Cap math, the penalty formula, the rookie table, franchise rules and the season phases live in
plain JavaScript modules that both the page and the daily job import, so the two can't disagree.

---

## 4. What ships when

### v1 — new foundation, no visible change

1. **Delivery** as above.
2. **Engine rebuild:**
   - The four 2012-era libraries are replaced with plain modern JavaScript.
   - Data loads in parallel, and every response is checked.
   - The season comes from the page URL.
   - League logic is shared with the job.
3. **Automatic franchise salaries**, with the three phases.
4. **The daily job**, with the snapshot, the chore log and the keepalive.

Members see the same tabs and content. **Effort:** about 2–3 days, done well before this
season's deadline (Wed 25 Nov 2026, 7:00 pm Central).

### Later versions, each previewed before activation

| Version | What | Why it waits |
|---|---|---|
| **A** | Contracts rebuilt around "My Team": cap space, roster count, expiring contracts and cut costs first; cards on phones; the full league list one tap away | Visible change; worth member feedback |
| **C** | A league-wide look: our own stylesheet on every page, a calmer desktop navigation | Visible change; best after A sets the visual language |
| **Chores** | In the daily job: cap penalties on drops, contract years from bid messages, over-cap flags. A chores queue on the Commish tab for anything that needs a decision. Message board posts, if wanted. | Builds on v1's job and shared logic |

**Open questions for the chores version:**
- Contract years on first-come-first-served adds: read free-text message board posts, or add a
  structured "Set contract length" control for members?
- Over-cap moves: flag with a one-click reverse, or flag only?
- A saved copy of the Prior FA Bids page is needed to build its parser.

### Ruled out

- **A separate companion site:** a second destination is a new navigation layer, and it can't
  tell who's viewing.
- **A proxy for MFL's API:** against MFL's terms.
- **Leaving MFL:** would give up the custom rules MFL's openness allows.
- **A public league-history site:** optional, and only after A and C.

---

## 5. Design rules

- **One primary navigation per screen size.** MFL's nav bar is the main menu, and our tabs are
  the league's own section. Never add a third league menu.
- **Start from the member's question**, not the data dump.
- **Phones first.** Cards under MFL's breakpoint, tables above it, 44px tap targets.
- **Advanced things one tap down:** calculators, scales and commissioner tools.
- **Design the slow and broken states.** Show the shell immediately, fill it as data arrives,
  and say so when a request fails.
- **Automation is visible.** Every automated change is logged, and anything risky is flagged
  for a person rather than done.

## Sources

- Live league site and pages, measured in Chrome at 390px and 1440px on 3 Oct 2026
- MFL 2026 API reference: hosts, rate limits, imports, forbidden uses — https://api.myfantasyleague.com/2026/api_info?STATE=details
- MFL Help Centre, Site Appearance — https://www44.myfantasyleague.com/2026/support?CATEGORY=Appearance%20%26%20Customization&SUBCATEGORY=Site%20Appearance
- GitHub Actions: disabling and enabling workflows — https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/disabling-and-enabling-a-workflow
