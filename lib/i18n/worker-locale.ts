import { kvGet, kvGetMany, kvSet } from "@/lib/storage/kv";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n/config";

// ---------------------------------------------------------------------------
// The app language a user picked, kept on the server too. The cookie only
// travels with page requests; a push is sent from the server without one, so
// to write it in the worker's own language we need it stored. Written when the
// user changes language (POST /api/me/taal via sendBeacon in setLocale).
// KV `werker-taal:<userId>` — erased with the account (lib/privacy/user-kv.ts).
// ---------------------------------------------------------------------------

const key = (userId: string) => `werker-taal:${userId}`;

export async function setUserLocale(userId: string, locale: Locale): Promise<void> {
  await kvSet(key(userId), { locale, at: new Date().toISOString() });
}

export async function userLocale(userId: string): Promise<Locale> {
  const row = await kvGet<{ locale?: unknown }>(key(userId)).catch(() => null);
  return isLocale(row?.locale) ? row.locale : DEFAULT_LOCALE;
}

/** Locales for many users in one query; users without a stored choice get Dutch. */
export async function userLocales(userIds: string[]): Promise<Map<string, Locale>> {
  const rows = await kvGetMany<{ locale?: unknown }>(userIds.map(key)).catch(() => new Map<string, { locale?: unknown }>());
  return new Map(userIds.map((id) => {
    const l = rows.get(key(id))?.locale;
    return [id, isLocale(l) ? l : DEFAULT_LOCALE] as const;
  }));
}
