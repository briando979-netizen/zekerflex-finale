"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { setLocale } from "@/components/i18n/I18nProvider";
import { DEFAULT_LOCALE, LOCALES, LOCALE_LABELS, TAAL_META, type Locale } from "@/lib/i18n/config";
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
export function SiteTaalKiezer({ breed = false, pil = false }: { breed?: boolean; pil?: boolean }) {
  const tx = useSiteT();
  const locale = useSiteTaal();
  const kiezer = (
    <select
      aria-label={tx(KOP_TEKSTEN.taal)}
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
      className={breed ? "w-full rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white" : "absolute inset-0 h-full w-full cursor-pointer opacity-0"}
    >
      {LOCALES.map((code) => (
        <option key={code} value={code} className="text-ink">
          {LOCALE_LABELS[code]}
        </option>
      ))}
    </select>
  );
  if (breed) return kiezer;
  // pil: op de telefoon bovenaan de voorpagina (28 nov 2026, eigenaar: "op de home pagina moet ook een talenknopje"); in de balk
  // past het rondje daar niet naast de naam en de schakelaar Werkers | Bedrijven
  if (pil) {
    return (
      <label className="relative inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/50 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-black/60">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
          <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
        <span aria-hidden>{TAAL_META[locale].naam}</span>
        <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {kiezer}
      </label>
    );
  }
  return (
    <label className="relative grid h-9 w-9 flex-shrink-0 place-items-center rounded-full border border-white/15 text-white/70 transition hover:text-white" title={tx(KOP_TEKSTEN.taal)}>
      <span aria-hidden className="text-[11px] font-bold uppercase">{locale}</span>
      {kiezer}
    </label>
  );
}
