"use client";

import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { setLocale } from "@/components/i18n/I18nProvider";

/** Language picker on log-in / sign-up / confirm — sets the same cookie the app uses. */
export function AuthLanguage({ locale, label }: { locale: Locale; label: string }) {
  return (
    <label className="relative inline-flex items-center gap-1.5 rounded-full border border-hairstrong px-3 py-1.5 text-xs font-semibold text-neutralx-600 hover:text-ink">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
        <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" stroke="currentColor" strokeWidth="1.6" />
      </svg>
      <span className="uppercase">{locale}</span>
      <select
        aria-label={label}
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_LABELS[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
