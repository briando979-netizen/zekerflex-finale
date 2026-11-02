"use client";

import { createContext, useContext, type ReactNode } from "react";
import { nl, type Dict } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_MAX_AGE, type Locale } from "@/lib/i18n/config";

interface I18nValue {
  locale: Locale;
  t: Dict;
}

const Ctx = createContext<I18nValue>({ locale: DEFAULT_LOCALE, t: nl });

/**
 * `t` is the dictionary for any language but Dutch, passed in by the server
 * layout (lib/i18n/server.ts clientDict) — only Dutch ships in the bundle.
 */
export function I18nProvider({
  locale,
  t,
  children,
}: {
  locale: Locale;
  t?: Dict | undefined;
  children: ReactNode;
}) {
  return <Ctx.Provider value={{ locale, t: t ?? nl }}>{children}</Ctx.Provider>;
}

/** Client-side translation dictionary + current locale. Falls back to Dutch outside a provider. */
export function useI18n(): I18nValue {
  return useContext(Ctx);
}

/** Just the dictionary. */
export function useT(): Dict {
  return useContext(Ctx).t;
}

/** Set the locale cookie and reload so server components re-render. */
export function setLocale(locale: Locale): void {
  try {
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_MAX_AGE}; samesite=lax`;
  } catch {
    /* ignore */
  }
  window.location.reload();
}
