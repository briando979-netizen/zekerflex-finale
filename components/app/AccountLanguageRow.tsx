"use client";

import { useI18n, useFT, setLocale } from "@/components/i18n/I18nProvider";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";

// Werkende taalkeuze in de Account-tab: toont de HUIDIGE taal (uit de locale-
// cookie) en wisselt direct (setLocale zet de cookie + herlaadt, zodat de
// server-rendered pagina's in de nieuwe taal terugkomen). Vervangt de oude,
// statische rij die altijd "Nederlands" toonde.
export function AccountLanguageRow() {
  const { locale } = useI18n();
  const t = useFT();
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3.5 text-sm">
      <span className="font-medium text-ink">{t.lang.label}</span>
      <select
        aria-label={t.lang.label}
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="rounded-lg border border-hairstrong bg-white px-2 py-1 text-sm text-ink"
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
