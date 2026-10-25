#!/usr/bin/env python3
"""How a v2 screen loads on a slow phone connection, from the saved pages, without asking MFL anything.

    uv run --no-project --with playwright python tools/verify/speed.py [--screens lineup,home] [--net slow]
        [--path beta,direct] [--cache cold,stale] [--ref master] [--film DIR]

Each request is answered from tools/verify/screens/ (as screens.py does) after the delay a phone
connection would add: a round trip per request, a connection setup per host, and the response's
gzipped size through one shared link. MFL's page arrives whole, so its progressive drawing isn't
modeled.

--path   beta: the header loads v1, which hands the page to v2 (a beta member today); direct: the
         header loads v2 itself
--cache  cold: nothing cached; stale: cached more than GitHub Pages' 10 minutes, so every site file is
         asked again and answered unchanged (a round trip, no body)
--film   saves a screenshot every second there

Per run: when the page first shows anything, how long MFL's own content shows (the flash v2 should
hide), when v2's screen is drawn, and the requests and bytes it took.
"""
import argparse
import asyncio
import gzip
import json
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from screens import HOST, INIT, NOW, SCREENS, Mfl, Site  # noqa: E402

# round trip (s), connection setup in round trips (DNS, TCP, TLS), link (bytes/s)
NETS = {
    "edge": (0.8, 3, 25_000),
    "slow": (0.4, 3, 50_000),
    "3g": (0.3, 3, 200_000),
    "fast": (0.03, 3, 2_000_000),
}

# what the page shows, sampled every 50 ms: hidden by the cover, MFL's own content in the page body,
# v2's screen (its mount, or the page body's v2 parts)
PROBE = """
(() => {
  const log = [];
  window.__speed = log;
  const shown = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none'; };
  const tick = () => {
    const html = document.documentElement;
    const body = document.body;
    const body_ = body ? getComputedStyle(body).visibility !== 'hidden' : false;
    const pb = document.querySelector('.pagebody');
    const kids = pb ? [...pb.children] : [];
    const mfl = body_ && kids.some((el) => !/^fuad/.test(el.id) && !el.classList.contains('fuad-layer') && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE' && shown(el));
    const ours = body_ && kids.some((el) => /^fuad/.test(el.id) && shown(el) && el.textContent.trim().length > 40);
    const s = (body_ ? 'v' : '-') + (mfl ? 'M' : '-') + (ours ? 'O' : '-');
    if (!log.length || log[log.length - 1][1] !== s) log.push([performance.now(), s]);
  };
  setInterval(tick, 50);
  document.addEventListener('readystatechange', tick);
})();
"""


class Link:
    """One shared pipe: responses queue for it after their round trip"""

    def __init__(self, net):
        self.rtt, self.setup, self.rate = NETS[net]
        self.free_at = 0.0
        self.hosts = set()
        self.requests = 0
        self.bytes = 0

    async def deliver(self, host, size):
        self.requests += 1
        self.bytes += size
        wait = self.rtt
        if host not in self.hosts:
            self.hosts.add(host)
            wait += self.setup * self.rtt
        await asyncio.sleep(wait)
        now = time.monotonic()
        start = max(now, self.free_at)
        self.free_at = start + size / self.rate
        await asyncio.sleep(self.free_at - now)


class Captured:
    """stands in for a route, so screens.Mfl decides the answer and we deliver it late"""

    def __init__(self, request):
        self.request = request
        self.answer = None

    def fulfill(self, **kwargs):
        self.answer = ("fulfill", kwargs)

    def abort(self):
        self.answer = ("abort", {})


def header_v1(html):
    """the clone's header loads v2; a member's loads v1"""
    return html.replace("fuadmflsite/v2/fuad.", "fuadmflsite/v1/fuad.")


async def run(browser, site, name, net, path, cache, film):
    url, swaps = SCREENS[name]
    mfl = Mfl(site, swaps)
    link = Link(net)
    context = await browser.new_context(viewport={"width": 390, "height": 844}, timezone_id="America/Los_Angeles")
    await context.clock.set_fixed_time(swaps.get("now", NOW))
    await context.add_init_script(INIT)
    await context.add_init_script(PROBE)
    if path == "beta":
        await context.add_init_script("try { localStorage.setItem('fuad.beta', 'v2'); } catch (e) {}")

    async def handle(route):
        request = route.request
        host = urlparse(request.url).netloc
        captured = Captured(request)
        mfl.handle(captured)
        kind, args = captured.answer
        if kind == "abort":
            return await route.abort()
        body = args.get("body", "")
        body = body.encode() if isinstance(body, str) else body
        if path == "beta" and request.resource_type == "document":
            body = header_v1(body.decode()).encode()
            args = {**args, "body": body}
        site_file = host == "bborchardt.github.io"
        size = 0 if (cache == "stale" and site_file) else len(gzip.compress(body)) if body else 0
        await link.deliver(host, size + 300)
        await route.fulfill(**args)

    await context.route("**/*", handle)
    page = await context.new_page()
    errors = []
    # MFL's chart script isn't among the saved pages
    page.on("pageerror", lambda error: "FusionCharts" not in str(error) and errors.append(str(error)))
    t0 = time.monotonic()
    nav = asyncio.create_task(page.goto(HOST + url, wait_until="commit", timeout=120_000))
    shots = 0
    if film:
        film.mkdir(parents=True, exist_ok=True)
    # until v2's screen has been drawn and nothing changed for 2 s, at most 60 s
    last_change, last = time.monotonic(), None
    while time.monotonic() - t0 < 60:
        await asyncio.sleep(0.25)
        try:
            log = await page.evaluate("() => window.__speed || []")
        except Exception:
            continue
        if film and time.monotonic() - t0 >= shots:
            try:
                await page.screenshot(path=str(film / f"{name}-{path}-{net}-{cache}-{shots:02d}s.png"))
            except Exception:
                pass
            shots += 1
        if log != last:
            last, last_change = log, time.monotonic()
        if log and log[-1][1].endswith("O") and time.monotonic() - last_change > 2:
            break
    await nav
    await context.close()
    return summarize(log or [], link, errors)


def summarize(log, link, errors):
    t = lambda ms: f"{ms / 1000:5.1f}s"
    first = next((ms for ms, s in log if s[0] == "v"), None)
    ours = next((ms for ms, s in log if s.endswith("O")), None)
    flash = 0.0
    for i, (ms, s) in enumerate(log):
        if "M" in s:
            end = log[i + 1][0] if i + 1 < len(log) else ms
            flash += end - ms
    return {
        "shows": t(first) if first is not None else "  never",
        "mfl flash": t(flash),
        "drawn": t(ours) if ours is not None else "  never",
        "requests": link.requests,
        "kB": round(link.bytes / 1000),
        "timeline": " ".join(f"{ms / 1000:.1f}:{s}" for ms, s in log),
        "errors": errors,
    }


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--screens", default="lineup,home")
    parser.add_argument("--net", default="slow")
    parser.add_argument("--path", default="beta,direct")
    parser.add_argument("--cache", default="cold,stale")
    parser.add_argument("--ref", default=None, help="a git ref instead of the working copy")
    parser.add_argument("--film", type=Path, default=None)
    parser.add_argument("--timeline", action="store_true")
    args = parser.parse_args()
    site = Site(args.ref)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--host-resolver-rules=MAP * ~NOTFOUND"])
        print(f"{'screen':8} {'path':6} {'net':5} {'cache':5}  shows  mfl flash  drawn  requests   kB")
        for name in args.screens.split(","):
            for net in args.net.split(","):
                for path in args.path.split(","):
                    for cache in args.cache.split(","):
                        r = await run(browser, site, name, net, path, cache, args.film)
                        print(f"{name:8} {path:6} {net:5} {cache:5}  {r['shows']}  {r['mfl flash']}    {r['drawn']}  {r['requests']:8} {r['kB']:4}")
                        if args.timeline:
                            print("   ", r["timeline"])
                        for error in r["errors"]:
                            print("    error:", error)
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
