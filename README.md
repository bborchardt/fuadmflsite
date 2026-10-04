# FUAD league site

Custom features for the Fuad Reveiz Fan Club Dynasty League on MyFantasyLeague: the Contracts,
Commish and Links tabs, and the League Alerts box on the Main tab (roster, salary cap and injured
reserve rules).

The code lives in this repo and is published to GitHub Pages. A home page message that appears
on every league page loads it, so it runs inside MFL and reads league data as the member
viewing the page.

## What's here

| Path | What it is |
|---|---|
| `site/v<N>/` | One folder per version: what MFL loads |
| `site/v<N>/fuad.js`, `loader.js`, `fuad.css` | The entry point, which version runs (header, preview or beta), and the league-wide styles |
| `site/v<N>/lib/` | League rules and logic, shared with the daily job |
| `site/v<N>/ui/` | The Main, Contracts, Commish and Links features |
| `mfl/` | What gets pasted into MFL's home page messages |
| `jobs/daily.mjs` | The daily job |
| `legacy/` | The code from before versions, kept as a paste-able fallback |
| `tests/` | Unit tests for the shared league logic (`npm test`) |
| `tools/dev-server.py` | Serves `site/` locally for previews |

The `league-data` branch holds what the daily job writes: franchise salary snapshots and its
chore log. It's published alongside the site.

## How MFL loads it

`mfl/message-header.html` goes in a home page message that appears on all league pages. It loads
one version's `fuad.js` and `fuad.css` from GitHub Pages. The other files in `mfl/` are one-line
mount points that go in the home page messages wired into the matching custom tabs.

If GitHub Pages can't be reached, the tabs say "League tools are temporarily unavailable" and MFL's
own pages keep working. For a long outage, `legacy/` can be pasted in instead, as before versions.

## Versions

The header message names one version. A version can be changed in place, which reaches every
season using it, or copied to a new folder and changed there. A new version is published but dark
until the header message is switched to it, and switching back reverts it. Which to do is the
maintainer's call: small fixes in place, rule changes and riskier work in a new version.

MFL keeps each season's site and copies the home page messages forward at renewal, so past seasons
keep loading the version they ended on. League rules live in each version's `lib/rules.js`, so a
season keeps the rules it was played under.

## Previewing

A `?fuadPreview=` parameter on any league page loads another version in that browser only:

| Value | Loads |
|---|---|
| `v<N>` | a published version |
| `local` or `local:v<N>` | the working copy served by `tools/dev-server.py` |
| `off` | the version in the header message again |

An orange badge shows while previewing. A preview that fails to load is turned off. For local
previews, Chrome asks once whether the MFL site may access the local network.

## Beta

The header message can offer members a version to try, with a line before the script that loads
the code:

```html
<script>window.fuadBeta = {version: "v2", feedback: "<link to a feedback thread>", teams: ["0001"]};</script>
```

`teams` limits the offer to those franchise ids; without it everyone gets it. League Alerts then
invites the viewer to try it (`?fuadBeta=on`), and the beta shows a bar on every page with the
feedback link and a way back (`?fuadBeta=off`). The choice is kept in that browser only, and only
while the header offers that version: removing the line ends the beta, and switching the header to
that version promotes it, for everyone at their next page load. The bar is drawn before the beta's
features start, so the way back stays even if they break. A developer preview wins over the beta.
The daily job follows `RULES_VERSION`, not what members see, so a beta changes how things look,
not the rules.

## Franchise salaries

The Contracts tab shows the salaries that apply right now. It works the dates out from MFL's NFL
schedule:

| When | Shows |
|---|---|
| Before the season's first kickoff, including while MFL hasn't published the schedule | Last season's snapshot |
| From the first kickoff to the trade deadline (the first kickoff of the deadline week in `rules.js`) | A live projection from current salaries |
| After the deadline | This season's snapshot |

Snapshots have to be taken at the deadline, because MFL reports today's salary for every past week:
a player cut later reads $1.

## The daily job

`.github/workflows/daily.yml` runs `jobs/daily.mjs` every morning, logged in to MFL as commissioner.
It works on the newest league site: this year's once the league has been renewed for it, last
year's until then. After a season's trade deadline it takes the franchise salary snapshot, commits it
to `league-data` and publishes the site. It checks last season's snapshot too, so one that's missing
is still taken after renewal. A snapshot taken
more than a week late is marked for checking. Snapshots only need public league data, so a failed
login is logged and fails the run, but doesn't stop the snapshot.

It also charges cap penalties for drops. A dropped player still carrying a contract gets a salary
adjustment for the penalty, described like "Name (2yrs@10, 10/03)" with the drop date, and is reset
to $1 / 0 years, which clears them from the Commish tab. An adjustment naming the player made since
the drop counts as already charged, so a penalty entered by hand isn't charged twice. Unless the
`DROP_PENALTIES` repository variable is `apply`, it only logs what it would do. More drops in one run
than a busy day would bring are left for the commissioner rather than charged.

It flags every team over the cap, all year, counting drop penalties still owed: the same total the
Main tab's League Alerts box uses. The chore log names the team, its total and its moves in the last
week, and the run fails so the commissioner hears about it, every day until the team is back under.
It doesn't reverse anything. A team over the cap has its drop penalties held, with the dropped
players' contracts intact, so the move can be reversed. It also flags roster limit and injured
reserve violations, from the same rules as the Main tab's League Alerts box.

It sets contract years for added players, which MFL adds with 0 years. By league rule a blind bid's
length (1 to 5 years) goes in the bid's comment, and a free agent or waiver add's in a message board
post within an hour of the add, naming the player. The recommended forms are `Hill: 3 years` in a
post, and one length per line in a bid comment, in the order of the players in the bid; the reader
also understands other common phrasings. While the hour is open, the Main tab's League Alerts box
reads the board with the job's own reader (`lib/contract-years.js`) and shows the deadline, the
length it read, or that it couldn't read one, so the owner can edit their latest post or post again. Owners
have used threads of every name, so all of them are read. The job reads bid comments from MFL's
Previously Processed Waivers page, the only place they appear, and posts through MFL's API. The
latest post within the hour about a player decides; MFL's API keeps an edited post's original time,
so an edit made after the hour still counts. A last name is enough unless another add waiting for
years shares it. A bare count in a bid comment covers every player in that conditional bid. An add
with no length stated in time gets 1 year at the job's next run; the commissioner adjusts by hand
for any leniency. Anything unclear (a length it can't tie to one player or can't read, a bid it
can't find) is left for the commissioner and fails the run, so a stated length is never replaced by
the default. Unless the `CONTRACT_YEARS` repository
variable is `apply`, it only logs what it would do.

It keeps a chore log on `league-data`, with an entry whenever it does something and a heartbeat at
least once a month. Each run's entries also appear on the run's summary page in GitHub Actions,
which a failed run's notification email links to. It re-enables itself on every run, because GitHub
turns off scheduled workflows after 60 days without repository activity.

If a snapshot is ever missing, the Commish tab says so and its **Show franchise snapshot** button
produces the file to commit to `league-data` by hand. The job publishes any snapshot on
`league-data` that the site doesn't have yet, so a hand-committed one goes live on its next run.
