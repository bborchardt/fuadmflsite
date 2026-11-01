// The settings of the league a page or the daily job is for (docs/settings.md): the defaults, under a
// listed league's own entry. An unlisted league is a test league: the defaults or a listed league's
// values (`extends`), under the settings line in its header, which only the pages can read. A listed
// league ignores that line, so a test league's header pasted into it changes nothing.

import data from "./settings-data.js";

const ZONES = ["ET", "CT", "MT", "PT", "AKT", "HT", "GMT"];
const CHOICES = {timeZone: ZONES, "playoffs.wildcardsBy": ["allPlay", "standings"], draftOrder: ["playoffFinish", "standings"]};
// taken whole: its positions are the ones a league uses
const WHOLE = ["rookieScale.firstPick"];
const LISTS = {
    "payouts.places": (item) => isAmount(item),
    renumberedFranchises: (item) => isObject(item) && typeof item.was === "string" && typeof item.now === "string" && isAmount(item.through)
};

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isAmount = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const has = (object, name) => Object.prototype.hasOwnProperty.call(object, name);

function merged(base, over, path = "") {
    const result = {...base};
    Object.keys(over).forEach((name) => {
        const here = path ? `${path}.${name}` : name;
        result[name] = isObject(over[name]) && isObject(base[name]) && !WHOLE.includes(here) ? merged(base[name], over[name], here) : over[name];
    });
    return result;
}

// why `value` can't be `path`'s, a setting `model` holds an example of; null if it can
function fault(path, value, model) {
    if (LISTS[path]) {
        return Array.isArray(value) && value.every(LISTS[path]) ? null : "isn't a list of the right values";
    }
    if (CHOICES[path] && !CHOICES[path].includes(value)) {
        return `must be one of ${CHOICES[path].join(", ")}`;
    }
    if (WHOLE.includes(path)) {
        return isObject(value) && Object.keys(value).length && Object.values(value).every(isAmount) ? null : "must name each position's amount";
    }
    if (typeof model === "number") {
        return isAmount(value) ? null : "must be a number, 0 or more";
    }
    if (typeof value !== typeof model || Array.isArray(value) !== Array.isArray(model)) {
        return `must be a ${typeof model}`;
    }
    return null;
}

// A header's values that can be used, as {values, changes: [{path, value}], problems: ["path why"]}
function checked(header, base, path = "") {
    const values = {};
    const changes = [];
    const problems = [];
    Object.keys(header).forEach((name) => {
        const here = path ? `${path}.${name}` : name;
        if (!has(base, name)) {
            problems.push(`${here} isn't a setting`);
        } else if (isObject(base[name]) && !WHOLE.includes(here)) {
            if (isObject(header[name])) {
                const inner = checked(header[name], base[name], here);
                values[name] = inner.values;
                changes.push(...inner.changes);
                problems.push(...inner.problems);
            } else {
                problems.push(`${here} must be an object`);
            }
        } else {
            const why = fault(here, header[name], base[name]);
            if (why) {
                problems.push(`${here} ${why}`);
            } else {
                values[name] = header[name];
                changes.push({path: here, value: header[name]});
            }
        }
    });
    return {values, changes, problems};
}

// so what's kept for a test league is dropped when its settings change
function fingerprint(text) {
    let hash = 5381;
    for (let i = 0; i < text.length; i++) {
        hash = (hash * 33 + text.charCodeAt(i)) % 2147483647;
    }
    return hash.toString(36);
}

// {settings, league}: `league` says how they were arrived at. `league.snapshots` is whether the
// published franchise salaries are this league's: they're from the daily job's league, which an
// unrelated test league isn't.
export function resolveSettings({defaults, leagues}, id, header) {
    const listed = id !== undefined && id !== null && has(leagues, String(id));
    if (listed) {
        const settings = merged(defaults, leagues[id]);
        return {settings, league: {id: String(id), listed, test: false, base: null, changes: [], problems: [], snapshots: true, keyId: String(id)}};
    }
    const problems = [];
    let own = {};
    if (header !== undefined && header !== null) {
        if (isObject(header)) {
            own = header;
        } else {
            problems.push("the settings line must be an object");
        }
    }
    const {extends: parent, ...rest} = own;
    let base = null;
    if (parent !== undefined) {
        if (has(leagues, String(parent))) {
            base = String(parent);
        } else {
            problems.push(`extends names ${parent}, which isn't a listed league`);
        }
    }
    const under = base ? merged(defaults, leagues[base]) : defaults;
    const {values, changes, problems: faults} = checked(rest, under);
    const settings = merged(under, values);
    return {
        settings,
        league: {
            id: id === undefined || id === null ? null : String(id),
            listed,
            test: true,
            base,
            baseName: base ? under.wordmark : null,
            changes,
            problems: [...problems, ...faults],
            snapshots: Boolean(base),
            keyId: `${id}-${fingerprint(JSON.stringify(settings))}`
        }
    };
}

// the league a page is for: `location` as window.location, `pageLeague` the page's league_id
export function leagueIdIn(location, pageLeague) {
    return (location.pathname.match(/\/home\/(\d+)/) || [])[1]
        || new URLSearchParams(location.search).get("L")
        || pageLeague;
}

const env = globalThis.process && globalThis.process.env;

const resolved = env
    ? resolveSettings(data, env.MFL_LEAGUE_ID)
    : resolveSettings(data, leagueIdIn(window.location, window.league_id), window.fuadSettings);

export const league = resolved.league;

export default resolved.settings;
