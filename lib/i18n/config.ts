// ---------------------------------------------------------------------------
// Lightweight i18n — locale lives in a cookie, the page reloads on change and
// server components read it. Employer workspace + shop: NL/EN. Freelancer app
// (/dashboard): NL/EN plus Polish, Romanian and Ukrainian for flexworkers
// (lib/i18n/freelancer.ts); those three see English on employer/shop pages.
// ---------------------------------------------------------------------------

export const LOCALES = ["nl", "en", "pl", "ro", "uk"] as const;
/** Languages offered in the employer workspace and the shop. */
export const EMPLOYER_LOCALES = ["nl", "en"] as const satisfies readonly Locale[];
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
  pl: "Polski (PL)",
  ro: "Română (RO)",
  uk: "Українська (UK)",
};
