# Findings at a glance

**League:** 48571 · **As of:** 3 Oct 2026, Week 4
**Full analysis:** [`ux-modernization-options.md`](ux-modernization-options.md)

Each line is the whole point. Follow a link only if you want the reasoning.

---

## What's still wrong

| # | Problem | Fix | Details |
|---|---|---|---|
| 1 | **The Contracts tab is a reference document, not a tool.** About 18 phone screens listing every rostered player in the league, so members dig for their own cap space. | **A:** rebuild around "My Team" (cap space, roster count, expiring contracts, cut costs), with cards on phones. | [§3A](ux-modernization-options.md#a-contracts-rebuilt-around-my-team) |
| 2 | **The site looks dated**, and none of MFL's stock skins fix it. | **C:** our own league-wide stylesheet in the shared header, which already reaches every page. | [§3C](ux-modernization-options.md#c-a-league-wide-look) |
| 3 | **Three navigation rows on desktop.** Phones are workable since PR #3; desktop is still cluttered. MFL's two rows can't be removed. | **C:** restyle the rows so MFL's dropdown recedes and our tabs read as the league's own section. | [§3C](ux-modernization-options.md#c-a-league-wide-look) |
| 4 | **Every release is pasted into five places**, and the repo drifts whenever one is missed. | **Tier 2:** load the code from GitHub Pages; deploy with `git push`. | [§4](ux-modernization-options.md#tier-2--load-from-github-pages--recommended) |
| 5 | **A yearly code ritual:** `year`, `beforeDraft`, and the post-deadline console paste. | **B:** derive the season from the URL; replace the paste with a committed snapshot. | [§3B](ux-modernization-options.md#b-engine-cleanup) |
| 6 | **2012-era code underneath:** four old libraries, eight sequential requests, nothing checked. | **B:** plain modern JavaScript, parallel requests, and visible errors. | [§3B](ux-modernization-options.md#b-engine-cleanup) |

## Recommended path

1. **Tier 2 setup**, ½ day: serve today's code from GitHub Pages, unchanged. Members see no difference.
2. **A, "My Team" Contracts**, 2–3 days.
3. **B, engine cleanup**, about 1 day more.
4. **C, league-wide look**, 2–4 days.
5. **Post-deadline snapshot** as a committed file. If Tier 2 isn't live by this season's deadline, do the console paste once more.

## Ruled out

- **A separate companion site (Tier 3)** would be a second destination, a new navigation layer, and it can't tell who's viewing.
- **A proxy (Tier 4)** goes against MFL's API terms.
- **Leaving MFL (Tier 6)** would lose the custom rules MFL's openness allows. Not recommended.
- **A public league-history site (Tier 5)** is optional, and only after A–C.

## Ground rules from your decisions

- The site must work well in a **phone browser**.
- **No new navigation layer.** Everything lives inside a tab.
- The **custom tabs stay** as members know them.
- Stay within **MFL's rules**, and keep upkeep modest.

## Coming up

- **The post-deadline paste** for this season. Production still has `beforeTradeDeadline = true`.
