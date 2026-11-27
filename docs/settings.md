# League settings

`site/v2/settings.json` holds the leagues' own numbers: the rules MFL doesn't know about, and the
league's choices that MFL can't report. Everything else v2 reads from MFL. The site and the daily
job both read this file, so its numbers apply as soon as master deploys and on the job's next run.
Like any rule change, changing a listed league's in a version members already run means a new version.

The file has `defaults` and `leagues`, listed by the number in the league's pages (`L=`). A listed
league's settings are the defaults under its entry, where nested values merge and lists replace. A
test holds FUAD's to their values, so a change to the defaults can't quietly change its rules.

The values below are FUAD's: the defaults, with the wordmark and renumbered franchises its own.

## Test leagues

A league that isn't listed is a test league. It runs without a change to the code: its commissioner
pastes the site's header running v2, as its `MAIN` or a beta its members join (v1 has no settings), and
it has the defaults, with the wordmark "MFL". One line in its header, above the `<!-- a beta offer` comment, changes any
setting:

```html
<script>window.fuadSettings = {extends: "48571", wordmark: "FUAD CLONE", salaryCap: 250};</script>
```

- `extends` names a listed league to start from instead of the defaults, and is optional.
- Everyone in a test league sees a "Test league" line. Its commissioner also sees what's in force and
  any value that was ignored, for a name that isn't a setting or a value the rules can't use.
- A listed league ignores the line.
- Published franchise salaries show only with `extends`, as they're that league's. Otherwise they're
  missing, as they're from no team in this league.
- What v2 keeps in the browser is kept per league and per settings, so a changed value starts afresh.
- The daily job can't read a header. It stops for a league that isn't listed in the version
  `RULES_VERSION` names (v2 or later). A dry run (the manual run's default)
  doesn't stop, and takes the same line, as JSON, in its settings input; a listed league refuses it.

## Forking

To run the site from your own repository, change the header's `BASE` to your Pages address, replace
FUAD's entry in `settings.json` with your league's, and set the job's repository variables. You can
still test on someone else's copy: paste their `BASE` and a settings line into a test league's header.

## The league

| Setting | Value | Meaning |
|---|---|---|
| `wordmark` | "FUAD" | The league's short name, at the top of every page; the default is "MFL". |
| `timeZone` | "CT" | MFL's Time Zone setting for the league: `"ET"`, `"CT"`, `"MT"`, `"PT"`, `"AKT"`, `"HT"` or `"GMT"`. Times show in it, labelled with it. |

## Money and roster

| Setting | Value | Meaning |
|---|---|---|
| `salaryCap` | 300 | The salary cap in dollars, counting adjustments and drop penalties not yet charged. |
| `roster.min`, `roster.max` | 23, 30 | Active players allowed (injured reserve doesn't count), from the final cut-down date until the championship week is over. |
| `roster.overAfterTradeHours` | 12 | A team a trade takes over the max must be back within it by the next game, the next blind-bid deadline or this many hours after the trade, whichever is first (10.5). The daily job's flag says so; v2 doesn't. |

## Weeks

| Setting | Value | Meaning |
|---|---|---|
| `weeks.tradeDeadline` | 12 | Franchise salaries are taken at this week's first kickoff. Trades close at MFL's own trade deadline (its calendar), or this week's first kickoff if MFL has none. |

The rest of the season's weeks are MFL's: the playoffs start after its last regular season week,
and its last week is the championship. The anti-tanking check covers the regular season, and the
roster checks run until the championship is over.

## Contracts

| Setting | Value | Meaning |
|---|---|---|
| `contracts.maxYears` | 5 | The longest contract. The shortest is always 1 year. Members can write a length in figures, or as a word up to "ten"; a longer one is flagged. |
| `contracts.defaultYears` | 1 | The length a player gets when nobody names one in time. |
| `contracts.postWithinHours` | 1 | How long after a free agent or waiver add the length must be posted on the message board. A blind bid's length goes in its comment. |
| `franchiseTag.averageOfTop` | 5 | A franchise salary is the average of this many top salaries at the position, at the trade deadline. |
| `cutPenalty.shareOfRemainingContract` | 0.40 | A cut costs this share of the remaining contract (salary × years left), rounded up to a whole dollar and never under $1. |
| `cutPenalty.minimumPerYear` | 1 | …and never under this many dollars per year left. |
| `rookieCutFreeUntilLengthSet` | true | A rookie from this season's draft can be cut for nothing until their length is set, if before the final cut-down date. With false, a cut costs what any player's does. |

## Rookie scale

| Setting | Value | Meaning |
|---|---|---|
| `rookieScale.firstPick` | QB 6, RB 10, WR 10, TE 4, PK 1 | The first pick's salary at each position. Its positions are the ones the rookie scale and the franchise tag cover, in this order. The scale table shows picks until every position pays $1, and the draft has the rounds MFL's draft picks have. |
| `rookieScale.firstPickFromRank` | (not set) | In place of `firstPick`: the first pick's salary at each position is the salary at this rank among the position's at the trade deadline before the draft, e.g. `{"QB": 15, "RB": 20, "WR": 35, "TE": 15, "PK": 15}`, the 15th-highest QB salary and so on, $1 where the position had fewer. Its positions and their order are taken as `firstPick`'s are. It comes from the same snapshot as franchise salaries, which then keeps salaries down to the deepest rank, and falls back as they do: before the deadline, and where there's no snapshot, Rosters › Draft shows the scale from salaries as they stand, saying so, as does Load results for the draft. A league sets one of the two; setting either drops the other it would inherit. |
| `rookieScale.dropPerPick` | 0.20 | Each later pick costs this much less than the one before (0.20 is 80% of it), rounded, never under $1. |

## Adds

| Setting | Value | Meaning |
|---|---|---|
| `adds.ownDropBidAfterHours` | 48 | A team can't bid on a player it dropped for this long. MFL's own lock on dropped players ("Dropped Players are Locked Until") applies to every team, and v2 follows it separately. 0 turns this off. |
| `antiTanking` | true | Starting an injured or suspended player in the regular season is flagged. False turns the flag off; a member's own lineup alerts stay. |
| `backupStarters` | false | Lineup lets a member pick each starter's backup (bylaw 16.5), saved in the lineup's Optional Message, and Scores shows each team's pairs once locked. With false, neither shows backups, and members write them in that message on MFL's own lineup page or post them in the board's "Conditional starters" thread. Whether the daily job swaps backups in is its own `BACKUP_STARTERS` variable: `apply`, `log` to only log them, and unset the job doesn't read or flag them at all. |

How many bid groups a team can have is MFL's ("Maximum Number of Conditional Blind Bid Groups").

## Playoffs and payouts

| Setting | Value | Meaning |
|---|---|---|
| `playoffs.teams` | 6 | Teams in the playoffs. |
| `playoffs.divisionWinnersSeededFirst` | true | The division winners make the playoffs. With true they're the first seeds, in standings order; with false every seed goes by record, the winners' included. |
| `playoffs.byes` | 2 | The top seeds shown with a bye. MFL's playoff bracket decides who plays. |
| `playoffs.wildcardsBy` | "allPlay" | How the other seeds are picked: `"allPlay"`, the best all-play records; or `"standings"`, the next teams in MFL's standings. |
| `playoffs.allPlayTiesBy` | "standings" | How all-play ties are broken: `"standings"`, MFL's standings order; or `"points"`, total points, then the overall record, then the standings. |
| `playoffs.rounds` | `[]` | Empty: the playoffs are MFL's brackets. Otherwise each round in order, as `{"weeks": 1, "headToHead": false, "advance": 2}`: its teams are those with a matchup in its first week, as the commissioner sets them, and each team's score is its total over the round's weeks. A head-to-head round's pairings are won on that total; any other round ranks its teams, the pairings only saying who's in. Who goes on is whoever has a matchup in the next round; the places are the last round's teams, then each earlier round's others by its scores, ties to the higher seed. Only a two-team final can be head-to-head. A round that isn't head-to-head and isn't the last says how many go on in `advance` (only such a round has it); if the next round's matchups have a different number, or not the top scorers, Winners says so and the matchups stand. League › Scores shows a round that isn't head-to-head as one card ranking its teams on their totals so far, with the cutoff and, in the round's last week, each team's chance to go on (or to win, in the last round); its pairings show without win chances. League › Winners, Rosters › Draft and the daily job's payouts read the places. |
| `playoffs.thirdPlaceGame` | true | Whether MFL's playoffs have a 3rd place game, which decides 3rd place. With false, `payouts.places` has at most two shares. |
| `draftOrder` | "standingsThenPlayoffFinish" | Next year's rookie draft order, worst first: the teams out of the playoffs, then the playoff teams by how far they got. `"standingsThenPlayoffFinish"` orders the teams out by the standings; `"allPlayThenPlayoffFinish"` by their all-play winning percentage, ties broken as `playoffs.allPlayTiesBy` breaks the seeds', the other way round. With ties by points, teams still tied after the overall record show "tied: coin flip" on Rosters › Draft, in the standings' order until the commissioner flips. |
| `payouts.weeklyHighScore` | 15 | Dollars to each regular season week's high score, split on a tie. If MFL's own "Credit For Being The Weekly High Scorer" is on, MFL pays it ("Credit for week 3 high score of 140.83") and the daily job counts that as paid; set the same amount here so Winners shows it. |
| `payouts.allPlayPerGameOver500` | 0.75 | Dollars for each all-play win beyond the team's all-play losses in the regular season, never below $0. |
| `payouts.allPlayTop` | (not set) | In place of `allPlayPerGameOver500`: dollars to the best all-play records over the regular season, 1st first, e.g. `[150, 100, 50]`. Ties go as the seeds' do (`playoffs.allPlayTiesBy`); teams still level split the prizes they cover. The daily job records them as "1st Place All Play". A league sets one of the two; setting either drops the other it would inherit. |
| `payouts.divisionWinner` | 0 | Dollars to each division's winner, the first of its teams in MFL's standings, once the regular season is over; recorded as "Division Champ". A division whose first is level on head-to-head record with another of its teams is left for the commissioner, as MFL's standings may break the tie with all-play or points it keeps counting into the playoffs. |
| `payouts.places` | 0.55, 0.30, 0.15 | The playoff prizes, as shares of what's left of the pot after the weekly and all-play payouts: 1st, 2nd, 3rd, and so on for a longer list. The pot is the league-wide entries in MFL's accounting; until the commissioner records them, League › Winners shows the shares without amounts and the daily job flags the places instead of recording them. |
| `payouts.placeAmounts` | (not set) | In place of `places`: each place's prize in dollars, e.g. `[250, 200, 150, 100, 60, 60]`, with no pot. A league sets one of the two. In a `playoffs.rounds` league the daily job leaves the places to the commissioner when a tie, which goes to the higher seed, decides one, as it doesn't work out the seeds. |

## History

| Setting | Value | Meaning |
|---|---|---|
| `renumberedFranchises` | 0009 → 0005 through 2020 | Franchise numbers MFL moved when teams left, so a past title goes to today's team: `was` is today's `now` up to and including `through`. Empty (`[]`), the default, if no team ever moved. |

## Where the league is

Not in the file either:

- The GitHub Pages address is where the site is published, from the repository's name.
- MFL's header message loads the site: its `BASE` is that Pages address and its `MAIN` the version
  every page runs.
- The daily job's league is the repository variables `MFL_LEAGUE_ID` (the number in the league's
  pages, `L=`) and `MFL_HOST` (the start of its pages' address, as `https://www44.myfantasyleague.com`).
  Without them, or for a league not listed in the file, it stops before reading MFL.

## Read from MFL

These follow MFL's own settings, so they're not in the file: the teams, the divisions, the
standings order, the scoring, the starting lineup's positions (in MFL's order on Add, Drop, Trades,
Lineup, Scores, League's chart and Rosters › Players; team rosters, the franchise tag and the
rookie scale follow `rookieScale.firstPick`'s, or `firstPickFromRank`'s), the
season's weeks, the number of bid groups and the draft picks.

## Not supported yet

- **Team defenses and other positions in live scoring.** League › Scores skips the team lines in
  MFL's projections file, so a team defense shows no projection while games are on. The small
  minimum projections MFL adds exist in v2 for QB, RB, WR and TE only.
- **Blind bids without conditional groups.** Moves › Add needs the group choice on MFL's add form,
  which conditional blind bids give it; a form without one gets MFL's own Add/Drop page, restyled.
