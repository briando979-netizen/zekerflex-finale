// ---------------------------------------------------------------------------
// Lightweight i18n — locale lives in a cookie, the page reloads on change and
// server components read it. Currently scoped to the employer workspace
// (/werkgever); the rest of the app is Dutch-only.
// ---------------------------------------------------------------------------

export const LOCALES = ["nl", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "nl";
export const LOCALE_COOKIE = "zf_locale";
export const LOCALE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export const LOCALE_LABELS: Record<Locale, string> = {
  nl: "Nederlands (NL)",
  en: "English (EN)",
};
