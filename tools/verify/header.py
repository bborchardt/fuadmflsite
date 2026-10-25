#!/usr/bin/env python3
"""Check mfl/message-header.html before the commissioner pastes it, without asking MFL anything.

    uv run --no-project --with playwright python tools/verify/header.py [--built] [--only NAME,...]

Each case loads a saved page (tools/verify/screens/, as screens.py does) with its header swapped for
mfl/message-header.html and the clone's beta offer, in Chromium and in WebKit (Safari's engine), and
checks which version ran, the beta choice left stored, the cover, and the bars and notes shown.
A version's files can be made to fail (404) or not start (a syntax error).
"""
import argparse
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from screens import HOST, INIT, LEAGUE, NOW, REPO, Mfl, Site, build_working_copy  # noqa: E402

HEADER = (REPO / "mfl" / "message-header.html").read_text()
OFFER = '<script>window.fuadBeta = {version: "v2", feedback: "https://example.com/feedback", teams: ["0001"]};</script>\n'
# the saved pages' header: from its comment to the script tag that loads a version
SAVED = re.compile(r"<!-- FUAD league code.*?fuad\.js\"[^>]*></script>", re.S)

LINEUP = f"/2026/lineup?L={LEAGUE}"
HOME = f"/2026/home/{LEAGUE}"

# name: url, {main, beta stored, offer shown, team, failing version, how}, expected
CASES = {
    "member": (LINEUP, {}, {"ran": "v1", "requested": ["v1"], "beta": None, "cloaked": False}),
    "beta direct": (LINEUP, {"beta": "v2"}, {"ran": "v2", "requested": ["v2"], "beta": "v2", "cloaked": False, "bar": "hidden"}),
    "beta 404": (LINEUP, {"beta": "v2", "fail": ("v2", "404")},
                 {"ran": "v1", "requested": ["v2", "v1"], "beta": "v2", "cloaked": False, "bar": "The beta couldn’t load"}),
    "beta broken": (LINEUP, {"beta": "v2", "fail": ("v2", "syntax")},
                    {"ran": "v1", "requested": ["v2", "v1"], "beta": "v2", "cloaked": False, "bar": "The beta couldn’t load"}),
    "opt out": (LINEUP + "&fuadBeta=off", {"beta": "v2"}, {"ran": "v1", "requested": ["v1"], "beta": None, "cloaked": False}),
    "opt in": (LINEUP + "&fuadBeta=on", {}, {"ran": "v2", "requested": ["v1", "v2"], "beta": "v2", "cloaked": False}),
    "beta ended": (LINEUP, {"beta": "v2", "offer": False}, {"ran": "v1", "requested": ["v1"], "beta": None, "cloaked": False}),
    "commissioner": (LINEUP, {"beta": "v2", "team": "0000"}, {"ran": "v1", "requested": ["v1"], "beta": "v2", "cloaked": False}),
    "v1 404": (HOME, {"fail": ("v1", "404")}, {"ran": None, "requested": ["v1"], "cloaked": False, "note": True}),
    "v1 broken": (HOME, {"fail": ("v1", "syntax")}, {"ran": None, "requested": ["v1"], "cloaked": False, "note": True}),
    # after v2 is promoted: MAIN = "v2" and no beta line
    "v2 main": (LINEUP, {"main": "v2", "offer": False}, {"ran": "v2", "requested": ["v2"], "beta": None, "cloaked": False}),
    "v2 main home": (HOME, {"main": "v2", "offer": False}, {"ran": "v2", "requested": ["v2"], "beta": None, "cloaked": False}),
    "v2 main 404": (HOME, {"main": "v2", "offer": False, "fail": ("v2", "404")}, {"ran": None, "requested": ["v2"], "cloaked": False, "note": True}),
}


def header(main="v1", offer=True):
    text = HEADER.replace('var MAIN = "v1";', f'var MAIN = "{main}";')
    assert text != HEADER or main == "v1", "MAIN not found in the header"
    first = text.index("<script>")
    return text[:first] + (OFFER if offer else "") + text[first:]


def run(browser, site, name):
    url, given, expected = CASES[name]
    mfl = Mfl(site, {})
    requested = []
    context = browser.new_context(viewport={"width": 390, "height": 844}, timezone_id="America/Los_Angeles")
    context.clock.set_fixed_time(NOW)
    context.add_init_script(INIT)
    # whether the cover ever went up, however briefly
    context.add_init_script("""(() => { const add = DOMTokenList.prototype.add;
        DOMTokenList.prototype.add = function (...names) { if (names.includes('fuad-cloak')) window.__covered = true; return add.apply(this, names); }; })();""")
    if given.get("beta"):
        context.add_init_script(f"if (!sessionStorage.getItem('h.set')) {{ sessionStorage.setItem('h.set', '1'); localStorage.setItem('fuad.beta', '{given['beta']}'); }}")
    swapped = header(given.get("main", "v1"), given.get("offer", True))
    team = given.get("team")

    class Captured:
        def __init__(self, request):
            self.request = request
            self.answer = None

        def fulfill(self, **kwargs):
            self.answer = ("fulfill", kwargs)

        def abort(self):
            self.answer = ("abort", {})

    def handle(route):
        request = route.request
        match = re.search(r"/fuadmflsite/(v\d+)/fuad\.js$", request.url)
        if match:
            requested.append(match.group(1))
            fail = given.get("fail")
            if fail and fail[0] == match.group(1):
                if fail[1] == "404":
                    return route.fulfill(status=404, body="")
                return route.fulfill(body="export const x = ;", content_type="text/javascript")
        captured = Captured(request)
        mfl.handle(captured)
        kind, args = captured.answer
        if kind == "abort":
            return route.abort()
        if request.resource_type == "document":
            body = args["body"]
            body = SAVED.sub(lambda _: swapped, body, count=1)
            if team:
                body = body.replace("franchise_id = '0001'", f"franchise_id = '{team}'")
            args = {**args, "body": body}
        return route.fulfill(**args)

    context.route("**/*", handle)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: "FusionCharts" not in str(error) and errors.append(str(error)))
    page.goto(HOST + url, wait_until="load")
    page.wait_for_timeout(3000)
    got = page.evaluate("""() => {
        const bar = document.getElementById('fuad-preview');
        return {
            ran: window.fuadVersion || null,
            beta: localStorage.getItem('fuad.beta'),
            cloaked: document.documentElement.classList.contains('fuad-cloak'),
            bar: bar ? (getComputedStyle(bar).display === 'none' ? 'hidden' : bar.textContent) : null,
            note: Boolean(document.querySelector('.fuad-unavailable')),
            leave: bar && bar.querySelector('a') ? bar.querySelector('a').href : null,
            covered: Boolean(window.__covered),
        };
    }""")
    got["requested"] = requested
    context.close()
    problems = []
    for key, want in expected.items():
        have = got.get(key)
        if key == "bar" and want != "hidden":
            if not have or want not in have:
                problems.append(f"bar {have!r}, wanted {want!r}")
        elif have != want:
            problems.append(f"{key} {have!r}, wanted {want!r}")
    if "bar" in expected and expected["bar"] != "hidden" and (not got["leave"] or "fuadBeta=off" not in got["leave"]):
        problems.append(f"leave link {got['leave']!r}")
    # covered whenever a version other than v1 may run: one loaded first, or a beta choice to settle
    should = expected["requested"][0] != "v1" or bool(given.get("beta")) or "fuadBeta=" in url
    if got["covered"] != should:
        problems.append(f"covered {got['covered']}, wanted {should}")
    # the deliberate syntax error
    if given.get("fail", ("", ""))[1] == "syntax":
        errors = [error for error in errors if "Unexpected" not in error]
    if errors:
        problems.append(f"page errors {errors}")
    return problems, got


def loading_shown(browser, engine):
    """the cover's Loading… is drawn while the page is hidden"""
    page = browser.new_page(viewport={"width": 390, "height": 844})
    page.set_content(header().split("<script>")[0] + "<body><p>MFL's page</p></body>")
    page.evaluate("document.documentElement.classList.add('fuad-cloak')")
    content = page.evaluate("getComputedStyle(document.documentElement, '::after').content")
    hidden = page.evaluate("getComputedStyle(document.body).visibility")
    page.close()
    ok = "Loading" in content and hidden == "hidden"
    print(f"{engine:8} {'loading':14} {'ok' if ok else f'FAIL: content {content!r}, body {hidden}'}")
    return ok


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--built", action="store_true", help="the working copy as Pages publishes it, bundled")
    parser.add_argument("--only")
    args = parser.parse_args()
    site = Site(build_working_copy() if args.built else None)
    names = args.only.split(",") if args.only else list(CASES)
    failed = 0
    with sync_playwright() as p:
        for engine in (p.chromium, p.webkit):
            browser = engine.launch(headless=True)
            failed += not loading_shown(browser, engine.name)
            for name in names:
                problems, got = run(browser, site, name)
                failed += bool(problems)
                print(f"{engine.name:8} {name:14} {'ok' if not problems else 'FAIL: ' + '; '.join(problems)}")
            browser.close()
    print(f"\n{failed} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
