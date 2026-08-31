# Tier 0 — settings, skin and apps

**League:** 48571 · **Live:** `https://www44.myfantasyleague.com/2026/home/48571`
**Prepared:** 30 Aug 2026 · Companion to `ux-modernization-options.md`

Tier 0 is the no-code tier: everything here is done in MFL's admin screens by
the commissioner. Nothing in this document requires a deploy, and nothing in it
can break the season.

This runbook exists because the options review recommended Tier 0 first but
described it in one paragraph. Measuring the live site changed the picture
enough to be worth writing down.

---

## What measuring changed

The options review said the mobile experience was broadly bad and the fix was
mostly ours. That was too pessimistic. Rendering every tab at 390px says
something narrower:

| Tab | Phone height | Horizontal overflow |
|---|---|---|
| Main | 1,036px | none |
| **Standings** | **1,998px** | **yes — Power Rankings, 514px into a 390px screen** |
| Transactions | 786px | none |
| Calendar | 913px | none |
| Contracts, Commish, Links | *not measurable — see below* | |
| Live Scoring | empty (preseason) | |

**Seven of the eight tabs are fine on a phone.** One is not. The whole mobile
complaint, on the MFL-native side, is the Standings tab — and specifically
MFL's own *Power Rankings* module, which has fourteen columns and cannot fit a
phone at any skin. That is a module you can remove or relocate in admin, which
makes it a Tier 0 fix rather than a code fix.

Two caveats, stated plainly:

- **Contracts, Commish and Links can't be measured this way.** Their content is
  drawn by our JavaScript, which the preview harness strips. They report ~765px,
  which is just the empty shell. The options review's concern about the
  seven-column contract table is untested here and remains a Tier 1/2 problem.
- Some modules look empty because it is 30 August and this was captured logged
  out. League Chat, Poll, Trade Bait and Live Scoring will populate in season.
  Don't prune a module for being empty today.

---

## Already done — don't spend time here

- **Mobile mode is on.** The page serves
  `<meta name="viewport" content="initial-scale=1.0, width=device-width">` and
  loads `skins17/BlueMesh/responsive.css`. *Desktop View On Mobile* is already
  set correctly.
- **The responsive skin works.** At 390px the main menu and tab bar collapse to
  hamburgers and the two home-page columns stack to full width. MFL's own CSS is
  doing its job.

The options review listed "check the mobile setting" as step one. It's done.
The easy win is already collected.

---

## The work, in order

### 1. Remove or relocate Power Rankings — *the one real mobile fix here*

**Where:** `csetup?L=48571&C=HMPGMOD` — Home Page Modules and Tabs Setup

Power Rankings carries Franchise, W-L-T, PF, PP, EFF, Bench Points, Max PF,
Min PF, Coulda Won, Woulda Lost, Power Rank, Alternate Power Rank, W, L, T, PCT.
At 390px the last four columns are simply off-screen with no scroll affordance —
members don't know they're missing.

Options, best first:

1. Move it to its own tab, so the Standings tab stays readable and anyone who
   wants the deep numbers opens a page that's expected to be wide.
2. Drop it. Nothing else links to it and the same information is in MFL's own
   reports.
3. Keep it and accept the clipping — only if the league actively uses it.

Re-measure afterwards with `tools/skin-preview` (`MFL_TAB=1`).

### 2. Fix the duplicated navigation

**Where:** `csetup?L=48571&C=HMPGMOD` — Home Page Modules and Tabs Setup

The page currently shows two rows of navigation. MFL's own row carries:

> Home · Rosters · Draft · Submit Lineup · Add/Drops · Trades · Player Stats ·
> **Standings** · **Transactions** · **Live Scoring** · Schedule

Our custom tab row carries:

> Main · **Standings** · **Transactions** · Contracts · Calendar · Commish ·
> Links · **Live Scoring**

Three of our eight tabs duplicate a destination MFL already provides one row
above. On a phone both rows collapse into two separate hamburgers, so a member
opens one, doesn't find what they want, and opens the other.

Proposal: drop the custom **Standings**, **Transactions** and **Live Scoring**
tabs and let MFL's native pages own those jobs. That leaves five tabs —
Main, Contracts, Calendar, Commish, Links — of which Contracts is the one that
actually justifies a custom tab.

This also removes the Power Rankings problem in step 1 for free, since that
module lives on the custom Standings tab.

Worth confirming first: open MFL's native Standings page on a phone and check
it reads better than the custom tab. If it doesn't, keep the tab and just do
step 1.

### 3. Move the Cap Penalty Calculator off the Main tab

**Where:** `csetup?L=48571&C=HMPGMSG` — Home Page Message Setup

The calculator currently sits in the right column of the Main tab. It's one of
ours, it's genuinely useful, and it is not something a member needs on first
paint — it answers "what would it cost to cut this guy", which is a question you
go looking for. The options review's principle was "common functions obvious,
advanced functions possible." This is an advanced function in the most prominent
slot on the site.

Move it to the Contracts tab, next to the contract data it operates on.

### 4. Reconsider the skin

**Where:** `csetup?L=48571&C=SKIN` — Select A Skin

The league is on **BlueMesh** (from MFL's 2017 skin set) — dark navy ground,
blue module headers, white text. It is not broken and it is not ugly. Its
weaknesses on a phone are contrast in daylight and fairly dense table rows.

For comparison I rendered the same page under two alternates:

| Skin | Character | Phone height, Main tab |
|---|---|---|
| BlueMesh (current) | dark navy, blue headers | 1,036px |
| AllAmerican | white ground, dark red headers, navy nav | 1,040px |
| AquaGreen | light, green headers | 1,026px |

A light skin is markedly easier to read on a phone outdoors. Nothing else
changes: **the skin does not affect the overflow at all** — Power Rankings
measured 514px, 525px and 514px under the three skins respectively. Choose a
skin for legibility, not expecting it to fix layout.

Preview any skin against the real page before committing to it:

```
cd tools/skin-preview && node preview.js AllAmerican AquaGreen
```

MFL's picker only shows a generic thumbnail; this shows your page. The full
skin list is only visible inside Appearance Setup — the names aren't
discoverable from outside — so take the names from that screen and pass them in
(spaces removed: "All American" → `AllAmerican`).

### 5. Point the league at a phone app for lineups

All three are still published:

- **MFL Modern** — newest, free for one team, logs in with existing MFL credentials
- **MFL Mobile** — long-standing
- **MFL Platinum** — long-standing

Rosters, lineups and live scoring are the most common member jobs and are
entirely MFL-native, so an app does them well with no work from us. Say so in a
league message once, before Week 1.

The limit to be honest about: apps generally don't render custom home page
modules, so members living in an app **won't see the Contracts tab at all**.
That's the argument for not letting Tier 0 be the whole answer.

---

## What Tier 0 will not fix

Worth being clear so expectations match:

- The **contract tables** — seven columns, drawn by our code. Untouched by any
  setting or skin. That's Tier 1/2.
- The **injuries bug** (see the options review, §3) — a one-line code fix,
  unrelated to any of this, and worth doing on its own.
- The **eight sequential data requests** on the Contracts tab.
- The **annual code edits** for `year`, `beforeDraft` and the post-deadline block.

---

## Checklist

- [ ] Decide Power Rankings: own tab, remove, or keep
- [ ] Check MFL's native Standings on a phone, then drop the duplicate custom tabs
      (Standings, Transactions, Live Scoring)
- [ ] Move the Cap Penalty Calculator to the Contracts tab
- [ ] Preview two or three skins against the real page; switch or keep deliberately
- [ ] Post one league message recommending a phone app
- [ ] Re-run `MFL_TAB=all node preview.js` and confirm no tab overflows

---

## Admin screens referenced

All under `https://www44.myfantasyleague.com/2026/`, commissioner login required.
Taken from MFL's own help centre rather than reconstructed from menu paths.

| Screen | URL |
|---|---|
| Home Page Modules and Tabs Setup | `csetup?L=48571&C=HMPGMOD` |
| Home Page Message Setup | `csetup?L=48571&C=HMPGMSG` |
| Select A Skin | `csetup?L=48571&C=SKIN` |
| Images & Other URLs Setup *(custom CSS upload)* | `csetup?L=48571&C=IMAGES` |

Source: [MFL Help Centre — Site Appearance](https://www44.myfantasyleague.com/2026/support?CATEGORY=Appearance%20%26%20Customization&SUBCATEGORY=Site%20Appearance).
That page is also the primary source for the CSS-upload path: *"define your own CSS and
upload using the Images & Other URLs Setup screen, or select from one of our predefined
skins with the Select A Skin screen."*

---

## Method

Figures come from `tools/skin-preview`, which mirrors the live home page,
swaps in a skin's stylesheets, and screenshots at 390×844 and 1440×900.

One correction worth recording, because it nearly became a false finding: an
early version of the harness stripped all scripts, including the inline
`show_tab(0)` call that hides every tab but the first. That made the page render
all eight tabs stacked and report ~4,050px on a phone — which looked like a
damning result and was entirely an artifact of the harness. The tool now
re-implements the tab initialisation, and the real figure is 1,036px. The
per-tab table above is from the corrected version.

Everything was captured logged out, so member-only and commissioner-only views
may differ.
