# UI/UX modernization — options review

**League:** 48571 (contract dynasty) · **Live site:** `https://www44.myfantasyleague.com/2026/home/48571`
**Prepared:** 30 Aug 2026 · **Revised:** 30 Aug 2026 — verification pass with full network access
**Status:** research only, no code changes made

Goals this was written against: good looking, intuitive, common functions obvious
while advanced functions stay possible, mobile friendly, within the spirit of what
MFL allows (no backdoor hacks that get shut down), stable year to year, avoid rewrites.

Stated priorities from the commissioner:
- Placement (in-MFL vs. companion site): open, let the research decide.
- Maintenance appetite: **modest** — git + a build step + auto-deploy is acceptable.
- Most common member job: **rosters, lineups and scores.**
- MFL entitlements: whatever the yearly hosting fee includes.

> **What changed in this revision.** The first draft was written in a session where every
> `myfantasyleague.com` domain was blocked, so §1 rested on forum posts and three claims were
> flagged as unverified. This pass reached the live site, the 2026 API and the league's own
> home page. All three claims are now settled (§9), the repo/production drift is fully
> reconciled (§2), the performance cost is measured rather than estimated, and one live
> production bug turned up that no amount of code reading would have caught (§3).
> Corrections to the first draft are marked **Revised**.

---

## 1. The constraint that decides everything

Every option is really an answer to one question: *where does the JavaScript run when
it asks MFL for rosters?*

| Where the code runs | Data call to `/2026/export?TYPE=…` | Notes |
|---|---|---|
| Inside the MFL page | **Works** | Same origin. The member's session cookie rides along, so private-league data and commissioner views just work. `window.franchise_id` identifies the viewer. No key, no secret, no server. |
| A site you host | **Blocked** | Confirmed by direct test, and forbidden by MFL's terms. See below. |
| A build job / serverless function | **Works, with strings** | Supported server-side. No API key needed to read a public league, but you inherit a per-IP rate limit that in-page code is explicitly exempt from. |

### This is now measured, not inferred

Every MFL export response carries a **static** allow-origin header naming MFL's own host:

```
$ curl -sS -D- -o/dev/null -H "Origin: https://bborchardt.github.io" \
    "https://www44.myfantasyleague.com/2026/export?TYPE=league&L=48571&JSON=1"

HTTP/1.1 200 OK
Access-Control-Allow-Origin: https://www44.myfantasyleague.com
```

It is not reflected. Sending `Origin: https://evil.example.com`, or no `Origin` at all,
returns the same fixed value. A browser on any other domain will refuse the read, always.

And MFL's 2026 API terms list this under **forbidden uses**, in their words:

> "Accessing the API via Javascript from web pages outside the myfantasyleague.com domain.
> Normal browser security will prevent this from working and **we will not put your domain
> in our cross-domain file to allow it.**"

**Revised:** the first draft treated this as a technical obstacle. It is also a
terms-of-service line, which changes the verdict on Tier 4 — see §5.

### The rate limit points the same way

From the same document, on the throttling introduced in 2020:

> "The limits will only apply on a per-IP address basis. So if your client is spread across
> many users, it won't be affected by this. Thus mobile apps and **calls from within league
> pages should not [be] affected**."

In-page code spreads across twelve members' own IPs and is called out as exempt. A cron job
or proxy funnels the whole league through one IP — precisely the shape that gets throttled.
This is an argument *for* Tier 2 and *against* Tiers 3–4, from MFL directly.

Crucially: **loading `<script src>` / `<link rel=stylesheet>` cross-origin has never been
restricted.** The current site already pulls jQuery and Handlebars from cdnjs. So code and
data have completely different rules — and that gap is where the good options live.

---

## 2. Repo vs. production — reconciled

**Revised.** The first draft said "nobody knows what's actually running." Now we do. The five
modules were extracted from the live 2026 home page and diffed against `src/`. Production
strips blank lines, so ignoring whitespace, the entire drift is:

| Module | Real drift |
|---|---|
| `fuadUtil.html` | `year` `"2022"` → `"2026"`; `beforeDraft` `true` → `false`; the franchise-player and rookie-baseline block refreshed to 2025 names/salaries (58 lines) |
| `fuadAjax.html` | one stray debug line, production-only: `console.log("Franchise " + franchise.teamName + " salary=" + franchise.salary)` |
| `fuadContract.hbs` | **byte-identical** |
| `fuadCommish.hbs` | **byte-identical** |
| `fuadLinks.hbs` | **byte-identical** |

This is much better news than feared. The drift is confined to the block the code itself
labels *"update these after upgrading site"* — the annual ritual, exactly where you'd expect
it. Three of five files never diverged at all.

Reconciliation is now a mechanical commit rather than an archaeology project. The exact
production text is recoverable from the live page at any time, which also means **the
paste-based workflow is recoverable, not lossy** — a point in favour of keeping it if you
ever want to fall back to Tier 1.

---

## 3. Live bug: injured-player detection has never worked

**New — only findable with network access.**

`fuadUtil.html:164` builds the injuries URL off the league host:

```js
injuriesDataUrl: baseUrl + "export?TYPE=injuries&L=" + leagueId + "&W="
```

which resolves to `https://www44.myfantasyleague.com/2026/export?TYPE=injuries&L=48571&W=1`.
MFL answers that with an error document, at every week tried:

```xml
<error>Invalid request. This API request must go to api.myfantasyleague.com</error>
```

The reason is in MFL's own API docs: *"if the request does not take a league parameter (L=),
it must be sent to the host `api`."* Injuries is global NFL data, not league data — it takes
no `L`. The correct call drops `L` and uses the API host:

```
https://api.myfantasyleague.com/2026/export?TYPE=injuries&W=1   →  200, 36 KB of <injury> nodes
```

**Consequence.** `loadInjuriesData` runs `getElementsByTagName("injury")` over an `<error>`
document, finds nothing, and silently sets no flags. `player.injured` is therefore never
`true`, so this check in `fuadCommish.hbs:121` has never once fired:

```js
warnings.push(franchise.teamName + " started injured/suspended player " + player.fullName + …)
```

A league-rules warning shown on the Main tab to everyone has been dead the whole time, with
no error and no empty state to hint at it. It fails silently because the load chain treats any
200 response as success.

The fix is one line. The lesson is bigger: **eight unchecked `$.get` calls means any of them
can fail this quietly.** Whatever tier you pick, the loader needs to check that a response is
the shape it expected, and say so on the page when it isn't.

*Caveat:* tested logged-out. The error is host-routing, not authentication, so it will behave
identically for a signed-in member — but it costs nothing to confirm in the browser console.

---

## 4. Repo audit (updated)

### Mobile — the outer layout is already handled; our tables are not
**Revised, and this matters.** The first draft blamed `<table id="homepagecolumns">` with its
`width="65%"` / `width="35%"`. But MFL's `responsive.css` already does this at ≤62.5em (1000px):

```css
#homepagecolumn1, #homepagecolumn2, … { width:100%!important; float:left }
```

So the two-column shell **already stacks correctly on a phone.** What does not reflow is the
seven-column contract table we generate ourselves — Player, Position, Salary, Contract Year,
Cap Penalty, Net Cap Space, Franchise — which overflows horizontally inside its now-full-width
column. The target is narrower and more tractable than the first draft implied: fix our
Handlebars tables, not MFL's layout.

Helpfully, MFL's stylesheet already contains the table→card idiom, scoped to one page:

```css
@media (max-width:35.5em){ #body_options_128 .report th{display:none}
                           #body_options_128 .report td{display:block; text-align:left} }
```

Our tables already carry MFL's own `class="homepagemodule report"`. Applying that same pattern
to them is stylistically native rather than a bolted-on override — squarely "within the spirit
of what MFL allows."

### Setting — already correct
**Revised: confirmed, nothing to do.** The live page serves
`<meta name="viewport" content="initial-scale=1.0, width=device-width">` and loads
`skins17/BlueMesh/responsive.css`. *Desktop View On Mobile* is already off and the skin is a
responsive one. The first draft's step-one recommendation is a no-op — good news, but it also
means **the easy win is already spent**; the remaining mobile problem is entirely ours.

### Speed — measured, and worse in shape than in size
Eight strictly sequential XML requests. Measured from a datacenter, warm:

| | Wall clock |
|---|---|
| Sequential, as shipped | **2.50 s** |
| Same eight in parallel | **0.58 s** |

A 4.3× gap on a fast connection; far wider on phone networks, which is where it hurts. The
ordering is a processing dependency, not a fetching one — only `injuries` genuinely needs a
prior response (`week`, from `weeklyResults`). Fetch all eight at once, then process in order.

**Revised on `JSON=1`:** it works on every endpoint, but it is *not* a payload win —
players 190 KB → 183 KB, freeAgents 51 KB → 48 KB, about 5%. The reason to switch is deleting
the XML DOM-walking code, not bytes saved.

### Stack — old, but entirely ours to remove
jQuery 1.8.0, Underscore 1.4.2, Modernizr 2.6.2, Handlebars 1.0.rc.1 (a release candidate),
all from cdnjs. `fuadContract.hbs` uses `.attr("checked")`, whose meaning changed in
jQuery 1.9 — so the version pin is a dependency, not a preference. Modernizr is loaded only to
feature-detect `localStorage`, which every browser has had for a decade.

**New:** MFL's own `mfl_common.js` contains no jQuery and no `$` usage, and the page loads
jQuery exactly once — from our tag. Nothing on MFL's side depends on these four libraries, so
dropping all of them is safe from the platform's point of view. The `jQuery.noConflict()` call
is defensive, not load-bearing.

### Fragile — one line reaches into MFL's own markup
`src/fuadCommish.hbs:134` — `$("#tabcontent0").find("#homepagecolumn1").prepend(html)`.
**New context:** the live page contains **eight** elements with `id="homepagecolumn1"`, one per
tab — invalid HTML that MFL ships anyway, and the reason this selector has to be scoped through
`#tabcontent0` at all. So the line is working around an MFL markup bug, which makes it likelier
than average to break when MFL cleans that up. Replace it with our own mount point.

### Ritual — three hand-edits a year, one via the console
`year`, `beforeDraft`, `beforeTradeDeadline` are hardcoded. After the trade deadline a
commissioner clicks a button that `console.log`s a block of JavaScript to copy back into the
source (`addPostTradeDeadlineJsButton`). Year and league ID are both already derivable — the
code does it for `baseUrl` and then ignores its own work for `year`.

### Keep — the architecture is genuinely right
Same-origin execution buys cookie auth, private-league access, per-member identity, zero
hosting, zero secrets, and now demonstrably a rate-limit exemption — and it's purely additive,
so MFL keeps owning lineups, trades, waivers and scoring. Don't give this up cheaply.

---

## 5. Options, ordered by escalating commitment

### Tier 0 — Settings, skin, and send everyone to an app (~2 hrs, no upkeep)
**Revised down from ~4 hrs:** the mobile setting and responsive skin are already done, so this
tier is now only "pick a nicer skin, tidy the module and tab arrangement, point members at an
app." All three apps are still listed and live: **MFL Modern** (newest, free for one team),
MFL Mobile, MFL Platinum. (The first draft also suggested a free third-party responsive
template; that recommendation is withdrawn — see the note on sources.)

- **For:** rosters/lineups/live scores are 100% MFL-native and these apps do them well on
  mobile, maintained by someone else. Zero risk, survives every MFL change.
- **Against:** does nothing for the contract/cap layer — the league's actual differentiator.
  Apps generally won't render custom home page modules, so mobile members may not see the
  contract views at all. Three competing apps is itself a hint that none is definitive.
- **Verdict:** still worth doing, but it is no longer the free win it looked like — the free
  part is already collected.

### Tier 1 — Modernize in place, keep pasting (~2 days, paste per season)
Same deployment model, rewritten files. Drop all four libraries for vanilla ES2020 + template
literals; CSS grid plus a card view under a breakpoint; `JSON=1`; `Promise.all` for the
fetches; derive year and league ID from the URL.

- **For:** smallest change of habit, nothing new to host. Kills the rigid tables and the
  hardcoded year. Zero dependencies means nothing left to bit-rot. Keeps same-origin.
  **Newly stronger:** §2 shows the paste workflow is faithful and fully recoverable — the drift
  was confined to the settings block, not scattered.
- **Against:** still deploys by copy-paste, so git drifts again. No local preview, no tests.
  Under-uses the accepted budget.
- **Verdict:** a more respectable fallback than the first draft allowed, given how contained
  the drift turned out to be.

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
  executes on MFL's origin. Deploying is `git push`; the repo becomes the source of truth.
  No API key, no stored credentials, no proxy, no CORS workaround, and — now confirmed — no
  rate-limit exposure, since MFL exempts in-page calls. Private-league and commissioner views
  keep working by cookie. Point the loader at `localhost` to preview against real league data.
  Nothing here is a backdoor: external `<script src>` is what the site already does.
- **Against:** the MFL page depends on GitHub Pages being reachable. Still inherits MFL's page
  chrome and skin CSS. Someone still pastes the loader once per season. Slightly more moving
  parts for a commissioner who inherits this in five years.
- **Risk, re-assessed:** the first draft's main worry was a future MFL Content-Security-Policy
  blocking third-party scripts. **The league page sends no CSP header at all today** (nor
  `X-Frame-Options`), so this is a hypothetical rather than a live constraint.
- **Fallback, corrected:** the first draft proposed keeping a built copy in MFL's league file
  space. Partially supported — league files do live same-origin under
  `www44.myfantasyleague.com/fflnetdynamic2026/48571_*` and serve fine, but MFL's help centre
  documents the upload path for **CSS** only — *"define your own CSS and upload using the
  Images & Other URLs Setup screen"* — and directory listing is 403. Treat JS hosting there as
  unconfirmed. **The reliable fallback is the mechanism already in use:**
  paste the built bundle straight into a home page module. That is Tier 1, which makes Tier 1
  the genuine safety net for Tier 2 — a nice property, since the two share all their code.
- **Verdict:** still the recommendation, and better supported than in the first draft. The only
  option that gets a modern build pipeline without giving up cookie auth, per-member identity,
  the rate-limit exemption, or the single-destination experience.

### Tier 3 — Static companion site, data baked at build time (~2 weeks + a secret)
GitHub Actions cron fetches the exports server-side, commits JSON, a static site renders a
custom dashboard. Optionally iframed back into an MFL tab (which would work — no
`X-Frame-Options` — though it behaves badly on phones regardless).

- **For:** total design freedom, real components, dark mode, charts, proper mobile nav, none of
  MFL's chrome. Fast. Testable with PR previews. Room for outside data.
- **Against:** **data is only as fresh as the last cron run**, which directly undercuts
  rosters/lineups/live scores — the stated top job. The site can't tell who's viewing, so no
  "your team" view and no commissioner tools without building auth. Two destinations. Every
  MFL auth or export change becomes an emergency. **Revised:** no API key is needed to read
  this league (it answers unauthenticated — verified against all seven league endpoints), so
  the credential burden is lighter than the first draft said; but the per-IP rate limit now
  applies where it previously didn't.
- **Verdict:** good for read-only, slow-moving content. Poor fit for the prioritized jobs.

### Tier 4 — Companion site plus a serverless proxy (~3 weeks, real ops)
Tier 3 but a Cloudflare Worker / Vercel function proxies MFL calls live.

- **For:** live data *and* full design freedom — the only option with both.
- **Against:** **Revised, and now firmer.** The first draft called this "leaning on the letter
  rather than the spirit." With the terms in hand it is worse than that: MFL lists cross-domain
  JavaScript access under *forbidden uses* and lists "looking for loop holes or other ways to
  cheat or circumvent league rules" alongside it. A proxy exists purely to defeat a restriction
  MFL states plainly. Add the per-IP throttle — the whole league funnelled through one address,
  the exact pattern the limits target — plus credentials to hold and rotate.
- **Verdict:** not recommended. Stronger evidence than before.

### Tier 5 — Hybrid: Tier 2 for the league, small public site for the front porch
In-MFL app owns everything needing auth. A separate static site owns read-only, no-auth
material — league history, bylaws, records, championships.

- **For:** each half uses the mechanism it suits. The public site can be beautiful and
  shareable without touching a credential. League history doesn't need to be fresh.
- **Against:** two build targets and two deploys. More concepts for a future commissioner.
- **Verdict:** a good year-two move on top of Tier 2, not a starting point.

### Tier 6 — Leave MFL for a platform with native contracts (due diligence)
League Tycoon handles salary caps, multi-year extensions, rookie scales and franchise tags
natively and imports MFL salary/contract data. Fantrax has native salary cap and a cleaner web
UI but a weak app.

- **For:** the contract logic we hand-maintain becomes a product feature; the annual ritual ends.
- **Against:** our rules are idiosyncratic — anything not modelled natively (our cap-penalty
  formula, rookie salary curve, RFA handling) becomes *worse* than today, because we lose the
  escape hatch of writing our own code. MFL's openness is precisely why this repo works.
- **Verdict:** worth an hour so we know what we're choosing against. Not a recommendation.

---

## 6. Comparison

| Option | Build | Yearly upkeep | Live data | Design freedom | Knows the member | Secrets | Rate-limited |
|---|---|---|---|---|---|---|---|
| 0 · Settings & apps | ~2 hrs | None | Yes | None | Yes | None | No |
| 1 · Modernize in place | ~2 days | Paste per season | Yes | Within MFL | Yes | None | No |
| **2 · Loader + Pages** | **~1 week** | **git push** | **Yes** | **Within MFL** | **Yes** | **None** | **No** |
| 3 · Static companion | ~2 weeks | Cron | Stale | Total | No | Login, if private | Yes, per-IP |
| 4 · Companion + proxy | ~3 weeks | Real ops | Yes | Total | Build it | Key + login | Yes, per-IP |
| 5 · Hybrid | 2 + 2 wks | Two deploys | Where it counts | Total, publicly | Yes, in MFL | None | Half |
| 6 · Change platform | migration | Theirs | Yes | Theirs | Yes | None | n/a |

---

## 7. Recommended sequence

**Revised — reordered, because verification moved two items.**

1. ~~Check the mobile setting and skin.~~ **Done — already correct.** Viewport and
   `responsive.css` are live. Optionally re-pick the skin for looks; there is no fix owed here.
2. **Fix the injuries URL** (§3). One line, restores a dead league-rules warning, independent of
   which tier you choose. Do it now whether or not anything else happens.
3. **Reconcile the repo with production.** Now a known, 60-line commit (§2) rather than an
   unknown. Do it before writing new code so the starting point is honest.
4. **Build the loader** (Tier 2). One home page message; everything else in the repo, built and
   deployed by Actions.
5. **Rewrite the contract views mobile-first** — cards under ~35.5em matching MFL's own
   breakpoint and its `.report` card idiom, table above — and derive year and league ID from
   the URL so the season rollover stops being a code edit.
6. **Parallelize the data load** — `Promise.all` the eight fetches (2.50 s → 0.58 s measured),
   and check each response's shape so the next silent failure isn't silent.
7. **Point the league at MFL Modern** for phone lineup-setting; stop trying to out-build it.

---

## 8. What to design (independent of which option)

- **Lead with one "My Team" view.** The contract tab opens with every rostered player in the
  league grouped by contract year — a reference document, not a landing page. Members arrive
  asking: how much cap space do I have, am I legal on roster count (23/30), who's expiring,
  what does cutting this guy cost. Put those at the top for the logged-in franchise — we
  already know who they are.
- **Cards on phones, table on desktop, one data source.** Same player objects, stacked cards
  below the breakpoint. Biggest single win for perceived quality, and now a well-scoped job:
  the outer layout already stacks itself (§4).
- **Make contract state legible, not numeric.** `Years: 0` currently means restricted free
  agent. A badge — *RFA*, *Expiring*, *Signed thru 2028* — carries it at a glance.
- **Advanced things stay possible, behind a door.** Cap penalty calculator, rookie salary scale,
  franchise-tag tables, commissioner forms — all useful, none belong on first paint.
- **Design the empty, slow and broken states.** Eight chained requests means members currently
  stare at a blank column for seconds. Render the shell immediately, fill as data lands, and —
  per §3 — say something when a fetch returns the wrong thing, because one of them has been
  doing exactly that for years.

---

## 9. Verification results

The first draft flagged three load-bearing claims. All three are now settled.

| # | Claim | Result |
|---|---|---|
| 1 | MFL declines cross-origin browser access and won't allowlist domains | **Confirmed, twice.** Static `Access-Control-Allow-Origin: https://www44.myfantasyleague.com` on every export, never reflected; and MFL's terms list it under forbidden uses in writing. |
| 2 | League file space accepts a JS/CSS upload referenceable by URL | **Partly.** Same-origin `fflnetdynamic2026/48571_*` files serve correctly; listing is 403. MFL's own help centre documents the upload path as **CSS**: *"define your own CSS and upload using the Images & Other URLs Setup screen."* No documented path for JS, so treat JS hosting as unconfirmed — Tier 2's fallback re-pointed at the paste mechanism instead (§5). |
| 3 | The league's *Desktop View On Mobile* setting | **Already off.** Viewport meta and `skins17/BlueMesh/responsive.css` both present. Nothing to change. |

Also pulled live and folded in: the current home page module contents (§2 reconciliation), the
skin in use (BlueMesh, `skins17`), the 2026 API rules on hosts, registration and rate limits
(§1), and the eight-request timing (§4).

Still worth a signed-in check, since everything above was observed logged-out:

- The injuries call from a member's browser (§3) — expected to fail identically, as the error is
  host-routing rather than auth.
- Whether Appearance Setup will accept a `.js` upload (claim 2).
- Whether any commissioner-only view differs from what the public page exposes.

---

## 10. Year-to-year stability checklist

- [ ] Derive year and league ID from `document.location`. Never hardcode a season.
- [ ] Depend on exactly one MFL DOM hook — our own mount point. Delete the
      `#tabcontent0` / `#homepagecolumn1` reach-in, which currently works around eight
      duplicate IDs in MFL's markup.
- [ ] Use only documented `export?TYPE=` endpoints, **on the right host** — league-scoped calls
      to the league server, `L`-less calls (`players`, `injuries`) to `api`. §3 is what
      forgetting this costs.
- [ ] Validate every response's shape; never treat HTTP 200 as success.
- [ ] Compute post-deadline franchise and rookie baselines rather than pasting generated code.
      If a snapshot is genuinely needed, store it in MFL, not in the source file.
- [ ] Pin exact dependency versions and vendor them into the build, so a CDN outage isn't a
      league outage. (Currently four libraries load from cdnjs at runtime.)
- [ ] Keep the paste fallback working — it is Tier 2's safety net, and §2 shows it is faithful.
- [ ] Write the season rollover procedure into the repo. There is no README today; the ritual
      lives only in the commissioner's head.
- [ ] Prefer boring, dependency-light code. Edited a few days a year by one person — cleverness
      costs more than it returns.

## Sources

Verified directly this pass (all reachable, 30 Aug 2026):

- Live league home page — https://www44.myfantasyleague.com/2026/home/48571
- MFL 2026 API rules, hosts, rate limits, forbidden uses — https://api.myfantasyleague.com/2026/api_info
- Export endpoints tested — `league`, `rosters`, `freeAgents`, `transactions`, `weeklyResults`,
  `salaryAdjustments` on `www44`; `players`, `injuries` on `api.myfantasyleague.com`
- Active skin and breakpoints — https://www44.myfantasyleague.com/skins17/BlueMesh/responsive.css
- League file space pattern — `https://www44.myfantasyleague.com/fflnetdynamic2026/`

**A note on the forum citations.** The first draft cited five MFL support-forum
topics. Those forums are now **permanently closed** — every topic returns 503, and the
notice redirects to FantasySharks, which is different forum software, so the old topic IDs
do not map there. Three of the five have no Wayback snapshot at all. Since the draft that
cited them could not open `myfantasyleague.com`, those citations rested on search-result
snippets rather than the pages themselves.

They have been removed rather than redirected. Everything they supported is now cited to a
primary source that was read directly: the cross-origin restriction to MFL's 2026 API terms
and the measured `Access-Control-Allow-Origin` header; the mobile setting to the live page's
own markup; and the CSS-upload path to MFL's help centre. One claim went the other way and
has been dropped: the first draft's suggestion of a *"free responsive template from
MFL.football / MFLaddons"* came from a forum post that is gone, and both sites refuse
requests here, so it is no longer offered as a recommendation.

Background:

- MFL Help Centre, Site Appearance — https://www44.myfantasyleague.com/2026/support?CATEGORY=Appearance%20%26%20Customization&SUBCATEGORY=Site%20Appearance
  (primary source for the CSS-upload path and the skin picker)
- MFL Open Developer's API — https://home.myfantasyleague.com/features/developers-api/
- MFL appearance customization — https://home.myfantasyleague.com/features/appearance-customization/
- MFL Modern — https://apps.apple.com/us/app/mfl-modern/id6751516222
- MFL Mobile — https://apps.apple.com/us/app/mfl-mobile-myfantasyleague/id639397317
- MFL Platinum — https://apps.apple.com/us/app/mfl-platinum/id452910130
- League Tycoon vs MyFantasyLeague — https://leaguetycoon.com/compare/league-tycoon-vs-myfantasyleague/
- Prior art: a companion site on the MFL API — https://github.com/alexciarlillo/mfl-league-site
