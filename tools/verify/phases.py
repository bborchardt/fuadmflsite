#!/usr/bin/env python3
"""Check that a change to v2 leaves what each view shows, through the season, as it was, without asking
MFL anything.

    uv run --no-project --with playwright python tools/verify/phases.py [--base master] [--only early,playoffs] [--built]

Each of v2's views is drawn at phone and desktop widths on nine dates of the league's year, on --base
(a git ref) and on the working copy, and every view whose HTML differs is listed, as screens.py
compare does for one date. MFL's answers are screens.py's saved clone samples, reshaped for the date:

    early         Apr 15     MFL hasn't published the NFL schedule
    before-draft  Jul 20
    draft-day     Sep 6      7 p.m., the rookie draft's picks not in
    before-cut    Sep 7      3 p.m., picks in, before the 11:45 p.m. cut-down
    preseason     Sep 8
    season        Oct 17     week 6, the saved samples as they are
    deadline      Dec 2      week 13
    playoffs      Dec 22     week 16
    over          Jan 10     2027

Before week 1 the rosters are as after the commissioner's rollover (a year off every contract, the
expiring players RFAs at $0.01), the standings and results a new season's, and last season's come
from screens/2025/. Live scoring's feeds for any week are week 6's. From before-cut, team 0001 has four draft-day players at 0 years and a pending
bid. A request no sample answers, or an error on the page, also fails the run: a new date may ask
for something the samples don't have.
"""
import argparse
import importlib.util
import json
import re
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
SAMPLES = HERE / "screens"
PAST = SAMPLES / "2025"

_spec = importlib.util.spec_from_file_location("screens_harness", HERE / "screens.py")
harness = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(harness)

TEAM = "0001"
# clock (Central), MFL's liveScoringWeek and completedWeek, whether the rookie draft's picks are in,
# whether MFL has published the NFL schedule
PHASES = {
    "early": ("2026-04-15T12:00:00-05:00", 1, 0, False, False),
    "before-draft": ("2026-07-20T12:00:00-05:00", 1, 0, False, True),
    "draft-day": ("2026-09-06T19:00:00-05:00", 1, 0, False, True),
    "before-cut": ("2026-09-07T15:00:00-05:00", 1, 0, True, True),
    "preseason": ("2026-09-08T12:00:00-05:00", 1, 0, True, True),
    "season": ("2026-10-17T10:00:00-05:00", 6, 5, True, True),
    "deadline": ("2026-12-02T12:00:00-06:00", 13, 12, True, True),
    "playoffs": ("2026-12-22T12:00:00-06:00", 16, 15, True, True),
    "over": ("2027-01-10T12:00:00-06:00", 17, 17, True, True),
}
L = harness.LEAGUE
VIEWS = {
    "home": f"/2026/home/{L}#home-page",
    "lineup": f"/2026/lineup?L={L}",
    "add": f"/2026/add_drop?L={L}",
    "drop": f"/2026/options?L={L}&O=257",
    "trades": f"/2026/options?L={L}&O=05",
    "ir": f"/2026/options?L={L}&O=18",
    **{v: f"/2026/home/{L}#league-{v}" for v in ["scores", "standings", "power", "winners"]},
    **{f"rosters-{v}": f"/2026/home/{L}#rosters-{v}" for v in ["my-team", "teams", "players", "draft"]},
    "rosters-team": f"/2026/home/{L}#rosters-teams/0002",
}
# MFL's own scripts that aren't saved, and the images no sample has
NOISE = ("FusionCharts", "show_tab is not defined")


def load(path):
    return json.loads(Path(path).read_text())


class Phase:
    """MFL's exports as they'd be on the phase's date"""

    def __init__(self, name):
        self.clock, self.week, self.completed, self.drafted, self.published = PHASES[name]
        self.before = self.week == 1
        free = load(SAMPLES / "freeAgents.json")["freeAgents"]["leagueUnit"]["player"]
        self.fa_ids = [player["id"] for player in free]
        self.draft_day = self.fa_ids[:4]

    def rosters(self):
        found = load(SAMPLES / "rosters.json")
        if not self.before:
            return found
        # the commissioner's rollover: a year off every contract; 1 → 0 years at $0.01 (RFAs)
        for team in found["rosters"]["franchise"]:
            for player in team["player"]:
                years = int(player.get("contractYear") or 0) - 1
                player["contractYear"] = str(max(years, 0))
                if years <= 0:
                    player["salary"] = "0.01"
        if self.drafted:
            mine = next(team for team in found["rosters"]["franchise"] if team["id"] == TEAM)
            # this draft's rookies have no length yet either
            rookies = {pick["player"] for pick in load(SAMPLES / "draftResults.json")["draftResults"]["draftUnit"]["draftPick"] if pick["franchise"] == TEAM}
            for player in mine["player"]:
                if player["id"] in rookies:
                    player["contractYear"] = "0"
            for salary, id_ in zip([12, 5, 2, 1], self.draft_day):
                mine["player"].append({"id": id_, "status": "ROSTER", "salary": str(salary), "contractYear": "0"})
        return found

    def free_agents(self):
        found = load(SAMPLES / "freeAgents.json")
        if self.before and self.drafted:
            unit = found["freeAgents"]["leagueUnit"]
            unit["player"] = [player for player in unit["player"] if player["id"] not in self.draft_day]
        return found

    def draft_results(self):
        found = load(SAMPLES / "draftResults.json")
        if not self.drafted:
            for pick in found["draftResults"]["draftUnit"]["draftPick"]:
                pick["player"], pick["timestamp"], pick["comments"] = "", "", ""
        return found

    def pending_waivers(self):
        if self.before and self.drafted:
            return {"pendingWaivers": {"blindBidWaiverRequest": {"round": "1", "addsDrops": f"{self.fa_ids[10]}_3_0000", "comments": "1 year", "timestamp": "1788900000"}}}
        return {"pendingWaivers": {}} if self.before else load(SAMPLES / "pendingWaivers.json")

    def nfl_schedule(self, week):
        if not self.published or not week.isdigit() or not 1 <= int(week) <= 18:
            return None
        found = load(SAMPLES / "nflSchedule-W6.json")
        found["nflSchedule"]["week"] = week
        for matchup in found["nflSchedule"]["matchup"]:
            matchup["kickoff"] = str(int(matchup["kickoff"]) + (int(week) - 6) * 7 * 86400)
        return found

    def unplayed(self):
        """a new season's results: week 1's matchups, none scored"""
        found = load(SAMPLES / "weeklyResults-W5.json")
        found["weeklyResults"]["week"] = "1"
        for matchup in found["weeklyResults"]["matchup"]:
            for team in matchup["franchise"]:
                for key in ("score", "opt_pts", "result"):
                    team.pop(key, None)
        return found

    def weekly_results(self, week):
        if self.before:
            return {"allWeeklyResults": {"weeklyResults": [self.unplayed()["weeklyResults"]]}} if week == "YTD" else self.unplayed()
        return load(SAMPLES / ("weeklyResults-YTD.json" if week == "YTD" else "weeklyResults-W5.json"))

    def live_scoring(self):
        found = load(SAMPLES / "liveScoring-W6.json")
        if self.before:
            for matchup in found["liveScoring"]["matchup"]:
                for team in matchup["franchise"]:
                    team["score"] = "0"
                    for player in team.get("players", {}).get("player", []):
                        player["score"] = "0"
        return found

    def export(self, year, query):
        """the export's answer, or None if no sample has it"""
        kind = query.get("TYPE", [""])[0]
        week = query.get("W", [""])[0]
        if year not in ("2025", "2026"):
            return None
        if year == "2025":
            if kind == "playoffBracket":
                return load(PAST / f"playoffBracket-{query.get('BRACKET_ID', ['1'])[0]}.json")
            # no 2025 points are saved: this season's stand in
            name = {"weeklyResults": "weeklyResults-YTD.json"}.get(kind, f"{kind}.json")
            return load(SAMPLES / "playerScores-YTD.json") if kind == "playerScores" else load(PAST / name) if (PAST / name).exists() else None
        if kind == "playoffBracket":
            return None if self.before else load(PAST / f"playoffBracket-{query.get('BRACKET_ID', ['1'])[0]}.json")
        special = {"rosters": self.rosters, "freeAgents": self.free_agents, "draftResults": self.draft_results,
                   "pendingWaivers": self.pending_waivers, "liveScoring": self.live_scoring,
                   "leagueStandings": lambda: load(SAMPLES / ("leagueStandings-new.json" if self.before else "leagueStandings.json")),
                   "transactions": lambda: {"transactions": {}} if self.before else load(SAMPLES / "transactions.json"),
                   "playerScores": lambda: {"playerScores": {}} if self.before else load(SAMPLES / "playerScores-YTD.json")}
        if kind == "nflSchedule":
            return self.nfl_schedule(week)
        if kind == "weeklyResults":
            return self.weekly_results(week)
        if kind in special:
            return special[kind]()
        return None


class Phased(harness.Mfl):
    """screens.py's answers, with the exports reshaped for the phase, MFL's week on its pages set to
    the phase's, and every request no sample answers noted"""

    def __init__(self, site, phase):
        super().__init__(site, {})
        self.phase = Phase(phase)
        self.missed = []

    def handle(self, route):
        url = urlparse(route.request.url)
        query = parse_qs(url.query)
        year = (re.match(r"^/(\d{4})/", url.path) or [None, "2026"])[1]
        if url.netloc.endswith("myfantasyleague.com") and url.path.endswith("/export"):
            body = self.phase.export(year, query)
            if body is None and year == "2026" and query.get("TYPE") != ["nflSchedule"]:
                body = json.loads(super().export(query))
            if body is None and query.get("TYPE") == ["nflSchedule"] and year == "2026" and not self.phase.published:
                # what MFL answers before it publishes the season's schedule
                return route.fulfill(status=404, content_type="application/json", body=json.dumps({"error": {"$t": "no schedule"}}))
            if body is None or "error" in body:
                self.missed.append(f"export {year} {query.get('TYPE', [''])[0]}{' W=' + query['W'][0] if 'W' in query else ''}")
                return route.fulfill(content_type="application/json", body=json.dumps({"error": {"$t": "not saved"}}))
            return route.fulfill(content_type="application/json", body=json.dumps(body))
        # live scoring's feeds for the phase's week: week 6's stand in, as its exports do
        feed = re.search(r"/(live_(?:stats|proj))_(\d+)\.txt$", url.path)
        if feed and (SAMPLES / f"{feed[1]}_06.txt").exists():
            return route.fulfill(content_type="text/plain", body=(SAMPLES / f"{feed[1]}_06.txt").read_text())
        if year == "2025" and url.path.endswith("/options") and query.get("O") == ["101"]:
            return route.fulfill(content_type="text/html", body=(PAST / "power-O101.html").read_text())
        # the samples are 2026's: another season's page would be answered with this one's
        if year != "2026" and url.netloc.endswith("myfantasyleague.com") and re.match(r"^/\d{4}/", url.path):
            self.missed.append(f"{route.request.method} {url.path}?{url.query}")
            return route.fulfill(status=404, body="")
        return super().handle(Weeked(route, self))


class Weeked:
    """a route whose HTML answer carries the phase's week, and whose unanswered requests are noted"""

    def __init__(self, route, mfl):
        self.route, self.mfl, self.request = route, mfl, route.request

    def fulfill(self, **answer):
        if answer.get("content_type") == "text/html" and isinstance(answer.get("body"), str):
            body = re.sub(r"liveScoringWeek\s*=\s*\d+;", f"liveScoringWeek = {self.mfl.phase.week};", answer["body"])
            answer["body"] = re.sub(r"completedWeek\s*=\s*\d+;", f"completedWeek = {self.mfl.phase.completed};", body)
        # the site's own files are the working copy's or the base's; only MFL's answers are samples
        if answer.get("status") == 404 and "myfantasyleague.com" in urlparse(self.request.url).netloc and not re.search(r"\.(png|gif|jpe?g|svg|ico)$", urlparse(self.request.url).path):
            self.mfl.missed.append(f"{self.request.method} {urlparse(self.request.url).path}")
        return self.route.fulfill(**answer)

    def abort(self, *args):
        return self.route.abort(*args)


def draw(job):
    ref, phase, view, width = job
    site = harness.Site(ref)
    mfl = Phased(site, phase)
    with sync_playwright() as playwright:
        browser = playwright.webkit.launch()
        context = browser.new_context(viewport={"width": harness.WIDTHS[width], "height": 1000}, timezone_id="America/Chicago")
        context.clock.set_fixed_time(mfl.phase.clock)
        context.add_init_script(harness.INIT)
        context.route("**/*", mfl.handle)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        # v2's own reports of what it couldn't load or draw; a schedule MFL hasn't published is expected
        expected = "couldn't load nflSchedule" if not mfl.phase.published else None
        page.on("console", lambda message: message.type in ("error", "warning") and message.text.startswith("[fuad]")
                and not (expected and expected in message.text) and errors.append(message.text))
        page.goto(harness.HOST + VIEWS[view])
        html = harness.settle(page)
        browser.close()
    errors = sorted({error for error in errors if not any(noise in error for noise in NOISE)})
    return job, {"html": html, "posts": [], "errors": errors, "missed": sorted(set(mfl.missed))}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base", default="master")
    parser.add_argument("--only", help="phases, comma-separated (default all)")
    parser.add_argument("--built", action="store_true", help="the working copy as Pages publishes it, bundled")
    args = parser.parse_args()
    phases = args.only.split(",") if args.only else list(PHASES)
    if set(phases) - set(PHASES):
        parser.error(f"no such phase: {', '.join(sorted(set(phases) - set(PHASES)))} (phases: {', '.join(PHASES)})")
    head = harness.build_working_copy() if args.built else None
    refs = [args.base, head]
    jobs = [(ref, phase, view, width) for ref in refs for phase in phases for view in VIEWS for width in harness.WIDTHS]
    found = {ref: {} for ref in refs}
    with ProcessPoolExecutor(harness.WORKERS) as pool:
        for (ref, phase, view, width), result in pool.map(draw, jobs):
            found[ref][f"{phase} {view} {width}"] = result
    problems = []
    for key, result in sorted(found[head].items()):
        if result["missed"]:
            problems.append(f"{key}: no sample answers {', '.join(result['missed'])}")
        if result["errors"]:
            problems.append(f"{key}: {result['errors']}")
    differ = harness.compare(found[args.base], found[head])
    print("\n".join(problems))
    print(f"base: {args.base}, head: the working copy{', built' if args.built else ''}; {differ} differences, {len(problems)} problems")
    return 1 if differ or problems else 0


if __name__ == "__main__":
    sys.exit(main())
