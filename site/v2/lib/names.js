// Player names as the readers compare them: the board's posts, bid comments, lineup messages, Add's
// search and the results screen's sheet all match what members typed against MFL's names.

// "Jr.", "III": dropped when comparing, as members write them or not
export const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

// "Núñez" → "Nunez"
export const withoutAccents = (text) => String(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// lower case, without accents or apostrophes, every other run of punctuation a space:
// "D.Booker" → "d booker", "Ja'Marr" → "jamarr"
export function normalize(text) {
    return withoutAccents(text).toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
