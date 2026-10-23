# MFL facts

How MyFantasyLeague behaves, as the code relies on it, or v2 will. Checked against the live site;
MFL documents little of this.

## Pages and data

- **Same-origin only:** league data can only be read from MFL's own pages. Scripts and styles can be
  loaded from GitHub Pages; the league page sends no CSP.
- **Hosts:** league exports go to the league's host (`www44.myfantasyleague.com`); league-independent
  ones (`players`, `injuries`, `nflSchedule`, `myleagues`, `login`) to `api.myfantasyleague.com`.
- **JSON:** a one-item list comes back as a bare object, and an empty one is left out. An unpublished
  season's `nflSchedule` returns 404.
- **Weeks:** `weeklyResults` reports the last week with results: a week behind in season, and week 17
  all offseason. `injuries` with `W` is that week's report; without it, today's.
- **This week's lineups:** `liveScoring` with `W` lists each matchup's `franchise` entries, their
  `players.player` marked `starter` or `nonstarter`, before kickoff too.
- **Rosters by week** keep membership but report today's salary: a player cut later reads $1.
- **The player page** (`player?L=<league>&P=<id>`, public) has in one request what the exports spread
  over many (`playerScores` takes one week per request): the biography (height and weight, born and
  age, college, drafted, experience, jersey), the status (owner as "Team - S" or "- NS" logged out,
  though it didn't match the team's name for a logged-in member, so v2 takes the owner from the
  rosters; MFL's team list can have spaces around a name, as "The Obliterators "; injury as
  "Out (Ankle)", expected return, bye, salary, contract year), the latest five headlines linking to
  `view_news_article?L=<league>&ID=<article>`, and the season by week (`#player_stats_table`: points,
  opponent as "at Colts" or "vs Saints", "Bye", and the week's lineup status with an injury mark such
  as "( O )"). The article page has the published time, the source, the update and "Analysis:".
- **MFL's player popup** is `launch_player_modal(league, player)`, called from `javascript:` links on
  its pages.
- **The calendar export** needs a logged-in member. Each `event` has `id`, `type` (`CUSTOM` for the
  commissioner's own, `TRADE`, `WAIVER_BBID`, `WAIVER_LOCK`), `title` (empty on MFL's own),
  `start_time` and `end_time` in seconds, and `happens`: for a weekly event, how many weeks it
  repeats after the first (the form's "each week for the next N weeks"), empty for one time only.
  The trade deadline's `start_time` is its week, `12`, not a time; its `end_time` is when trades
  reopen.
- **Renewal:** MFL keeps past seasons' sites and copies home page messages forward. The league renews
  in mid-March or later, never on a fixed date.

## Scores and standings

- **MFL's live scoring page** (`ajax_ls`) computes in the browser, from two feeds on the league's
  host, `fflnetdynamic<season>/live_stats_<WW>.txt` and `live_proj_<WW>.txt` (`WW` the week, two
  digits): the scoring rules compiled into the page (the same rules as `export?TYPE=rules`), then
  `mfl_win_prob.js`, 400 simulations of what's left to play, seeded by player and week. One random
  value carries from player to player, so the result depends on the order it walks the lineups
  (position, then name).
- **The stats feed** is a line per player (`12860|EA 1|EP 1`) and per NFL team (`HOU|QUARTER 2|
  REMAINING 15:00|POSSESSION 2|…`), then `DATE|<seconds>|…` and `REFRESH|40000`. A team's game is
  over when `QUARTER` is empty or `F`; `H` is halftime, `O` overtime. Lines carry stray carriage
  returns inside them (`DIF 7\r|EA 1\r`). It answers 403 without a referrer from MFL's pages. A
  past week's file stays readable.
- **The projections feed** is a line per player: `16619,WR,RA=0.18,CC=1.92,ARY=3.44,…`, stats only.
- **`liveScoring`** needs `DETAILS=1` to list the bench (without it, only the starters). It lists each team's `playersCurrentlyPlaying`, `playersYetToPlay` and
  `gameSecondsRemaining`, and each player's `score` and `gameSecondsRemaining`, but no stats
  (`updatedStats` is a counter), and leaves out injured reserve.
- **`weeklyResults` with `W=YTD`** comes back as `allWeeklyResults`, a `weeklyResults` per week, each
  team's `player` list with `status` and `score`. Weeks not yet played have matchups without scores.
- **`leagueStandings`** lists the teams in the league's standings order; its `all_play_wlt` keeps
  counting through the playoff weeks (2025's champion: 128-25, paid on the regular season's 102-24).
- **The Power Rank page** (`options?O=101`, no export) is a `table.report`, a row per team with the
  team in `a.franchise_<id>` and each figure in a classed cell (`power_rank`, `all_play_w`, …).
- **The League History pages** (no exports, public) go back to 2008 through the commissioner's
  historical franchise links (Link Historical Franchises), which MFL doesn't publish; past league ids
  differ (34866 in 2013). League Champions (`options?O=194`) lists each year under a
  `<th colspan="2">` with the champion's that-year name and a link holding that year's franchise
  number. Career Records (`O=208`) has a row per current team (`franchise_<id>`): W, L, T and the
  seasons linked to it. All-Time Series Records (`O=171&FID=<id>`) has a row per current opponent
  with a total, plus Defunct Franchises; a year not linked is starred. Each table's name is in MFL's
  menu too, so a reader looks for its `<caption><span>`. Franchise numbers moved when teams left:
  Golden Ratio was 0009 through 2020, 0005 since 2021.
- **`playoffBracket` with `BRACKET_ID`** has `playoffRound`s of `playoffGame`s, each side's
  `franchise_id`, `points` and `seed` (or `winner_of_game` / `loser_of_game`); `playoffBrackets`
  names them (Championship, 3rd Place Game). `schedule` covers the regular season only.

## Login and limits

- **Login:** `POST api…/<year>/login` returns `<status MFL_USER_ID="…">`, sent back as the
  `MFL_USER_ID` cookie. Bad credentials return `<error>` with HTTP 200. A per-user `APIKEY` can't
  do commissioner actions.
- **Rate limits** aren't published. A registered client (registered at `/<year>/csetup?C=APICLI`,
  then sent as the User-Agent) gets about 2.5 times as much as an unregistered one. Bursts get HTTP
  429; MFL asks for about a second between requests and no retries. Heavy testing from one machine
  is throttled within hours, so test against saved exports. A member's browser sending 11–14
  exports at once per page load (v1's home page) isn't refused; about 25 within a few seconds can be.
  Requests from the league's own pages count too.
- **API imports:** `blindBidWaiverRequest` takes `PICKS` (`ADD_BID_DROP`, …) and `ROUND` but no
  comment; `messageBoard` lets an owner post (`THREAD` + `BODY`, or `SUBJECT` + `BODY`), posted to
  `/<season>/import?TYPE=messageBoard&L=<league>` from the logged-in page, which answers
  `<status>OK</status>` or `<error>`; `salaries` needs the commissioner's cookie.
- **Becoming the commissioner:** when the commissioner is logged in as a team, MFL's menu has "Become
  Commissioner", `logout?L=<league>&BECOME=0000`; presumably `BECOME=<team>` goes the other way (not
  yet seen).

## Waivers and the message board

- **Blind bid comments** appear only on the logged-in Previously Processed Waivers page
  (`/<season>/processed_waivers?LEAGUE_ID=…&PERIOD=…`), one page per waiver run; the period id is the
  `BBID_WAIVER` transaction's timestamp. A conditional bid lists several players, of which MFL awards
  the first it can. Players without an NFL team show as "FA*". Every logged-in member sees every
  team's requests there, losing bids included; a group shows again for each step MFL took through
  it.
- **Processing** (MFL's blind bidding help; not yet seen happen): bids league-wide from the highest
  dollar amount down; within a group the first valid claim wins; groups have no priority. A claim
  whose drop is already gone (won by another group) is invalid, so a drop shared by two groups can't
  add a player.
- **Pending claims** (`export?TYPE=pendingWaivers`) are the logged-in owner's own:
  `{"pendingWaivers":{"blindBidWaiverRequest":{"round":"1","addsDrops":"13753_1_16619,13308_1_16152",
  "comments":"1 yearbr/2 years","timestamp":"…"}}}`, one entry per group (a list when there are
  several), claims in priority order as `ADD_BID_DROP` (a claim with no drop ends `_0000`), and the
  comment's line breaks mangled to `br/`. Until the run, each group also shows in `transactions` as
  a `BBID_WAIVER_REQUEST` (`"transaction":"<round>|<claims>"`).
- **The board's pages:** a topic is `options?L=<league>&O=28&TOPIC_ID=<thread id>`, a new one
  `options?L=<league>&O=28&ACTION=add`. The home page's "10 Newest Message Board Topics" module
  (`#message_board_summary`, links in `td.topic`) shows to guests too.
- **Pending trades** (`export?TYPE=pendingTrades`) are the logged-in owner's, both offered and
  received; with none it's an empty `{"pendingTrades":{}}`. `transactions` also lists each offer as a
  `TRADE_PROPOSAL` and each refusal as a `TRADE_REJECTION` (`by_commish` when the commissioner acted
  for a team).
- **Message board API** (`messageBoard`, `messageBoardThread`) needs a login and returns nothing for
  2024 and earlier; past seasons' boards are a public archive at `/<season>/options?L=<league>&O=28`.
- **Edited posts** keep their original `postTime` and return the edited text; the API has no edit
  time (the board's page shows "Edited …").

## Forms

Each is an ordinary page form, posted from the logged-in browser.

- **Add/Drop** (`add_drop?L=<league>`), one form posted to `add_drop`:
  - Fields: `L`, `add_pid` and `drop_pid` (hidden, `#add_pid_field_id`, `#drop_pid_field_id`),
    `FORCE_WAIVER` (checkbox), `BBID_AMT`, `ROUND` (a select of existing groups plus the next),
    `COMMENTS` (textarea; a claim added to an existing group has its comment added to the group's
    as a new line), `SUBMIT` (`#add_drop_submit`, "Perform Add/Drop" or "Submit Request"),
    `add_settings` and `PROJSRC`.
  - The player lists are JavaScript data, `playerDatabaseObj["add"]` and `["drop"]`: arrays of
    `Player2` (`id, name, nfl_team, pos, bye_week, sal, inj, roster, pts, opp, pwpts, sort_sal`),
    `pts` the points so far and `pwpts` this week's projection. Names carry flags: `*` dropped
    recently, `!` game started, `#` locked by the global player lock (from the Sunday noon lock to
    the Wednesday night run, and a dropped player until the run after two days), `(R)` rookie. Only
    a free agent with no flag can be added at once.
  - The form opens between the table's rows, so its fields belong to it without being inside it
    (`input.form`, not `form.querySelector`).
  - `picker.js` draws the rows (`tr#add_<id>`, `tr#drop_<id>`). A click fills the hidden id and the
    "To Add"/"To Drop" cells (`#add_name_field_id`, `#drop_name_field_id`), then
    `picker_locked_check(...)` shows or hides the bid, group and comment rows (`#amt_field_id`,
    `#round_field_id`, `#comments_field_id`) and the `FORCE_WAIVER` row. A pick with any flag,
    `!` included, becomes a blind bid ("Submit Request"), not a refusal; a row already picked is
    unpicked by `picker_select` on it again. The drop list's `!` isn't checked by the page.
  - After a submit MFL shows Add/Drop again with no message; the claim appears in
    `#waiver_request_list`: Group, Add, Drop, Bid Amount, Action, Time Entered, Comments (one cell
    per group). Its action links write a claim as `ROUND_ADDID_BID_DROPID`:
    `add_drop?L=<league>&F=<team>&MOVE_UP=1_13308_1_16152`, `MOVE_DOWN=…`, `DELETE=…`,
    `COPY_ROUND=1_13753_1_16619_2` (the last part is the target group), and Edit,
    `options?L=<league>&O=255&F=<team>&ROUND=1`.
- **Drop Players** (`options?L=<league>&O=257`), one form posted to `add_drop`: `LEAGUE_ID`,
  `FRANCHISE`, `OPTION=257`, `drop_pid` (a multiple select, filled by "Add To List"), `SUBMIT`
  ("Drop Players"). The roster is JavaScript data, `playerDatabaseObj["picker"]`: `Player2` (`id,
  name, nfl_team, pos, bye_week, sal, inj, roster, pts, projpts, sort_sal`), `roster` `S`, `NS` or
  `IR`, and `!` on the name once his game has started.
- **Edit a claim group** (`options?O=255&ROUND=<n>`), one form posted to `options`:
  `form_name=editwr`, `LEAGUE_ID`, `O=255`, `ROUND`; per claim `amount_<i>` and `drop_<i>` (a select
  of the roster plus "None"); `applyall` (checkbox); `comment` (the group's one comment); `SAVE` /
  `CANCEL`.
- **Injured reserve** (`options?L=<league>&O=18`), one form posted to `ir`: `LEAGUE_ID`,
  `FRANCHISE_ID`; per player checkboxes `deactivate<team>` (to IR), `activate<team>` (from IR) and
  `drop<team>`, each valued with the player id, all in one submit ("Perform Injured Reserve", no
  name), so an activation and a drop go together. Two tables, each with the drop box: "Select
  Players To Deactivate/Drop" (active players, with Starter?) and "Select Players To Activate" (IR
  players). Each player is a `launch_player_modal` link with MFL's injury mark after it ("(IR)",
  "(Out)"). MFL refuses ineligible players itself ("Can not be deactivated" in place of a
  checkbox) and puts "Locked" in place of a player's boxes once his game has started.
- **Trades** (`options?L=<league>&O=05`): "Trades Offered By You", "Trades Offered To You", and a
  "Select Franchise To Trade With" form (`options`, `OPTION=05`, `FRANCHISE` select) that opens the
  proposal page.
  - Propose: one form posted to `trade_offer`: `LEAGUE_ID`, `FRANCHISE_ID` (both teams,
    `0001,0002`), `input_expires`, checkboxes `drop<team>` per side, each valued with a player id or
    a future pick (`FP_<owner>_<year>_<round>`, "Year 2027 Round 1 Draft Pick from …"),
    `TRADE_EXPIRES_MONTH`, `_DAY`, `_TIME`, `_YEAR`, `msg`, and `Propose` ("Propose Trade").
  - Respond: per offer, a form posted to `trade_response`: `LEAGUE_ID`, `TRADE_ID`, radio `ACTION`
    (`accept`, `counter_proposal`, `reject`), `COMMENTS`, and "Respond To Trade Offer" (off until a
    choice is made; accept asks to confirm). A counter rejects the offer at once, then opens the
    ordinary proposal page for the two teams (`options?O=05&FRANCHISE=<mine>,<theirs>`) with nothing
    ticked, an empty message and the default expiry.
  - Withdraw: each of the member's offers links "I'd like to revoke this trade offer", a plain GET
    with no confirmation: `trade_response?L=<league>&TRADE_ID=<id>&ACTION=revoke`. The offer row
    shows the date, each side's players and picks, the expiry, a Comments row and "Compare Players".
- **Submit Lineup** (`lineup?L=<league>`): a week picker ("Submit Lineup For Week: 6 | 7 | … 17",
  `lineup?L=…&WEEK=<n>&F=<team>`; this week and later), then one form posted to `lineup`:
  - Hidden `FRANCHISE`, `LEAGUE_ID`, `WEEK`, `FORM=1`, `lineup_expires`, `INITPROJSRC`; a `PROJSRC`
    select (the projection source) that submits the form on change.
  - One `table.report`, a row per active player, grouped by position and alphabetical within it
    ("Beck, Carson ARI QB"), each group's first row headed "Select 1-2 QB:". Per player a checkbox
    `QB<team>` (`RB<team>`, …) valued with the player id, `checked` for a starter; columns for the
    opponent with kickoff, Inj (`O`, `Q`, `I`, presumably IR), Bye, the opponent's average and rank
    against the position, YTD, Avg and Proj points, position rank, % Start and NFL News; last week's
    starters in bold.
  - The checkbox is **disabled** (no name) for a player on a bye or whose game has started, so
    neither can be changed. A starter whose game has started stays checked, and a hidden input of
    the same name and value keeps him in the posted lineup. An Out player can stay checked.
  - Then `MESSAGE<team>` ("Optional Message"), and `SUBMIT` ("Submit Lineup"; with nothing checked
    it asks to confirm "un-submitting" the lineup). IR players are listed below the table ("you must
    first activate them on the Injured Reserve page").

## Chat

- The Main tab's `#league_chat` module and the chat page (`chat?L=<league>&COUNT=40`) are both drawn
  by `mfl_common.js` from one feed, `fflnetdynamic<season>/<league>_chat.xml`, polled every 5
  seconds (stopping after about 2 hours without posting); they differ only in `displayMessages` (9
  or 40).
- The feed is `<messages>` of `<message>` elements, newest first, carrying `id`, `franchise_id`
  (the sender), `to` (a team or `0000` the commissioner, for a private message; empty for everyone),
  `message` and `posted`. `posted` is text ("Sat Oct 10 8:36:55 p.m. CT 2026"); the `id` starts
  with the post's time in seconds (`1791682615dog683`). It holds the season's messages until
  someone posts `:clear:`.
- **Private messages are in the public feed:** MFL's script just skips those not to or from the
  viewer, so v2 must apply the same filter.
- Posting is a GET from the logged-in browser:
  `chat_save?L=<league>&MESSAGE=<escaped text>&TO_FID=<team, or empty for everyone>`. It can take a few
  seconds to answer, as can a board import; the feed has the message once it does.

## League settings

- **`export?TYPE=league`:** `bbidConditional=Yes`, `maxWaiverRounds=8`, `bbidMinimum=1`,
  `bbidIncrement=1`, `bbidSeasonLimit=999999`, `currentWaiverType=BBID_FCFS`,
  `includeIRWithSalary=100`, `salaryCapAmount=300` (soft), `rosterSize=80`.
- **Trades** (the commissioner's setup): accepted trades process immediately; trades that create
  invalid rosters go through, and that team can't submit a lineup until fixed; a trade with a player
  whose game has kicked off can't be accepted until the week's games end (4 hours after the last
  kickoff, per MFL's help); trade comments aren't shown to everyone; picks are tradable 2 years out,
  rounds 1–5; blind-bid dollars can't be traded; proposals expire after 7 days by default.

## Layout

- **Tabs:** up to 10 custom tabs ("Main" is fixed). MFL's nav bar and dropdown menu can't be changed.
- **Phones:** the BlueMesh skin hides the nav bar below 54.25em; `fuad.css` brings it back. Wide
  modules already scroll sideways.
- **MFL's app** doesn't run home page messages, so none of this code.

## GitHub

- Scheduled workflows are disabled after 60 days without repository activity; the daily job
  re-enables itself.
- Chrome asks once before a public site may load from `localhost`, which local previews need.
