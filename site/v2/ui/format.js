// How v2 writes amounts, counts and times, the same on every screen

import {cents} from "../lib/payouts.js";
import {TIME_ZONE, zoneLabel} from "../lib/zone.js";

export {cents, ordinal} from "../lib/payouts.js";

// "$12", "$12.50", "$0.01"
export function money(amount) {
    const value = cents(Number(amount));
    return `$${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

// "12.5" to `digits` places; "—" for a number not known (NaN: lib/mfl.js numberOf)
export const figure = (value, digits = 0) => (typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—");

// cap used within this many dollars of the cap reads as tight (Rosters, Moves)
export const CAP_TIGHT = 10;

export const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;


// a time's "p.m." kept with it, where a narrow column breaks a line: "Sun 12:00\u00a0p.m."
export const oneLineTimes = (text) => String(text).replace(/\b(\d{1,2}:\d{2}) ([ap]\.m\.)/g, "$1\u00a0$2");

// a contract's length: "1 yr", "3 yrs"
export const yearsText = (years) => `${years} yr${years === 1 ? "" : "s"}`;

// "Thu Oct 8"
export const dayText = (seconds) => new Date(seconds * 1000).toLocaleDateString("en-US", {weekday: "short", month: "short", day: "numeric", timeZone: TIME_ZONE}).replace(",", "");
// "7:42 p.m.", or "7:42 p.m. CT" where the device's clock differs
export const clock = (seconds) => new Date(seconds * 1000).toLocaleTimeString("en-US", {hour: "numeric", minute: "2-digit", timeZone: TIME_ZONE})
    .replace(/\s?AM$/, " a.m.").replace(/\s?PM$/, " p.m.") + zoneLabel(seconds);
// "Thu Oct 8, 7:42 p.m."
export const whenText = (seconds) => `${dayText(seconds)}, ${clock(seconds)}`;
// "Sun 7:42 p.m."
export const weekdayClock = (seconds) => `${new Date(seconds * 1000).toLocaleDateString("en-US", {weekday: "short", timeZone: TIME_ZONE})} ${clock(seconds)}`;
