#!/usr/bin/env python3
"""Check mfl/message-header.html before the commissioner pastes it, without asking MFL anything.

    uv run --no-project --with playwright python tools/verify/header.py [--built] [--only NAME,...]

Each case loads a saved page (tools/verify/screens/, as screens.py does) with its header swapped for
mfl/message-header.html and the clone's beta offer, in Chromium and in WebKit (Safari's engine), and
checks which version ran, the beta choice left stored, the cover, and the bars and notes shown.
A version's files can be made to fail (404) or not start (a syntax error).
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from screens import HOST, INIT, LEAGUE, NOW, REPO, Mfl, Site, build_working_copy  # noqa: E402

HEADER = (REPO / "mfl" / "message-header.html").read_text()
OFFER = '<script>window.fuadBeta = {version: "VERSION", feedback: "https://example.com/feedback", teams: ["0001"]};</script>\n'
# the saved pages' header: from its comment to the script tag that loads a version
SAVED = re.compile(r"<!-- FUAD league code.*?fuad\.js\"[^>]*></script>", re.S)

LINEUP = f"/2026/lineup?L={LEAGUE}"
HOME = f"/2026/home/{LEAGUE}"

# name: url, {main, beta stored, offer shown, its teams, team ("guest": logged out), failing version, how}, expected
CASES = {
    "member": (LINEUP, {}, {"ran": "v1", "requested": ["v1"], "beta": None, "cloaked": False}),
    "beta direct": (LINEUP, {"beta": "v2"}, {"ran": "v2", "requested": ["v2"], "beta": "v2", "cloaked": False, "bar": "hidden"}),
    # the cover in the member's look, from the page's skin; any other skin (MFL's, here) Night Game's
    "beta look": (LINEUP, {"beta": "v2", "skin": "OceanBlue"},
                  {"ran": "v2", "requested": ["v2"], "beta": "v2", "cloaked": False, "cover": ["rgb(245, 246, 248)", "rgb(84, 90, 102)"]}),
    "beta no look": (LINEUP, {"beta": "v2"}, {"ran": "v2", "requested": ["v2"], "cover": ["rgb(13, 17, 23)", "rgb(139, 148, 158)"]}),
    "beta 404": (LINEUP, {"beta": "v2", "fail": ("v2", "404")},
                 {"ran": "v1", "requested": ["v2", "v1"], "beta": "v2", "cloaked": False, "bar": "The beta couldn’t load"}),
    "beta broken": (LINEUP, {"beta": "v2", "fail": ("v2", "syntax")},
                    {"ran": "v1", "requested": ["v2", "v1"], "beta": "v2", "cloaked": False, "bar": "The beta couldn’t load"}),
    "opt out": (LINEUP + "&fuadBeta=off", {"beta": "v2"}, {"ran": "v1", "requested": ["v1"], "beta": None, "cloaked": False}),
    "opt in": (LINEUP + "&fuadBeta=on", {}, {"ran": "v2", "requested": ["v1", "v2"], "beta": "v2", "cloaked": False}),
    "beta ended": (LINEUP, {"beta": "v2", "offer": False}, {"ran": "v1", "requested": ["v1"], "beta": None, "cloaked": False}),
    "commissioner": (LINEUP, {"beta": "v2", "team": "0000"}, {"ran": "v1", "requested": ["v1"], "beta": "v2", "cloaked": False}),
    # an offer to guests: logged out, they're in it; the commissioner, left out, keeps the choice
    "guest beta": (LINEUP, {"beta": "v2", "team": "guest", "teams": ["guest"]},
                   {"ran": "v2", "requested": ["v2"], "beta": "v2", "cloaked": False, "bar": "hidden"}),
    "guest opt in": (LINEUP + "&fuadBeta=on", {"team": "guest", "teams": ["guest"]},
                     {"ran": "v2", "requested": ["v1", "v2"], "beta": "v2", "cloaked": False}),
    "guest left out": (LINEUP, {"beta": "v2", "team": "guest"}, {"ran": "v1", "requested": ["v1"], "beta": "v2", "cloaked": False}),
    "commissioner, guests": (LINEUP, {"beta": "v2", "team": "0000", "teams": ["0001", "guest"]},
                             {"ran": "v1", "requested": ["v1"], "beta": "v2", "cloaked": False}),
    "v1 404": (HOME, {"fail": ("v1", "404")}, {"ran": None, "requested": ["v1"], "cloaked": False, "note": True}),
    "v1 broken": (HOME, {"fail": ("v1", "syntax")}, {"ran": None, "requested": ["v1"], "cloaked": False, "note": True}),
    # after v2 is promoted: MAIN = "v2" and no beta line
    "v2 main": (LINEUP, {"main": "v2", "offer": False}, {"ran": "v2", "requested": ["v2"], "beta": None, "cloaked": False}),
    "v2 main home": (HOME, {"main": "v2", "offer": False}, {"ran": "v2", "requested": ["v2"], "beta": None, "cloaked": False}),
    "v2 main 404": (HOME, {"main": "v2", "offer": False, "fail": ("v2", "404")}, {"ran": None, "requested": ["v2"], "cloaked": False, "note": True}),
    # the beta and the version it falls back to both fail
    "both broken": (HOME, {"beta": "v2", "fail": ("v2", "syntax"), "fail2": ("v1", "syntax")},
                    {"ran": None, "requested": ["v2", "v1"], "cloaked": False, "note": True}),
    # a later beta (v3, not published: 404) over v2 as MAIN: v2 runs as itself, not as the beta, with the bar out
    "v3 beta 404": (LINEUP, {"main": "v2", "offer": "v3", "beta": "v3"},
                    {"ran": "v2", "requested": ["v3", "v2"], "beta": "v3", "cloaked": False, "bar": "The beta couldn’t load", "inBeta": False}),
}


def header(main="v1", offer=True, teams=None):
    """the header with MAIN and the beta offer (True: v2; a version; False: none), to `teams` if given"""
    text = HEADER.replace('var MAIN = "v1";', f'var MAIN = "{main}";')
    assert text != HEADER or main == "v1", "MAIN not found in the header"
    first = text.index("<script>")
    line = OFFER.replace("VERSION", "v2" if offer is True else str(offer)) if offer else ""
    if teams is not None:
        line = line.replace('teams: ["0001"]', f"teams: {json.dumps(teams)}")
    return text[:first] + line + text[first:]


def run(browser, site, name):
    url, given, expected = CASES[name]
    mfl = Mfl(site, {})
    requested = []
    context = browser.new_context(viewport={"width": 390, "height": 844}, timezone_id="America/Los_Angeles")
    context.clock.set_fixed_time(NOW)
    context.add_init_script(INIT)
    # whether the cover ever went up, however briefly
    context.add_init_script("""(() => { const add = DOMTokenList.prototype.add;
        DOMTokenList.prototype.add = function (...names) {
            const result = add.apply(this, names);
            if (names.includes('fuad-cloak')) {
                window.__covered = true;
                const root = document.documentElement;
                window.__cover = [getComputedStyle(root).backgroundColor, getComputedStyle(root, '::after').color];
            }
            return result;
        }; })();""")
    if given.get("beta"):
        context.add_init_script(f"if (!sessionStorage.getItem('h.set')) {{ sessionStorage.setItem('h.set', '1'); localStorage.setItem('fuad.beta', '{given['beta']}'); }}")
    swapped = header(given.get("main", "v1"), given.get("offer", True), given.get("teams"))
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
            fail = next((f for f in (given.get("fail"), given.get("fail2")) if f and f[0] == match.group(1)), None)
            if fail:
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
            if given.get("skin"):
                body = re.sub(r"skins17/(?!MFLBaseCSS)[^/\"]+/", f"skins17/{given['skin']}/", body)
            if team == "guest":
                assert "var franchise_id = '0001';" in body, "the saved page no longer sets franchise_id as expected"
                body = body.replace("var franchise_id = '0001';", "")
            elif team:
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
            cover: window.__cover || null,
            inBeta: document.documentElement.classList.contains('fuad-beta'),
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
    if "syntax" in (given.get("fail", ("", ""))[1], given.get("fail2", ("", ""))[1]):
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
