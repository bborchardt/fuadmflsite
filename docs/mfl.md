# MFL facts

How MyFantasyLeague behaves, as the code relies on it. Checked against the live site; MFL documents
little of this.

## Pages and data

- **Same-origin only:** league data can only be read from MFL's own pages. Scripts and styles can be
  loaded from GitHub Pages; the league page sends no CSP.
- **Hosts:** league exports go to the league's host (`www44.myfantasyleague.com`); league-independent
  ones (`players`, `injuries`, `nflSchedule`, `myleagues`, `login`) to `api.myfantasyleague.com`.
- **JSON:** a one-item list comes back as a bare object, and an empty one is left out. An unpublished
  season's `nflSchedule` returns 404.
- **Weeks:** `weeklyResults` reports the last week with results: a week behind in season, and week 17
  all offseason. `injuries` with `W` is that week's report; without it, today's.
- **Rosters by week** keep membership but report today's salary: a player cut later reads $1.
- **Renewal:** MFL keeps past seasons' sites and copies home page messages forward. The league renews
  in mid-March or later, never on a fixed date.

## Login and limits

- **Login:** `POST api…/<year>/login` returns `<status MFL_USER_ID="…">`, sent back as the
  `MFL_USER_ID` cookie. Bad credentials return `<error>` with HTTP 200. A per-user `APIKEY` can't
  do commissioner actions.
- **Rate limits** aren't published. A registered client (registered at `/<year>/csetup?C=APICLI`,
  then sent as the User-Agent) gets about 2.5 times as much as an unregistered one. Bursts get HTTP
  429; MFL asks for about a second between requests and no retries. Heavy testing from one machine
  is throttled within hours, so test against saved exports.

## Waivers and the message board

- **Blind bid comments** appear only on the logged-in Previously Processed Waivers page
  (`/<season>/processed_waivers?LEAGUE_ID=…&PERIOD=…`), one page per waiver run; the period id is the
  `BBID_WAIVER` transaction's timestamp. A conditional bid lists several players, of which MFL awards
  the first it can. Players without an NFL team show as "FA*".
- **Message board API** (`messageBoard`, `messageBoardThread`) needs a login and returns nothing for
  2024 and earlier; past seasons' boards are a public archive at `/<season>/options?L=<league>&O=28`.
- **Edited posts** keep their original `postTime` and return the edited text; the API has no edit
  time (the board's page shows "Edited …").

## Layout

- **Tabs:** up to 10 custom tabs ("Main" is fixed). MFL's nav bar and dropdown menu can't be changed.
- **Phones:** the BlueMesh skin hides the nav bar below 54.25em; `fuad.css` brings it back. Wide
  modules already scroll sideways.
- **MFL's app** doesn't run home page messages, so none of this code.

## GitHub

- Scheduled workflows are disabled after 60 days without repository activity; the daily job
  re-enables itself.
- Chrome asks once before a public site may load from `localhost`, which local previews need.
