#!/usr/bin/env python3
"""Check that a change to v2 doesn't ask MFL for more, without asking MFL anything.

    uv run --no-project --with playwright python tools/verify/requests.py [--base master] [--built]

MFL throttles by machine and doesn't say how much, so each request v2 adds costs every member. In one
browser, as a member moves through the site, each of v2's views is opened in turn, first with nothing
stored and then again (what v2 keeps in the browser answering instead), on --base (a git ref) and on
the working copy. What each step asks MFL for (exports, feeds and pages; not MFL's own scripts,
styles or images, the page the member opened, nor MFL's page polling its chat and visitors) is
counted, and a step that asks for more, or for something it didn't, fails the run. v2's reads
(fetch, as MFL's own page reads with XMLHttpRequest) go to MFL and the site's Pages and nowhere
else, but for GitHub's list of the daily job's runs on the commissioner's pages, which the saved
pages are (they have MFL's Become Commissioner link); a member's Home, without the link, asks
nothing outside. Either failing fails the run, --more-intended or not. The clock is
fixed, so the returning visit is one moments later: what v2 keeps answers it, however long it keeps
it. MFL's answers are screens.py's saved clone samples. --more-intended lists the same and passes: a
pull request labelled "more requests" (.github/workflows/browser-checks.yml), whose description says
why each is needed.
"""
import argparse
import importlib.util
import sys
import time
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("screens_harness", HERE / "screens.py")
harness = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(harness)

L = harness.LEAGUE
# a member's way through the site: a page, or a view of the page before it
STEPS = [
    ("Home", f"/2026/home/{L}#home-page"),
    ("League › Scores", "#league-scores"),
    ("League › Standings", "#league-standings"),
    ("League › Power", "#league-power"),
    ("League › Winners", "#league-winners"),
    ("Rosters › My team", "#rosters-my-team"),
    ("Rosters › Teams", "#rosters-teams"),
    ("Rosters › Players", "#rosters-players"),
    ("Rosters › Draft", "#rosters-draft"),
    ("Lineup", f"/2026/lineup?L={L}"),
    ("Moves › Add", f"/2026/add_drop?L={L}"),
    ("Moves › Drop", f"/2026/options?L={L}&O=257"),
    ("Moves › IR", f"/2026/options?L={L}&O=18"),
    ("Moves › Trades", f"/2026/options?L={L}&O=05"),
]
VISITS = ["first visit", "returning visit"]
# what MFL's own page polls, with XMLHttpRequest, every few seconds; v2 reads these with fetch
MFL_POLLS = ("_chat.xml", "_visitors.xml")
PAGES_HOST = "bborchardt.github.io"
# the one outside read v2 makes, only on the commissioner's pages (REVIEW.md: Accepted decisions)
COMMISH_ONLY = "api.github.com/repos/bborchardt/fuadmflsite/actions/workflows/daily.yml/runs"
# a member's pages: MFL's Become Commissioner link taken out as MFL's page draws it
MEMBER = """new MutationObserver(() => document.querySelectorAll('a[href*="BECOME=0000"]').forEach((a) => a.remove()))
    .observe(document, {childList: true, subtree: true});"""


def label(url):
    query = parse_qs(url.query)
    # another host or season than the usual, named
    where = ("api " if url.netloc.startswith("api.") else "") + next((f"{year} " for year in [url.path[1:5]] if year.isdigit() and year != "2026"), "")
    if url.path.endswith("/export"):
        extra = ",".join(f"{key}={value[0]}" for key, value in sorted(query.items()) if key not in ("TYPE", "L", "JSON"))
        return f"{where}export {query.get('TYPE', ['?'])[0]}{f' ({extra})' if extra else ''}"
    if "/fflnetdynamic" in url.path:
        return f"{where}feed " + url.path.rsplit("/", 1)[1]
    return f"{where}page " + url.path.rsplit("/", 1)[1] + (f" O={query['O'][0]}" if "O" in query else "")


class Counted(harness.Mfl):
    """screens.py's answers, with every request v2 makes of MFL noted"""

    def __init__(self, site):
        super().__init__(site, {})
        self.asked = []
        self.outside = []

    def handle(self, route):
        request = route.request
        url = urlparse(request.url)
        if (url.netloc.endswith("myfantasyleague.com") and request.resource_type != "document"
                and not url.path.endswith((".js", ".css", ".gif", ".png", ".jpg", ".svg", ".ico", ".woff", ".woff2"))
                and not (request.resource_type == "xhr" and url.path.endswith(MFL_POLLS))):
            self.asked.append(label(url))
        if request.resource_type == "fetch" and not url.netloc.endswith("myfantasyleague.com") and url.netloc != PAGES_HOST:
            self.outside.append(url.netloc + url.path)
        return super().handle(route)


def quiet(page, mfl, still=1.0, limit=10.0):
    """once no request has been made of MFL for `still` seconds"""
    count, since, start = len(mfl.asked), time.time(), time.time()
    while time.time() - start < limit:
        page.wait_for_timeout(100)
        if len(mfl.asked) != count:
            count, since = len(mfl.asked), time.time()
        elif time.time() - since >= still:
            return


def walk(ref):
    site = harness.Site(ref)
    mfl = Counted(site)
    found = {}
    with sync_playwright() as playwright:
        browser = playwright.webkit.launch()
        context = browser.new_context(viewport={"width": harness.WIDTHS["phone"], "height": 1000}, timezone_id="America/Los_Angeles")
        context.clock.set_fixed_time(harness.NOW)
        context.add_init_script(harness.INIT)
        context.route("**/*", mfl.handle)
        page = context.new_page()
        for visit in VISITS:
            for step, (name, target) in enumerate(STEPS):
                start = len(mfl.asked)
                if target.startswith("#"):
                    page.evaluate(f"window.location.hash = {target!r}")
                else:
                    page.goto(harness.HOST + target)
                harness.settle(page)
                # and what it asks for after drawing (a saved copy shown, then refreshed) counts here
                # too, not against the next step
                # longer before a page is left (or the walk ends), when a late request would be lost
                leaving = not STEPS[(step + 1) % len(STEPS)][1].startswith("#")
                quiet(page, mfl, still=2.5 if leaving else 1.0)
                found[f"{visit}: {name}"] = Counter(mfl.asked[start:])
        browser.close()
    return ref, found, mfl.outside


def member_home(ref):
    """what Home reads outside MFL and Pages for a member who isn't the commissioner"""
    mfl = Counted(harness.Site(ref))
    with sync_playwright() as playwright:
        browser = playwright.webkit.launch()
        context = browser.new_context(viewport={"width": harness.WIDTHS["phone"], "height": 1000}, timezone_id="America/Los_Angeles")
        context.clock.set_fixed_time(harness.NOW)
        context.add_init_script(harness.INIT)
        context.add_init_script(MEMBER)
        context.route("**/*", mfl.handle)
        page = context.new_page()
        page.goto(harness.HOST + STEPS[0][1])
        harness.settle(page)
        quiet(page, mfl, still=2.5)
        browser.close()
    return mfl.outside


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base", default="master")
    parser.add_argument("--built", action="store_true", help="the working copy as Pages publishes it, bundled")
    parser.add_argument("--more-intended", action="store_true", help="list what's asked for more, and pass")
    args = parser.parse_args()
    head = harness.build_working_copy() if args.built else None
    with ProcessPoolExecutor(3) as pool:
        member = pool.submit(member_home, head)
        walks = list(pool.map(walk, [args.base, head]))
        found = {ref: steps for ref, steps, _ in walks}
        outside = walks[1][2]
        member = member.result()
    more = 0
    for key, asked in found[head].items():
        before = found[args.base].get(key, Counter())
        added = asked - before
        fewer = before - asked
        print(f"{key}: {sum(asked.values())}" + (f" (base {sum(before.values())})" if asked != before else ""))
        for what, n in sorted(added.items()):
            print(f"    + {what}{f' ×{n}' if n > 1 else ''}")
        for what, n in sorted(fewer.items()):
            print(f"    - {what}{f' ×{n}' if n > 1 else ''}")
        more += bool(added)
    for visit in VISITS:
        total = lambda ref: sum(sum(asked.values()) for key, asked in found[ref].items() if key.startswith(visit))
        print(f"{visit}: {total(head)} requests (base {total(args.base)})")
    print(f"base: {args.base}, head: the working copy{', built' if args.built else ''}; steps asking MFL for more: {more}")
    strays = sorted(set(outside) - {COMMISH_ONLY})
    if strays or member:
        print("v2 read outside MFL and Pages:")
        for what in strays:
            print(f"    {what}, on the commissioner's pages")
        for what in sorted(set(member)):
            print(f"    {what}, on a member's Home")
        return 1
    print(f"Outside MFL and Pages: {len(outside)} read{'s' if len(outside) != 1 else ''} of GitHub's runs on the commissioner's pages, none on a member's Home.")
    if more and args.more_intended:
        print("Passing: asking for more is intended (--more-intended, the pull request's \"more requests\" label).")
        return 0
    return 1 if more else 0


if __name__ == "__main__":
    sys.exit(main())
