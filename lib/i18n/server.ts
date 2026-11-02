import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "@/lib/i18n/config";
import { nl, type Dict } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";
import { FREELANCER_DICTS, type FreelancerDict } from "@/lib/i18n/freelancer";

// Employer/shop pages have no PL/RO/UK translation — those readers get English.
const DICTS: Record<Locale, Dict> = { nl, en, pl: en, ro: en, uk: en };

/** Current locale from the cookie (server components / route handlers). */
export async function getLocale(): Promise<Locale> {
  const raw = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(raw) ? raw : DEFAULT_LOCALE;
}

/** The translation dictionary for the current locale. */
export async function getDict(): Promise<Dict> {
  return DICTS[await getLocale()];
}

/**
 * The `t` prop for <I18nProvider>: nothing for Dutch, which the client bundle
 * already carries — any other language travels with the page instead, so the
 * browser never downloads a dictionary it won't show.
 */
export function clientDict(locale: Locale): Dict | undefined {
  return locale === DEFAULT_LOCALE ? undefined : DICTS[locale];
}

/** The freelancer-app dictionary for the current locale (server components). */
export async function getFreelancerDict(): Promise<FreelancerDict> {
  return FREELANCER_DICTS[await getLocale()];
}
