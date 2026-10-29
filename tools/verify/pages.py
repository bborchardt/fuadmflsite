#!/usr/bin/env python3
"""Check what v2 does with each MFL page as each kind of viewer gets it, without asking MFL anything.

    uv run --no-project --with playwright python tools/verify/pages.py [--record]

Loads every page the capture bookmark saved (tests/fixtures/pages/<viewer>/), at the address MFL
served it from, in WebKit with the working copy built as Pages publishes it and v2 as the main
version, the clock at the capture's time. Exports and other pages v2 asks for come from the screen
harness's saved clone samples (screens.py). For each page it notes whether v2 drew over it (the
class on <html> that each of v2's screens sets) or left MFL's page, and compares that with EXPECTED.
A difference fails the run; --record prints what each page did instead, to update EXPECTED with.

It sees which screen took the page, not what the screen drew: tests/mfl-pages.test.mjs checks that.
"""
import argparse
import importlib.util
import json
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
PAGES = REPO / "tests" / "fixtures" / "pages"
VIEWERS = ["guest", "member", "commish"]

_spec = importlib.util.spec_from_file_location("screens_harness", HERE / "screens.py")
harness = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(harness)

# the classes v2's screens set on <html> when they take a page
SCREEN_CLASSES = ["fuad-lineup-on", "fuad-add-on", "fuad-drop-on", "fuad-ir-on", "fuad-trades-on", "fuad-all-moves-on",
                  "fuad-all-bids-on", "fuad-rules-on", "fuad-board", "fuad-topic", "fuad-reply", "fuad-side", "fuad-home-on"]

# page: {viewer: the screen class v2 sets, or None when MFL's page stays}. A guest gets MFL's login page
# for what needs one, and the commissioner MFL's team picker or its own page for the Moves pages, All
# moves, All bids and Rules; Power, History, Looks and the player page stay MFL's, read by v2's views.
EXPECTED = {
    "add_drop": {"guest": None, "member": "fuad-add-on", "commish": None},
    "csetup-SKIN": {"guest": None, "member": None, "commish": None},
    "home": {"guest": "fuad-home-on", "member": "fuad-home-on", "commish": "fuad-home-on"},
    "lineup": {"guest": None, "member": "fuad-lineup-on", "commish": None},
    "mb-board_show": {"guest": "fuad-board", "member": "fuad-board", "commish": "fuad-board"},
    "mb-forum_search": {"guest": "fuad-side", "member": "fuad-side", "commish": "fuad-side"},
    "mb-message_add": {"guest": None, "member": "fuad-side", "commish": "fuad-side"},
    "mb-message_list": {"guest": None, "member": "fuad-side", "commish": "fuad-side"},
    "mb-post_add": {"member": "fuad-reply", "commish": "fuad-reply"},
    "mb-post_edit": {"member": "fuad-reply", "commish": "fuad-reply"},
    "mb-topic_add": {"guest": None, "member": "fuad-reply", "commish": "fuad-reply"},
    "mb-topic_show": {"guest": "fuad-topic", "member": "fuad-topic", "commish": "fuad-topic"},
    "mb-topic_show-long": {"guest": "fuad-topic"},
    "mb-user_options": {"guest": None, "member": "fuad-side", "commish": "fuad-side"},
    "options-O02": {"guest": None, "member": "fuad-lineup-on", "commish": None},
    "options-O03": {"guest": "fuad-all-moves-on", "member": "fuad-all-moves-on", "commish": None},
    "options-O05": {"guest": None, "member": "fuad-trades-on", "commish": None},
    "options-O05-propose": {"member": "fuad-trades-on"},
    "options-O09": {"guest": "fuad-rules-on", "member": "fuad-rules-on", "commish": None},
    "options-O101": {"guest": None, "member": None, "commish": None},
    "options-O171": {"guest": None, "member": None, "commish": None},
    "options-O18": {"guest": None, "member": "fuad-ir-on", "commish": None},
    "options-O194": {"guest": None, "member": None, "commish": None},
    "options-O208": {"guest": None, "member": None, "commish": None},
    "options-O257": {"guest": None, "member": "fuad-drop-on", "commish": None},
    "options-O26": {"guest": "fuad-rules-on", "member": "fuad-rules-on", "commish": None},
    "options-O28": {"guest": "fuad-board", "member": "fuad-board", "commish": "fuad-board"},
    "options-O76": {"guest": None, "member": "fuad-all-bids-on", "commish": None},
    "player": {"guest": None, "member": None, "commish": None},
    "processed_waivers": {"guest": None, "member": "fuad-all-bids-on", "commish": None},
}


class Captured(harness.Mfl):
    """the captured page for the address it was served from; everything else as screens.py answers it"""

    def __init__(self, site, url, html):
        super().__init__(site, {})
        self.url = url
        # v2 as the main version, as it will be for everyone
        self.html = html.replace('var MAIN = "v1"', 'var MAIN = "v2"')

    def handle(self, route):
        request = route.request
        if request.method == "GET" and request.url.split("#")[0] == self.url:
            return route.fulfill(content_type="text/html", body=self.html)
        return super().handle(route)


def check(job):
    built, viewer, name = job
    manifest = json.loads((PAGES / viewer / "manifest.json").read_text())
    entry = next(page for page in manifest["pages"] if page["name"] == name)
    url = (entry.get("served") or entry["url"]).split("#")[0]
    site = harness.Site(built)
    mfl = Captured(site, url, (PAGES / viewer / f"{name}.html").read_text())
    with sync_playwright() as playwright:
        browser = playwright.webkit.launch()
        context = browser.new_context(viewport={"width": 390, "height": 1000}, timezone_id="America/Chicago")
        context.clock.set_fixed_time(manifest["at"])
        context.add_init_script(harness.INIT)
        context.route("**/*", mfl.handle)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        # app.js catches a screen's failed draw and logs it, leaving MFL's page as if v2 had passed it by
        failed = []
        page.on("console", lambda message: message.type == "error" and message.text.startswith("[fuad]")
                and failed.append(message.text))
        page.goto(url)
        harness.settle(page)
        page.wait_for_timeout(500)
        classes = page.evaluate("() => [...document.documentElement.classList]")
        browser.close()
    taken = [name for name in SCREEN_CLASSES if name in classes]
    return viewer, name, taken[0] if taken else None, sorted(set(errors)), sorted(set(failed))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--record", action="store_true", help="print what each page did instead of comparing")
    args = parser.parse_args()
    built = harness.build_working_copy()
    jobs = [(built, viewer, path.stem) for viewer in VIEWERS for path in sorted((PAGES / viewer).glob("*.html"))]
    with ProcessPoolExecutor(harness.WORKERS) as pool:
        results = list(pool.map(check, jobs))
    found = {}
    differ_errors = []
    for viewer, name, taken, errors, failed in results:
        found.setdefault(name, {})[viewer] = taken
        # the home page's chart script is MFL's, not saved with it
        errors = [error for error in errors if "FusionCharts" not in error]
        if errors:
            differ_errors.append(f"{viewer}/{name}: page errors {errors}")
        # a guest's login page fails to draw as the screen v2 tries first; only a page v2 should take matters
        if failed and EXPECTED.get(name, {}).get(viewer):
            differ_errors.append(f"{viewer}/{name}: {failed}")
    if args.record:
        for name in sorted(found):
            print(f"    {json.dumps(name)}: {json.dumps(found[name])},")
        return 0
    print("\n".join(differ_errors))
    differ = len(differ_errors)
    for name in sorted(set(found) | set(EXPECTED)):
        for viewer in VIEWERS:
            want = EXPECTED.get(name, {}).get(viewer, "missing")
            got = found.get(name, {}).get(viewer, "missing")
            if want != got:
                differ += 1
                print(f"{viewer}/{name}: expected {want or 'MFL’s page'}, got {got or 'MFL’s page'}")
    print(f"\n{len(results)} pages, {differ} differences")
    return 1 if differ else 0


if __name__ == "__main__":
    sys.exit(main())
