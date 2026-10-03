# UI/UX modernization — options

**League:** 48571 (contract dynasty) · **Live site:** `https://www44.myfantasyleague.com/2026/home/48571`
**As of:** 3 Oct 2026, Week 4 · **Summary:** [`findings.md`](findings.md)

An analysis of the league site as it is today: what's wrong with it, what MFL allows, what
to build, and how to deliver it.

---

## 1. Where things stand

**The site today:**
- MFL's BlueMesh skin, with three navigation rows: MFL's dropdown menu, MFL's nav bar, and
  seven custom tabs (Main, Standings, Transactions, Contracts, Calendar, Commish, Links).
- On phones, the dropdown menu and the custom tabs each collapse to a "+" bar, and MFL's nav
  bar shows as a swipeable row on every league page.
- League features are custom code: a rules-violation check on Main, plus the Contracts,
  Commish and Links tabs. It's pasted into the shared page header (fuadUtil) and home page
  messages 3–6.
- The repo matches what's deployed.

**What's wrong with it:**

| Problem | Evidence |
|---|---|
| **The site looks dated**, and none of MFL's stock skins fix that | Your judgment; BlueMesh dates from MFL's 2017 skin set |
| **The Contracts tab is a reference document, not a tool** | 15,226px on a phone, about 18 screens, listing every rostered player in the league. Members have to dig for their own cap space. |
| **Three navigation rows on desktop** | MFL's dropdown menu, MFL's nav bar and our tabs. Phones are now workable; desktop is still cluttered. |
| **Deploying means pasting into five places** | Header (fuadUtil) plus home page messages 3–6. The repo goes out of date whenever a paste is missed. |
| **A yearly code ritual** | `year`, `beforeDraft`, and the post-deadline franchise-player paste via the browser console |
| **2012-era code underneath** | jQuery 1.8, Underscore 1.4, Modernizr 2.6 and Handlebars 1.0 RC from cdnjs. Eight data requests run one after another (0.75s; about 0.25s in parallel). No response is checked, so a failed request goes unnoticed. |

---

## 2. What decides the options

### Platform facts

| Fact | Consequence |
|---|---|
| MFL's data API is **same-origin only**. Exports send a fixed `Access-Control-Allow-Origin: https://www44.myfantasyleague.com`, and MFL's 2026 API terms forbid JavaScript access from other domains. | League data can only be read by code running **inside an MFL page**. A site hosted elsewhere can't read it in the browser. |
| MFL's rate limits are per IP, and its terms say "calls from within league pages should not [be] affected". | In-page code is exempt. Servers and proxies are not. |
| Loading `<script src>` or a stylesheet from another domain is unrestricted, and the league page sends **no Content-Security-Policy**. | Code can be *hosted* anywhere, as long as it *runs* inside the MFL page. |
| **fuadUtil sits in the shared header of every league page.** | One paste reaches every page. CSS there outranks the skin (the phone nav bar works this way), so a league-wide look is possible without a stock skin. |
| Images & Other URLs Setup has a **League CSS field (file or URL)** and a "Load jQuery" switch. | MFL supports custom league CSS. Restyling is within the rules. |
| Our tabs are configurable (up to 10; "Main" is fixed). MFL's nav bar and dropdown menu are not. | We can shape our tabs, never MFL's rows. |
| MFL wraps home page modules in a box that scrolls sideways on phones. | Wide MFL modules like Power Rankings are usable on phones as they are. |
| The repo is **public**. | GitHub Pages hosting is free. |

### Your requirements

1. **The site must work well in a phone browser.** We can't count on an app; you found MFL
   Modern lacking.
2. **No new navigation layer.** Whatever we build lives inside a tab.
3. **Keep the custom tabs** as members know them.
4. **Stay within MFL's rules**: no workarounds MFL would shut down.
5. **Stable year to year**, with modest upkeep. Git, a build step and auto-deploy are acceptable.

---

## 3. What to build

Three independent pieces of work. Each can ship on its own, in any order, and none depends
on how it's delivered (§4).

### A. Contracts, rebuilt around "My Team"

The league's own feature, and its worst phone experience.

- **Open with the viewer's franchise:** cap space against $300, roster count against 23–30,
  who's expiring, and what cutting each player costs. MFL tells us who's logged in, so this
  is possible today.
- **Cards on phones, a table on desktop**, both drawn from the same data.
- **Contract state as badges** (*RFA*, *Expiring*, *Signed thru 2028*) instead of "Years: 0".
- **The full league roster stays one tap away**, collapsed by default.
- **Reference tables behind a door:** rookie salaries, franchise-tag salaries and the
  calculator stay on the tab, below the member's own view.

**Size:** 2–3 days. **Payoff:** the Contracts tab goes from about 18 phone screens to one
screen that answers the member's question.

### B. Engine cleanup

Invisible to members, but it makes everything else cheaper and less fragile.

- Replace the four 2012-era libraries with plain modern JavaScript.
- Fetch the eight data requests in parallel and render as data arrives.
- Check every response's shape and show a message on the page when something fails.
- Derive `year` and the league ID from the page URL, so the season rollover is no longer a
  code edit.
- Replace the post-deadline console ritual. How depends on delivery: a committed JSON file
  under Option 2, or a generated paste under Option 1.

**Size:** about 2 days, less if done alongside A.

### C. A league-wide look

Your "it looks dated" complaint, addressed without picking a stock skin.

- **Our own stylesheet in the shared header:** type, color, spacing, tables and module
  headers, on every league page.
- **Calmer desktop navigation:** we can't remove MFL's rows, but we can restyle all three so
  MFL's dropdown recedes, the nav bar reads as the main menu and our tabs read as the league's
  own section.
- **Phones first:** larger tap targets and readable tables. Wide tables already scroll sideways.

**Risk:** this styles MFL's markup (IDs like `#hsubmenu`, classes like `.homepagemodule`).
That markup has been stable since 2017. If MFL changes it, parts of the look degrade but
nothing breaks.

**Size:** 2–4 days, depending on ambition. Best done after A, so the new Contracts views set
the visual language.

---

## 4. How it gets to the site

Six delivery options, from least to most change.

### Option 1 — Keep pasting

Edit files in the repo, then paste them into the header and messages 3–6.

- **For:** nothing new to set up or learn. It's how the site is deployed today.
- **Against:**
  - Five paste targets per release, and the repo drifts whenever one is missed.
  - MFL's textareas are awkward for 400-line files.
  - The post-deadline ritual stays a console copy-and-paste.
- **Fits:** fine for small changes. It gets painful once A–C put far more code in those
  textareas.

### Option 2 — Load from GitHub Pages ← RECOMMENDED

fuadUtil shrinks to two tags, and messages 3–6 shrink to empty mount points. Everything
else is served from `bborchardt.github.io/fuadmflsite/` and goes live on `git push`.

```html
<!-- the whole header paste, for good -->
<link rel="stylesheet" href="https://bborchardt.github.io/fuadmflsite/fuad.css">
<script src="https://bborchardt.github.io/fuadmflsite/fuad.js"></script>
```

- **For:**
  - Deploying is `git push`. You paste the header once, then only at season rollover, if at all.
  - The repo *is* production, so it can't drift.
  - The code still **runs inside the MFL page**, so data access, logged-in identity,
    commissioner views and the rate-limit exemption all work exactly as today.
  - The post-deadline snapshot becomes a small JSON file in the repo instead of console output.
  - **No build step required.** Pages can serve plain files from the repo. Add a bundler
    later only if the code grows to need one.
  - Changes can be tested on real league data first, by serving the live page with the new
    files swapped in.
- **Against:**
  - Custom content depends on GitHub Pages being up. If it's down, MFL's own pages still work
    but our tabs are empty. Keeping a paste-able build in the repo covers that (Option 1
    as the fallback).
  - Pages caches files for up to 10 minutes, so a push takes a few minutes to reach members.
  - If MFL ever adds a Content-Security-Policy, external scripts could be blocked. There is
    none today.
- **Setup:** about half a day. Enable Pages, move the current code over unchanged, paste the
  two-tag header, and verify. Members see no difference until we ship A–C.

### Option 3 — A separate companion site, data baked at build time

A static site of its own, fed by a scheduled job that downloads MFL exports.

- **Fails two requirements.** It's a second destination, which is a new navigation layer, and
  it can't tell who's viewing, so there's no "My Team". Its data is also only as fresh as the
  last scheduled run, and the job is subject to MFL's per-IP rate limits.
- **Verdict:** not recommended for anything members use week to week.

### Option 4 — Companion site plus a proxy

Option 3 with a server relaying MFL calls live.

- **Verdict:** rejected. It exists only to get around MFL's same-origin rule, which MFL's
  terms forbid in writing, and it funnels the whole league through one rate-limited IP.

### Option 5 — A small public site for league history

Read-only and public: champions, records, bylaws, draft history. Nothing that needs to be
live or logged in.

- **For:** a shareable "front porch" with no data constraints at all.
- **Against:** a second destination, though a rarely visited one. One more thing to maintain.
- **Verdict:** optional, and only after A–C. It could live on the same GitHub Pages site as
  Option 2.

### Option 6 — Leave MFL

League Tycoon models salary caps, extensions, rookie scales and franchise tags natively.

- **For:** the league's fixed rookie salary table would be easy to model elsewhere.
- **Against:** the custom cap-penalty formula, RFA handling and the franchise-tag
  calculation would all depend on another platform's feature set, and a 25-year dynasty
  would need every owner to agree to move.
- **Verdict:** worth knowing about, not recommended. MFL's openness is what makes A–C possible.

---

## 5. Comparison

| | Setup | Each release | Meets requirements | Data | Knows the member | Risk |
|---|---|---|---|---|---|---|
| **1 · Keep pasting** | none | paste into 5 places | yes | live | yes | drift |
| **2 · GitHub Pages** | ½ day | `git push` | yes | live | yes | Pages outage (MFL pages unaffected) |
| 3 · Companion site | ~2 weeks | automatic | **no**: new destination | stale | no | MFL export changes |
| 4 · Proxy | ~3 weeks | ops | **no**: against MFL terms | live | build it | high |
| 5 · History site | ~1 week | `git push` | as an add-on only | archive | n/a | low |
| 6 · Leave MFL | migration | theirs | unknown | live | yes | migration |

---

## 6. Recommended sequence

1. **Set up Option 2** (½ day). Move the current code to GitHub Pages unchanged and paste the
   two-tag header. Nothing changes for members.
2. **Build A, "My Team" Contracts** (2–3 days), with B's cleanup done in the files A touches.
3. **Finish B** (about 1 day): the remaining library removal, parallel loading and response
   checks.
4. **Design and ship C, the league-wide look** (2–4 days), using A's visual language.
5. **Replace the post-deadline ritual** with a committed snapshot. If Option 2 isn't live by
   this season's deadline, do the paste the old way once more.

Each step ships on its own and can be rolled back with `git revert`.

---

## 7. Design rules for A–C

- **One primary navigation per screen size.** MFL's nav bar is the main menu, and our tabs
  are the league's own section. Never add a third league menu.
- **Start from the member's question**, not the data dump. "Can I afford this?" comes before
  "here is every contract".
- **Phones first.** Cards under MFL's breakpoint, tables above it, 44px tap targets.
- **Advanced things stay possible, one tap down:** calculators, scales and commissioner tools.
- **Design the slow and broken states.** Show the page shell immediately, fill it as data
  arrives, and say so when a request fails.

## 8. Year-to-year stability

- [ ] Derive the season and league from the URL; never hardcode a year.
- [ ] Depend on as few MFL DOM hooks as possible: our own mount points, plus the selectors C
      needs to style.
- [ ] Use documented `export?TYPE=` endpoints on the right host: league calls to `www44`,
      league-independent calls (`players`, `injuries`) to `api`.
- [ ] Check every response; never treat HTTP 200 as success.
- [ ] Keep a paste-able fallback build in the repo for a Pages outage.
- [ ] Write the season rollover steps into the repo README.

## Sources

- Live league site and pages, measured in Chrome at 390px and 1440px on 3 Oct 2026
- MFL 2026 API rules: hosts, rate limits, forbidden uses — https://api.myfantasyleague.com/2026/api_info
- MFL Help Centre, Site Appearance — https://www44.myfantasyleague.com/2026/support?CATEGORY=Appearance%20%26%20Customization&SUBCATEGORY=Site%20Appearance
- BlueMesh skin stylesheets — https://www44.myfantasyleague.com/skins17/BlueMesh/responsive.css
- League Tycoon vs MyFantasyLeague — https://leaguetycoon.com/compare/league-tycoon-vs-myfantasyleague/
