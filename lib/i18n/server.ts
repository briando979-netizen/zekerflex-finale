import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "@/lib/i18n/config";
import { DICTS, type Dict } from "@/lib/i18n/dictionaries";

/** Current locale from the cookie (server components / route handlers). */
export function getLocale(): Locale {
  const raw = cookies().get(LOCALE_COOKIE)?.value;
  return isLocale(raw) ? raw : DEFAULT_LOCALE;
}

/** The translation dictionary for the current locale. */
export function getDict(): Dict {
  return DICTS[getLocale()];
}
