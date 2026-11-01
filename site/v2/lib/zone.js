// The league's time zone (settings.json), as MFL's own pages show times: in the zone set on MFL,
// labelled with its abbreviation ("CT").

import settings from "./settings.js";

// the zones MFL's Franchise setup › Customize › Time Zone offers, by the letters it writes after a time
export const ZONES = {ET: "America/New_York", CT: "America/Chicago", MT: "America/Denver", PT: "America/Los_Angeles", AKT: "America/Anchorage", HT: "Pacific/Honolulu", GMT: "UTC"};
export const ZONE = settings.timeZone;
export const TIME_ZONE = ZONES[ZONE];

// the zone's offset from UTC at a moment, in seconds (−18000 in Central daylight time)
export function zoneOffset(seconds, timeZone = TIME_ZONE) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric"})
        .formatToParts(new Date(seconds * 1000)).map((part) => [part.type, Number(part.value)]));
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute) / 1000 - Math.floor(seconds / 60) * 60;
}

// " CT" after a time for a member whose device is on another clock at that moment, so they know the
// league's times aren't theirs; nothing for the rest
export function zoneLabel(seconds, deviceOffset = -new Date(seconds * 1000).getTimezoneOffset() * 60) {
    return deviceOffset === zoneOffset(seconds) ? "" : ` ${ZONE}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// A time as MFL's pages write it, "Thu Oct 22 12:00:00 a.m. ET 2026", in the zone the member picked
// on MFL: the moment, in seconds, of the one the text starts with, or null if it doesn't
export function mflTime(text) {
    const match = /^\s*\w{3} (\w{3}) (\d{1,2}) (\d{1,2}):(\d{2}):(\d{2}) ([ap])\.m\. ([A-Z]+) (\d{4})\b/.exec(String(text));
    const month = match ? MONTHS.indexOf(match[1]) : -1;
    if (month < 0 || !ZONES[match[7]]) {
        return null;
    }
    const hour = Number(match[3]) % 12 + (match[6] === "p" ? 12 : 0);
    const wall = Date.UTC(Number(match[8]), month, Number(match[2]), hour, Number(match[4]), Number(match[5])) / 1000;
    // the offset at the moment itself, which near a change of daylight time differs from the wall time's
    const guess = wall - zoneOffset(wall, ZONES[match[7]]);
    return wall - zoneOffset(guess, ZONES[match[7]]);
}
