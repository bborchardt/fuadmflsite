// How v2 writes amounts and counts, the same on every screen

// to the cent, as MFL keeps salaries ($0.01 for a player whose contract has run out)
export const cents = (amount) => Math.round(amount * 100) / 100;

// "$12", "$12.50", "$0.01"
export function money(amount) {
    const value = cents(Number(amount));
    return `$${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

export const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

export const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;

// a contract's length: "1 yr", "3 yrs"
export const yearsText = (years) => `${years} yr${years === 1 ? "" : "s"}`;
