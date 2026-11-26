#!/usr/bin/env python3
"""Look for broken layout in v2's screens at the widths members' screens have, without asking MFL anything.

    uv run --no-project --with playwright python tools/verify/layout.py [--only scores,home] [--built | --ref REF]
        [--engine webkit|chromium|firefox] [--widths 320,phone,desktop] [--minimum] [--shots DIR]

Each screen loads as screens.py loads it (its saved pages, the clock fixed) in WebKit, which is what
iPhones draw with, or another --engine, at each of WIDTHS: phones from 320 (the first iPhone SE, and
iOS's page zoom on a wider one) to 440 (the largest iPhones), just past where v2's desktop layout starts, an iPhone
turned sideways in the home screen app (its notch padding added, as iOS gives it), an iPad
turned sideways or a small laptop, and a desktop.
Then it measures:

squeezed  text wrapped to under four characters a line ("Final" a letter a line)
offscreen something past the window's edge, not inside a box that scrolls
clipped   a box cutting off its own content, other than with an ellipsis
cut       a control (button, field, list) mostly past the edge of a box that scrolls sideways (under
          half of it, or under 24px, in view), so a member finds it only by scrolling there
overlap   two controls drawn over each other
offcentre in a row that centres its children on one line, a child's one line of text more than 2px
          from the row's middle (a box centred with its text not, from padding on one side)
stale     a height that's wrong after the window turns: the screen laid out at the other way round
          first, then turned, differs from the same page laid out afresh (Safari keeping rows' old heights)

--minimum draws with the stylesheet as a browser at the minimum (docs/design.md: Devices) reads it, the
newer CSS it marks taken out (tools/minimum-css.mjs), so a page that needs one of those extras shows up.

Only v2's parts are measured (the frame and its views, the message board's pages, which v2 restyles,
and a move's page fallen back to MFL's, which v2 fits): MFL's own pages are left as MFL draws them.
It sees what's drawn, not whether it looks good: a finding is worth a look, and the screenshot
(--shots) shows it. A screen whose moves are answered differently (screens.py's "moves") looks the
same as its plain screen until a move is made, so only the plain one is measured.
"""
import argparse
import subprocess
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
import screens  # noqa: E402

# name: (width, height, the size it's first laid out at for `stale`, as the app turned sideways)
WIDTHS = {
    # phones, upright: the first iPhone SE (the narrowest, and iOS's page zoom on a wider one), common
    # Androids, the iPhone 8 and SE, the newer iPhones, larger Androids, the largest iPhones (Pro Max)
    "320": (320, 568, (568, 320), False),
    "360": (360, 780, (780, 360), False),
    "375": (375, 667, (667, 375), False),
    "phone": (390, 844, (844, 390), False),
    "412": (412, 915, (915, 412), False),
    "440": (440, 956, (956, 440), False),
    "780": (780, 1000, (1000, 780), False),
    "860": (860, 1000, (1000, 860), False),
    "app-sideways": (874, 402, (402, 874), True),
    "1024": (1024, 768, (768, 1024), False),
    "desktop": (1280, 900, (900, 1280), False),
}
# the app's padding turned sideways (fuad.css .fuad-app): iOS's insets, which a desktop browser gives as 0;
# upright there are none
APP = """(() => { document.documentElement.classList.add('fuad-app');
    const style = document.createElement('style');
    style.textContent = '@media (orientation: landscape) { .fuad-app body { padding-left: 62px !important; padding-right: 62px !important; } }';
    document.head.append(style); })()"""
# a state a screen opens into, by the control that opens it
STATES = {
    "home": [("site menu", ".fuad-menu-button"), ("team sheet", ".fuad-team")],
    "scores": [("player popup", "#fuad-league [data-player]")],
    "rosters": [("player popup", "#fuad-rosters [data-player]")],
}

# v2's parts; on the message board's pages, which v2 restyles in place, and a move's page fallen back
# to MFL's, which v2 fits to the window, MFL's page body too
ROOTS = """[...document.querySelectorAll('#fuad-frame, [id^="fuad-"], :is(.fuad-board, .fuad-topic, .fuad-reply, .fuad-side) #withmenus'),
    ...(document.getElementById('fuad-fallback') ? document.querySelectorAll('#withmenus') : [])]
    .filter((el, i, all) => !all.some((other) => other !== el && other.contains(el)))"""

MEASURE = r"""() => {
    const roots = """ + ROOTS + r""";
    const shown = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !el.closest('[hidden], .fuad-hidden'); };
    const name = (el) => {
        const cls = [...el.classList].slice(0, 2).map((c) => '.' + c).join('');
        const text = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
        const root = el.closest('[id^="fuad-"]');
        return `${root && root !== el ? '#' + root.id + ' ' : ''}${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls}${text ? ` "${text}"` : ''}`;
    };
    const scrolls = (el) => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const o = getComputedStyle(a).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
    const found = [];
    const all = roots.flatMap((root) => [root, ...root.querySelectorAll('*')]).filter(shown);
    // squeezed: a text's lines, by their tops
    for (const root of roots) {
        const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let node = walk.nextNode(); node; node = walk.nextNode()) {
            const text = node.textContent.trim();
            if (text.length < 4 || !shown(node.parentElement)) continue;
            const range = document.createRange(); range.selectNodeContents(node);
            const tops = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
            if (tops.size >= 3 && text.length / tops.size < 4) found.push(['squeezed', name(node.parentElement)]);
        }
    }
    for (const el of all) {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        if (s.position !== 'fixed' && (r.right > innerWidth + 1 || r.left < -1) && !scrolls(el)
            && !(el.closest('.fuad-layer') && r.right <= 0)) found.push(['offscreen', name(el)]);
        if (el.matches('button, input:not([type=hidden]), select, textarea')) {
            for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
                const o = getComputedStyle(a).overflowX;
                if (o === 'auto' || o === 'scroll') {
                    const shownWidth = Math.min(r.right, a.getBoundingClientRect().right) - r.left;
                    if (r.right > a.getBoundingClientRect().right + 1 && (shownWidth < r.width / 2 || shownWidth < 24)) found.push(['cut', name(el)]);
                    break;
                }
            }
        }
        if ((s.overflowX === 'hidden' || s.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 2
            && s.textOverflow !== 'ellipsis' && el.clientWidth > 2) found.push(['clipped', name(el)]);
    }
    // a fixed or sticky bar, or a dialog, is there to cover the page: only controls in the same layer can clash
    const layer = (el) => { for (let a = el; a; a = a.parentElement) { const p = getComputedStyle(a).position;
        if (p === 'fixed' || p === 'sticky') return a; } return null; };
    const controls = all.filter((el) => el.matches('a[href], button, input:not([type=hidden]), select, textarea'));
    for (let i = 0; i < controls.length; i++) {
        for (let j = i + 1; j < controls.length; j++) {
            const a = controls[i], b = controls[j];
            if (a.contains(b) || b.contains(a) || layer(a) !== layer(b)) continue;
            // by each line's box: a link wrapped onto two lines spans both, the next link's line included
            const clash = [...a.getClientRects()].some((ra) => [...b.getClientRects()].some((rb) => {
                const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
                return w > 2 && h > 2 && w * h > 0.25 * Math.min(ra.width * ra.height, rb.width * rb.height);
            }));
            if (clash) found.push(['overlap', `${name(a)} / ${name(b)}`]);
        }
    }
    // offcentre: in a row that centres its children (flex or grid, align-items: center, all on one
    // line), a child whose text is one line, more than 2px from the row's middle: a box can sit centred with its text not
    // (padding on one side), which the eye sees against the row's other parts
    for (const row of all) {
        const s = getComputedStyle(row);
        if (s.alignItems !== 'center' || !(s.display.endsWith('grid') || (s.display.endsWith('flex') && !s.flexDirection.startsWith('column')))) continue;
        // one line of children (not wrapped, not a grid's several rows), each centred against it
        const kids = [...row.children].filter(shown).map((child) => child.getBoundingClientRect());
        if (kids.length < 2 || kids.some((k) => k.top >= kids[0].bottom || k.bottom <= kids[0].top)) continue;
        const r = row.getBoundingClientRect();
        const top = r.top + parseFloat(s.borderTopWidth) + parseFloat(s.paddingTop);
        const middle = (top + r.bottom - parseFloat(s.borderBottomWidth) - parseFloat(s.paddingBottom)) / 2;
        for (const child of row.children) {
            if (!shown(child) || !['auto', 'center', 'normal'].includes(getComputedStyle(child).alignSelf)) continue;
            const rects = [];
            const walk = document.createTreeWalker(child, NodeFilter.SHOW_TEXT);
            for (let node = walk.nextNode(); node; node = walk.nextNode()) {
                if (!node.textContent.trim() || !shown(node.parentElement)) continue;
                const range = document.createRange(); range.selectNodeContents(node);
                rects.push(...[...range.getClientRects()].filter((t) => t.width > 0 && t.height > 0));
            }
            if (!rects.length) continue;
            const lo = Math.min(...rects.map((t) => t.top)), hi = Math.max(...rects.map((t) => t.bottom));
            // one line: every text's box overlaps the first's
            if (rects.some((t) => t.top >= rects[0].bottom || t.bottom <= rects[0].top)) continue;
            const off = (lo + hi) / 2 - middle;
            if (Math.abs(off) > 2) found.push(['offcentre', `${name(child)} ${off > 0 ? 'down' : 'up'} ${Math.abs(off).toFixed(1)}px in ${name(row)}`]);
        }
    }
    // only a page that's wider than the window says so; its parts already have
    if (!found.some(([kind]) => kind === 'offscreen') && document.documentElement.scrollWidth > innerWidth + 1)
        found.push(['offscreen', `the page, ${document.documentElement.scrollWidth}px wide`]);
    return found;
}"""

# every shown element of v2's, by its place in the page: its height, its name, and where what's inside it ends
HEIGHTS = r"""() => { const out = {}; let i = 0;
    for (const root of """ + ROOTS + r""") for (const el of [root, ...root.querySelectorAll('*')]) {
        const r = el.getBoundingClientRect();
        if (r.height > 0) out[i] = [Math.round(r.height), el.tagName.toLowerCase() + [...el.classList].slice(0, 2).map((c) => '.' + c).join(''), i + el.querySelectorAll('*').length];
        i++; }
    return out; }"""

RELAYOUT = "() => { document.body.style.display = 'none'; document.body.getBoundingClientRect(); document.body.style.display = ''; }"


def load(browser, site, name, size, app):
    screens.WIDTHS["layout"] = size[0]
    context, page, mfl, errors = screens.open_screen(browser, site, name, "layout")
    page.set_viewport_size({"width": size[0], "height": size[1]})
    if app:
        page.evaluate(APP)
    screens.settle(page)
    page.wait_for_timeout(300)
    return context, page


# one browser and one copy of the site's files per worker, kept for all its jobs: each job gets new
# contexts, so nothing a page left carries over, and launching a browser per job cost about a second each
WORKER = {}


def start_worker(ref, engine):
    WORKER["engine"] = engine
    WORKER["site"] = screens.Site(ref)
    WORKER["playwright"] = sync_playwright().start()
    WORKER["browser"] = None


def worker_browser():
    """the worker's browser, launched on its first job (a browser that won't start fails each job, as
    a finding) and again if it has crashed"""
    if not (WORKER["browser"] and WORKER["browser"].is_connected()):
        WORKER["browser"] = launch(WORKER["playwright"], WORKER["engine"])
    return WORKER["browser"]


def measure(job):
    """one screen at one width, as findings; a screen that doesn't load is one"""
    try:
        return measure_screen(worker_browser(), WORKER["site"], *job, engine=WORKER["engine"])
    except Exception as error:
        return [(job[0], job[1], None, "failed", str(error).splitlines()[0])]
    finally:
        # a job that failed partway leaves its context open, which the next job mustn't share
        if WORKER["browser"] and WORKER["browser"].is_connected():
            for context in list(WORKER["browser"].contexts):
                try:
                    context.close()
                except Exception:
                    pass  # the browser gone since: the next job launches another


def launch(p, engine):
    """the engine, reaching nothing the route doesn't answer: Chromium's and Firefox's own preconnects too"""
    if engine == "chromium":
        return p.chromium.launch(args=["--host-resolver-rules=MAP * ~NOTFOUND"])
    if engine == "firefox":
        return p.firefox.launch(firefox_user_prefs={"network.http.speculative-parallel-limit": 0, "network.dns.disablePrefetch": True})
    return p.webkit.launch()


def measure_screen(browser, site, name, width, shots, engine="webkit"):
    w, h, first, app = WIDTHS[width]
    out = []
    for state, css in [(None, None)] + STATES.get(name, []):
        context, page = load(browser, site, name, (w, h), app)
        if css:
            try:
                page.locator(css).first.click(timeout=2000)
            except Exception as error:
                out.append((name, width, state, "missing", f"couldn't open it with {css}: {str(error).splitlines()[0]}"))
                context.close()
                continue
            screens.settle(page)
            page.wait_for_timeout(300)
        found = page.evaluate(MEASURE)
        out += [(name, width, state, kind, what) for kind, what in dict.fromkeys(map(tuple, found))]
        if shots and found:
            page.screenshot(path=str(Path(shots) / f"{name}-{width}-{engine}{'-' + state.replace(' ', '-') if state else ''}.png"), full_page=True)
        context.close()
    # turned: laid out the other way round first, then at this size, against the same page laid out afresh
    context, page = load(browser, site, name, first, app)
    page.set_viewport_size({"width": w, "height": h})
    # a view that redraws for the new width (Scores' lineups) has done so, so only layout differs
    screens.settle(page)
    page.wait_for_timeout(300)
    turned = page.evaluate(HEIGHTS)
    page.evaluate(RELAYOUT)
    fresh = page.evaluate(HEIGHTS)
    differ = sorted(int(i) for i in fresh if i in turned and abs(turned[i][0] - fresh[i][0]) > 2)
    # the first that differs with nothing inside it differing says where: its boxes around it differ with it
    inner = [i for i in differ if not any(i < j <= fresh[str(i)][2] for j in differ)]
    if inner:
        first = fresh[str(inner[0])]
        out.append((name, width, None, "stale", f"{first[1]} {turned[str(inner[0])][0]}px, afresh {first[0]}px ({len(differ)} heights in all)"))
    context.close()
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only")
    which = parser.add_mutually_exclusive_group()
    which.add_argument("--built", action="store_true", help="the working copy as Pages publishes it, bundled")
    which.add_argument("--ref", help="a git ref's site/ in place of the working copy")
    which.add_argument("--minimum", action="store_true",
                       help="the working copy built, its stylesheet as a browser at the minimum reads it (tools/minimum-css.mjs)")
    parser.add_argument("--shots", help="a folder for a full-page screenshot of each screen with a finding")
    parser.add_argument("--engine", choices=["webkit", "chromium", "firefox"], default="webkit")
    parser.add_argument("--widths", help=f"some of {', '.join(WIDTHS)} (default: all)")
    args = parser.parse_args()
    widths = args.widths.split(",") if args.widths else list(WIDTHS)
    if set(widths) - set(WIDTHS):
        parser.error(f"no such width: {', '.join(sorted(set(widths) - set(WIDTHS)))}")
    plain = [name for name, (url, swaps) in screens.SCREENS.items() if "moves" not in swaps]
    only = set(args.only.split(",")) if args.only else None
    if only and only - set(plain):
        parser.error(f"no such screen: {', '.join(sorted(only - set(plain)))} (screens: {', '.join(plain)})")
    if args.shots:
        Path(args.shots).mkdir(parents=True, exist_ok=True)
    ref = screens.build_working_copy() if args.built or args.minimum else args.ref
    if args.minimum:
        sheet = Path(ref[len(screens.BUILT):]) / "v2" / "fuad.css"
        with open(screens.REPO / "site" / "v2" / "fuad.css") as source, open(sheet, "w") as out:
            subprocess.run(["node", "tools/minimum-css.mjs"], cwd=screens.REPO, stdin=source, stdout=out, stderr=subprocess.DEVNULL, check=True)
    jobs = [(name, width, args.shots) for name in plain if not only or name in only for width in widths]
    findings = []
    with ProcessPoolExecutor(screens.WORKERS, initializer=start_worker, initargs=(ref, args.engine)) as pool:
        for out in pool.map(measure, jobs):
            findings += out
    # one line per finding, with every screen and width it's on
    where = {}
    for name, width, state, kind, what in findings:
        where.setdefault((kind, what), []).append(f"{name}{' (' + state + ')' if state else ''} {width}")
    for (kind, what), places in sorted(where.items()):
        print(f"{kind:9} {what}\n          on {', '.join(places)}")
    print(f"\n{len(jobs)} screens and widths in {args.engine}, {len(where)} findings")
    sys.exit(1 if where else 0)


if __name__ == "__main__":
    main()
