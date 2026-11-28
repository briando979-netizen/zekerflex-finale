"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { setLocale } from "@/components/i18n/I18nProvider";
import { DEFAULT_LOCALE, LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { KOP_TEKSTEN } from "@/lib/marketing/kop-teksten";
import { maakSiteT, type SiteT, type SiteVertaling } from "@/lib/i18n/site";

// ---------------------------------------------------------------------------
// De taal van de openbare site voor clientonderdelen (28 nov 2026, lib/i18n/site.ts). De layout (server) vertaalt de zinnen
// die de kop en het menu nodig hebben en geeft ze hier als gewone data mee; een clientonderdeel krijgt nooit een functie van de
// server. useSiteT() zoekt daarin op; een zin die er niet in staat, blijft Nederlands. Zonder taalkeuze is `vertaling` leeg.
// ---------------------------------------------------------------------------

interface SiteTaalWaarde {
  locale: Locale;
  vertaling: SiteVertaling | undefined;
}

const Ctx = createContext<SiteTaalWaarde>({ locale: DEFAULT_LOCALE, vertaling: undefined });

export function SiteTaal({ locale, vertaling, children }: { locale: Locale; vertaling?: SiteVertaling | undefined; children: ReactNode }) {
  const waarde = useMemo(() => ({ locale, vertaling }), [locale, vertaling]);
  return <Ctx.Provider value={waarde}>{children}</Ctx.Provider>;
}

/** De vertaalfunctie voor een clientonderdeel op de site. */
export function useSiteT(): SiteT {
  const { vertaling } = useContext(Ctx);
  return useMemo(() => maakSiteT(vertaling), [vertaling]);
}

/** De gekozen taal (voor de taalkiezer). */
export function useSiteTaal(): Locale {
  return useContext(Ctx).locale;
}

/**
 * De taal van de site (28 nov 2026, lib/i18n/site.ts): een vakje met de taalcode, met de gewone keuzelijst eroverheen (zoals in
 * de werkersapp). Kiezen zet het taalcookie en herlaadt, zodat de server de pagina in die taal maakt.
 */
export function SiteTaalKiezer({ breed = false }: { breed?: boolean }) {
  const tx = useSiteT();
  const locale = useSiteTaal();
  const kiezer = (
    <select
      aria-label={tx(KOP_TEKSTEN.taal)}
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
      className={breed ? "w-full rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white" : "absolute inset-0 cursor-pointer opacity-0"}
    >
      {LOCALES.map((code) => (
        <option key={code} value={code} className="text-ink">
          {LOCALE_LABELS[code]}
        </option>
      ))}
    </select>
  );
  if (breed) return kiezer;
  return (
    <label className="relative grid h-9 w-9 flex-shrink-0 place-items-center rounded-full border border-white/15 text-white/70 transition hover:text-white" title={tx(KOP_TEKSTEN.taal)}>
      <span aria-hidden className="text-[11px] font-bold uppercase">{locale}</span>
      {kiezer}
    </label>
  );
}
