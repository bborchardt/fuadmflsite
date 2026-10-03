# Findings at a glance

**League:** 48571 · **Checked against the live site:** 3 Oct 2026, Week 4 ·
**Updated:** 3 Oct 2026, after [PR #1](https://github.com/bborchardt/fuadmflsite/pull/1) was deployed
**Details:** [`tier-0-runbook.md`](tier-0-runbook.md) (admin changes) ·
[`ux-modernization-options.md`](ux-modernization-options.md) (code and platform)

Start here. Each line is the whole finding; follow the link only if you want
the evidence.

**Where things stand:** the three live bugs are fixed and deployed, and the repo
now matches production exactly. What's left is six admin tidy-ups and the
post-deadline paste.

---

## Still to do — admin tidy-ups, no code

| # | Finding | Fix |
|---|---|---|
| 4 | **The Standings tab cuts off columns on phones**, with no way to scroll sideways. Power Rankings runs 588px into a 390px screen (514px preseason; it grew as stats filled in). League Standings clips too. | Move Power Rankings to its own tab, or drop it. [Runbook 1](tier-0-runbook.md#1-move-or-remove-power-rankings) |
| 5 | **Two custom tabs duplicate MFL's own menu:** Standings and Live Scoring. | Drop them after checking MFL's native pages on a phone. [Runbook 2](tier-0-runbook.md#2-drop-the-two-duplicate-tabs) |
| 6 | **The "Transactions" tab has no transactions on it.** It holds Trade Bait, Top Free Agents and the Starter Points chart. Transactions are on Main. | Rename it, e.g. "Players". [Runbook 3](tier-0-runbook.md#3-rename-the-transactions-tab) |
| 7 | **League Chat, Poll and Trade Bait are still empty after four weeks.** The message board is busy, so members are talking there. | Remove them from Main. [Runbook 4](tier-0-runbook.md#4-remove-the-unused-modules) |
| 8 | **Skin is still BlueMesh.** Not broken. A light skin reads better outdoors, and it doesn't change layout. | Optional. [Runbook 5](tier-0-runbook.md#5-reconsider-the-skin) |
| 9 | **All three MFL phone apps are still listed** (MFL Modern, MFL Mobile, MFL Platinum). None show the Contracts tab. | One league message. [Runbook 6](tier-0-runbook.md#6-point-members-at-a-phone-app) |

## Coming up

| # | Finding | Action |
|---|---|---|
| 10 | **The post-deadline paste is still ahead.** Production has `beforeTradeDeadline = true`. Once the deadline passes, the commissioner clicks the button on the Commish tab, copies the console output and pastes it into `fuadUtil.html`. It now covers franchise players only, since rookie baselines are fixed by rule. | Do it the week the deadline passes, and commit the same change to the repo so the two stay matched. |

## Fixed — deployed 3 Oct 2026 ([PR #1](https://github.com/bborchardt/fuadmflsite/pull/1))

Each was verified on the live page in Chrome at phone and desktop width, with no JavaScript errors.

| # | Was | Now |
|---|---|---|
| 1 | **The injured-starter warning had never worked.** The injuries request went to the wrong MFL host and got an error back. | Loads from `api.myfantasyleague.com`: 464 records, 347 players flagged (was 0), 55 of them rostered. `IR-R`, `IR-PUP` and `IR-NFI` now count as injured too. No Week 3 starter was injured, so "No violations found" is now a real result. |
| 2 | **Kicker rookie salaries showed `$NaN`.** The baseline was the 15th-highest kicker salary, and only 14 kickers were rostered. | **Superseded by a new league rule.** First-pick baselines are fixed: QB $6, RB $10, WR $10, TE $4, PK $1, each later pick still 80% of the one before. The table now runs from $6/$10/$10/$4/$1 at pick 1 to $1 across the board at pick 15. |
| 3 | **The Contracts tab was broken on phones.** The sidebar was crushed into 134px with overlapping text. | Below MFL's 62.5em breakpoint the two columns stack, with the calculator and salary tables first. No table overflows. Desktop is unchanged. |
| 11 | **The repo had drifted from production:** 2022 season values and a stray debug line. | Reconciled. All five files in `src/` now match the live page line for line. |

## Background — no action owed

| # | Finding |
|---|---|
| 12 | **MFL's platform rules are unchanged.** Cross-origin reads are still blocked by a fixed CORS header, the page still sends no CSP, and the API terms still forbid off-site JavaScript and exempt in-page calls from rate limits. **The Tier 2 recommendation (thin loader in MFL, app on GitHub Pages) stands.** |
| 13 | **Data loading is slow in shape, not in size.** Eight requests run one after another: 0.75 s on home broadband (2.5 s from a datacenter in August). Run in parallel, about 0.25 s. Worth fixing in any rewrite, not urgent on its own. |
| 14 | **No JavaScript errors on any tab.** The four 2012-era libraries still load from cdnjs and still work. |
| — | **The Contracts tab is still long on a phone:** 15,226px, about 18 screens, because it lists every rostered player in the league. Fixing that is a content change (a "My Team" view first), not a bug fix. |

---

## Corrected since the August pass

Measuring the live page with our scripts running (instead of the stripped mirror the August pass used) overturned four claims:

- **"Move the Cap Penalty Calculator off the Main tab."** Wrong. It has always been on the Contracts tab. Step removed.
- **"The seven-column contract table overflows sideways on a phone."** Wrong. It squeezes to fit. The sidebar beside it was what broke (finding 3).
- **"Three custom tabs duplicate MFL's menu."** Two do. Transactions is misnamed, not a duplicate (finding 6).
- **"Contracts, Commish and Links can't be measured."** They can, by loading the live page in a real browser.

The August advice not to prune empty modules "until the season starts" has also expired. The season is four weeks old (finding 7).
