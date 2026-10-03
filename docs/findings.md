# Findings at a glance

**League:** 48571 · **As of:** 3 Oct 2026, Week 4
**Full plan:** [`ux-modernization-options.md`](ux-modernization-options.md)

Each line is the whole point. Follow a link only if you want the reasoning.

---

## What's wrong

| # | Problem | Fixed by |
|---|---|---|
| 1 | **The Contracts tab is a reference document, not a tool:** about 18 phone screens listing every rostered player in the league. | **A** ("My Team" Contracts) |
| 2 | **The site looks dated**, and none of MFL's stock skins fix it. | **C** (league-wide look) |
| 3 | **Three navigation rows on desktop.** Phones show one swipeable nav row. | **C** |
| 4 | **Every release is pasted into five places**, and the repo drifts whenever one is missed. | **v1** (versioned code on GitHub Pages) |
| 5 | **Commissioner chores are manual:** contract years, cap penalties, over-cap watching, the post-deadline paste. | **v1** (franchise snapshot), **Chores** version (the rest) |
| 6 | **2012-era code underneath:** four old libraries, eight requests in a row, nothing checked. | **v1** (engine rebuild) |

## Decided

- **Delivery:** the MFL header points at a versioned file on GitHub Pages (`…/fuadmflsite/v1/fuad.js`).
  - New versions start dark.
  - Activating and reverting are one-line header edits.
  - Each season's site pins its own version.
- **Franchise salaries switch automatically:**
  - last season's snapshot until the week 1 kickoff
  - a live projection until the week 12 trade deadline
  - this season's snapshot after it
- **A daily GitHub job** logs in as commissioner. It takes the franchise snapshot, keeps a chore log on its own branch, and keeps itself alive.
- **League logic is written once**, shared by the page and the job.

## What ships when

| Version | Contents | Members see |
|---|---|---|
| **v1** | Delivery, engine rebuild, automatic franchise salaries, the daily job | No change |
| **A** | "My Team" Contracts, cards on phones | A new Contracts tab, previewed first |
| **C** | Our own league-wide stylesheet, calmer desktop navigation | A new look, previewed first |
| **Chores** | Cap penalties, contract years from bid messages, over-cap flags, a Commish chores queue | Fewer manual fixes |

**v1 effort:** about 2–3 days, live well before this season's trade deadline (Wed 25 Nov 2026, 7:00 pm Central).

## Ruled out

- **A separate companion site:** a second destination, and it can't tell who's viewing.
- **A proxy for MFL's API:** against MFL's terms.
- **Leaving MFL:** would give up the custom rules.
- **A public league-history site:** optional, after A and C.

## Ground rules

- Works well in a **phone browser**.
- **No new navigation layer**; the **custom tabs stay**.
- Within **MFL's rules**.
- As few **chores to remember** as possible.
