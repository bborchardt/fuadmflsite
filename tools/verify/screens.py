#!/usr/bin/env python3
"""Check that a change to v2 leaves its screens as they were, without asking MFL anything.

    uv run --no-project --with playwright python tools/verify/screens.py compare [--base master] [--only add,trades] [--built]
    uv run --no-project --with playwright python tools/verify/screens.py record OUT.json [--ref master]

Each screen loads from pages and exports saved from the clone league (tools/verify/screens/; the
repo is public, so new samples need emails, members' contact details and MFL's apiKey removed), with the clock fixed, at phone and desktop widths. From what it first
shows, every kind of control starts a chain (the first two of each: buttons, links within the page,
boxes, fields) of up to six steps, each a kind of control the chain hasn't used yet; SEEDS lead
into each move's review and post first. Each chain runs from a fresh load. After each step it keeps
the HTML of v2's parts of the page and the moves the page made (POSTs, and GETs naming an ACTION),
which are answered from the saved pages, never sent.

compare  records --base (a git ref, default master) and the working copy (with --built, as Pages
         publishes it: bundled by tools/build.mjs), and lists every step whose HTML or moves differ. A refactor should show none; a visible change shows up as a review list.
         Runs of whitespace count as one space, as the browser draws them, so markup may be reindented.
record   writes one version's record, from the working copy or --ref.

It sees HTML and moves, not CSS: a style change needs its own check. The site menu, team sheet and
header (#fuad-frame) are in the HTML but their controls aren't used. MFL's answer to a move is the
saved page unchanged, so moves end on their unconfirmed path; the *-done screens plant the line a
successful move leaves instead. On the drop-* and ir-* screens MFL keeps the roster their posts
change (Mfl's "moves"): the move lands, MFL's answer fails with the move made or not, MFL refuses it
(or, on IR, makes the moves but refuses the drop), the rosters export lags it or leaves the team out,
or (Drop) MFL can't be reached. On the trades-*, trades-offer-*, propose-* and counter-* screens MFL
keeps the pending trades and rosters that Trades' moves change in the same ways, and an offer can be
gone by the time it's accepted, or a counter's offer sent but the original left open.
"""
import argparse
import copy
import difflib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parents[2]
SAMPLES = Path(__file__).resolve().parent / "screens"
HOST = "https://www44.myfantasyleague.com"
LEAGUE = "50965"
# Sunday of week 6, 1:30 p.m. CT: games on, the free agent window and bids still ahead
NOW = "2026-10-18T18:30:00Z"
WIDTHS = {"phone": 390, "desktop": 1280}
PER_KIND = 2
CHAIN = 6
WORKERS = max(2, min(8, (os.cpu_count() or 4) - 1))

# before the clone's trade deadline (Thu Oct 15), so proposing is open
BEFORE_DEADLINE = "2026-10-13T18:00:00Z"

# name: (url, saved exports to swap in, and "now" where it isn't NOW)
SCREENS = {
    "home": (f"/2026/home/{LEAGUE}", {}),
    "add": (f"/2026/add_drop?L={LEAGUE}", {}),
    "add-claims": (f"/2026/add_drop?L={LEAGUE}", {"pendingWaivers": "pendingWaivers-claims.json", "page:add_drop": "add_drop-claims.html"}),
    "drop": (f"/2026/options?L={LEAGUE}&O=257", {}),
    "ir": (f"/2026/options?L={LEAGUE}&O=18", {}),
    "trades": (f"/2026/options?L={LEAGUE}&O=05", {"now": BEFORE_DEADLINE}),
    "trades-closed": (f"/2026/options?L={LEAGUE}&O=05", {}),
    "trades-offer": (f"/2026/options?L={LEAGUE}&O=05", {"pendingTrades": "pendingTrades-offer.json", "page:trades": "trades-O05-offer.html", "now": BEFORE_DEADLINE}),
    "propose": (f"/2026/options?L={LEAGUE}&O=05&FRANCHISE=0001,0002", {"now": BEFORE_DEADLINE}),
    # after a move: MFL's answer here is the saved page, unchanged, so a move never succeeds; the
    # line a move leaves for after the reload is planted instead
    "add-done": (f"/2026/add_drop?L={LEAGUE}", {"flash": ("fuad.addFlash", {"done": {"text": "Bid made."}, "error": "Couldn’t bid: a test error.", "highlight": "1:12678"})}),
    "add-warn": (f"/2026/add_drop?L={LEAGUE}", {"flash": ("fuad.addFlash", {"done": {"text": "Bid made, but check its lengths.", "failed": True, "line": "Higbee: 1 year"}})}),
    "drop-done": (f"/2026/options?L={LEAGUE}&O=257", {"flash": ("fuad.dropFlash", {"done": "Tyler Higbee dropped.", "error": "Couldn’t drop: a test error."})}),
    "ir-done": (f"/2026/options?L={LEAGUE}&O=18", {"flash": ("fuad.irFlash", {"done": "Jalen Hurts moved to IR.", "error": "Couldn’t save: a test error."})}),
    "trades-done": (f"/2026/options?L={LEAGUE}&O=05", {"now": BEFORE_DEADLINE, "flash": ("fuad.tradesFlash", {"done": "Offer sent.", "error": "Couldn’t send: a test error.", "note": "A test note."})}),
    # MFL keeping the roster a move changes (Mfl's "moves")
    **{f"{move}-{how}": (f"/2026/options?L={LEAGUE}&O={option}", {"moves": how})
       for move, option in [("drop", "257"), ("ir", "18")] for how in ["lands", "fails", "fails-made", "refuses", "lags"]},
    **{f"ir-{how}": (f"/2026/options?L={LEAGUE}&O=18", {"moves": how}) for how in ["refuses-drop"]},
    **{f"drop-{how}": (f"/2026/options?L={LEAGUE}&O=257", {"moves": how})
       for how in ["lags-twice", "fails-noteam", "fails-made-noteam", "refuses-noteam", "offline"]},
    "lineup": (f"/2026/lineup?L={LEAGUE}", {}),
    "scores": (f"/2026/home/{LEAGUE}#league-scores", {}),
    "standings": (f"/2026/home/{LEAGUE}#league-standings", {}),
    "power": (f"/2026/home/{LEAGUE}#league-power", {}),
    "winners": (f"/2026/home/{LEAGUE}#league-winners", {}),
    "rosters": (f"/2026/home/{LEAGUE}#rosters-players", {}),
    "rosters-teams": (f"/2026/home/{LEAGUE}#rosters-teams", {}),
    "rosters-my-team": (f"/2026/home/{LEAGUE}#rosters-my-team", {}),
    "rosters-draft": (f"/2026/home/{LEAGUE}#rosters-draft", {}),
}

# Paths into a screen's deeper states, as data-act names (one that isn't there is skipped), from which
# a chain continues as from any first control: a move's review and its post sit a few steps in. A
# step can also be (act, value, n): the nth control with that action and data-side or data-answer
# value (-1 the last).
CHEAPEST = [("tick", "give", -1), "next", ("tick", "get", -1), "next"]
SEEDS = {
    "add": [["start", "pick-fa"], ["start", "pick-fa", "pick-drop", "submit"], ["pick-fa"], ["pick-fa", "pick-drop", "submit"]],
    "add-claims": [["edit"], ["copy"], ["start", "pick-fa"], ["pick-fa"], ["pick-fa", "pick-drop"]],
    "propose": [["tick", "next"], CHEAPEST + ["send"], CHEAPEST + ["message", "send"], CHEAPEST + ["hour", "send"]],
    "trades": [["ask", "withdraw"]],
    "trades-offer": [["answer"], ["answer", "comment", "send-answer"], [("answer", "reject", 0), "send-answer"],
                     [("answer", "counter", 0), "comment", "send-answer"]],
    **{f"drop-{how}": [["toggle", "drop"]] for how in ["lands", "fails", "fails-made", "refuses", "lags", "lags-twice", "fails-noteam", "fails-made-noteam", "refuses-noteam", "offline"]},
    # a drop is offered only once a player is activated
    **{f"ir-{how}": [["toIR", "save"], ["activate", "drop", "save"]] for how in ["lands", "fails", "fails-made", "lags", "refuses", "refuses-drop"]},
    # a box ticked and unticked again, which no first-of-each-kind chain does
    "ir": [["toIR", "save"], ["activate", "save"], ["toIR", "activate", "save"], ["activate", "drop", "save"],
           [("toIR", "", 0), ("toIR", "", 0)], [("activate", "", 0), ("activate", "", 0)]],
}
# MFL keeping the pending trades and rosters that Trades' moves change: each move on the plain
# screens, landing, failing (made or not) or refused; an accepted offer already gone; a counter sent
TRADE_SCREENS = ["trades", "trades-offer", "propose"]
for _name in TRADE_SCREENS:
    for _how in ["lands", "fails", "fails-made", "refuses"]:
        SCREENS[f"{_name}-{_how}"] = (SCREENS[_name][0], {**SCREENS[_name][1], "moves": _how})
        SEEDS[f"{_name}-{_how}"] = SEEDS[_name]
SCREENS["trades-offer-gone"] = (SCREENS["trades-offer"][0], {**SCREENS["trades-offer"][1], "moves": "gone"})
SEEDS["trades-offer-gone"] = [["answer", "send-answer"]]
for _how in ["lands", "fails", "fails-made", "refuses", "then-fails"]:
    SCREENS[f"counter-{_how}"] = (SCREENS["propose"][0] + "#counter-1003", {**SCREENS["trades-offer"][1], "moves": _how})
    SEEDS[f"counter-{_how}"] = [["send"], ["next", "next", "send"]]

EXPORTS = {
    "nflSchedule": "nflSchedule-W6.json", "liveScoring": "liveScoring-W6.json", "projectedScores": "projectedScores-W6.json",
    "players": "players.json",
}

# deterministic Math.random
INIT = """
(() => {
  let seed = 42;
  Math.random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
})();
"""

# v2's parts of the page: its own top-level elements, layers, dialogs and the popup, sorted (layers
# are added as their modules load, in either order)
SNAPSHOT = """() => {
  const roots = [...document.querySelectorAll('[id^="fuad"], .fuad-layer, .fuad-popup, dialog')]
    .filter((el) => !el.parentElement || !el.parentElement.closest('[id^="fuad"], .fuad-layer, .fuad-popup, dialog'));
  const classes = [...document.documentElement.classList].filter((c) => c.startsWith('fuad')).sort().join(' ');
  return `${location.pathname}${location.search}${location.hash}\\n<html class="${classes}">\\n`
    + roots.map((el) => el.outerHTML).sort().join('\\n');
}"""

# The screen's controls in page order, each with a signature (tag, type, data-act, classes...) and
# its index among controls with that signature; the frame's own (#fuad-frame: header, site menu,
# team sheet) are left out, being shared and drawn the same on every screen. While a layer (a popup,
# Add's compose layer) is open, only its controls count: it covers the rest.
CONTROLS_JS = """
const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
const layers = [...document.querySelectorAll('.fuad-layer')].filter((layer) => !layer.hidden && visible(layer));
const roots = layers.length ? layers.slice(-1) : [...document.querySelectorAll('[id^="fuad"], .fuad-layer, .fuad-popup, dialog')];
const controls = [...new Set(roots.flatMap((root) => [...root.querySelectorAll('button, a[href^="#"], [role=tab], input, select, textarea')]))]
  .filter((el) => !el.disabled && el.type !== 'hidden' && visible(el) && !el.closest('#fuad-frame, #fuad-preview'))
  .map((el) => {
    const tag = el.tagName.toLowerCase();
    const kind = tag === 'input' ? (['checkbox', 'radio'].includes(el.type) ? 'check' : 'fill') : tag === 'textarea' ? 'fill' : tag === 'select' ? 'select' : 'click';
    const classes = typeof el.className === 'string' ? el.className.split(' ').filter((c) => c.startsWith('fuad')).sort().join('.') : '';
    const sig = [tag, el.type || '', el.dataset.act || '', el.dataset.view || '', el.dataset.chip || '', el.dataset.side || el.dataset.answer || '', el.getAttribute('role') || '', el.name || '',
      tag === 'a' ? el.getAttribute('href') : '', classes].join('|');
    return {el, kind, sig};
  });
const counts = new Map();
for (const c of controls) { c.index = counts.get(c.sig) || 0; counts.set(c.sig, c.index + 1); }
"""
CONTROLS = "() => {" + CONTROLS_JS + "return controls.map(({kind, sig, index}) => ({kind, sig, index})); }"
# marks the control a step names, found again the same way
FIND = "([sig, index]) => {" + CONTROLS_JS + """
const found = controls.find((c) => c.sig === sig && c.index === index);
if (found) found.el.setAttribute('data-screens-target', '1');
return Boolean(found);
}"""


BUILT = "built:"


def build_working_copy():
    """the working copy as Pages publishes it (tools/build.mjs: v2 bundled), as a ref Site reads"""
    out = tempfile.mkdtemp(prefix="fuad-built-")
    subprocess.run(["node", "tools/build.mjs", out], cwd=REPO, check=True, stdout=subprocess.DEVNULL)
    return BUILT + out


class Site:
    """v2's files from the working copy, a git ref, or a build ("built:DIR")"""

    def __init__(self, ref=None):
        self.ref = ref
        self.cache = {}

    def read(self, path):
        if path not in self.cache:
            if path.endswith("/lib/settings.js") and not (self.ref and self.ref.startswith(BUILT)):
                # as tools/build.mjs publishes it: the JSON itself, which a browser can't read through Node
                settings = self.read(path[: -len("lib/settings.js")] + "settings.json")
                if settings is not None:
                    self.cache[path] = f"export default {json.dumps(json.loads(settings))};\n".encode()
                    return self.cache[path]
            if self.ref and self.ref.startswith(BUILT):
                local = Path(self.ref[len(BUILT):]) / path
                self.cache[path] = local.read_bytes() if local.exists() else None
            elif self.ref:
                result = subprocess.run(["git", "show", f"{self.ref}:site/{path}"], cwd=REPO, capture_output=True)
                self.cache[path] = result.stdout if result.returncode == 0 else None
            else:
                local = REPO / "site" / path
                self.cache[path] = local.read_bytes() if local.exists() else None
        return self.cache[path]


def sample(name):
    return (SAMPLES / name).read_text()


TEAM = "0001"
# how many times v2 reads the roster to confirm a move
READS = int(re.search(r"export const READS = (\d+);", (SAMPLES.parent.parent.parent / "site/v2/ui/moves.js").read_text()).group(1))
REFUSED = '<html><body><div class="pagebody"><span class="warning">Roster moves are locked for this team.</span></div></body></html>'
ROW = re.compile(r'<tr class="(?:odd|even)tablerow">.*?</tr>', re.S)


class Mfl:
    """Answers the page's requests from the saved samples, and keeps what it posts. With swaps["moves"],
    Drop's and IR's posts change the roster that the rosters export and their pages then show, as MFL
    does: "lands"; "fails" (MFL's answer an error, nothing changed); "fails-made" (an error, the move
    made); "refuses" (a page with MFL's reason, nothing changed); "refuses-drop" (that page, the moves
    made but not the drop); "lags" (made, MFL's answer not the IR page, and the first rosters read after
    it still shows the roster from before); "lags-twice" (the first two reads do); any of these with
    "-noteam" (each rosters read v2 makes to confirm it leaves the team out); "offline" (the post and
    rosters reads don't reach MFL). Trades' moves too: "lands", "fails", "fails-made", "refuses";
    "gone" (an accepted offer removed with no players moved); "then-fails" (the first move lands, those
    after it fail)"""

    def __init__(self, site, swaps):
        self.site = site
        self.swaps = swaps
        self.posts = []
        self.moves = swaps.get("moves")
        self.rosters = json.loads(sample("rosters.json")) if self.moves else None
        # the pending trades, as moves change them
        self.trades = None
        if self.moves:
            pending = json.loads(sample(swaps.get("pendingTrades", "pendingTrades.json")))["pendingTrades"].get("pendingTrade", [])
            self.trades = pending if isinstance(pending, list) else [pending]
        self.stale = None
        # how many rosters reads still get the stale copy
        self.stale_reads = 0
        # rosters reads still to answer without the team, and whether MFL can't be reached
        self.noteam = 0
        self.offline = False

    def team(self, rosters=None):
        return next(team for team in (rosters or self.rosters)["rosters"]["franchise"] if team["id"] == TEAM)

    def make(self, route, path, fields):
        """MFL's answer to Drop's or IR's post, the roster changed as the move says"""
        before = copy.deepcopy(self.rosters)
        how = self.moves
        if how == "offline":
            self.offline = True
            return route.abort()
        if how.endswith("-noteam"):
            how = how[:-len("-noteam")]
            self.noteam = READS
        if how not in ("fails", "refuses"):
            team = self.team()
            for player in team["player"]:
                if player["id"] in fields.get(f"deactivate{TEAM}", []):
                    player["status"] = "INJURED_RESERVE"
                if player["id"] in fields.get(f"activate{TEAM}", []):
                    player["status"] = "ROSTER"
            if how != "refuses-drop":
                gone = set(fields.get("drop_pid", []) + fields.get(f"drop{TEAM}", []))
                team["player"] = [player for player in team["player"] if player["id"] not in gone]
        if how in ("fails", "fails-made"):
            return route.fulfill(status=500, body="")
        if how in ("refuses", "refuses-drop"):
            return route.fulfill(content_type="text/html", body=REFUSED)
        if how in ("lags", "lags-twice"):
            # an answer that isn't the IR page, so v2 reads the rosters export, which still has it as it was
            self.stale = before
            self.stale_reads = 2 if how == "lags-twice" else 1
            return route.fulfill(content_type="text/html", body="<html><body><div class=\"pagebody\"></div></body></html>")
        return route.fulfill(content_type="text/html", body=self.ir_page() if path.endswith("/ir") else self.drop_page())

    def trade(self, route, path, fields):
        """MFL's answer to a trade move: an offer sent, answered (accept swaps the players) or withdrawn"""
        how = self.moves
        if how == "then-fails":
            # the first move lands, any after it fails unmade
            how = "lands" if sum(post["url"].split("?")[0].endswith(("/trade_response", "/trade_offer")) for post in self.posts) == 1 else "fails"
        field = lambda name: fields.get(name, [""])[0]
        if how not in ("fails", "refuses"):
            if path.endswith("/trade_offer"):
                partner = next(team for team in field("FRANCHISE_ID").split(",") if team != TEAM)
                listed = lambda team: "".join(f"{id_}," for id_ in fields.get(f"drop{team}", []))
                self.trades.append({"trade_id": str(2001 + len(self.posts)), "offeringteam": TEAM, "offeredto": partner,
                                    "will_give_up": listed(TEAM), "will_receive": listed(partner), "comments": field("msg"),
                                    "timestamp": "1792300000", "expires": "1792900000", "description": ""})
            else:
                trade = next((trade for trade in self.trades if trade["trade_id"] == field("TRADE_ID")), None)
                if trade:
                    self.trades.remove(trade)
                if trade and field("ACTION") == "accept" and how != "gone":
                    teams = {team["id"]: team for team in self.rosters["rosters"]["franchise"]}
                    for giver, taker, listed in [(trade["offeringteam"], trade["offeredto"], trade["will_give_up"]),
                                                 (trade["offeredto"], trade["offeringteam"], trade["will_receive"])]:
                        ids = [id_ for id_ in listed.split(",") if id_]
                        moved = [player for player in teams[giver]["player"] if player["id"] in ids]
                        teams[giver]["player"] = [player for player in teams[giver]["player"] if player["id"] not in ids]
                        teams[taker]["player"] += moved
        if how in ("fails", "fails-made"):
            return route.fulfill(status=500, body="")
        if how == "refuses":
            return route.fulfill(content_type="text/html", body=REFUSED)
        return route.fulfill(content_type="text/html", body="<html><body><div class=\"pagebody\"></div></body></html>")

    def drop_page(self):
        """MFL's Drop Players page as the roster now stands: a dropped player's entry gone"""
        html = sample("drop-O257.html")
        kept = {player["id"] for player in self.team()["player"]}
        html = re.sub(r'\s*pdb_picker\[\d+\] = new Player2 \("(\d+)",[^\n]*', lambda m: m.group(0) if m.group(1) in kept else "", html)
        counter = iter(range(1000))
        return re.sub(r"pdb_picker\[\d+\]( = new Player2)", lambda m: f"pdb_picker[{next(counter)}]{m.group(1)}", html)

    def ir_page(self):
        """MFL's Injured Reserve page as the roster now stands: a player moved to IR under Activate, one
        activated under Deactivate, a dropped one gone"""
        html = sample("ir-O18.html")
        statuses = {player["id"]: player["status"] for player in self.team()["player"]}
        head, rest = html.split("Select Players To Activate", 1)
        form_at = head.index('name="FRANCHISE_ID"')
        pre, head = head[:form_at], head[form_at:]
        player = lambda row: re.search(r"launch_player_modal\('\d+','(\d+)'\)", row)
        active_rows = {player(row).group(1): row for row in ROW.findall(head) if player(row)}
        form_end = rest.index("</form>")
        rest, post = rest[:form_end], rest[form_end:]
        ir_rows = {player(row).group(1): row for row in ROW.findall(rest) if player(row)}
        link = lambda row: re.search(r"<td><a .*?</a>[^<]*(?:<span[^>]*>[^<]*</span>\)?)?", row).group(0)
        as_ir = lambda row, id_: (f'<tr class="oddtablerow"><td class="inputfield"><input type="checkbox" name="activate{TEAM}" value="{id_}"/></td>'
                                  f'<td class="inputfield dropplayer"><input type="checkbox" name="drop{TEAM}" value="{id_}"/></td>{link(row)}</tr>')
        as_active = lambda row, id_: (f'<tr class="oddtablerow"><td class="inputfield"><span class="warning">Can not be deactivated</span></td>'
                                      f'<td class="inputfield dropplayer"><input type="checkbox" name="drop{TEAM}" value="{id_}"/></td>{link(row)}<td align="center">No</td></tr>')
        new_active = [row for id_, row in active_rows.items() if statuses.get(id_) == "ROSTER"] + [as_active(row, id_) for id_, row in ir_rows.items() if statuses.get(id_) == "ROSTER"]
        new_ir = [row for id_, row in ir_rows.items() if statuses.get(id_) == "INJURED_RESERVE"] + [as_ir(row, id_) for id_, row in active_rows.items() if statuses.get(id_) == "INJURED_RESERVE"]

        def swap(part, rows):
            found = ROW.findall(part)
            return part[:part.index(found[0])] + "\n".join(rows) + part[part.rindex(found[-1]) + len(found[-1]):]
        return pre + swap(head, new_active) + "Select Players To Activate" + swap(rest, new_ir) + post

    def page_for(self, path, query):
        option = query.get("O", [""])[0]
        if "/home/" in path:
            return "home.html"
        if path.endswith("/add_drop"):
            return self.swaps.get("page:add_drop", "add_drop.html")
        if path.endswith("/lineup"):
            return "lineup.html"
        if path.endswith("/player"):
            return "player.html"
        if path.endswith("/ajax_ls"):
            return "ajax_ls.html"
        if path.endswith("/options"):
            if option == "257":
                return "drop-O257.html"
            if option == "18":
                return "ir-O18.html"
            if option == "05":
                return "trade-propose-0002.html" if "FRANCHISE" in query else self.swaps.get("page:trades", "trades-O05.html")
            if option == "101":
                return "power-O101.html"
            if option == "194":
                return "champions-O194.html"
            if option == "208":
                return "career-O208.html"
            if option == "171":
                return f"series-O171-{query.get('FID', [''])[0]}.html"
        return None

    def export(self, query):
        kind = query.get("TYPE", [""])[0]
        week = query.get("W", [""])[0]
        if kind == "pendingTrades" and self.moves:
            # MFL's shape with none left
            return json.dumps({"pendingTrades": {"pendingTrade": self.trades} if self.trades else {}})
        if kind in self.swaps:
            return sample(self.swaps[kind])
        if kind == "rosters" and self.noteam:
            self.noteam -= 1
            rosters = copy.deepcopy(self.rosters)
            rosters["rosters"]["franchise"] = [team for team in rosters["rosters"]["franchise"] if team["id"] != TEAM]
            return json.dumps(rosters)
        if kind == "rosters" and self.moves:
            if self.stale_reads:
                self.stale_reads -= 1
                return json.dumps(self.stale)
            return json.dumps(self.rosters)
        if kind == "weeklyResults":
            name = "weeklyResults-YTD.json" if week == "YTD" else "weeklyResults-W5.json"
        elif kind == "playerScores":
            name = "playerScores-YTD.json"
        elif kind == "myWatchList":
            free = json.loads(sample("freeAgents.json"))["freeAgents"]["leagueUnit"]["player"][:2]
            return json.dumps({"myWatchList": {"player": [{"id": player["id"]} for player in free]}})
        else:
            name = EXPORTS.get(kind, f"{kind}.json")
        return sample(name) if (SAMPLES / name).exists() else json.dumps({"error": {"$t": "not saved"}})

    def handle(self, route):
        request = route.request
        url = urlparse(request.url)
        query = parse_qs(url.query)
        if url.netloc == "bborchardt.github.io":
            path = url.path.replace("/fuadmflsite/", "", 1)
            if path.startswith("data/"):
                return route.fulfill(status=404, body="")
            body = self.site.read(path)
            if body is None:
                return route.fulfill(status=404, body="")
            return route.fulfill(body=body, content_type="text/css" if path.endswith(".css") else "text/javascript")
        if not url.netloc.endswith("myfantasyleague.com"):
            return route.abort()
        # a move: a POST, or a GET naming an ACTION (withdrawing an offer by its revoke link)
        move = request.method == "POST" or "ACTION" in query
        if move:
            body = request.post_data or url.query
            fields = sorted(parse_qs(body, keep_blank_values=True).items()) if "=" in body else body
            self.posts.append({"method": request.method, "url": f"{url.path}?{url.query}" if url.query else url.path, "body": fields})
            if self.moves and request.method == "POST" and url.path.endswith(("/add_drop", "/ir")):
                return self.make(route, url.path, parse_qs(body, keep_blank_values=True))
            if self.moves and url.path.endswith(("/trade_response", "/trade_offer")):
                return self.trade(route, url.path, parse_qs(body, keep_blank_values=True))
            if url.path.endswith("/import"):
                return route.fulfill(content_type="text/xml", body="<status>OK</status>")
            name = self.page_for(url.path, query)
            return route.fulfill(content_type="text/html", body=sample(name) if name else "<html><body></body></html>")
        if url.path.endswith("/export"):
            if self.offline and query.get("TYPE") == ["rosters"]:
                return route.abort()
            return route.fulfill(content_type="application/json", body=self.export(query))
        if "/fflnetdynamic" in url.path:
            name = url.path.rsplit("/", 1)[1]
            if (SAMPLES / name).exists():
                return route.fulfill(content_type="text/plain", body=sample(name))
            if name.endswith(".xml"):
                return route.fulfill(content_type="text/xml", body="<messages></messages>")
            return route.fulfill(status=404, body="")
        if self.moves and url.path.endswith("/options") and query.get("O") in (["257"], ["18"]):
            return route.fulfill(content_type="text/html", body=self.drop_page() if query["O"] == ["257"] else self.ir_page())
        name = self.page_for(url.path, query)
        if name and (SAMPLES / name).exists():
            return route.fulfill(content_type="text/html", body=sample(name))
        # MFL's own scripts the pages need (picker.js, mfl_common.js)
        if url.path.endswith(".js") and (SAMPLES / url.path.rsplit("/", 1)[1]).exists():
            return route.fulfill(body=sample(url.path.rsplit("/", 1)[1]), content_type="text/javascript")
        if url.path.endswith((".js", ".css")):
            return route.fulfill(body="", content_type="text/javascript" if url.path.endswith(".js") else "text/css")
        return route.fulfill(status=404, body="")


def ev(page, script, arg=None):
    """page.evaluate, again after a reload a step caused (a move reloads MFL's page)"""
    for attempt in range(20):
        try:
            return page.evaluate(script, arg)
        except Exception as error:
            if "context was destroyed" not in str(error) and "navigat" not in str(error):
                raise
            page.wait_for_timeout(200)
            try:
                page.wait_for_load_state("load", timeout=5000)
            except Exception:
                pass
    return page.evaluate(script, arg)


def settle(page, timeout=15.0):
    """v2's parts once they've stopped changing for 0.3 s (compared by a hash, the HTML being large)
    and no move is under way: a button saying "Saving…" may wait seconds between reads with nothing
    changing (IR reads the roster back 1.5 s apart)"""
    last, since, start = None, time.time(), time.time()
    while time.time() - start < timeout:
        now = ev(page, f"() => {{ const s = ({SNAPSHOT})(); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (/[A-Z][a-z]+ing…\\s*</.test(s) ? 'busy:' : '') + h + ':' + s.length; }}")
        if now != last:
            last, since = now, time.time()
        elif time.time() - since >= 0.3 and not now.startswith("busy:"):
            break
        page.wait_for_timeout(50)
    return ev(page, SNAPSHOT)


def act(page, step):
    kind, sig, index = step["kind"], step["sig"], step["index"]
    if not ev(page, FIND, [sig, index]):
        return False
    target = page.locator("[data-screens-target]")
    try:
        if kind == "fill":
            target.fill("2 years" if (target.get_attribute("type") or "text") == "text" else "3", timeout=1000)
            # a screen may redraw on input, replacing the field: change goes to it only if it's still there
            ev(page, "() => { const el = document.querySelector('[data-screens-target]'); if (el) el.dispatchEvent(new Event('change', {bubbles: true})); }")
        elif kind == "select":
            values = target.evaluate("(el) => [...el.options].map((o) => o.value)")
            target.select_option(values[1] if len(values) > 1 else values[0], timeout=1000)
        else:
            target.click(timeout=1000)
    except Exception:
        return False
    finally:
        ev(page, "() => document.querySelectorAll('[data-screens-target]').forEach((el) => el.removeAttribute('data-screens-target'))")
    return True


def priority(control):
    """a chain's next step: the screen's own actions first, then other buttons and links, fields last
    (a search typed early empties the lists the rest would use); page order within each"""
    act_name = control["sig"].split("|")[2]
    return 0 if act_name and control["kind"] == "click" else 1 if control["kind"] in ("click", "check") else 2


def open_screen(browser, site, name, width):
    url, swaps = SCREENS[name]
    mfl = Mfl(site, swaps)
    context = browser.new_context(viewport={"width": WIDTHS[width], "height": 1000}, timezone_id="America/Los_Angeles")
    context.clock.set_fixed_time(swaps.get("now", NOW))
    context.add_init_script(INIT)
    if "flash" in swaps:
        # once per chain: a reload a step causes leaves storage as the page left it
        key, value = swaps["flash"]
        context.add_init_script(f"""if (!sessionStorage.getItem('screens.planted')) {{
            sessionStorage.setItem('screens.planted', '1'); sessionStorage.setItem({json.dumps(key)}, {json.dumps(json.dumps(value))}); }}""")
    context.route("**/*", mfl.handle)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(HOST + url)
    return context, page, mfl, errors


def explore(job):
    """One screen at one width, for one version (`ref` None: the working copy): what it first shows,
    then from each of its controls (the first PER_KIND of each kind) a chain of up to CHAIN steps in
    one page, each step a kind of control the chain hasn't used yet, by `priority`."""
    ref, name, width = job
    site = Site(ref)
    out = {}
    start = time.time()
    label = lambda path: f"{name} {width} " + " > ".join(f"{s['sig']}#{s['index']}" for s in path)
    with sync_playwright() as p:
        # every request is answered by the route; this stops the connections Chromium opens itself
        # (a page's preconnect links) from reaching anything
        browser = p.chromium.launch(headless=True, args=["--host-resolver-rules=MAP * ~NOTFOUND"])
        context, page, mfl, errors = open_screen(browser, site, name, width)
        out[label([])] = {"html": settle(page), "posts": [], "errors": list(errors)}
        firsts = [c for c in ev(page, CONTROLS) if c["index"] < PER_KIND]
        context.close()
        for seed in SEEDS.get(name, []) + [[first] for first in firsts]:
            context, page, mfl, errors = open_screen(browser, site, name, width)
            settle(page)
            path, used = [], set()
            for wanted in seed:
                if isinstance(wanted, tuple):
                    act_name, side, n = wanted
                    named = [c for c in ev(page, CONTROLS) if c["sig"].split("|")[2] == act_name and c["sig"].split("|")[5] == side]
                    wanted = named[n] if named else None
                elif isinstance(wanted, str):
                    # the first with that action whose kind the path hasn't used, else one it hasn't
                    # used, else the first (a step's Next is the same control on the next screen)
                    taken = {(s["sig"], s["index"]) for s in path}
                    named = [c for c in ev(page, CONTROLS) if c["sig"].split("|")[2] == wanted]
                    wanted = next((c for c in named if c["sig"] not in used),
                                  next((c for c in named if (c["sig"], c["index"]) not in taken), named[0] if named else None))
                if wanted and act(page, wanted):
                    path.append(wanted)
                    used.add(wanted["sig"])
                    out[label(path)] = {"html": settle(page), "posts": list(mfl.posts), "errors": list(errors)}
                elif not path and isinstance(seed[0], dict):
                    out[label([wanted])] = {"html": None, "posts": [], "errors": list(errors)}
            limit = len(path) + CHAIN - 1
            step = next((c for c in sorted(ev(page, CONTROLS), key=priority) if c["sig"] not in used), None) if path else None
            while step and len(path) < limit:
                used.add(step["sig"])
                if act(page, step):
                    path.append(step)
                    out[label(path)] = {"html": settle(page), "posts": list(mfl.posts), "errors": list(errors)}
                elif not path:
                    out[label([step])] = {"html": None, "posts": [], "errors": list(errors)}
                    break
                step = next((c for c in sorted(ev(page, CONTROLS), key=priority) if c["sig"] not in used), None)
            context.close()
        browser.close()
    return job, out, time.time() - start


def record(refs, only=None):
    """{ref: {step: result}} for each ref, every screen and width, in parallel"""
    jobs = [(ref, name, width) for ref in refs for name in SCREENS if not only or name in only for width in WIDTHS]
    found = {ref: {} for ref in refs}
    with ProcessPoolExecutor(WORKERS) as pool:
        for (ref, name, width), out, seconds in pool.map(explore, jobs):
            found[ref].update(out)
            print(f"{ref or 'working copy'}: {name} {width}, {len(out)} steps, {seconds:.0f}s", flush=True)
    return found


# as the browser draws it: a run of whitespace is one space (v2 has no <pre>)
def drawn(html):
    return re.sub(r"\s+", " ", html or "")


def compare(base, head):
    differ = 0
    for key in sorted(set(base) | set(head)):
        a, b = base.get(key), head.get(key)
        if a is None or b is None:
            differ += 1
            print(f"\n## {key}: only in {'head' if a is None else 'base'}")
            continue
        for part in ["html", "posts", "errors"]:
            if (drawn(a[part]) != drawn(b[part])) if part == "html" else a[part] != b[part]:
                differ += 1
                print(f"\n## {key}: {part} differs")
                left = a[part] if isinstance(a[part], str) else json.dumps(a[part], indent=1)
                right = b[part] if isinstance(b[part], str) else json.dumps(b[part], indent=1)
                left = re.sub(r">\s*<", ">\n<", left or "").splitlines()
                right = re.sub(r">\s*<", ">\n<", right or "").splitlines()
                print("\n".join(list(difflib.unified_diff(left, right, "base", "head", n=1, lineterm=""))[:40]))
    errors = sorted({e for r in head.values() for e in r["errors"]})
    print(f"\n{len(head)} steps, {differ} differences" + (f"; page errors in head: {errors}" if errors else ""))
    return differ


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    c = sub.add_parser("compare")
    c.add_argument("--base", default="master")
    c.add_argument("--only")
    c.add_argument("--built", action="store_true", help="the working copy as Pages publishes it, bundled")
    r = sub.add_parser("record")
    r.add_argument("out")
    r.add_argument("--ref")
    r.add_argument("--only")
    args = parser.parse_args()
    only = set(args.only.split(",")) if args.only else None
    if only and only - set(SCREENS):
        parser.error(f"no such screen: {', '.join(sorted(only - set(SCREENS)))} (screens: {', '.join(SCREENS)})")
    if args.command == "record":
        Path(args.out).write_text(json.dumps(record([args.ref], only)[args.ref], indent=1))
        return
    head = build_working_copy() if args.built else None
    found = record([args.base, head], only)
    print(f"base: {args.base}, head: the working copy{', built' if args.built else ''}")
    sys.exit(1 if compare(found[args.base], found[head]) else 0)


if __name__ == "__main__":
    main()
