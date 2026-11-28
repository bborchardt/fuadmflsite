// A chore's context as jobs/daily.mjs makes it (jobs/chore-context.mjs), with v2's lib and the real
// session, but MFL answered from `exports` and `pages` here: nothing leaves the machine.
//   exports  {TYPE or "TYPE:W": section body}; a number in place of a body is an HTTP status
//   pages    {"/2026/path?query": html}
// Every request is in `requests`, every line the run printed in `printed`, and its chore log and flags
// in `run` (jobs/run-log.mjs). `cleanUp()` removes the league-data folders made.

import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {choreContext, loadLib} from "../../jobs/chore-context.mjs";
import {mflSession} from "../../jobs/mfl-session.mjs";
import {runLog} from "../../jobs/run-log.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const lib = await loadLib(root, "v2");
export const HOST = "https://www44.myfantasyleague.com";
const made = [];
export const cleanUp = () => made.splice(0).forEach((dir) => rmSync(dir, {recursive: true, force: true}));

export function testContext({exports = {}, pages = {}, config = {}} = {}) {
    const requests = [];
    const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {"Content-Type": "application/json"}});
    const fetchImpl = async (input, init = {}) => {
        const url = new URL(String(input));
        requests.push({url: String(input), method: init.method || "GET", body: init.body ? String(init.body) : null});
        if (url.pathname.endsWith("/import")) {
            return new Response("<status>OK</status>");
        }
        if (url.pathname.endsWith("/export")) {
            const type = url.searchParams.get("TYPE");
            const keyed = url.searchParams.get("W");
            const params = Object.fromEntries([...url.searchParams].filter(([key]) => !["TYPE", "JSON"].includes(key)));
            const body = `${type}:${keyed}` in exports ? exports[`${type}:${keyed}`] : exports[type];
            if (typeof body === "number") {
                return json({}, body);
            }
            return body === undefined ? json({error: `no ${type} here`}) : json({[lib.mfl.exportSection(type, params)]: body});
        }
        const html = pages[url.pathname + url.search];
        return html === undefined ? new Response("not here", {status: 404}) : new Response(html);
    };
    const printed = [];
    const run = runLog({print: (line) => printed.push(line)});
    const dataDir = mkdtempSync(join(tmpdir(), "fuad-chore-"));
    made.push(dataDir);
    const session = mflSession({lib, host: HOST, leagueId: "48571", userAgent: "test", log: run.log, fetchImpl, sleep: async () => {}, spacing: 0});
    session.headers.Cookie = "MFL_USER_ID=test";
    const ctx = choreContext({lib, session, run, config: {
        dryRun: false, now: new Date("2026-10-24T12:00:00Z"), season: 2026, host: HOST, leagueId: "48571",
        dataDir, dataIsThisLeagues: true, loggedIn: true, version: "v2",
        apply: {dropPenalties: false, contractYears: false, payouts: false, rfaSalaries: false, backups: false}, backupsOff: false,
        userAgent: "test", repo: "", repoName: "", pagesData: "https://example.invalid/data/",
        savedPagesDir: null, savePages: false, dataLeagueId: "", checkOff: false,
        ...config
    }});
    // what was sent to MFL's import, as its fields
    const imports = () => requests.filter((request) => request.method === "POST" && request.url.endsWith("/import"))
        .map((request) => Object.fromEntries(new URLSearchParams(request.body)));
    return {ctx, run, printed, requests, imports};
}
