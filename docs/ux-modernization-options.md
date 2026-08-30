# UI/UX modernization — options review

**League:** 48571 (contract dynasty) · **Live site:** `https://www44.myfantasyleague.com/2026/home/48571`
**Prepared:** 30 Aug 2026 · **Status:** research only, no code changes made

Goals this was written against: good looking, intuitive, common functions obvious
while advanced functions stay possible, mobile friendly, within the spirit of what
MFL allows (no backdoor hacks that get shut down), stable year to year, avoid rewrites.

Stated priorities from the commissioner:
- Placement (in-MFL vs. companion site): open, let the research decide.
- Maintenance appetite: **modest** — git + a build step + auto-deploy is acceptable.
- Most common member job: **rosters, lineups and scores.**
- MFL entitlements: whatever the yearly hosting fee includes.

---

## 1. The constraint that decides everything

Every option is really an answer to one question: *where does the JavaScript run when
it asks MFL for rosters?*

| Where the code runs | Data call to `/2026/export?TYPE=…` | Notes |
|---|---|---|
| Inside the MFL page | **Works** | Same origin. The member's session cookie rides along, so private-league data and commissioner views just work. `window.franchise_id` identifies the viewer. No key, no secret, no server. |
| A site you host | **Blocked** | Browser blocks the cross-origin read, and MFL states they will not add third-party domains to their cross-origin allowlist. No front-end trick gets around it. |
| A build job / serverless function | **Works, with strings** | Supported server-side, but needs the league API key, a stored MFL login for private data, a registered User-Agent, ~1 req/sec, and aggressive caching. A credential to rotate and a rate limit to respect, forever. |

Crucially: **loading `<script src>` / `<link rel=stylesheet>` cross-origin has never been
restricted.** The current site already pulls jQuery and Handlebars from cdnjs. So code and
data have completely different rules — and that gap is where the good options live.

---

## 2. Repo audit (first-hand, from the code)

### Drift — git no longer matches production
Last commit is "Updates for 2022". `src/fuadUtil.html` still has `var year = "2022"` and
franchise-player salaries frozen at 2021 names. The live site is on 2026. The real source of
truth is a set of textareas in MFL admin. **This must be reconciled before any rebuild.**

### Mobile — the layout is a fixed-width table from 2001
`<table id="homepagecolumns">` with `width="65%"` / `width="35%"`, `cellspacing`, `align="center"`.
A seven-column contract table cannot reflow on a phone. This is the single biggest reason the
site feels bad on mobile, and it is ours, not MFL's.

### Setting — MFL may already be trying to help
With *Desktop View On Mobile* set to No, MFL injects a viewport meta tag and a responsive
stylesheet into the skin. Confirm this is on; a responsive skin wrapped around a rigid table
still reads as broken.

### Fragile — one line reaches into MFL's own markup
`src/fuadCommish.hbs:134` — `$("#tabcontent0").find("#homepagecolumn1").prepend(html)`.
Depends on MFL's internal DOM structure and IDs. Most likely thing in the codebase to break
silently on an MFL update.

### Stack — every dependency is 13+ years old, and one is load-bearing
jQuery 1.8.0, Underscore 1.4.2, Modernizr 2.6.2, Handlebars 1.0.rc.1 (a release candidate).
`src/fuadContract.hbs` uses `.attr("checked")`, whose meaning changed in jQuery 1.9 — so the
version pin is a dependency, not a preference. Modernizr is loaded only to feature-detect
`localStorage`.

### Speed — eight requests in a chain
players → franchises → salary adjustments → rosters → transactions → weekly results →
free agents → injuries, strictly sequential, parsed as XML. Six of the eight are independent
and could run concurrently. The full NFL player database is fetched and cached into
`localStorage`. `JSON=1` is available and would drop XML parsing entirely.

### Ritual — three hand-edits a year, one via the console
`year`, `beforeDraft`, `beforeTradeDeadline` are hardcoded. After the trade deadline a
commissioner clicks a button that `console.log`s a block of JavaScript to copy back into the
source (`addPostTradeDeadlineJsButton` in `src/fuadCommish.hbs`). Year and league ID are both
already in the page URL and could be derived.

### Keep — the architecture is genuinely right
Same-origin execution buys cookie auth, private-league access, per-member identity, zero
hosting, zero secrets — and it's purely additive, so MFL keeps owning lineups, trades,
waivers and scoring. Don't give this up cheaply.

---

## 3. Options, ordered by escalating commitment

### Tier 0 — Settings, skin, and send everyone to an app (~4 hrs, no upkeep)
No code. Confirm *Desktop View On Mobile* is off, pick a modern skin from MFL's 40+ (or a free
responsive template from MFL.football / MFLaddons), tidy the home page module and tab
arrangement, point the league at **MFL Modern** (free for one team, logs in with MFL
credentials), MFL Mobile or MFL Platinum.

- **For:** rosters/lineups/live scores are 100% MFL-native and these apps already do them well
  on mobile, maintained by someone else. Zero maintenance, zero risk, survives every MFL change.
  Establishes the visual baseline before you spend effort.
- **Against:** does nothing for the contract/cap layer (the league's actual differentiator).
  A skin repaints, it doesn't reorganize. Third-party apps can be abandoned or go paid — three
  exist, which is also a hint none is definitive. Apps generally won't render custom home page
  modules, so mobile members may not see the contract views at all.
- **Verdict:** do this first regardless. Highest return per hour, and it reveals how much of the
  problem is actually ours.

### Tier 1 — Modernize in place, keep pasting (~2 days, paste per season)
Same deployment model, rewritten files. Drop all four libraries for vanilla ES2020 + template
literals; CSS grid plus a card view under a breakpoint; `JSON=1`; `Promise.all` for the
independent fetches; derive year and league ID from the URL.

- **For:** smallest change of habit, nothing new to host. Kills the rigid table and the
  hardcoded year. Zero dependencies means nothing left to bit-rot. Keeps same-origin.
- **Against:** still deploys by copy-paste into a textarea, so git drifts again — that's how we
  got here. No local preview, no tests. Under-uses the accepted budget.
- **Verdict:** solid fallback if we later want zero infrastructure. Otherwise it's Tier 2 minus
  the part that fixes the drift.

### Tier 2 — Thin loader in MFL, real app on GitHub Pages (~1 week, then `git push`) ← RECOMMENDED
One home page message holds a mount point and two tags pointing at
`bborchardt.github.io/fuadmflsite/`. Everything else lives in the repo, builds with Vite or
esbuild, deploys on push via GitHub Actions. The app renders *inside* the MFL page, so every
data call is still same-origin.

```html
<div id="fuad-root"></div>
<link rel="stylesheet" href="https://bborchardt.github.io/fuadmflsite/fuad.css">
<script src="https://bborchardt.github.io/fuadmflsite/fuad.js"></script>
```

- **For:** modern tooling + auto-deploy with none of the data problems, because the code still
  executes on MFL's origin. Deploying is `git push`; the repo becomes the source of truth again.
  No API key, no stored credentials, no proxy, no CORS workaround, no rate-limit accounting.
  Private-league and commissioner views keep working by cookie. One URL for the league. Point
  the loader at `localhost` to preview against real league data. Nothing here is a backdoor —
  external `<script src>` is what the site already does, and MFL gives leagues disk space for
  custom code.
- **Against:** the MFL page now depends on GitHub Pages being reachable (mitigate: keep a built
  copy in MFL's league file space as a fallback source). Still inherits MFL's page chrome and
  skin CSS. A future MFL Content-Security-Policy blocking third-party scripts would break the
  loader (low odds; the MFL-hosted fallback covers it). Someone still pastes the loader once per
  season. Slightly more moving parts for a commissioner who inherits this in five years.
- **Verdict:** the recommendation. The only option that gets a modern build pipeline without
  giving up cookie auth, per-member identity, or the single-destination experience.

### Tier 3 — Static companion site, data baked at build time (~2 weeks + a secret)
GitHub Actions cron fetches the exports server-side, commits JSON, a static site (Astro,
SvelteKit, Next export) renders a custom dashboard. Optionally iframed back into an MFL tab.

- **For:** total design freedom, real components, dark mode, charts, proper mobile nav, none of
  MFL's chrome. Fast (pre-computed static JSON). Testable with PR previews. Room to blend in
  outside data (dynasty values, ADP, historical charts).
- **Against:** **data is only as fresh as the last cron run**, which directly undercuts
  rosters/lineups/live scores — the stated top job. Private data needs a stored MFL login or API
  key in GitHub secrets. The site can't tell who's viewing, so no "your team" view and no
  commissioner-only tools without building auth. Two destinations, or an iframe that behaves
  badly on phones. Every MFL auth or export change becomes an emergency.
- **Verdict:** good for read-only, slow-moving content. Poor fit for the prioritized jobs.

### Tier 4 — Companion site plus a serverless proxy (~3 weeks, real ops)
Tier 3 but a Cloudflare Worker / Vercel function proxies MFL calls live, holding the API key
and a logged-in session cookie.

- **For:** live data *and* full design freedom — the only option with both. A place to cache,
  precompute and shape an API to the league's rules. Could serve a real mobile app later.
- **Against:** we'd own credentials, a proxy, cache invalidation, and rate-limit compliance for
  the whole league funnelled through one identity. MFL says plainly they won't allowlist
  third-party domains; proxying around that leans on the letter rather than the spirit — the
  thing we asked to avoid. Most to maintain, highest chance of a forced rewrite when MFL changes
  login or session handling. Directly contradicts "stable year to year."
- **Verdict:** not recommended.

### Tier 5 — Hybrid: Tier 2 for the league, small public site for the front porch
In-MFL app owns everything needing auth (cap sheets, contracts, commissioner tools, live views).
A separate static site owns read-only, no-auth material — league history, bylaws, records,
championships.

- **For:** each half uses the mechanism it suits. The public site can be beautiful and shareable
  without touching a credential. League history doesn't need to be fresh, so Tier 3's staleness
  problem evaporates.
- **Against:** two build targets and two deploys even in one monorepo. More concepts for a future
  commissioner. Easy to start and never finish.
- **Verdict:** a good year-two move on top of Tier 2, not a starting point.

### Tier 6 — Leave MFL for a platform with native contracts (due diligence)
League Tycoon handles salary caps, multi-year extensions, rookie scales and franchise tags
natively (~$12/team/yr for contract dynasty) and imports MFL salary and contract data plus past
seasons. Fantrax has native salary cap and a cleaner web UI but a weak app.

- **For:** the contract logic we hand-maintain becomes a product feature; the annual JavaScript
  ritual ends. Modern mobile-first UI is their problem. Import claims to carry salaries, contract
  years and up to 20 prior seasons.
- **Against:** **our rules are idiosyncratic** — anything not modelled natively (our cap-penalty
  formula, rookie salary curve, RFA handling) becomes *worse* than today, because we lose the
  escape hatch of writing our own code. MFL's openness is precisely why this repo works.
  Migration risk mid-dynasty, buy-in needed from every owner. Betting a long-running league on a
  newer company is a bigger bet than staying.
- **Verdict:** worth an hour of looking so we know what we're choosing against. Not a
  recommendation.

---

## 4. Comparison

| Option | Build | Yearly upkeep | Live data | Design freedom | Knows the member | Secrets |
|---|---|---|---|---|---|---|
| 0 · Settings & apps | ~4 hrs | None | Yes | None | Yes | None |
| 1 · Modernize in place | ~2 days | Paste per season | Yes | Within MFL | Yes | None |
| **2 · Loader + Pages** | **~1 week** | **git push** | **Yes** | **Within MFL** | **Yes** | **None** |
| 3 · Static companion | ~2 weeks | Cron + secret | Stale | Total | No | MFL login |
| 4 · Companion + proxy | ~3 weeks | Real ops | Yes | Total | Build it | Key + login |
| 5 · Hybrid | 2 + 2 wks | Two deploys | Where it counts | Total, publicly | Yes, in MFL | None |
| 6 · Change platform | migration | Theirs | Yes | Theirs | Yes | None |

---

## 5. Recommended sequence

1. **Check the mobile setting and the skin first.** If *Desktop View On Mobile* is still on, or
   the skin is a 2012 pick, we're solving a problem MFL already solved.
2. **Reconcile the repo with production.** Pull the current text out of each home page message
   and commit it. Right now nobody knows what's actually running.
3. **Build the loader** (Tier 2). One home page message; everything else in the repo, built and
   deployed by Actions.
4. **Rewrite the contract views mobile-first** — cards under a breakpoint, table above — and
   derive year and league ID from the URL so the season rollover stops being a code edit.
5. **Point the league at MFL Modern** for phone lineup-setting; stop trying to out-build it.

---

## 6. What to design (independent of which option)

- **Lead with one "My Team" view.** The contract tab currently opens with every rostered player
  in the league grouped by contract year — a reference document, not a landing page. Members
  arrive asking: how much cap space do I have, am I legal on roster count (23/30), who's
  expiring, what does cutting this guy cost. Put those numbers at the top for the logged-in
  franchise — we already know who they are.
- **Cards on phones, table on desktop, one data source.** Same player objects, stacked cards
  below a breakpoint. Biggest single win for perceived quality.
- **Make contract state legible, not numeric.** `Years: 0` currently means restricted free
  agent. A badge — *RFA*, *Expiring*, *Signed thru 2028* — carries it at a glance.
- **Advanced things stay possible, behind a door.** Cap penalty calculator, rookie salary scale,
  franchise-tag tables, commissioner forms — all useful, none belong on first paint. A Tools
  section gives "common easy, advanced possible" without two separate sites.
- **Design the empty and slow states.** Eight chained requests means members currently stare at
  a blank column. Render the shell immediately, fill as data lands, say something when a fetch
  fails.

---

## 7. Year-to-year stability checklist

- [ ] Derive year and league ID from `document.location`. Never hardcode a season.
- [ ] Depend on exactly one MFL DOM hook — our own mount point. Delete the
      `#tabcontent0` / `#homepagecolumn1` reach-in.
- [ ] Use only documented `export?TYPE=` endpoints. Never parse MFL's rendered HTML.
- [ ] Compute post-deadline franchise and rookie baselines rather than pasting generated code.
      If a snapshot is genuinely needed, store it in MFL, not in the source file.
- [ ] Pin exact dependency versions and vendor them into the build, so a CDN outage isn't a
      league outage.
- [ ] Keep a built copy of the bundle in MFL's league file space as a fallback.
- [ ] Write the season rollover procedure into the repo. There is no README today; the ritual
      lives only in the commissioner's head.
- [ ] Prefer boring, dependency-light code. Edited a few days a year by one person — cleverness
      costs more than it returns.

---

## 8. Verify before building — research caveat

All `myfantasyleague.com` domains were blocked by the network policy of the session that
produced this document, so the live site, the API docs and the MFL forums could **not** be
opened directly. The repo audit in §2 is first-hand from the code. The MFL platform specifics
come from search results and third-party sources.

Three claims to confirm before building on them:

1. **That MFL still declines cross-origin browser access and won't allowlist domains.**
   Check Help → Developer's API while logged in. This is the load-bearing claim for the whole
   options split in §1.
2. **That league file space accepts a JS/CSS upload referenceable by URL** — the Tier 2 fallback
   plan depends on it.
3. **The league's current *Desktop View On Mobile* setting** (Commissioner → Setup → Appearance).

Also worth pulling live in a session with full internet: the current home page module contents
(for the §5 step-2 reconciliation), the exact skin in use, and the 2026 `api_info` page for the
current export type list.

## Sources

- MFL Developers Program, 2026 API docs — https://api.myfantasyleague.com/2026/api_info
- MFL appearance customization — https://home.myfantasyleague.com/features/appearance-customization/
- MFL Open Developer's API — https://home.myfantasyleague.com/features/developers-api/
- MFL Acceptable Use (league disk space for custom code) — https://home.myfantasyleague.com/use.html
- MFL forums, cross-domain XML in JavaScript (the no-allowlist statement) — http://forums.myfantasyleague.com/forums/index.php?showtopic=27624
- MFL forums, new user display settings (Desktop View On Mobile, responsive.css) — http://forums.myfantasyleague.com/forums/index.php?showtopic=35576
- MFL forums, free mobile template — http://forums.myfantasyleague.com/forums/index.php?showtopic=35720
- MFL forums, custom MFL tabs — http://forums.myfantasyleague.com/forums/index.php?showtopic=35498
- MFL Modern — https://apps.apple.com/us/app/mfl-modern/id6751516222
- MFL Mobile — https://apps.apple.com/us/app/mfl-mobile-myfantasyleague/id639397317
- MFL Platinum — https://apps.apple.com/us/app/mfl-platinum/id452910130
- League Tycoon vs MyFantasyLeague — https://leaguetycoon.com/compare/league-tycoon-vs-myfantasyleague/
- League Tycoon league import — https://leaguetycoon.com/features/league-import/
- FantasyPros, best dynasty platforms 2026 — https://www.fantasypros.com/2026/07/best-dynasty-fantasy-football-platforms/
- Prior art: a companion site on the MFL API — https://github.com/alexciarlillo/mfl-league-site
