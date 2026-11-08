#!/usr/bin/env python3
"""Draw v2's home screen icons (site/v2/app/) from the wordmark, in Night Game's colours and font.

    uv run --no-project --with playwright python tools/app-icons.py [WORDMARK]

The wordmark stays inside the middle 80% circle, so Android can crop the same picture to any shape
(a maskable icon); an iPhone rounds the corners itself. The font comes from Google Fonts, as v2's does.
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent.parent / "site" / "v2" / "app"
SIZES = {"icon-512.png": 512, "icon-192.png": 192, "apple-touch-icon.png": 180}

PAGE = """<!doctype html>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700&display=block" rel="stylesheet">
<style>
  html, body { margin: 0; width: 100vw; height: 100vh; background: #0D1117; }
  body { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4vw; }
  .mark { font: 700 27vw/0.8 "Barlow Condensed", sans-serif; letter-spacing: 0.04em; color: #E9EDF2;
          margin-right: -0.04em; }
  .bar { width: 34vw; height: 3.4vw; border-radius: 1.7vw; background: #C8F43C; }
</style>
<div class="mark">%s</div><div class="bar"></div>
"""


def main():
    wordmark = sys.argv[1] if len(sys.argv) > 1 else "FUAD"
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        for name, size in SIZES.items():
            page = browser.new_page(viewport={"width": size, "height": size})
            page.set_content(PAGE % wordmark)
            page.evaluate("document.fonts.ready")
            page.screenshot(path=str(OUT / name))
            page.close()
        browser.close()
    print(f"wrote {', '.join(SIZES)} to {OUT}")


if __name__ == "__main__":
    main()
