# Skin & layout preview

Renders the league home page at phone and desktop widths, under any MFL skin,
without touching the live site. MFL's own skin picker shows thumbnails of a
generic page; this shows *your* page, with *your* modules, at the width your
members actually use.

## Setup

```
npm install        # PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 if Chromium already exists
node preview.js    # current skin, Main tab, phone + desktop
```

If Node's fetch doesn't pick up a proxy in your environment, prefix with
`NODE_USE_ENV_PROXY=1`.

Set `CHROME_PATH` if Chromium isn't in one of the default locations.

## Usage

```
node preview.js                          # whatever skin the league uses now
node preview.js AllAmerican AquaGreen    # compare candidate skins
MFL_TAB=1 node preview.js                # render the Standings tab
MFL_TAB=all node preview.js              # walk all eight tabs
```

Skin names are the names from *For Commissioners → Setup → Appearance Setup →
Select a Skin*, with spaces removed: "All American" → `AllAmerican`. A name
that doesn't exist is reported and skipped.

Screenshots land in `out/`. Each run prints page height and flags any table
wider than the viewport — that's a horizontal-scroll bug.

```
BlueMesh     tab1 Standings     phone     390px  page= 1998px  OVERFLOWS power_rank:514px
```

Override the league with `MFL_LEAGUE`, `MFL_YEAR`, `MFL_HOST`.

## What it does and doesn't tell you

It fetches the live home page, rewrites the three skin stylesheets to local
copies, strips the page's scripts, and screenshots the result.

Because the scripts are stripped, it re-implements one thing by hand: MFL runs
`show_tab(0)` on load to hide every tab but the first. Without that the page
renders all eight tabs stacked and looks four times longer than it is. The
harness restores it, so heights and overflow figures are honest.

The flip side: **tabs whose content is drawn by our own JavaScript render
empty** — Contracts, Commish and Links. A height around 765px for those is the
empty shell, not a real measurement. Use it for MFL-native tabs (Main,
Standings, Transactions, Calendar) and for judging skins, which is what it's
for. To see the contract tables at a phone width, use a real browser's device
emulation against the live site.
