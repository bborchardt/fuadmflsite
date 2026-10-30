# League settings

`site/v2/settings.json` holds the league's own numbers: the rules MFL doesn't know about, and the
league's choices that MFL can't report. Everything else v2 reads from MFL. The site and the daily
job both read this file, so its numbers apply as soon as master deploys and on the job's next run.
Like any rule change, changing one in a version members already run means a new version.

The values below are this league's.

## The league

| Setting | Value | Meaning |
|---|---|---|
| `wordmark` | "FUAD" | The league's short name, at the top of every page. |
| `timeZone` | "CT" | MFL's Time Zone setting for the league: `"ET"`, `"CT"`, `"MT"` or `"PT"`. Times show in it, labelled with it. |

## Money and roster

| Setting | Value | Meaning |
|---|---|---|
| `salaryCap` | 300 | The salary cap in dollars, counting adjustments and drop penalties not yet charged. |
| `roster.min`, `roster.max` | 23, 30 | Active players allowed (injured reserve doesn't count), from the final cut-down date until the championship week is over. |

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
| `rookieCutFreeUntilLengthSet` | true | A rookie from this season's draft can be cut for nothing until their length is set (and before week 1). With false, a cut costs what any player's does. |

## Rookie scale

| Setting | Value | Meaning |
|---|---|---|
| `rookieScale.firstPick` | QB 6, RB 10, WR 10, TE 4, PK 1 | The first pick's salary at each position. Its positions are the ones the rookie scale and the franchise tag cover, in this order. The scale table shows picks until every position pays $1, and the draft has the rounds MFL's draft picks have. |
| `rookieScale.dropPerPick` | 0.20 | Each later pick costs this much less than the one before (0.20 is 80% of it), rounded, never under $1. |

## Adds

| Setting | Value | Meaning |
|---|---|---|
| `adds.ownDropBidAfterHours` | 48 | A team can't bid on a player it dropped for this long. MFL's own lock on dropped players ("Dropped Players are Locked Until") applies to every team, and v2 follows it separately. 0 turns this off. |
| `antiTanking` | true | Starting an injured or suspended player in the regular season is flagged. False turns the flag off; a member's own lineup alerts stay. |

How many bid groups a team can have is MFL's ("Maximum Number of Conditional Blind Bid Groups").

## Playoffs and payouts

| Setting | Value | Meaning |
|---|---|---|
| `playoffs.teams` | 6 | Teams in the playoffs. |
| `playoffs.divisionWinnersSeededFirst` | true | The division winners are the first seeds, in standings order. With false, every seed is picked as the wildcards are. |
| `playoffs.byes` | 2 | The top seeds shown with a bye. MFL's playoff bracket decides who plays. |
| `playoffs.wildcardsBy` | "allPlay" | How the other seeds are picked: `"allPlay"`, the best all-play records, ties by the standings; or `"standings"`, the next teams in MFL's standings. |
| `playoffs.thirdPlaceGame` | true | Whether MFL's playoffs have a 3rd place game, which decides 3rd place. With false, `payouts.places` has at most two shares. |
| `draftOrder` | "playoffFinish" | Next year's rookie draft order, worst first: `"playoffFinish"`, the teams out of the playoffs by the standings, then the playoff teams by how far they got; or `"standings"`, every team by the standings. |
| `payouts.weeklyHighScore` | 15 | Dollars to each regular season week's high score, split on a tie. |
| `payouts.allPlayPerGameOver500` | 0.75 | Dollars for each all-play win beyond the team's all-play losses in the regular season, never below $0. |
| `payouts.places` | 0.55, 0.30, 0.15 | The playoff prizes, as shares of what's left of the pot after the weekly and all-play payouts: 1st, 2nd, 3rd, and so on for a longer list. The pot is the league-wide entries in MFL's accounting; until the commissioner records them, League › Winners shows the shares without amounts and the daily job flags the places instead of recording them. |

## History

| Setting | Value | Meaning |
|---|---|---|
| `renumberedFranchises` | 0009 → 0005 through 2020 | Franchise numbers MFL moved when teams left, so a past title goes to today's team: `was` is today's `now` up to and including `through`. Empty (`[]`) if no team ever moved. |

## Where the league is

Not in the file either:

- The GitHub Pages address is where the site is published, from the repository's name.
- MFL's header message loads the site: its `BASE` is that Pages address and its `MAIN` the version
  every page runs.
- The daily job's league is the repository variables `MFL_LEAGUE_ID` (the number in the league's
  pages, `L=`) and `MFL_HOST` (the start of its pages' address, as `https://www44.myfantasyleague.com`).
  Without them it stops before reading MFL.

## Read from MFL

These follow MFL's own settings, so they're not in the file: the teams, the divisions, the
standings order, the scoring, the starting lineup's positions (in MFL's order on Add, Drop, Trades,
Lineup, Scores, League's chart and Rosters › Players; team rosters, the franchise tag and the
rookie scale follow `rookieScale.firstPick`'s), the
season's weeks, the number of bid groups and the draft picks.

## Not supported yet

- **Team defenses and other positions in live scoring.** League › Scores skips the team lines in
  MFL's projections file, so a team defense shows no projection while games are on. The small
  minimum projections MFL adds exist in v2 for QB, RB, WR and TE only.
- **Blind bids without conditional groups.** Moves › Add needs the group choice on MFL's add form,
  which conditional blind bids give it; a form without one gets MFL's own Add/Drop page, restyled.
