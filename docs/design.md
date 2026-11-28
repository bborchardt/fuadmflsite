# Design

Why the league site and the daily job work the way they do. MFL's own behavior is in
[mfl.md](mfl.md).

## Goals

- Works well in a **phone browser**; members can't be assumed to use an app.
- **Stable on every device members use** (Devices, below): a bug or an older browser costs a member a
  feature at most, never the page, and what members' browsers run is known from what they report,
  not from members telling us.
- **One navigation layer:** v2's five sections (Home, Lineup, League, Moves, Rosters) replace the
  custom tabs rather than adding to them; whatever they leave out stays reachable from MFL's own
  menu, inside v2's site menu (☰). A link there or in MFL's pages to a page one of v2's views draws
  instead (Live Scoring, Weekly Results, Standings, Power Rank, Rosters, Draft Results, a team's
  page) leads to the view, so a page goes by one name; MFL's pages that show more than the view
  (Fantasy Schedule, Future Draft Picks) stay MFL's, under no section. v1 keeps the custom tabs as
  members know them.
- **One Back, the browser's:** a page reached by a link (a team's page, All moves, the message board)
  lights the section and view it lives under, which leads up; a section's link always opens its
  first view. A page gets a link of its own only up to a parent the sections can't
  reach, named for it (the board's ‹ Messages). Steps of a move (Add, Trades on phones) and v2's
  dialogs are history entries, so Back steps back through them or closes them, Android's Back and
  an iPhone's edge swipe included.
- **What a view shows is kept as each way to it expects** (`ui/kept.js`: Scores' week, Season and
  Best; Players' filters, search and sort; Draft's open rounds; All moves' filters): a section's link
  starts it afresh, as Lineup's and Moves' pages always are; its tab, or the menu, finds it as it was
  left; and Back returns to it as it was left, from its own history entry, even after another page.
  Paging (Scores' weeks, All bids' runs) isn't an entry of its own, so Back leaves the view rather
  than stepping back a page. Moves' tabs are pages of their own and start afresh.
- **A view shown again shows what's true now** (`ui/back.js`): Home, and each of League's and
  Rosters' views, when its section is tapped, another view on the same page is left for it, the app
  or tab is come back to, or Back finds it in the browser's cache, refreshes its panels once what it
  shows is 2 minutes old, keeping them on screen until the new answers are in, and what was set on
  it (Scores' week, Players' filters) as it was. A page of its own (Lineup, Moves' tabs, All moves,
  Rules) loads again instead, unless the member has tapped or typed on it since it loaded, so what
  they've started stays as they left it; MFL's forms v2 restyles (Franchise setup, the message
  board's pages) stay as left, as loading one again could send it again. Nothing runs while it's
  away, and in view it refreshes only as its own polling does (Chat; Scores while games are on).
  `tests/back.test.mjs` fails on a screen that doesn't take part.
- Within **MFL's rules**.
- **As few chores as possible** for the commissioner, stable year to year.

## How it fits together

- **The code runs inside MFL's pages,** loaded by a home page message from GitHub Pages. MFL's data
  is only readable from its own pages, and running there means it sees the league as the viewer
  does.
- **Published as few files as possible:** on a slow phone the wait is mostly round trips, one per
  level of imports, so GitHub Pages gets v2 bundled into one minified `fuad.js` (its on-demand
  parts still run only when asked for) and a minified `fuad.css`, built by `tools/build.mjs` in the
  publish workflow; a stale cache then re-checks one file. v1 is published as written.
- **One folder per version, pinned per season.** MFL keeps each season's site and copies the
  messages forward at renewal, so a past season keeps the version, and the rules, it was played
  under. Rule changes and visible redesigns get a new version; small fixes go in place. A version
  offered only as the beta changes in place, redesigns included: only its testers run it.
- **The commissioner's results screen** (Home › Load auction or rookie draft, `ui/load-form.js`,
  `lib/load.js`) reads the league's sheet as pasted from the spreadsheet and sends only what differs
  from MFL, so a run that stops partway is finished by reading the sheet again. Rosters go through
  Load/Unload Rosters, the commissioner's tool: it skips the add rules, and its `LOAD_ROSTERS`
  transactions are neither adds owing a length within the hour nor drops owing a penalty, so auction
  buys and rookies get theirs with Home's form. Names are matched to MFL's ignoring periods,
  apostrophes, hyphens and suffixes; one still unmatched is picked from a list, never guessed.
- **League rules live once, in `lib/`,** shared by the page and the daily job, so League Alerts and
  the job's flags can't disagree. The job loads them from the version `RULES_VERSION` names, so a
  new version's `lib/` must keep the exports the job reads.
- **A version is code; a league is data** (docs/settings.md). Only a league that runs the daily job
  is listed, with its rules locked in `settings.json`. Any other league is a test league, set up from
  its own header, so trying a value takes no code change and no version, and can't reach a listed
  league. It works with defaults rather than stopping, and says so; the job refuses it, as assumed
  rules are too little to write to MFL by.
- **The job writes only to the `league-data` branch,** because master is protected.
- **A member's look is their MFL skin** (v2's team sheet, `ui/looks.js`): each look is saved as one of
  MFL's skins, which MFL keeps with the franchise, so it follows the member to any device, and v2
  reads it from the page's own stylesheet link, asking MFL nothing and drawing the look before the
  page shows. The default look is saved as Commish Choice (the league's skin) and shown for any skin
  no look names. MFL's own pages, v1's included, take the skin too, so each look saves a skin in its
  colors. Browser storage would keep a look per device; a franchise's notes aren't in any export,
  and are saved by the form that also holds the team's logo.
- **Team pictures** (`ui/team-pictures.js`): each team's icon, cropped round, beside its name in
  Standings, Scores, Rosters and on the message board, from the still the daily job makes, so a list
  costs a few KB and nothing moves; a team's page shows the upload itself, moving if it moves, or on
  desktop the logo, beside the name, as there's room. Each picture is downloaded only at the width it shows,
  and one that won't load leaves the name, the logo giving way to the icon. The addresses come from
  MFL's page (`franchiseDatabase`), so nothing more is asked of MFL.
- **Owners on Rosters, for members and the commissioner:** each team's owner under its name in Teams, and on a team's page
  (My team too) their email beside it, from the league export MFL gives a logged-in member. MFL gives
  every owner's email there whatever their "let leaguemates see" choice; the league shares its emails
  anyway, so all are shown. They're filled in after a panel draws, never into what it saves, as a
  saved copy is shown to whoever opens the page next on that device, and Moves keeps its copy of the
  export without them. The export itself is kept a day per viewer (page-fetch.js), so they cost no
  request of MFL.
- **Three looks are team colours** (Vikings, Packers, Cowboys), for the league's fans of those teams,
  each saved as MFL's skin for that team, so MFL's own pages match.
- **The commissioner's view follows their team's look, marked in v2's colours:** the commissioner's
  skin is the league's (docs/mfl.md), so one saved for them would change the default look too, and MFL
  shows a team's skin only to that team. So v2 keeps the skin in the browser, per league, when it sees
  the commissioner's own team (the page with Become Commissioner), and draws it for team 0000. On a
  device that hasn't seen their team it's the default look, and the team sheet says so. A look a
  person picks is theirs, not a league's; a test league is told apart by its wordmark on any device.
  The accent is blue on a dark look and magenta on a light one, in place of the look's own, so the view
  is marked even scrolled past the header, with a bar along the top and a Commissioner tag by the wordmark.
- **The header's loading cover is in the member's look**, read from the skin as v2 reads it (for the
  commissioner, the team's skin v2 keeps), so a
  light look doesn't flash dark on a slow connection; the header keeps each look's two colours,
  which a test holds to the looks'.
- **A home screen app** (`ui/web-app.js`): v2 links a manifest, so a phone adds the league as an
  app that opens full screen, v2 and all, with the wordmark for its name (MFL's titles name the page
  too) and icon (`site/v2/app/`,
  drawn by `tools/app-icons.py`). MFL serves the pages, so there's no service worker: nothing works
  offline and there's no push. The icon opens the season's home page on the league's host, with the
  whole host in the app, so the manifest is made in the page, as a blob: a file on Pages can't know
  the host or season. Its `id` names neither, so Android takes the next season's as the same app.
  Chrome's own install bar is held back, so a page in the browser looks as it did; its menu installs.
  An iPhone's app takes Safari's login when added but starts with empty storage, then keeps its own:
  with v1 in the header, it opens v1 until the member joins the beta in the app, which then holds.
  So the app is for members once v2 is the header's version. An iPhone's app draws to the screen's
  edges, under a status bar coloured like the page: in the app only, `viewport-fit=cover` gives the
  page the status bar's and home bar's heights, which it clears, with room for the blur iOS 26 fades
  in below the status bar (upright, a fixed gap: iOS reports no top inset there). A link to another host (MFL's Dashboard and older seasons are on
  other servers, and the outside sites) opens with a browser bar, as the app's scope is the host.
  The iPhone's app has no Back and no pull to refresh, so in it v2 puts Back beside Menu whenever
  there's somewhere to go back to, and a Refresh button on Scores' current week. Home, League and Rosters are views
  of one page, so that's Safari's `navigation.canGoBack` (iOS 26.2), which counts a view's entry too,
  but not a dialog's; before 26.2, only a page a link on the host led to (its referrer, and not a
  launch). Android's app keeps its own Back, so neither shows there.
- **Projections are the live scoring page's everywhere** (`ui/projections.js`): Scores', Lineup's,
  Add's and Players' come from MFL's projected stats feed scored by the league's rules, not the
  Fantasy Sharks points MFL's Lineup and Add/Drop pages show (docs/mfl.md), so a player has one
  projection. Scores and Lineup run MFL's simulation, Lineup's starters together in MFL's order as
  Scores does, so the two match; Add's and Players' lists of hundreds score each player's average
  stat line, which is within a point of it (mostly 0.2) and quick on a phone, where the simulation
  takes a second or two. A player MFL's injury report has out, suspended or on IR projects 0 in all
  four, as MFL's Fantasy Sharks figures have him and the feed doesn't, so Scores differs from MFL's
  live scoring page for a team starting one. Before kickoff only: in a game Scores' moves with the
  stats, the others' don't. For a player the feed has none of, and without the feed, a page keeps
  MFL's own figure.

## Devices

Items marked *(to do)* are the plan, not yet built.

- **Supported: back to Safari on iOS 14.5, Chrome and Edge 88, Samsung Internet 15 and Firefox 79,**
  one minimum for both code and looks, set low on purpose and listed in `package.json`'s
  `browserslist`, which the lint reads. Every iPhone still in use updates to iOS 15 or later (the 6s,
  7 and first SE stop at 15.8), and v2's CSS needs 14.5 (flex `gap`) and Chrome 88 (`:where()` and
  `:is()`, whose rules an older one drops whole). Android and desktop browsers update themselves. Widths
  from 320 (the first iPhone SE) to desktop, either way up, in the home screen app too, and with
  larger text.
- **The minimum moves on what members' browsers report, never on a guess.** The header sends the
  commissioner's devices form a row from each browser: the day's first, then one for each page with
  errors, at most 20 a day. A row is the team (`guest` logged out), what ran (`v1`, `v2`, `-fallback`
  when a beta couldn't start, `-old` below the minimum, `none` when no version could, `loading` when
  the page was left first), the user agent, the screen and window widths and whether it's the home
  screen app, the page, and the errors v1's and v2's code logged (`[fuad] couldn't draw Home: …`) or
  threw, each counted. It comes from the header so that a browser no version runs on is counted too.
  It's this league's only. The team is as MFL gives it, so the commissioner's rows say 0000, or the
  team their Become views as: the device and errors are theirs either way. The rows are read once a
  season: a minimum nobody is near doesn't earn the slow checks (below), and an error in them is a
  bug no member had to report.
- **Below the minimum, the page still works:** a browser without `WeakRef` (Safari 14.1, Chrome 84 and
  Firefox 79 brought it, each with all of ES2020 and flex `gap`) or without `:where()` (Chrome 88) gets
  the header's `OLDER`, v1, with no beta offered. The header's script is ES5, so it runs in any
  browser to decide. Once v1 is retired, `OLDER` is null and it gets MFL's own pages with the
  unavailable note.
- **Newer than the minimum only as an extra:** a feature the minimum lacks may make a page better but
  must never be needed to use it. Layout holds without newer CSS, or the rule sits behind `@supports`
  (Rosters' draft board's `subgrid`), and a newer browser API sits behind a check whose absence
  leaves a feature out, not the page. Each such use carries a lint disable comment saying why it
  fails quietly, which the lint requires. A newer selector gets a rule of its own, as a browser that
  can't read one selector in a list drops the whole rule. Syntax can't fail quietly: v2 is one file,
  so one error stops every tab, and syntax is held to the minimum exactly.
- **Checked automatically, on every pull request:**

  | Check | Catches | Blind to |
  |---|---|---|
  | `npm run lint`: ESLint (ES2020, `.at()`, `eslint-plugin-compat`) | JS syntax and built-ins past the minimum; browser globals past it (`structuredClone`, `BroadcastChannel`); the header's and capture page's scripts held to ES5 | Many browser methods (`AbortSignal.timeout`, `dialog.showModal()`): the plugin sees globals better than methods |
  | `npm run lint`: stylelint (caniuse at the minimum, and a hand list) | CSS past the minimum in `site/` and the header's `<style>`: selectors (`:has()`), at-rules (`@container`, `@layer`), units (`dvh`), and the properties and functions the hand list names (`aspect-ratio`, `accent-color`, `color-mix()`) | Newer CSS neither caniuse's data nor the hand list knows; what's only partly supported at the minimum |
  | `tests/guards.test.mjs` | Regex lookbehind (needs 16.4) in `site/` and `mfl/` | Anything else |
  | `header.py` (Chromium, WebKit) | The header loading, falling back and covering as it should; a browser below the minimum (no `WeakRef`, or no `:where()`) getting `OLDER`; the device rows; the header placed in a member's home page tab too, running once | Old engines: below the minimum is simulated |
  | `pages.py`, `requests.py` | Which screen takes each MFL page, a member's own home page layout included; v2 asking MFL for more | How it looks; what MFL's own modules do under v2, as their scripts aren't saved |
  | `layout.py`: WebKit at 320, 360, 375, 390, 412 and 440 upright, 780 to 1280, and the app sideways; Chromium and Firefox at 360 and 1280 | Squeezed, offscreen, clipped or overlapping parts, and a control mostly past the edge of a box that scrolls sideways (`cut`), in v2's screens, the message board's pages it restyles and the moves fallen back to MFL's page; a row's text off its middle (`offcentre`); heights left wrong after the phone turns | Old engines; whether it looks good; Android's text scaling (iOS's page zoom is a narrower width, which 320 stands for). Drawn in Barlow, served by the harness (`tools/verify/fonts/`), so a Mac and CI measure what members see |
  | `layout.py --minimum` (WebKit at 320, 390 and 1280) | A page that needs an extra: the stylesheet drawn as a browser at the minimum reads it, what it marks as newer taken out as such a browser drops it (`tools/minimum-css.mjs`) | Newer CSS that isn't marked (the lint's to catch); what an old engine draws differently, not just lacks |

  Playwright's engines are current ones, so no automated check draws as an old Safari does: the
  minimum is held by the lint and the quiet-failure rules above, and the slow checks below. These
  checks are kept within 10 minutes; past that, the slowest move to the manual checks, for the
  changes that risk what they cover.
- **Checked by hand,** where a person has to look or no free tool reaches:
  - before a version becomes the header's, and after any header change: the screens in the oldest
    Safari members' reports show, in Xcode's simulator (served by the screen harness *(to do)*), or on
    an iPhone that old
  - a visible change: `screens.py compare` and `layout.py --shots`, read by a person, since a check
    sees broken, not ugly
  - `skins.py`, for a change to v2's colours or to what MFL's skins could reach

## Outside change

What changes without a change here: MFL's pages, exports and feeds; a member's own settings (their
skin, Responsive View, Full width, time zone, their own home page layout); the commissioner's setup;
the season's calendar; outside services (nflverse, GitHub); and the member's browser (forced dark
mode, translation, content blockers, password managers). Items marked *(to do)* are the plan.

- **A reader tells "not recognised" from "none":** it returns what it read, a "none" it has proof of,
  or null (a throw, in the job), never an empty result for a page it found nothing on, which would
  read as "no bids" or "no posts". Its proof is the page MFL drew, which MFL names on every page's
  body (`mflProgram` in `lib/mfl.js`: `options_101` for Power Rank, `login` for its login page), or
  what only its page has (the Add page's `pdb_add` list, the chat feed's `<messages>`, the stats
  feed's `DATE` line); the message board's pages share one name, so a topic also needs a post.
  `tests/readers.test.mjs` holds every reader of MFL's pages and feeds to it, on its own page,
  another page, the login page and an empty one, and fails on an exported reader it doesn't list.
- **Not recognised, v2 steps back and says so:** a screen leaves MFL's page as MFL draws it, a panel
  shows it couldn't load, or Scores, without a stats feed it can read, draws the week from liveScoring
  alone (MFL's points and seconds left, no game clocks, stats or win chances, and a note saying so),
  and logs `[fuad] MFL's … has changed` as an error, which the header's
  devices form counts (Devices), so an MFL change is seen without a member reporting it. A page MFL
  draws in place of the one asked for, for an ordinary reason, is recognised and not logged: Lineup's
  refusal ("You may not set your lineup at this time because …": the season over, a roster to fix),
  another team's IR page, MFL's answer to an add made on its own form.
- **Moves that can't check fall back to MFL's page:** when Add, Drop, IR or Trades can't load what
  its checks need, for any reason (MFL unreachable, MFL asking us to wait, an export changed), the
  member gets MFL's own page, so a move is never held up by v2, with a line above it: "Error loading
  cap and roster data. Rule checks are disabled; please ensure this transaction follows league
  rules." and Reload Page, which tries v2's again (`mflFallback` in `ui/moves.js`). MFL's page is
  fitted to the window below 72em, so every control shows without scrolling sideways: Add's and
  Drop's side-by-side layout stacked, a list scrolling in its own box with Add's filters moved below
  it, Trades' offers and Add's claims as wrapping rows; `layout.py` draws all four fallen back, in the
  league's skin, whose responsive stylesheet MFL's page relies on. It's logged as
  an error with its cause (`[fuad] Drop couldn't load, so MFL's page was shown: … HTTP 429`), which
  the devices form counts: a fallback that happens is a design issue to fix, not a member's to work
  around. A move made there that breaks the league's rules is the daily job's to flag, its
  penalties and contract years held.
- **Views v2 rebuilds offer MFL's page when they fail:** Scores, Standings, Power, Teams, a team and
  Draft replace MFL's page (MFL's links to it open v2's, `ui/frame.js`), so one that can't load
  would leave no way to it. Its "Couldn't load standings." has Basic view beside Retry, a link to
  the MFL page it replaces (`basicHref` in `ui/nav.js`) that the link rewriting leaves be, and is
  logged as an error. A panel showing a copy kept from before only warns.
- **A first load cut off is tried once more:** a panel with nothing shown yet, a Scores week and
  Lineup's backups try again 3 seconds on when a read was cut off before MFL answered (`retryCutOff`
  in `ui/panel.js`: an iPhone's "Load failed", a signal dropping), with a warning; only a second
  failure says it couldn't load, and is logged as an error. A failure MFL answered is shown at once.
- **A check My alerts can't make is logged, not shown:** trade offers, bids, the lineup, the draft
  or contract lengths MFL can't give leave that check's alerts out, as the member sees the same on
  its screen, and log `[fuad] My alerts couldn't check trade offers` as an error, so the header's
  devices form shows how often. So does the daily job's last run when GitHub can't give it, or gives
  something that isn't its list of runs (`readLastRun`), which is asked for again an hour on.
- **The season's facts are kept only whole:** the line under the wordmark, Moves' phase and Lineup's
  draft check go by week 1's kickoff, the season's end, the draft results and the calendar
  (`seasonFacts` in `ui/context.js`), kept a day per viewer. A part MFL fails to give (an error, a
  refusal) is left out so the line still draws, logged as an error (`[fuad] the season's facts
  couldn't read the season's end: …`), and the result isn't kept, so the next page asks again for what
  failed, and for the draft results before week 1. Without week 1's kickoff, MFL's page says whether
  the season has begun. What MFL hasn't published yet (the schedule before it's out) counts as none
  and is kept. So is an export MFL has changed, which fails every time until the code follows and is
  logged once a page. A guest's calendar, which MFL always refuses, isn't asked for.
- **Not recognised, the job flags and writes nothing from it:** a chore stops with a flag, and the
  others go on.
- **The job tries what v2 reads each morning** (`jobs/mfl-check.mjs`), after its chores: each export
  v2 reads that the chores don't, through `lib/shapes.js`, and each of MFL's pages and feeds v2 reads,
  through v2's own reader, as the commissioner's login sees them, which is a member's view of the team
  it owns (the commissioner's own pages need MFL's switch, which the check doesn't make). One MFL has
  changed, or no longer has (HTTP 404), fails the run like a flag, naming the page, or the item and
  field, usually before a member opens it. One MFL didn't give this time (a refusal, an error, its
  home page) fails the run too, at once, named apart from a change, as a lasting refusal (a feed
  answering 403) is a change v2 would meet. It only reads, and nothing of a page goes in the
  run's log, which is public. Out of season it leaves out what's of a week (live scoring, projections,
  the stats feed); Lineup passes as v2 takes it, MFL's refusal included (the season over). Pages are parsed with jsdom, not a browser, and MFL's scripts aren't run:
  Add/Drop's fields are found on the page rather than in its form, which MFL puts inside a table and
  jsdom, unlike a browser, doesn't give them to. `tests/readers.test.mjs` fails on a reader of MFL's
  pages that neither the check nor a chore tries on MFL's page. Not seen: how a page draws, what MFL's
  scripts give (Add's picker), the message board's pages (restyled, with no reader), and what only a
  member's own settings change.
- **The job keeps MFL's pages as it finds them,** for `tests/fixtures/pages/`: a page the check flags
  as v2 can't read is saved on the run, so its fix starts from MFL's new page, and a dry run with
  "Save pages" saves every page the check reads, so the saved samples can follow the season (its
  draft, playoffs and offseason). They're cleaned as the capture bookmark cleans them
  (`site/capture/capture-model.js`), with the owners' names from the league export (none saved
  without them), into `<league>/member/` with the bookmark's manifest. A run's files are public, as
  the repo is, so a page with what only members see or the commissioner's own team (pending bids and
  offers, its settings, the chat) is saved only from a league other than the real one: a dry run of
  the test league, where the commissioner owns a team too. A flagged one of the real league's says
  so in the log.
- **Exports the job, and v2's checks and forms, read** are checked as they come (`fetchExport`: a section missing fails), and
  then item by item (`lib/shapes.js`): an item without a field a chore relies on, or with a number
  that won't read, fails the export, and the chore that read it flags, naming the item ("franchise
  0002 player 14800 has no contractYear"); a check that only skips without its export (the injury
  reports, the calendar) flags too. An empty list passes, as MFL leaves one out; a field only some
  items have is needed only of those (the team of a lock or a waiver run), and one that may be blank
  (a charge's description) only has to be there. Its rules are fields every saved export
  (`tests/fixtures`, and the clone's in `tools/verify/screens`) has where it's needed;
  `tests/export-shapes.test.mjs` takes each out in turn, and fails on an export the job reads that
  has no rules. In v2, the checks and forms that rely on an
  export (Moves' checks, Home's alerts and forms, Lineup's backups, IR's eligibility, Trades'
  withdrawals and locks) pass `check: strict` (`ui/checked.js`): a changed export fails as one that couldn't load,
  and is logged once a page; one they do without when MFL can't give it (the calendar, the injury reports) they don't do
  without when MFL has changed it. The log names the first item and field, as a display panel's does. `tests/checked.test.mjs` fails on a read in v2's screens without
  the check, the display panels' aside.
- **A display panel shows what it can of a changed export:** League's, Rosters', All moves' and Home's display panels' reads, Scores' included, pass `check: lenient`
  (`ui/checked.js`). An item missing a field has it set to null (`markMissing` in `lib/shapes.js`),
  which reads as not known (`numberOf`: NaN) and shows as "—"; so does anything worked out from it,
  never a total of the rest: a week's score that won't read leaves every team's all-play and weekly
  winnings unknown, and the prizes with them, and seeds that go by a record not known aren't drawn
  (the playoff picture's "Couldn't load", with Basic view). In Scores, a side with a player MFL
  didn't say starts or sits, or whose points won't read, has its score as "—" and the card no leader
  or win chance; a game with no kickoff goes by the stats feed, or shows "—" for its time; a past
  result whose score won't read shows "W" alone. Rosters' and the player popup's reads are lenient
  too, but not the contracts and cap: those come from the page's league load (`lib/league.js`, as
  the job and Moves' checks build them), held to `lib/shapes.js`, so a change fails the panel with
  Basic view rather than show a cap figure that leaves one out (the popup's "Cut now" goes without
  its cap used). A player's points or projection that won't read is "—", sorted last; without the
  points export every player's are "—", not 0; without the future draft picks, or with one
  that doesn't say its year, round or first owner, every team's picks are "—" and the draft order
  says its traded picks aren't known; a playoff game without points isn't a result. All moves lists
  a move whose kind or players MFL left out as "—", and one whose time it left out last, under "—";
  All bids' voided bids go by a win's transaction not being there, so they read the transactions
  strictly and, on a change, show the run as MFL has it. All moves' Basic view stands v2's view
  aside for MFL's list on the same page. Home's message board shows a topic's subject or time MFL
  left out as "—", the time last. Coming up's dates are worked out across the calendar's events
  (free agency closes with the last waiver run), so a calendar or league settings MFL has changed
  leave them all not known: the season's own dates show, then "Other league dates —". My alerts,
  whose checks read the same exports, fail on the change as checks do. An export with no item whole, or an item
  without the field that says which it is (an id, a team, or a rule's own `keys`: a draft pick's
  round, number and player), fails as "Couldn't load", even where the
  panel goes without the export when MFL can't give it (Winners' accounting, whose absence reads as
  no pot yet). Either is logged
  once a page, naming the first item and field. A panel's saved copy keeps NaN as not known
  (`ui/store.js`), where JSON would make it null, which reads as none.
- **A member's own home page** is a viewer of its own in `pages.py` (`member-custom`: every module MFL
  offers, the header in a tab too).
- **Checked automatically:**

  | Check | When | Catches | Blind to |
  |---|---|---|---|
  | `tests/readers.test.mjs` | every pull request | A reader that takes another page, the login page or an empty one for "none"; a reader no check or chore tries on MFL's page | MFL's live page |
  | `tests/export-shapes.test.mjs` | every pull request | A rule that doesn't fail without its field; an export the job reads with no rules | MFL's live exports |
  | `tests/checked.test.mjs` | every pull request | A read in v2's screens without `check: strict` or `lenient` | Whether the chosen one is right |
  | `tests/stage-pages.test.mjs` | every pull request | A reader that no longer reads a season stage's saved page | Stages not saved |
  | `pages.py` | pull requests that touch the site, header or harness | Which screen takes each saved page, each season stage's and a member's own home page layout included | Pages not saved; what changed since they were saved |
  | The daily job's check (`jobs/mfl-check.mjs`) | every morning | An export, page or feed v2 reads that MFL changed or removed, as the commissioner's team sees it | How a page draws; MFL's scripts; the message board's pages; what only a member's own settings change; the commissioner's own pages |
  | `lib/rounds.js` (`roundPlaces`), in a league with `playoffs.rounds` | each time League › Winners or Rosters › Draft loads in the playoffs | The commissioner's playoff-week matchups not fitting the rounds: a round's weeks not MFL's, a week with none, a team back after going out, a head-to-head round's winners not going on, or a ranked round's top scores, or its `advance`, not going on; all but the last two show a note in place of the places | Matchups that fit the rounds but aren't what the league decided; on League › Scores, a ranked round's card is left out when a round's team has no matchup that week, with nothing said |
  | The devices form's rows (Devices) | each page with errors | A fallback, a "Couldn't load" or an "MFL's … has changed" a member met | What no member opened |

- **Checked by hand,** each when it's due:
  - at each season stage: new saved pages and the test league's exports, taken as
    docs/commissioner.md says ("New saved pages for the tests"). Each stage's folder is kept:
    `tests/stage-pages.test.mjs` reads every page in each with the reader the daily check tries on it, `pages.py` checks which screen takes each, and `tests/stage-exports.test.mjs`
    reads every export with the rules the job read it by (`lib/shapes.js`), so a change that stops
    reading an earlier stage's MFL page, or a rule that turns down an export MFL gave then, fails. The other saved pages stay as they are, for the tests of what
    a screen draws
  - once a season, in week 2, for a league with MFL's own weekly high score credit on: the daily
    job's log records no "Most Points Week 1", as it counts MFL's "Credit for week 1 high score of …"
    as paid; MFL renaming that entry would have the job pay the week again
  - once a season, in the playoffs' first week: Standings' Playoffs panel against MFL's Playoff
    Brackets page (`options?O=79`), as MFL fills in a bracket's teams only as the playoffs go, which
    the saved brackets (2025's finished, 2026's before week 15) don't show
  - once a season, after the league renews and before MFL publishes the NFL schedule: the
    `liveScoringWeek` and `completedWeek` MFL's page gives, on a page saved then (that stage's
    saved pages). Without week 1's kickoff, `seasonStarted` (`ui/context.js`) goes by them, and it
    isn't known whether they still show last season's week then: `tools/verify/phases.py` takes them
    as 1 and 0, the context line's tests as 17
  - once a season: the devices form's rows read for errors, fallbacks and the oldest browsers
  - before a version becomes the header's, and after any header change: the oldest Safari (Devices)
  - once a season, and after a change to v2's colours: `skins.py --refresh`, so a skin MFL changed
    shows in git diff

## The daily job

- **Dry run first:** each chore that writes to MFL only logs until its repository variable is
  `apply`, so the commissioner can check its decisions first.
- **A test run is a dry run of the same job,** started by hand: `DRY_RUN` overrides the variables
  above, so nothing reaches MFL, `league-data` or the site. It can name another league, host, settings,
  version, season or time, and only a dry run can: unticked, a manual run given any of them stops
  before it starts, naming them, rather than run the real league with them ignored. It fails and
  emails like the real job, flags included, and shows what it found on the run's summary page. MFL's
  writes aren't exercised. A league the login isn't in gets no session, so it reads public data and the
  summary lists what that leaves unchecked. Only the real league's run sees `league-data`'s snapshots
  and icons, as they're all that branch holds.
- **Apply what's deterministic, flag what's risky, log everything.** A flag fails the run, so
  GitHub emails the commissioner, with the run's summary page listing the flags.
- **Nothing is reversed automatically.** A team over the cap or 30 players has its drop penalties
  and contract years held, so the commissioner can reverse the move cleanly.
- **Franchise salaries are snapshotted at the trade deadline,** because MFL reports today's salary
  for every past week.
- **Team icons are stills the job makes** (`jobs/team-icons.mjs`), published with the site: MFL
  serves the picture an owner uploaded, often hundreds of KB and sometimes animated, for a spot about
  30px wide, so a list of ten would cost a phone over a megabyte and keep moving. Each is its first
  frame, cropped square, a few KB. A re-upload keeps its address, so the job asks each day with the
  picture's validators and remakes it only on a change; one it can't read is logged and the team's
  still left as it was, as a picture is its owner's to fix. Nothing of the job's goes with those
  requests, since a picture can be anywhere on the web.
- **Contract lengths:**
  - before the season (bylaws 4.4, 12.4–12.6), every player at 0 years with a salary owes one by the
    cut-down date, whatever brought him; an unsettled RFA's $0.01 marks him out. Members send them
    with Home's form, which posts them to the newest contract topic as `Name, First TEAM POS: N
    years` lines under a fixed heading, read the same with or without MFL's line breaks
    (`lib/lengths.js`). It needs every one at once and the roster within the limit, since every player
    kept needs a length; once posted it gives way to "sent" until the job sets them. There are no
    adds before the cut-down date (the first blind bid run is after it), so a player added after it
    owes his within the hour, as in season. A length sent before a trade holds after it. From week
    1's kickoff a draft player still without one gets 1 year.
  - blind bids: read from the bid comment on MFL's Previously Processed Waivers page, the only
    place comments appear (the commissioner judged reading their own league's page within the
    spirit of MFL's terms)
  - free agent and waiver adds: from the team's posts in any thread, since the contract thread's
    name changes yearly
  - the latest post within the hour decides, so owners can correct a length; a later unreadable
    post flags rather than keep the earlier length
  - a post or comment that offers a player more than one length ("3 or 4 years", "3 years, no
    wait 4") flags; a correction belongs in its own post
  - a last name is ambiguous only with another add waiting for years, not a player under contract
  - nothing stated in time: 1 year, applied on sight; the commissioner adjusts by hand for leniency
  - anything unclear is flagged, never defaulted
- **Payouts** (`lib/payouts.js`, shared with League › Winners) are recorded once a week's scores
  are final, taken to be when the next week kicks off, after the NFL's stat corrections usually
  are, and its backup starters have gone in. The job reads the accounting first and matches by description, so an entry the commissioner
  made by hand, or a run that failed partway, is never doubled; a later correction is left to the
  commissioner.
- **Backup starters** (bylaw 16.5; `lib/backups.js`, `jobs/backup-starters.mjs`) are read from each
  team's lineup messages (the Optional Message MFL keeps with every lineup, on Lineup Details) and
  from the "Conditional starters" thread, once a week's games are over and nflverse's weekly rosters
  have every team that played (a team still missing four days after flags); a week without either
  doesn't wait for nflverse. The job takes, for each starter, the team's latest request before the
  pair's deadline, five minutes before the earlier kickoff of the two, and the lineup MFL had then,
  from Lineup Details. A starter who was inactive (nflverse's `INA`) and scored 0 gives way to his
  backup; a locked starter the team benched afterwards is put back (16.5.5). It fills the
  commissioner's Submit Lineup form for the past week, as MFL's lineup import refuses one,
  recalculates the week's standings, checks the saved result, and writes what it changed in the
  chore log; it posts nothing. A name it can't match, a swap that wouldn't fit MFL's position ranges,
  or a backup claimed twice flags, never guessed, as is a late request in a post naming no week (it
  may have meant the next); a name of a player no longer on the team is logged, as a lineup message
  carried forward can name one.
  - A lineup message counts only when it reads as backups ("If … is out, start …", "No backups"), so
    one an app leaves empty or writes for itself changes nothing. It's the lineup's week's, unless it
    names another week, when it's one carried forward and changes nothing either; one the same as
    the lineup's before it is that one carried forward, as MFL's own page refills the box.
  - A post's week is from when it was posted, its deadline from its last edit.
  - A week is settled once, in `league-data` (`backup-starters.json`): one the chore only logged is
    the commissioner's to settle by hand, as are the weeks before its first run of a season. A week
    that fails is flagged and left for the next run, the others going on. A team that submitted
    nothing all week keeps the lineup MFL scored. Whether a week was recalculated is judged from
    MFL's saved results, so a run that fails between the lineup and the recalculation is finished
    by the next.
- **League Alerts (in v2, the owner's My alerts) confirms a free agent add's length** with the job's
  own reader while the hour is open, so owners see what will be set.
- **The commissioner is told when the job hasn't run:** GitHub emails a run that fails, not one that
  never starts (the schedule turned off, an Actions outage). My alerts, as 0000 or as the
  commissioner's own team (whose pages have MFL's Become Commissioner link, `isTeamOfCommish` in
  `ui/looks.js`), shows "The daily chores haven't run on schedule since …", linking to the workflow,
  once the last scheduled run that succeeded or failed started more than 36 hours ago (a cancelled
  one did none of the chores; one started by hand doesn't mend the schedule). The page asks GitHub's
  API for the last 10 (`runsUrl` in `ui/home-model.js`, the repository read from the Pages address)
  after My alerts has drawn, at most once in 6 hours, or an hour after a read that failed, keeping
  the answer in the browser. If the alert changed, My alerts is drawn again from the reads it
  already made. GitHub answers a browser without a login 60 times an hour. No other member's
  page asks. A file the job published on Pages would have every member download v2 again each day,
  as each deploy gives every file a new ETag.

## Previews and the beta

- Previews and the beta swap the whole version in one browser, so the commissioner and members can
  try a version on the real site before it's switched in the header.
- The header loads a member's stored beta itself, not through its own version: on a slow phone that
  would be a second download before the beta's. A choice being made or changed (`?fuadBeta=`,
  `?fuadPreview=`, a stored preview) still goes through the header's version, which decides.
- A beta that can't load or start falls back to the header's version, with the bar that leads out of
  the beta drawn by the header, so the way back never depends on the beta's code. When the header's
  own version can't, members get MFL's own pages, not an older version, which would likely fail the
  same way (Pages down, MFL changed) and cost another download.
- League Alerts is the toggle both ways: it invites members to the beta, and in the beta it leads
  back to the classic site. A beta can hide the bar while it runs well, so v2 does, and shows it once
  anything fails, including a home page whose League Alerts couldn't be drawn.
- A beta choice holds only while the header offers that version, so ending or promoting it needs no
  member action. Viewing as a team the offer leaves out (the commissioner as 0000) keeps the choice
  without loading the beta, so switching back needs no new opt-in.
- The header hides the page behind "Loading…" whenever a version other than v1 may run (v1 draws
  only its own tabs), for at most 30 seconds, so MFL's page doesn't show before the version draws;
  whichever version runs shows it again, v2 once its frame and any view it draws over MFL's page have
  first drawn.
- Whether the league has moved to a beta before it's promoted is in the devices form's Ran (Devices):
  `v1`, the beta's version, or `-fallback` when the beta couldn't load or start. MFL's app runs none
  of this, so a team with no rows may just be using the app.
- A beta changes how things look, not the rules: the job follows `RULES_VERSION`, v2 by default
  and never v1 (v2's `lib/` holds v1's rules).

## League rules the code relies on

They're in `lib/rules.js` and `lib/violations.js`, with the league's numbers in `settings.json`
(docs/settings.md); the numbers below are this league's. A rule change means a new version.

- **Salary cap:** $300, counting adjustments and drop penalties not yet charged. Cap used counts
  this season's drafted rookies whose length is still due, though bylaw 4.6 counts them only once
  it's set (one picked up as a free agent since counts at once, 4.5). A team over only by them is
  told to get under by the cut-down date, not that a move will be reversed, and the daily job notes
  it without a flag or holding its chores; Moves still block as for any team over. The rookies are
  this season's draft results, which v2 reads before week 1 and the job when such a team, or a cut
  whose length was due, needs them.
- **Roster:** 23–30 active players (IR doesn't count), from the final cut-down date (2.5; the
  commissioner's first one-off calendar event, at a set time in the season's year (a renewed
  league's calendar can still hold last season's), with a word starting "cut" in its
  title, unless it says "contract year end(s)"; without one, from week 1's kickoff) until the
  championship week (MFL's last) is over, the same for the daily job. Going over 30
  voids the move, as going over the cap does; under 23 must be fixed but voids nothing.
- **Injured reserve:** only players the NFL lists on IR (and its variants). One who comes off must
  move back to the active roster.
- **Anti-tanking:** starting an injured (IR or Out) or suspended player is flagged in weeks 1–14,
  from week 1's kickoff.
- **Drop penalty:** `max(ceil(max(1, 0.4 × salary × years)), years)`. A player whose length is
  still due (0 years, $1 or more: draft day, or an add's hour) costs the 1-year penalty, except a
  rookie from this season's draft cut before the final cut-down date, who costs nothing
  (`lengthDuePenalty`, for v2's pages and the daily job alike). One at $1 isn't charged by the job:
  it can't be told from a player already charged and cleared, whom MFL reads at $1 / 0 years. 0 years at under $1 is
  an RFA after the rollover.
- **Rookie salaries:** first pick QB $6, RB $10, WR $10, TE $4, PK $1; each later pick 80% of the
  one before, never under $1.
- **Franchise salary:** the average of the position's top 5 salaries at the trade deadline (the first
  kickoff of week 12).
- **Rookie draft:** offline, on no fixed date; the week 1 kickoff stands in for "after the draft".
- **Pending blind bids** that could take a team over the cap, or past 30 active, void that owner's
  bids (5.5). "Could" counts each claim group's costliest claim winning: groups have no priority
  and each awards one claim.
- **Moves › Add** (v2, `ui/add-model.js`) blocks a move that takes cap used or the active count
  past its limit, or further past it, with every pending group's costliest claim counted; bids
  already over a limit stay "Current bids invalid" until fixed, without blocking a move that leaves
  them as they are. Over 30 active in season no adds at all, and under 23 no add drops an active
  player (10.5); a player the team dropped can't be re-added for 48 hours (9.4). Adds are closed
  before the draft and once free agency closes (the calendar's last waiver lock, or a bid run after
  it) or the championship week is over, whichever is first; after the last bid run, bid-only players can't be
  picked. The roster limits here, in Drop, Trades and IR apply from the
  cut-down date.
- **Moves › Drop** (v2, `ui/drop-model.js`) blocks a cut whose penalty takes cap used past the
  cap, or further past it, with every pending group's costliest claim counted (a claim dropping the
  same player counts as no drop after it); in season, an active player's at 23 active (9.2) and any
  under 23 (10.5); and a player whose game has started (MFL's mark).
- **Moves › Trades** (v2, `ui/trades-model.js`) blocks a trade, proposed or accepted, that leaves
  either team over the cap (10.3; a team already over may trade back under, not stay over). Taking
  a team past 30 or under 23 active is allowed with a notice, once the roster limits apply (10.5).
  The member's own pending bids are checked as for a cut: a notice if the trade lets them break a
  limit (5.5). Proposing closes at the deadline (10.1). "Locked" comes from the NFL schedule;
  MFL decides whether it still holds.
- **Moves › IR** (v2, `ui/ir-model.js`) saves moves to IR, activations and a drop together, as
  MFL's one form does, and blocks a save that takes cap used, or the active count once the roster
  limits apply, past its limit or further past it, with every pending group's costliest claim
  counted (5.5). A player the NFL no longer lists on IR must be activated (11.1): he's in every save
  until he is. Who can go on IR, and whose game has started, is MFL's own page's say.
- **Contract length on adds:** 1 to 5 years, in the bid comment or a post within an hour of a free
  agent add; none in time means 1 year.
- **Best in League › Scores** (`bestLineup`, `bestCard` in `ui/league-model.js`, display only): each
  side's best lineup by MFL's own method (its live scoring page's `get_best_lineup`) on the points so
  far, from the league's lineup rules; it gives MFL's recorded best score for every team in weeks
  1–5 of 2026. Ties go to the players who started (MFL breaks them by name), so the lineup changes
  only for points. Players on IR can't start. Off until the week's first kickoff.
- **All moves and All bids** (v2's Home, `ui/all-moves.js`, display only): MFL's Transactions and
  Processed Waivers pages with v2's view over them. Other bids count only claims MFL tried, one per
  team at its highest; a win with no won-bid transaction for that team and player shows "Voided",
  since the commissioner voids a bid by removing the player and deleting its transaction.
- **Backup starters** (16.5): a starter declared out is one on the NFL's game-day inactive list, for
  any reason; a backup must be on the bench, on his team's game-day roster, and keep the lineup
  within MFL's position ranges.
  The commissioner's posts and lineups count for no team.
- **Lineup's backups** (v2, `ui/lineup-backups.js`, `ui/lineup-board.js`; on with the
  `backupStarters` setting): each starter whose game is more than five minutes off, and whom someone
  on the bench can back up, gets a "+ Backup" button, which opens the bench players who keep the
  lineup within MFL's ranges with every pair out at once; Out, IR and Suspended players are listed but
  can't be picked. The pairs are read as the job reads them, by the same code in `lib/backups.js`, from the team's Lineup Details and the
  thread. Save writes them in the lineup's Optional Message, in the same submission as the lineup, so
  nothing goes on the board; it changes the message only when the backups changed, so a member's own
  note stays otherwise. The message restates every pair, the locked ones too, so the week's latest
  message has them all, and takes back each unlocked pair the member dropped, which
  an older message or a post may have made. Benching a starter or starting his backup sets the pair
  aside: it isn't shown and still stands, and counts again if the lineup changes back, as the job takes
  the lineup at the deadline. From its deadline a pair that counts shows locked and both players'
  boxes are disabled (16.5.5); one past its deadline that the lineup MFL has sets aside isn't shown,
  though the job restores the lineup if it was changed after the deadline. Save refuses backups that
  no longer hold (locked since they were picked, now out, or too many at once), and reads them back
  after, to check MFL kept them.
- **Scores' backups** (v2, `ui/scores-backups.js`; with the `backupStarters` setting): an open card
  reads both teams' Lineup Details and the thread, as Lineup does, from the week's first deadline,
  and again once another deadline has passed; a closed card reads nothing. A pair shows from its
  deadline, to everyone, if it counts (its starter starting and its backup sitting in the lineup at
  the deadline): "If out → B" under a starter still starting, "in for A" on a backup starting in his
  place. It stays shown once the week is over, used or not. Best's lineups show none.
- **Watch list** (v2's player popup, Moves › Add and Rosters › Players, `ui/watch.js`): MFL's own My
  Watch List, so it follows a member across devices and MFL's app, read with its export and changed with
  its import from the member's own page. A star in the popup changes it; a Watching chip filters Add's
  free agents and Rosters › Players to it.
- **League history** (v2's League and Rosters, `ui/history-model.js`, display only): a title belongs
  to today's team holding the champion's franchise number, if MFL links that team to that year;
  franchise numbers MFL moved are the `renumberedFranchises` setting.
- **Playoff seeds and payouts** (v2's League, `ui/league-model.js` and `lib/payouts.js`): the division
  winners are seeds 1–2, the other four the best all-play records, ties by standings order (1.1–1.3);
  $15 to each regular season week's high score, ties split; all-play pays $0.75 × (wins − losses),
  never below $0 (1.6–1.7); what's left of the pot goes 55/30/15 (1.8). All-play counts weeks 1–14
  only, from the weekly results, since MFL's standings keep counting it through the playoffs. Another
  league's payouts can be dollar amounts (docs/settings.md: `allPlayTop`, `placeAmounts`,
  `divisionWinner`). The
  pot is the accounting's league-wide entries; before they're recorded the prizes show their shares
  without amounts. In the playoffs and for a past season, Standings shows the playoffs as they stand
  (`ui/bracket-model.js`) in place of the seeds: MFL's championship and 3rd place brackets round by
  round, or a `playoffs.rounds` league's rounds ranked on their totals; the seeds show when neither
  can be read.

## Ruled out

- **A separate companion site:** a second destination is a new navigation layer, and it can't tell
  who's viewing.
- **A proxy for MFL's API:** against MFL's terms.
- **Leaving MFL:** it would give up the custom rules.

## Accepted limits

- An iPhone keeps the address its icon was added with, so after renewal a launch opens last season's
  site, which goes on to the newest season's: one more page load. From the new year, a launch asks
  MFL for the next season's league export, behind the page, which moves on if there's a site and the
  member hasn't yet tapped or typed. A season found is kept a year, so last season's page is drawn
  first only on the first launch after renewal; none is kept a day, and no answer (a refusal) an
  hour. This needs the phone to have read the manifest: an icon added from a page with a phone that
  didn't opens that page, with no launch to tell, and stays on its season. A league moved to another
  host is left on the old one: its icons are added again.
- Chores run once a day (about 07:40 UTC): snapshots, penalties and contract years land up to a day late.
- The commissioner's own moves aren't in the history the job reads, and a hand-entered penalty must
  spell the player's name as MFL does to be recognized.
- The over-cap flag lists the last 7 days' moves, so a team over for longer shows none.
- The Commish tab's penalty form pre-fills penalties already charged whose contracts aren't cleared yet.
- Contract years:
  - before the season only the form's posts are read: this year's cut-down posts by hand named
    players by nickname, misspelling or "all rookies", which no reading gets right
  - a form post's line is matched by MFL's name for the player, by NFL team and position only when a
    team has two of that name; a renamed player stays due, and the form shows again
  - after the cut-down date, a player added and traded before the job runs stays at 0 years,
    unflagged
  - an add before the cut-down date would be taken as the form's, and its bid comment or post not
    read: the league has none
  - another team's form post counts for a player only with his name, NFL team and position: one
    who changed NFL teams between the post and a trade stays due, and the form shows again
  - a length without a digit or "year" ("Hill for two") isn't read
  - before reversing an add for a team under the cap, set the player's years to 0, or the drop is
    charged a penalty
  - a length edited after the hour still counts: MFL keeps an edited post's original time
  - blind bid readings aren't shown in League Alerts
- IR: MFL doesn't say when a designation changed, so an add made after a player came off NFL IR
  isn't caught as a void.
- While an add's hour is open, each Main tab view reads the message board once.
- To stay within MFL's limits, v2 keeps what it reads in the browser, shared by every page
  (`ui/page-fetch.js`): the NFL schedule, the league's settings and the calendar for a day; last
  week's injury report for a day, today's for 5 minutes on a game day and an hour otherwise; the
  week's results for an hour; rosters, adjustments, transactions, free agents, pending bids and
  trades, and the message board for 2 minutes, which a move made in v2 clears; MFL's League History
  pages until the next week's results or a week, League Champions for a day; a processed bid run,
  for good. A page left open holds what it read no longer than that, and what it doesn't keep for
  2 minutes. So a move made on
  MFL's own pages, or by another team, can take 2 minutes to show. Moves' checks and who starts in
  League › Scores always ask MFL. MFL's player list (`ui/player-list.js`) is kept a day as bare
  rows; where it's only shown (League, Recent moves, a player's card), a copy up to two days old
  draws the page and a fresh one is asked for behind it. Moves' checks and Home, whose forms write to
  MFL, wait for a fresh one. On the home page, MFL's hidden chat module stops reading the chat every
  few seconds, as Home reads its own.
- Every request v2 makes to MFL goes through `ui/page-fetch.js`: reads through `mflFetch`, an
  action's first among them (a form read before its save, a bid's edit page before the edit), the
  reads that confirm a move or finish one under way (a form's reads once it has written) through
  `mflConfirm`, and moves (a move's form,
  the lineup, a chat post, the watch list, a skin or width saved) through `mflSend`. The lint
  (`npm run lint`) refuses `fetch` in `ui/`, called or passed on, but for the site's own files on
  Pages, and `fetchExport` (`lib/mfl.js`) has no fetch of its
  own to fall back on. After MFL refuses one (HTTP 429), whichever it was, v2 holds its reads for 30
  seconds, on any page; a panel with nothing to show says "Server is busy. Try again in a few
  seconds.", with Retry off until then, and Moves' screens fall back to MFL's page (Outside change).
  Moves and the reads confirming them aren't held, as a move made but not confirmed would show as
  failed, and one half made shouldn't stop there; a move's read-back stops at MFL's refusal rather
  than ask it again. A read held back fails as `HTTP 429, held by v2 after MFL's 429` in what's logged, so the
  devices form's rows tell MFL's refusals from the reads v2 held after one.
- A read MFL hasn't started answering in 20 seconds is given up as one cut off (`ui/panel.js`
  `cutOff`): a panel tries it once more, then says it couldn't load, rather than wait on its
  placeholders; a move's confirmation that times out fails as one MFL couldn't answer. Reading the
  answer isn't timed, and a move never is, as one cut off may still be made.
- What v2 keeps in browser storage (`ui/store.js`) says how long it's read. Once a page, just
  before the first thing is kept, what's past that goes, and so does an entry with no time of its
  own (a panel's saved copy) once it's a year old, as keys carry a season or week and would pile up
  beside MFL's own. Storage that's full or blocked keeps nothing, with one console warning a page.
- League › Scores runs MFL's own win probability on the same feeds, but its numbers can differ from
  MFL's page by a point or so: MFL's simulation carries a random value across every lineup it has
  shown since the page loaded.
- Moves › Trades' "Locked" note shows for the rest of the NFL week once a traded player's game has
  kicked off, after MFL's own lock has lifted: Accept stays on, so MFL takes or refuses it.
- The commissioner viewing as another team (MFL's Become) is that team to MFL, so a look picked then
  is saved as that team's skin.
- A preview or beta whose features fail after starting shows their errors, with its bar there to
  leave. The beta is per browser and isn't in MFL's app.
