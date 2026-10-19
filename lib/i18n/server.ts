import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "@/lib/i18n/config";
import { DICTS, type Dict } from "@/lib/i18n/dictionaries";
import { FREELANCER_DICTS, type FreelancerDict } from "@/lib/i18n/freelancer";

/** Current locale from the cookie (server components / route handlers). */
export async function getLocale(): Promise<Locale> {
  const raw = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(raw) ? raw : DEFAULT_LOCALE;
}

/** The translation dictionary for the current locale. */
export async function getDict(): Promise<Dict> {
  return DICTS[await getLocale()];
}

/** The freelancer-app dictionary for the current locale (server components). */
export async function getFreelancerDict(): Promise<FreelancerDict> {
  return FREELANCER_DICTS[await getLocale()];
}
