#!/usr/bin/env python3
"""Check a version of the league code against the live league site, in a real browser.

    uv run --no-project --with playwright python tools/verify/verify.py compare [--local v2]
    uv run --no-project --with playwright python tools/verify/verify.py phases  [--local v2]

compare  Renders the live league home page twice: as published, and with the version the
         header message loads replaced by files from this working copy (site/<local>/,
         default: the same version folder). Compares every area (League Alerts box, both
         Contracts views, calculator, rookie and franchise tables, Commish forms as guest and
         as commissioner, Links) and reports differences, JavaScript errors and load times.
         Before a release that should look the same, expect "no differences". For a version
         that changes the page on purpose, read the differences as a review list.

phases   Renders the working copy with the browser clock set to dates in each franchise
         salary phase (before week 1, live, after the deadline) plus a season whose NFL
         schedule isn't published, and prints the note and first QB row shown for each.

Needs uv (which fetches the playwright package for the run) and Google Chrome. Nothing
is changed on the live site: the browser fetches the real page and swaps files locally.
Commissioner views are simulated by setting MFL's franchise_id to "0000", not by logging in.
"""
import argparse
import datetime
import json
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parents[2]
LEAGUE_URL = "https://www44.myfantasyleague.com/{season}/home/{league}"
PAGES = "https://bborchardt.github.io/fuadmflsite/"
TYPES = {".js": "text/javascript", ".css": "text/css", ".json": "application/json"}

AREAS = """() => {
  const text = (el) => el ? el.textContent.replace(/\\s+/g, ' ').trim() : null;
  const tables = (root) => root ? [...root.querySelectorAll('table')] : [];
  const col1 = document.querySelector('#tabcontent0 #homepagecolumn1');
  const col2 = document.getElementById('contractscolumn2');
  const commish = document.getElementById('commishdiv');
  const links = document.getElementById('fuadlinksdiv');
  return {
    violations: text(tables(col1).find(t => /violations|league alerts/i.test(t.textContent))),
    players: text(document.getElementById('contractscolumn1')),
    calculator: text(tables(document.getElementById('tabcontent3')).find(t => /calculator/i.test(t.textContent))),
    rookie: text(tables(col2).find(t => /rookie/i.test(t.textContent))),
    franchise: tables(col2).filter(t => /top \\d+ \\w+ salaries/i.test(t.textContent)).map(text),
    commishForms: commish ? [...commish.querySelectorAll('form')].map(f => ({
        action: f.getAttribute('action'),
        fields: [...f.querySelectorAll('input')].map(i => [i.name, i.value, i.type])})) : [],
    commishText: text(commish),
    links: links ? [...links.querySelectorAll('a')].map(a => [a.textContent.trim(), a.href]) : null,
  };
}"""

READY = """() => {
  const c = document.getElementById('contractscolumn1');
  const m = document.getElementById('commishdiv');
  return c && c.textContent.length > 100 && m && !m.querySelector('.fuad-loading');
}"""


def header_version(html):
    match = re.search(r"fuadmflsite/(v\d+)/fuad\.js", html)
    if not match:
        sys.exit("The live page doesn't load the league code from GitHub Pages; nothing to compare.")
    return match.group(1)


def serve_local(local):
    """Route handler: answer requests for the header's version with files from site/<local>/."""
    def handle(route):
        url = route.request.url.split("?")[0]
        rel = url.split("/fuadmflsite/", 1)[1].split("/", 1)[1]
        path = REPO / "site" / local / rel
        if path.is_file():
            route.fulfill(status=200, body=path.read_bytes(), headers={
                "content-type": TYPES.get(path.suffix, "application/octet-stream"),
                "access-control-allow-origin": "*"})
        else:
            route.fulfill(status=404, body="not found", headers={"access-control-allow-origin": "*"})
    return handle


def open_page(browser, url, version, local, *, width=1440, grouped=False, commish=False, clock=None, no_schedule=False):
    context = browser.new_context(viewport={"width": width, "height": 900}, is_mobile=width < 500)
    init = ["try{localStorage.clear()}catch(e){}"]
    if grouped:
        init.append("try{localStorage.setItem('playersByContractYearChecked' + location.pathname.split('/')[1], 'true')}catch(e){}")
    if commish:
        init.append("window.franchise_id = '0000';")
    context.add_init_script(";".join(init))
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and "fuad" in m.text.lower() and errors.append(m.text))
    if clock:
        page.clock.set_fixed_time(clock)
    if local:
        page.route(f"{PAGES}{version}/**", serve_local(local))
    if no_schedule:
        page.route("https://api.myfantasyleague.com/**nflSchedule**", lambda route: route.fulfill(status=404, body="Not Found"))
    started = time.time()
    page.goto(url, wait_until="load", timeout=90000)
    page.wait_for_function(READY, timeout=90000)
    return context, page, errors, round(time.time() - started, 2)


def compare(args):
    url = LEAGUE_URL.format(season=args.season, league=args.league)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome")
        probe = browser.new_page()
        probe.goto(url, wait_until="domcontentloaded")
        version = header_version(probe.content())
        probe.close()
        local = args.local or version
        print(f"Comparing the published {version} with the working copy's site/{local}/ on {url}\n")
        differences = 0
        for grouped in (False, True):
            for commish in (False, True):
                label = f"Contracts {'grouped by year' if grouped else 'single list'}, {'commissioner' if commish else 'guest'}"
                ctx_a, page_a, errors_a, secs_a = open_page(browser, url, version, None, grouped=grouped, commish=commish)
                published = page_a.evaluate(AREAS)
                ctx_a.close()
                ctx_b, page_b, errors_b, secs_b = open_page(browser, url, version, local, grouped=grouped, commish=commish)
                working = page_b.evaluate(AREAS)
                ctx_b.close()
                changed = [area for area in published if published[area] != working[area]]
                differences += len(changed)
                print(f"{label}: {'no differences' if not changed else 'differs in ' + ', '.join(changed)}"
                      f" | errors {len(errors_a)}/{len(errors_b)} | {secs_a}s/{secs_b}s")
                for area in changed:
                    print(f"  {area}\n    published: {json.dumps(published[area])[:300]}\n    working:   {json.dumps(working[area])[:300]}")
                for error in errors_b:
                    print(f"  error in working copy: {error[:200]}")
        browser.close()
    sys.exit(1 if differences else 0)


def phases(args):
    url = LEAGUE_URL.format(season=args.season, league=args.league)
    season = int(args.season)
    cases = [
        ("before week 1", f"{season}-08-20T12:00:00+00:00", False),
        ("live", f"{season}-10-15T12:00:00+00:00", False),
        ("after the deadline", f"{season}-12-01T12:00:00+00:00", False),
        ("schedule not published", f"{season}-10-15T12:00:00+00:00", True),
    ]
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome")
        probe = browser.new_page()
        probe.goto(url, wait_until="domcontentloaded")
        version = header_version(probe.content())
        probe.close()
        local = args.local or version
        print(f"Franchise phases for site/{local}/ on {url}\n")
        for name, when, no_schedule in cases:
            clock = datetime.datetime.fromisoformat(when)
            context, page, errors, _ = open_page(browser, url, version, local, clock=clock, no_schedule=no_schedule)
            page.wait_for_selector(".fuad-note", state="attached", timeout=60000)
            note = page.locator(".fuad-note").text_content()
            first = page.evaluate("""() => {
                const t = [...document.querySelectorAll('#contractscolumn2 table')].find(x => /top \\d+ qb/i.test(x.textContent));
                return t && t.rows[1] ? t.rows[1].textContent.replace(/\\s+/g, ' ').trim() : null; }""")
            print(f"{name} ({when[:10]}): {note}\n  first QB: {first}" + (f"\n  errors: {errors}" if errors else ""))
            context.close()
        browser.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["compare", "phases"])
    parser.add_argument("--local", help="version folder in this working copy to test, e.g. v2 (default: the header's version)")
    parser.add_argument("--season", default=str(datetime.date.today().year), help="league season in the URL")
    parser.add_argument("--league", default="48571")
    args = parser.parse_args()
    {"compare": compare, "phases": phases}[args.command](args)


if __name__ == "__main__":
    main()
