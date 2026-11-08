# Design

Why the league site and the daily job work the way they do. MFL's own behavior is in
[mfl.md](mfl.md).

## Goals

- Works well in a **phone browser**; members can't be assumed to use an app.
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
  An iPhone's app keeps its own login and storage once added (copied from Safari when added), a beta
  choice included.

## The daily job

- **Dry run first:** each chore that writes to MFL only logs until its repository variable is
  `apply`, so the commissioner can check its decisions first.
- **A test run is a dry run of the same job,** started by hand: `DRY_RUN` overrides the variables
  above, so nothing reaches MFL, `league-data` or the site. It can name another league, host, settings,
  version, season or time, and only a dry run can: unticked, a manual run ignores them. It fails and
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
- While a beta is on offer, each member's browser sends the commissioner's Google Form a row a day
  saying which version it runs: `v1`, the beta's version, or `v1-fallback` when the beta couldn't load
  or start (`reportUse`, loader.js). It sends the team id and version, nothing else, so the
  commissioner can see the league has moved before promoting a beta. It is only this league's logged-in
  teams, and not a browser that has been the commissioner, whose Become would count as that team. MFL's
  app runs none of this, so a team with no rows may just be using the app. Only the v1 file and a
  beta report: once promoted, v2 sends nothing.
- A beta changes how things look, not the rules: the job follows `RULES_VERSION`, v2 by default
  and never v1 (v2's `lib/` holds v1's rules).

## League rules the code relies on

They're in `lib/rules.js` and `lib/violations.js`, with the league's numbers in `settings.json`
(docs/settings.md); the numbers below are this league's. A rule change means a new version.

- **Salary cap:** $300, counting adjustments and drop penalties not yet charged.
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
  it can't be told from a player already charged and reset to $1 / 0 years. 0 years at under $1 is
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
  can't be picked. The pairs are read as the job reads them, from the team's Lineup Details and the
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
  franchise numbers MFL moved are listed in `RENUMBERED`.
- **Playoff seeds and payouts** (v2's League, `ui/league-model.js` and `lib/payouts.js`): the division
  winners are seeds 1–2, the other four the best all-play records, ties by standings order (1.1–1.3);
  $15 to each regular season week's high score, ties split; all-play pays $0.75 × (wins − losses),
  never below $0 (1.6–1.7); what's left of the pot goes 55/30/15 (1.8). All-play counts weeks 1–14
  only, from the weekly results, since MFL's standings keep counting it through the playoffs. The
  pot is the accounting's league-wide entries; before they're recorded the prizes show their shares
  without amounts.

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
- The Commish tab's penalty form pre-fills penalties already charged but not yet reset.
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
  for good. So a move made on
  MFL's own pages, or by another team, can take 2 minutes to show. Moves' checks and who starts in
  League › Scores always ask MFL. MFL's player list (`ui/player-list.js`) is kept a day as bare
  rows; where it's only shown (League, Recent moves, a player's card), a copy up to two days old
  draws the page and a fresh one is asked for behind it. Moves' checks and Home, whose forms write to
  MFL, wait for a fresh one. On the home page, MFL's hidden chat module stops reading the chat every
  few seconds, as Home reads its own.
- After MFL refuses a request (HTTP 429), v2 asks it nothing for 30 seconds, on any page; a panel
  with nothing to show says MFL asked us to wait, with Retry off until then. Moves aren't held.
- League › Scores runs MFL's own win probability on the same feeds, but its numbers can differ from
  MFL's page by a point or so: MFL's simulation carries a random value across every lineup it has
  shown since the page loaded.
- Moves › Trades' "Locked" note shows for the rest of the NFL week once a traded player's game has
  kicked off, after MFL's own lock has lifted: Accept stays on, so MFL takes or refuses it.
- The commissioner viewing as another team (MFL's Become) is that team to MFL, so a look picked then
  is saved as that team's skin.
- A preview or beta whose features fail after starting shows their errors, with its bar there to
  leave. The beta is per browser and isn't in MFL's app.
