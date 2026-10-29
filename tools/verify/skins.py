#!/usr/bin/env python3
"""Check that MFL's skins don't show through v2's screens, in each look.

    uv run --no-project --with playwright python tools/verify/skins.py [--refresh] [--only home,add]

Each look is saved as one of MFL's skins, whose stylesheets load under v2's screens (ui/looks.js). For
each look, each of screens.py's screens is drawn at phone and desktop widths twice, with the look's
skin and with its stylesheets empty, and every style of v2's parts that differs between the two is
listed: what the skin changes there, which fuad.css should set itself. Both keep MFL's page margin. The default look is drawn
with the league's own skin, Neon Blue.

MFL's stylesheets aren't the repo's to publish, so they're fetched from MFL on the first run (13
files) into mfl-skins/ here, which git ignores, and their fingerprints kept in skins.json. --refresh fetches them again and
rewrites skins.json, so a skin MFL has changed shows in git diff.
"""
import argparse
import hashlib
import importlib.util
import json
import re
import sys
import urllib.request
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
CACHE = HERE / "mfl-skins"
FINGERPRINTS = HERE / "skins.json"

_spec = importlib.util.spec_from_file_location("screens_harness", HERE / "screens.py")
harness = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(harness)

# the looks' skin folders, as ui/looks.js names them; the default look's (null there) the league's own
LOOKS = {look: folder or "NeonBlue" for look, folder in re.findall(
    r'\{id: "(\w+)",[^}]*folder: (?:"(\w+)"|null)', (REPO / "site/v2/ui/looks.js").read_text())}


def files():
    return ["MFLBaseCSS.css"] + [name for folder in sorted(set(LOOKS.values())) for name in (f"{folder}/{folder}.css", f"{folder}/responsive.css")]


def fetch(refresh):
    """the skins' stylesheets, from the cache or from MFL; returns the names whose fingerprint changed"""
    known = json.loads(FINGERPRINTS.read_text()) if FINGERPRINTS.exists() else {}
    prints, changed = {}, []
    for name in files():
        path = CACHE / name
        if refresh or not path.exists():
            # a browser's ordinary request for a public file; never the daily job's registered client name
            request = urllib.request.Request(f"{harness.HOST}/skins17/{name}", headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(request, timeout=30) as response:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(response.read())
        prints[name] = hashlib.sha256(path.read_bytes()).hexdigest()
        if name in known and known[name] != prints[name]:
            changed.append(name)
    if refresh or not known or set(prints) != set(known):
        FINGERPRINTS.write_text(json.dumps(prints, indent=2) + "\n")
    return changed


# every element of v2's parts (as screens.py's SNAPSHOT finds them) that's drawn, by its place
# in the page, with the styles a skin could change
STYLES = """(props) => {
  const roots = [...document.querySelectorAll('[id^="fuad"], .fuad-layer, .fuad-popup, dialog')]
    .filter((el) => !el.parentElement || !el.parentElement.closest('[id^="fuad"], .fuad-layer, .fuad-popup, dialog'));
  const out = {};
  const name = (el) => el.tagName.toLowerCase() + (el.type && el.tagName === 'INPUT' ? `[type=${el.type}]` : '') + (el.id ? '#' + el.id : '')
    + [...el.classList].map((c) => '.' + c).join('');
  const walk = (el, path, root) => {
    if (el.getClientRects().length) {
      const style = getComputedStyle(el);
      const text = (el.childNodes[0] && el.childNodes[0].nodeType === 3 ? el.childNodes[0].textContent : '').trim().slice(0, 30);
      // widths only at the roots: inside, they follow from what's around them, as heights do from what's inside
      const own = root ? props : props.filter((p) => p !== 'width');
      out[path] = {name: name(el), text, styles: Object.fromEntries(own.map((p) => [p, style.getPropertyValue(p)]))};
    }
    [...el.children].forEach((child, i) => walk(child, path + '>' + i + name(child), false));
  };
  roots.forEach((root) => walk(root, name(root), true));
  return out;
}"""
PROPS = ["color", "background-color", "background-image", "border-top-color", "border-bottom-color",
         "border-left-color", "border-right-color", "border-top-width", "border-bottom-width", "border-top-style",
         "border-radius", "box-shadow", "outline-color", "font-family", "font-size", "font-weight", "font-style",
         "line-height", "letter-spacing", "text-transform", "text-decoration-line", "text-align", "text-shadow",
         "padding-top", "padding-left", "margin-top", "margin-left", "display", "opacity", "visibility",
         "width"]


class Skinned(harness.Mfl):
    """screens.py's answers, with the pages naming the look's skin, and its stylesheets from the cache
    or empty"""

    def __init__(self, site, swaps, folder, styled):
        super().__init__(site, swaps)
        self.folder, self.styled = folder, styled
        self.loaded = set()

    def handle(self, route):
        path = route.request.url.split("?")[0]
        if "/skins17/" in path and path.endswith(".css"):
            self.loaded.add(path.split("/skins17/", 1)[1])
            cached = CACHE / path.split("/skins17/", 1)[1]
            body = cached.read_text() if self.styled and cached.exists() else ""
            # the page box as MFL's base stylesheet leaves it, so sizes differ only by what reaches v2's parts
            if not self.styled and path.endswith("/MFLBaseCSS.css"):
                body = "body{margin:0;padding:0}"
            return route.fulfill(content_type="text/css", body=body)
        return super().handle(Reskinned(route, self.folder))


class Reskinned:
    """a route whose HTML answer names `folder`'s skin"""

    def __init__(self, route, folder):
        self.route, self.folder, self.request = route, folder, route.request

    def fulfill(self, **answer):
        if answer.get("content_type") == "text/html" and isinstance(answer.get("body"), str):
            body = re.sub(r"skins17/(?!MFLBaseCSS)([^/\"]+)/\1\.css", f"skins17/{self.folder}/{self.folder}.css", answer["body"])
            answer["body"] = re.sub(r"skins17/(?!MFLBaseCSS)[^/\"]+/responsive\.css", f"skins17/{self.folder}/responsive.css", body)
        return self.route.fulfill(**answer)

    def abort(self, *args):
        return self.route.abort(*args)


def draw(browser, site, screen, look, width, styled):
    url, swaps = harness.SCREENS[screen]
    mfl = Skinned(site, swaps, LOOKS[look], styled)
    context = browser.new_context(viewport={"width": harness.WIDTHS[width], "height": 1000}, timezone_id="America/Los_Angeles")
    context.clock.set_fixed_time(swaps.get("now", harness.NOW))
    context.add_init_script(harness.INIT)
    if "flash" in swaps:
        # the line a move leaves for after the reload, as screens.py plants it
        key, value = swaps["flash"]
        context.add_init_script(f"sessionStorage.setItem({json.dumps(key)}, {json.dumps(json.dumps(value))});")
    context.route("**/*", mfl.handle)
    page = context.new_page()
    page.goto(harness.HOST + url)
    harness.settle(page)
    shown = page.evaluate("() => document.documentElement.getAttribute('data-fuad-look')")
    styles = page.evaluate(STYLES, PROPS)
    context.close()
    folder = LOOKS[look]
    missing = sorted({"MFLBaseCSS.css", f"{folder}/{folder}.css", f"{folder}/responsive.css"} - mfl.loaded)
    return shown, styles, missing


def check(job):
    built, screen, look, width = job
    site = harness.Site(built)
    with sync_playwright() as playwright:
        browser = playwright.webkit.launch()
        shown, skinned, missing = draw(browser, site, screen, look, width, True)
        _, plain, _ = draw(browser, site, screen, look, width, False)
        browser.close()
    differ = []
    for path, element in skinned.items():
        other = plain.get(path)
        if other is None:
            differ.append((element["name"], element["text"], "drawn", "yes", "no"))
            continue
        for prop, value in element["styles"].items():
            if other["styles"][prop] != value:
                differ.append((element["name"], element["text"], prop, value, other["styles"][prop]))
    differ += [(plain[path]["name"], plain[path]["text"], "drawn", "no", "yes") for path in plain if path not in skinned]
    return screen, look, width, shown, missing, len(skinned), differ


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true", help="fetch MFL's stylesheets again and update skins.json")
    parser.add_argument("--only", help="screens to draw, comma-separated (default all)")
    args = parser.parse_args()
    changed = fetch(args.refresh)
    for name in changed:
        print(f"MFL changed {name} (skins.json updated)" if args.refresh
              else f"mfl-skins/{name} isn't the copy skins.json has: --refresh fetches MFL's")
    screens = args.only.split(",") if args.only else list(harness.SCREENS)
    built = harness.build_working_copy()
    jobs = [(built, screen, look, width) for look in LOOKS for screen in screens for width in harness.WIDTHS]
    with ProcessPoolExecutor(harness.WORKERS) as pool:
        results = list(pool.map(check, jobs))
    # one line per element and style, with the looks, screens and widths it's on; a line every look
    # shares is MFL's base stylesheet's, or the same rule in every skin
    found = {}
    problems = []
    for screen, look, width, shown, missing, count, differ in results:
        if shown != look:
            problems.append(f"{look}/{screen}/{width}: drawn in look {shown}")
        if missing:
            problems.append(f"{look}/{screen}/{width}: the page didn't load {', '.join(missing)}")
        if not count:
            problems.append(f"{look}/{screen}/{width}: nothing of v2's drawn")
        for name, text, prop, value, plain in differ:
            seen = found.setdefault((name, prop, value, plain), {"text": text, "looks": set(), "where": set()})
            seen["looks"].add(look)
            seen["where"].add(f"{screen}/{width}")
    print("\n".join(problems))
    lines = []
    for (name, prop, value, plain), seen in found.items():
        looks = "every look" if seen["looks"] == set(LOOKS) else ", ".join(sorted(seen["looks"]))
        where = sorted(seen["where"])
        text = f' "{seen["text"]}"' if seen["text"] else ""
        lines.append(f"{looks}: {name}{text} {prop}: {value} (without the skin {plain}) on {', '.join(where)}")
    print("\n".join(sorted(lines)))
    print(f"\n{len(results)} screens drawn, {len(found)} styles the skins change, {len(problems)} problems")
    return 1 if found or problems or changed else 0


if __name__ == "__main__":
    sys.exit(main())
