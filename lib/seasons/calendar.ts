import { easterMonthDay } from "@/lib/time/easter";

// ---------------------------------------------------------------------------
// Seizoensthema's: welk feest is het vandaag in Nederland? Puur (geen Date in
// de logica, alleen kalenderdagen), zodat de server en het voorbeeld in de
// browser precies hetzelfde zeggen. De versiering zelf staat in
// components/seasons; aan/uit per thema in lib/seasons/settings.ts.
// ---------------------------------------------------------------------------

export type SeasonId = "nieuwjaar" | "valentijn" | "carnaval" | "pasen" | "koningsdag" | "halloween" | "sinterklaas" | "kerst" | "oudjaar";
/** A season, or the birthday of whoever is logged in. */
export type ThemeId = SeasonId | "verjaardag";

export interface ThemeInfo {
  id: ThemeId;
  naam: string;
  /** when, in plain words, for the admin list */
  wanneer: string;
  /** the greeting on the small pill */
  groet: string;
  emoji: string;
}

export const THEMES: readonly ThemeInfo[] = [
  { id: "nieuwjaar", naam: "Nieuwjaar", wanneer: "1 en 2 januari, met vuurwerk", groet: "Gelukkig nieuwjaar!", emoji: "🎆" },
  { id: "valentijn", naam: "Valentijnsdag", wanneer: "14 februari", groet: "Fijne Valentijnsdag!", emoji: "❤️" },
  { id: "carnaval", naam: "Carnaval", wanneer: "zondag tot en met dinsdag voor Aswoensdag", groet: "Fijne carnaval!", emoji: "🎉" },
  { id: "pasen", naam: "Pasen", wanneer: "Goede Vrijdag tot en met tweede paasdag", groet: "Vrolijk Pasen!", emoji: "🐣" },
  { id: "koningsdag", naam: "Koningsdag", wanneer: "27 april (26 april als dat een zondag is)", groet: "Fijne Koningsdag!", emoji: "🧡" },
  { id: "halloween", naam: "Halloween", wanneer: "29 tot en met 31 oktober", groet: "Fijne Halloween!", emoji: "🎃" },
  { id: "sinterklaas", naam: "Sinterklaas", wanneer: "1 tot en met 5 december", groet: "Fijne Sinterklaas!", emoji: "🎁" },
  { id: "kerst", naam: "Kerst", wanneer: "20 tot en met 26 december", groet: "Fijne feestdagen!", emoji: "🎄" },
  { id: "oudjaar", naam: "Oudjaarsdag", wanneer: "31 december, met aftellen tot middernacht", groet: "Nog even, dan is het nieuwjaar", emoji: "🥂" },
  { id: "verjaardag", naam: "Verjaardag", wanneer: "op de verjaardag van wie is ingelogd", groet: "Gefeliciteerd!", emoji: "🎂" },
];

export const isThemeId = (v: unknown): v is ThemeId => typeof v === "string" && THEMES.some((t) => t.id === v);
export const themeInfo = (id: ThemeId): ThemeInfo => THEMES.find((t) => t.id === id) ?? THEMES[0]!;

const pad = (n: number) => String(n).padStart(2, "0");
const key = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** A calendar day `days` after (or before) y-m-d, as "YYYY-MM-DD". */
function shift(y: number, m: number, d: number, days: number): string {
  const t = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  return key(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Which season it is on a Dutch calendar day ("YYYY-MM-DD"), or null on an ordinary day. */
export function seasonOn(dayKey: string): SeasonId | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!m) return null;
  const year = Number(m[1]);
  const md = Number(m[2]) * 100 + Number(m[3]);
  if (md === 101 || md === 102) return "nieuwjaar";
  if (md === 214) return "valentijn";
  const e = easterMonthDay(year);
  if (dayKey >= shift(year, e.month, e.day, -49) && dayKey <= shift(year, e.month, e.day, -47)) return "carnaval";
  if (dayKey >= shift(year, e.month, e.day, -2) && dayKey <= shift(year, e.month, e.day, 1)) return "pasen";
  const sunday27 = new Date(Date.UTC(year, 3, 27)).getUTCDay() === 0;
  if (md === (sunday27 ? 426 : 427)) return "koningsdag";
  if (md >= 1029 && md <= 1031) return "halloween";
  if (md >= 1201 && md <= 1205) return "sinterklaas";
  if (md >= 1220 && md <= 1226) return "kerst";
  if (md === 1231) return "oudjaar";
  return null;
}

/** Is a stored birthday ("YYYY-MM-DD" or "MM-DD") on this Dutch calendar day? */
export function isBirthdayOn(birthday: string | null | undefined, dayKey: string): boolean {
  const b = /^(?:\d{4}-)?(\d{2})-(\d{2})$/.exec((birthday ?? "").trim());
  const d = /^\d{4}-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!b || !d) return false;
  // 29 February: celebrated on 28 February in other years
  const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  if (b[1] === "02" && b[2] === "29" && !leap(Number(dayKey.slice(0, 4)))) return d[1] === "02" && d[2] === "28";
  return b[1] === d[1] && b[2] === d[2];
}
