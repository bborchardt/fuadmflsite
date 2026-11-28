// MFL's calendar as Home's dates and Add's banner read it: its weekly waiver locks and blind bid
// runs. No DOM or fetching, so it's checked on saved exports.

import {asArray} from "../lib/mfl.js";
import {zoneOffset} from "../lib/zone.js";

const DAY = 24 * 60 * 60;

// `weeks` after `first` at the same clock time in the league's zone: MFL's weekly runs stay at
// 11 p.m. when daylight time ends
const weeksLater = (first, weeks) => {
    const plain = first + weeks * 7 * DAY;
    return plain + zoneOffset(first) - zoneOffset(plain);
};

// MFL's weekly calendar events with a time: `happens` is how many weeks one repeats after the first
export const weeklyEvents = (calendar, types) => asArray(calendar && calendar.event).filter((event) => types.includes(event.type) && Number(event.start_time) > 1e9);
const lastRun = (event) => weeksLater(Number(event.start_time), Number(event.happens) || 0);

// Free agency ends with the last time free agents go on waivers, or the last bid run after it;
// null without a waiver lock on the calendar
export function freeAgencyEnd(calendar) {
    const waivers = weeklyEvents(calendar, ["WAIVER_LOCK", "WAIVER_BBID"]);
    return waivers.some((event) => event.type === "WAIVER_LOCK") ? Math.max(...waivers.map(lastRun)) : null;
}

// The first time after `now` of an event repeated weekly from `first`, `repeats` times after it;
// null once the last has passed
export function weeklyAfter(first, now, repeats) {
    let weeks = Math.max(0, Math.floor((now - first) / (7 * DAY)));
    for (;;) {
        if (weeks > repeats) {
            return null;
        }
        const at = weeksLater(first, weeks);
        if (at > now) {
            return at;
        }
        weeks += 1;
    }
}

// MFL's weekly event of a type after `now`, each repeated weekly as often as it says
export function nextWeekly(calendar, type, now) {
    const next = weeklyEvents(calendar, [type]).map((event) => weeklyAfter(Number(event.start_time), now, Number(event.happens) || 0)).filter(Boolean);
    return next.length ? Math.min(...next) : null;
}

// the last blind bid run on the calendar, null without one
export function lastBidRun(calendar) {
    const runs = weeklyEvents(calendar, ["WAIVER_BBID"]);
    return runs.length ? Math.max(...runs.map(lastRun)) : null;
}

// MFL's next blind bid run
export const nextBidRun = (calendar, now) => nextWeekly(calendar, "WAIVER_BBID", now);
