// Reads MFL's player page (`player?L=…&P=…`) and news article page (`view_news_article`), which
// hold in one request each what the player popup shows. If MFL changes their markup, the reader
// returns null and the popup leaves the player to MFL's own.

export const NFL_TEAMS = {
    ARI: "Arizona Cardinals", ATL: "Atlanta Falcons", BAL: "Baltimore Ravens", BUF: "Buffalo Bills",
    CAR: "Carolina Panthers", CHI: "Chicago Bears", CIN: "Cincinnati Bengals", CLE: "Cleveland Browns",
    DAL: "Dallas Cowboys", DEN: "Denver Broncos", DET: "Detroit Lions", GBP: "Green Bay Packers",
    HOU: "Houston Texans", IND: "Indianapolis Colts", JAC: "Jacksonville Jaguars", KCC: "Kansas City Chiefs",
    LAC: "Los Angeles Chargers", LAR: "Los Angeles Rams", LVR: "Las Vegas Raiders", MIA: "Miami Dolphins",
    MIN: "Minnesota Vikings", NEP: "New England Patriots", NOS: "New Orleans Saints", NYG: "New York Giants",
    NYJ: "New York Jets", PHI: "Philadelphia Eagles", PIT: "Pittsburgh Steelers", SEA: "Seattle Seahawks",
    SFO: "San Francisco 49ers", TBB: "Tampa Bay Buccaneers", TEN: "Tennessee Titans", WAS: "Washington Commanders",
    FA: "Free agent"
};

// MFL's one-letter marks in the weekly status column
const MARKS = {O: "Out", D: "Doubtful", Q: "Questionable", IR: "IR", S: "Suspended"};

const ENTITIES = {amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", mdash: "—", ndash: "–"};

export function text(markup) {
    return String(markup || "")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]*>/g, "")
        .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code) => {
            if (code[0] === "#") {
                const number = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
                return Number.isFinite(number) ? String.fromCodePoint(number) : whole;
            }
            return code.toLowerCase() in ENTITIES ? ENTITIES[code.toLowerCase()] : whole;
        })
        .replace(/\s+/g, " ")
        .trim();
}

// "Jackson, Lamar" → "Lamar Jackson"
export function displayName(mflName) {
    const [last, first] = String(mflName).split(",").map((part) => part.trim());
    return first ? `${first} ${last}` : last;
}

// the table whose class or id contains `marker`, up to its end
function table(html, marker) {
    const at = html.indexOf(marker);
    if (at < 0) {
        return "";
    }
    const start = html.lastIndexOf("<table", at);
    const end = html.indexOf("</table>", at);
    return end < 0 ? "" : html.slice(start, end);
}

// the value cell of each "Label:" row
function labelled(markup) {
    const values = {};
    for (const row of markup.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
        const label = row.match(/<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
        if (label) {
            values[text(label[1]).replace(/:.*$/, "")] = text(label[2]);
        }
    }
    return values;
}

const cells = (row) => (row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || []).map((cell) => text(cell));

function weeks(markup) {
    const rows = [];
    let total = null;
    for (const row of markup.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || []) {
        if (!/<td class="week">/i.test(row)) {
            continue;
        }
        const [week, points, opponent, , , status = ""] = cells(row);
        if (/^Total/i.test(week)) {
            total = points ? Number(points) : null;
            continue;
        }
        if (!/^\d+$/.test(week)) {
            continue;
        }
        const mark = (status.match(/\(\s*([A-Z]+)\s*\)\s*$/) || [])[1];
        rows.push({
            week: Number(week),
            points: points === "" ? null : Number(points),
            opponent: opponent.replace(/^at /, "@ "),
            bye: /^bye$/i.test(opponent),
            started: / - S\b/.test(status),
            mark: mark ? MARKS[mark] || mark : null
        });
    }
    return {rows, total};
}

// "6'2\" / 205lbs" → "6′2″ · 205 lbs"
function size(value) {
    const match = String(value || "").match(/(\d+)'\s*(\d+)"?\s*\/\s*(\d+)\s*lbs/i);
    return match ? `${match[1]}′${match[2]}″ · ${match[3]} lbs` : value || "";
}

// "Out (Ankle)" → {status: "Out", detail: "Ankle"}
function injury(value) {
    const match = String(value || "").match(/^([^()]+?)\s*(?:\((.*)\))?$/);
    return match && match[1] && !/^(none|healthy|-)$/i.test(match[1]) ? {status: match[1], detail: match[2] || ""} : null;
}

// the owning team's name as MFL's team list has it ("The Obliterators " there, with a space), or ""
// for a free agent, whom MFL lists as "FA (Locked)" or the like with the contract he was dropped with
export function ownerOf(owner, teamNames) {
    return teamNames.find((name) => name.trim() === String(owner || "").trim()) || "";
}

// The id of the team holding a player, or null: from the rosters (`holders`, player id → team id)
// when they could be read, since the player page's owner line doesn't always match a team's name
// (Smooth City Styles! didn't for a logged-in member); else from that line. `teamNames` maps ids
// to names.
export function holderOf(player, holders, teamNames) {
    if (holders) {
        return holders.get(player.id) || null;
    }
    const named = ownerOf(player.owner, [...teamNames.values()]);
    return named ? ([...teamNames].find(([, name]) => name === named) || [])[0] || null : null;
}

// null when the page isn't a player page MFL still draws the way this expects
export function readPlayerPage(html) {
    const bio = labelled(table(html, "biography report"));
    const heading = html.match(/<h3>([^<:]+?)\s+([A-Z]{2,3})\s+([A-Z]{1,3}):Profile/);
    const stats = table(html, 'id="player_stats_table"');
    if (!heading || !("Height/Weight" in bio)) {
        return null;
    }
    // the Player Status table comes second, also with class "biography report"
    const second = html.indexOf("biography report", html.indexOf("biography report") + 1);
    const status = second > 0 ? labelled(table(html.slice(second - 200), "biography report")) : {};
    const news = (table(html, "bionews report").match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [])
        .map((row) => row.match(/view_news_article\?[^"]*ID=([^"&]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<td class="timestamp">([\s\S]*?)<\/td>/i))
        .filter(Boolean)
        .map(([, id, headline, published]) => ({id: text(id), headline: text(headline), published: text(published)}));
    const [dob, age] = String(bio["DOB/Age"] || "").split("/").map((part) => part.trim());
    const drafted = String(bio.Drafted || "").split("/").map((part) => part.trim()).filter(Boolean);
    const owner = String(status["League Status"] || "").replace(/\s+-\s+N?S$/, "");
    const salary = (String(status.Salary || "").match(/\$?([\d.]+)/) || [])[1];
    const years = (String(status["Contract Year"] || "").match(/\d+/) || [])[0];
    return {
        name: displayName(heading[1]),
        team: heading[2],
        position: heading[3],
        jersey: bio["Jersey Num"] || "",
        bio: {
            age: age ? Number(age) : null,
            born: dob || "",
            size: size(bio["Height/Weight"]),
            college: bio.College || "",
            // "2018 / / Round 1, Pick 32": the year, then the round and pick
            drafted: drafted.length ? {year: drafted[0], pick: drafted.slice(1).join(" · ").replace(/Round (\d+), Pick (\d+)/i, "round $1, pick $2")} : null,
            experience: (String(bio.Experience || "").match(/\d+/) || [])[0] || ""
        },
        owner,
        injury: injury(status["Injury Status"]),
        expectedReturn: status["Expected Return"] || "",
        bye: status["Bye Week"] || "",
        salary: salary === undefined ? null : Number(salary),
        years: years === undefined ? null : Number(years),
        news,
        ...weeks(stats)
    };
}

// {published, source, update, analysis}, or null
export function readArticle(html) {
    const published = html.match(/<th>Published ([^<]+)<\/th>/);
    const cell = html.match(/<tr class="oddtablerow"><td valign=top>([\s\S]*?)<\/td>/);
    if (!published || !cell) {
        return null;
    }
    const body = cell[1];
    const source = (body.match(/^\s*\(<a[^>]*>([^<]+)<\/a>\)/) || [])[1] || "";
    const split = body.search(/<p><b>Analysis:<\/b>/i);
    const update = text((split < 0 ? body : body.slice(0, split)).replace(/^\s*\(<a[^>]*>[^<]+<\/a>\)/, "").replace(/\(<a[^>]*>Article Link<\/a>\)[\s\S]*$/i, ""));
    const analysis = split < 0 ? "" : text(body.slice(split).replace(/<b>Analysis:<\/b>/i, "").replace(/\(<a[^>]*>Article Link<\/a>\)[\s\S]*$/i, ""));
    return {published: text(published[1]), source: text(source), update, analysis};
}
