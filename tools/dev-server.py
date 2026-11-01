#!/usr/bin/env python3
"""Serve site/ on http://localhost:8000 for previewing local changes on the live league site.

    python3 tools/dev-server.py

Then open any league page with ?fuadPreview=local (or ?fuadPreview=local:v2) added to the URL.
?fuadPreview=off goes back to the published version.

The first time, Chrome asks whether the MFL site may access devices on your local network.
Allow it, or the preview can't load. Browsers also only load module scripts from another
origin when the server allows it, so this adds the CORS header Python's built-in server
leaves out, and turns off caching so every reload picks up your edits.
"""
import functools
import http.server
import json
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / "site"
PORT = 8000


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        # Chrome asks before a public site may load from your own machine; older versions
        # look for this header instead of prompting.
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        # lib/settings-data.js reads settings.json through Node; a browser gets the JSON itself, as
        # tools/build.mjs publishes it
        path = self.path.split("?")[0]
        settings = SITE / path.lstrip("/").removesuffix("lib/settings-data.js") / "settings.json"
        if path.endswith("/lib/settings-data.js") and settings.is_file():
            body = f"export default {json.dumps(json.loads(settings.read_text()))};\n".encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/javascript")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


if __name__ == "__main__":
    handler = functools.partial(Handler, directory=str(SITE))
    print(f"Serving {SITE} at http://localhost:{PORT}/  (Ctrl+C to stop)")
    http.server.ThreadingHTTPServer(("localhost", PORT), handler).serve_forever()
