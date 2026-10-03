# Tier 0 — settings, skin and apps

**League:** 48571 · **Live:** `https://www44.myfantasyleague.com/2026/home/48571`
**Prepared:** 30 Aug 2026 · **Re-verified:** 3 Oct 2026, Week 4 ·
**Updated:** 3 Oct 2026, after PR #1 was deployed · Companion to
[`findings.md`](findings.md) and [`ux-modernization-options.md`](ux-modernization-options.md)

Tier 0 is the no-code tier: everything here is done in MFL's admin screens by
the commissioner. Nothing in this document requires a deploy.

---

## At a glance

| Step | Change | Why | Where |
|---|---|---|---|
| 1 | Move or remove Power Rankings | Standings tab cuts off columns on phones | Home Page Modules and Tabs |
| 2 | Drop the Standings and Live Scoring tabs | They duplicate MFL's own menu | Home Page Modules and Tabs |
| 3 | Rename the Transactions tab | It holds Trade Bait and free agents, not transactions | Home Page Modules and Tabs |
| 4 | Remove League Chat, Poll and Trade Bait | Still empty after four weeks | Home Page Modules and Tabs |
| 5 | Reconsider the skin | Optional; legibility only | Select A Skin |
| 6 | Post one message recommending a phone app | Lineups on phones | League message |

None of these have been done yet. As of 3 Oct the page still has eight tabs,
Power Rankings, and the BlueMesh skin.

**Done:** the earlier first step, a CSS rule that stacks the Contracts tab's two
columns on phones, shipped with the code fixes in
[PR #1](https://github.com/bborchardt/fuadmflsite/pull/1) and is live. It is now
part of `src/fuadContract.hbs`, so there is nothing to paste.

---

## How the tabs measure on a phone

Measured by loading the live page in Chrome at 390×844, with our scripts
running, on 3 Oct 2026:

| Tab | What's on it | Phone height | Cut off on the right |
|---|---|---|---|
| Main | rule violations, trades, message board, transactions, poll, chat, owner activity | 1,809px | none |
| **Standings** | standings, Power Rankings, next week's schedule | 2,312px | **Power Rankings to 588px, League Standings to 415px** |
| Transactions | Trade Bait, Top 10 Free Agents, Starter Points chart | 990px | none |
| Contracts | every rostered player; calculator and salary tables above it on phones | 15,226px | none since the 3 Oct fix (was: sidebar crushed to 134px) |
| Calendar | weekly and monthly calendar | 1,632px | none |
| Commish | commissioner forms (empty when logged out) | 35px | none |
| Links | league links | 244px | none |
| Live Scoring | one scores summary | 330px | none |

The page never scrolls sideways (`scrollWidth` stays at 390). Anything past the
right edge is invisible, and a member has no hint that columns are missing.

Already done, no work owed: the page serves a proper viewport meta and loads
`skins17/BlueMesh/responsive.css`, so MFL's own menus collapse and its two home
page columns stack.

---

## The work, in order

### 1. Move or remove Power Rankings

**Where:** `csetup?L=48571&C=HMPGMOD` — Home Page Modules and Tabs Setup

Power Rankings has sixteen columns: Franchise, W-L-T, PF, PP, Eff, Bench
Points, Max PF, Min PF, Coulda Won, Woulda Lost, Power Rank, Alternate Power
Rank, W, L, T, Pct. With real stats in it, it now runs **588px** into a 390px
screen. It was 514px preseason. The right third is simply gone on a phone.

Options, best first:

1. Move it to its own tab, so anyone who wants the deep numbers opens a page
   that's expected to be wide.
2. Drop it. MFL's menu already links Power Rank (`options?L=48571&O=101`).
3. Keep it and accept the clipping, only if the league actively uses it.

League Standings also clips, by 25px (the last column, Avg PA). The team logos
make its rows tall. That is MFL's module, so leave it unless step 2 removes the
tab anyway.

### 2. Drop the two duplicate tabs

**Where:** `csetup?L=48571&C=HMPGMOD`

MFL's own navigation row already carries **Standings** and **Live Scoring**,
and so does our custom tab row. On a phone both rows collapse into separate
hamburger menus, so a member can open the wrong one first.

Drop the custom **Standings** and **Live Scoring** tabs. The Live Scoring tab
holds a single score summary, and MFL's page (`ajax_ls?L=48571`) is the real
thing. If you do this, step 1 resolves itself, since Power Rankings lives on the
Standings tab.

Check MFL's native Standings page on a phone first. If it reads worse than the
custom tab, keep the tab and just do step 1.

### 3. Rename the Transactions tab

**Where:** `csetup?L=48571&C=HMPGMOD`

The August runbook said this tab duplicated MFL's Transactions page. It doesn't.
It holds **Trade Bait, Top 10 Free Agents and the Starter Points chart**. The
league's transactions list is on Main. The tab is only misnamed.

Rename it to something that says what's there, such as **Players** or **Free
Agents**. Keep it.

### 4. Remove the unused modules

**Where:** `csetup?L=48571&C=HMPGMOD`

In August these were empty because it was preseason, and the runbook said to
wait. Four weeks into the season:

- **League Chat:** "No Chat Messages To Display".
- **League Poll:** "No Current League Polls".
- **Trade Bait:** "No franchises have entered Trade Bait yet".

The message board is active over the same period, with seven topics since 6 Sep.
So the league has a place to talk and doesn't use these. Removing League Chat
and Poll shortens Main on a phone. Removing Trade Bait leaves the renamed tab
from step 3 with free agents and the chart.

### 5. Reconsider the skin

**Where:** `csetup?L=48571&C=SKIN` — Select A Skin

Still **BlueMesh** (dark navy, blue headers). It isn't broken. A light skin
reads better on a phone outdoors. The skin doesn't affect layout: Power Rankings
measured 514, 525 and 514px under BlueMesh, AllAmerican and AquaGreen in August.
Choose for legibility only.

Preview skins against the real page before switching:

```
cd tools/skin-preview && node preview.js AllAmerican AquaGreen
```

### 6. Point members at a phone app

All three are still listed on the App Store (checked 3 Oct):

- **MFL Modern:** newest, free for one team, uses existing MFL logins
- **MFL Mobile**
- **MFL Platinum**

Rosters, lineups and live scoring are the most common member jobs and are all
MFL-native, so an app handles them well. Say so in one league message.

Apps don't render custom home page modules, so members who live in an app
**won't see the Contracts tab at all**. That's why Tier 0 can't be the whole
answer.

---

## What Tier 0 will not fix

- **The length of the Contracts tab.** 13,800px of roster on a phone. Needs a
  "My Team" view.
- **The eight sequential data requests.**
- **The annual code edits** for `year`, `beforeDraft` and the post-deadline
  block. The post-deadline one is due this season.

The injured-starter warning and the kicker `$NaN` were code bugs outside Tier 0.
Both were fixed in PR #1.

---

## Checklist

- [ ] Check MFL's native Standings page on a phone
- [ ] Drop the custom Standings and Live Scoring tabs, or move Power Rankings
- [ ] Rename the Transactions tab
- [ ] Remove League Chat, Poll and Trade Bait
- [ ] Preview two or three skins; switch or keep deliberately
- [ ] Post one league message recommending a phone app

---

## Admin screens referenced

All under `https://www44.myfantasyleague.com/2026/`, commissioner login required.
Taken from MFL's own help centre rather than reconstructed from menu paths.

| Screen | URL |
|---|---|
| Home Page Modules and Tabs Setup | `csetup?L=48571&C=HMPGMOD` |
| Home Page Message Setup *(where our code lives)* | `csetup?L=48571&C=HMPGMSG` |
| Select A Skin | `csetup?L=48571&C=SKIN` |
| Images & Other URLs Setup *(custom CSS upload)* | `csetup?L=48571&C=IMAGES` |

Source: [MFL Help Centre — Site Appearance](https://www44.myfantasyleague.com/2026/support?CATEGORY=Appearance%20%26%20Customization&SUBCATEGORY=Site%20Appearance).

---

## Method

**3 Oct pass.** The live page was loaded directly in Chrome (via Playwright) at
390×844 and 1440×900, logged out. Because it ran on MFL's own origin, our
scripts ran too, so the Contracts, Commish and Links tabs were measured for the
first time. Each tab was shown with MFL's own `show_tab()`, and every table
whose right edge passed the viewport was recorded. The Contracts CSS fix was
tested by injecting it into the same live page, then re-checked on the live page
after PR #1 was deployed.

**30 Aug pass.** `tools/skin-preview` mirrors the page locally and swaps the
skin stylesheet. It strips scripts, so it can only measure MFL-native tabs. That
limitation caused two wrong conclusions in the first runbook: it placed the Cap
Penalty Calculator on Main (it is on Contracts) and assumed the contract table
overflowed sideways (it squeezes; the sidebar was what broke). Use it to compare
skins, not to judge our own tabs.

Logged-out caveat: the Commish tab and franchise-specific views were not seen
as a member or commissioner would see them.
