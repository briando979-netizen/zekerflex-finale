// Dutch number input for the calculators: "15,50", "1.200", "€ 3.000,-" → number.
// Kept as text in the form so a half-typed "15," doesn't jump around.

/** Parses a Dutch amount; returns NaN when there is no number in it. */
export function parseNl(raw: string): number {
  let s = raw.replace(/[€\s]/g, "").replace(/,-$/, "");
  if (s.includes(",")) {
    // comma = decimal sign, dots = thousand separators
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  return s === "" ? NaN : Number(s);
}

/** Euros as typed → cents; empty or invalid counts as 0. */
export function centsFrom(raw: string): number {
  const n = parseNl(raw);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Plain number as typed; empty or invalid counts as 0. */
export function numberFrom(raw: string): number {
  const n = parseNl(raw);
  return Number.isFinite(n) ? n : 0;
}

const EURO = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const EURO_ROUND = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export const euroCents = (cents: number) => EURO.format(cents / 100);
export const euroWhole = (cents: number) => EURO_ROUND.format(Math.round(cents / 100));
export const hoursNl = (h: number) => Math.round(h).toLocaleString("nl-NL");
