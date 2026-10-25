# League settings

`site/v2/settings.json` holds the league's own numbers: the rules MFL doesn't know about, and the
league's choices that MFL can't report. Everything else v2 reads from MFL. The site and the daily
job both read this file, so its numbers apply as soon as master deploys and on the job's next run.
Like any rule change, changing one in a version members already run means a new version.

The values below are this league's.

## Money and roster

| Setting | Value | Meaning |
|---|---|---|
| `salaryCap` | 300 | The salary cap in dollars, counting adjustments and drop penalties not yet charged. |
| `roster.min`, `roster.max` | 23, 30 | Active players allowed (injured reserve doesn't count), from the final cut-down date until the championship week is over. |

## Weeks

| Setting | Value | Meaning |
|---|---|---|
| `weeks.tradeDeadline` | 12 | Franchise salaries are taken at this week's first kickoff. Trades close at MFL's own trade deadline (its calendar), or this week's first kickoff if MFL has none. |
| `weeks.playoffsStart` | 15 | The first playoff week. The anti-tanking check covers the weeks before it. |
| `weeks.championship` | 17 | The last week. The roster checks run until it's over. |

## Contracts

| Setting | Value | Meaning |
|---|---|---|
| `contracts.maxYears` | 5 | The longest contract. The shortest is always 1 year. Members can write a length in figures, or as a word up to "ten"; a longer one is flagged. |
| `contracts.defaultYears` | 1 | The length a player gets when nobody names one in time. |
| `contracts.postWithinHours` | 1 | How long after a free agent or waiver add the length must be posted on the message board. A blind bid's length goes in its comment. |
| `franchiseTag.averageOfTop` | 5 | A franchise salary is the average of this many top salaries at the position, at the trade deadline. |
| `cutPenalty.shareOfRemainingContract` | 0.40 | A cut costs this share of the remaining contract (salary × years left), rounded up to a whole dollar and never under $1. |
| `cutPenalty.minimumPerYear` | 1 | …and never under this many dollars per year left. |

## Rookie scale

| Setting | Value | Meaning |
|---|---|---|
| `rookieScale.firstPick` | QB 6, RB 10, WR 10, TE 4, PK 1 | The first pick's salary at each position. Its positions are the ones the rookie scale and the franchise tag cover, in this order. |
| `rookieScale.dropPerPick` | 0.20 | Each later pick costs this much less than the one before (0.20 is 80% of it), rounded, never under $1. |

## Adds

| Setting | Value | Meaning |
|---|---|---|
| `adds.ownDropBidAfterHours` | 48 | A team can't bid on a player it dropped for this long. MFL's own lock on dropped players ("Dropped Players are Locked Until") applies to every team, and v2 follows it separately. 0 turns this off. |

## Playoffs and payouts

| Setting | Value | Meaning |
|---|---|---|
| `playoffs.teams` | 6 | Teams in the playoffs. The division winners are the first seeds; the rest are the best all-play records. |
| `playoffs.byes` | 2 | The top seeds shown with a bye. MFL's playoff bracket decides who plays. |
| `payouts.weeklyHighScore` | 15 | Dollars to each regular season week's high score, split on a tie. |
| `payouts.allPlayPerGameOver500` | 0.75 | Dollars for each all-play win beyond the team's all-play losses in the regular season, never below $0. |
| `payouts.places` | 0.55, 0.30, 0.15 | The playoff prizes, as shares of what's left of the pot after the weekly and all-play payouts: 1st, 2nd, 3rd. The pot is the league-wide entries in MFL's accounting; until they're recorded, $100 × 10 teams. |

## History

| Setting | Value | Meaning |
|---|---|---|
| `renumberedFranchises` | 0009 → 0005 through 2020 | Franchise numbers MFL moved when teams left, so a past title goes to today's team: `was` is today's `now` up to and including `through`. Empty (`[]`) if no team ever moved. |
