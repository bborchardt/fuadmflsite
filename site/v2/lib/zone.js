// The league's time zone (settings.json), as MFL's own pages show times: in the zone set on MFL,
// labelled with its abbreviation ("CT").

import settings from "./settings.js";

const ZONES = {ET: "America/New_York", CT: "America/Chicago", MT: "America/Denver", PT: "America/Los_Angeles"};
export const ZONE = settings.timeZone;
export const TIME_ZONE = ZONES[ZONE];

// the zone's offset from UTC at a moment, in seconds (−18000 in Central daylight time)
export function zoneOffset(seconds) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {timeZone: TIME_ZONE, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric"})
        .formatToParts(new Date(seconds * 1000)).map((part) => [part.type, Number(part.value)]));
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute) / 1000 - Math.floor(seconds / 60) * 60;
}
