"use client";

import { useEffect, useState } from "react";
import { useFT } from "@/components/i18n/useFT";
import { AppInstallatie } from "@/components/app/AppInstallatie";
import { isStandaloneBrowser } from "@/lib/app-vereist";

const WEG_KEY = "zf_app_voorstel_weg";

/**
 * "Eerst browser, dan app" (22 nov 2026, eigenaar): na de ID-check een vriendelijk voorstel op Ontdekken om de app te
 * installeren, voor de meldingen van nieuwe klussen. Geen muur: "Niet nu" bewaart de keuze op dit toestel. Niet in de app
 * zelf (de server geeft dan niets door) en niet in een geïnstalleerde web-app. Vaste donkere kleuren, zoals het
 * installatiescherm: de kaart ziet er in elk thema hetzelfde uit.
 */
export function AppVoorstelKaart() {
  const t = useFT().appVereist;
  // eerst niets: pas in de browser weten we of de kaart al eens is weggeklikt (zelfde tekening op server en client)
  const [zichtbaar, setZichtbaar] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isStandaloneBrowser(window)) return;
    try {
      if (localStorage.getItem(WEG_KEY) === "1") return;
    } catch {
      /* geen opslag: de kaart gewoon tonen */
    }
    setZichtbaar(true);
  }, []);

  function nietNu() {
    setZichtbaar(false);
    try {
      localStorage.setItem(WEG_KEY, "1");
    } catch {
      /* geen opslag: alleen nu weg */
    }
  }

  if (!zichtbaar) return null;

  return (
    <section className="relative mb-5 rounded-xl border border-[#2A2F38] bg-[#121418] px-5 py-6 text-white" aria-labelledby="app-voorstel-kop">
      <button
        type="button"
        onClick={nietNu}
        aria-label={t.kaartWeg}
        className="absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-full text-xl leading-none text-white/70 hover:bg-white/10 hover:text-white"
      >
        <span aria-hidden>×</span>
      </button>
      <h2 id="app-voorstel-kop" className="pr-10 font-display text-xl font-extrabold">{t.kaartKop}</h2>
      <p className="mt-2 max-w-sm text-base leading-snug text-white/80">{t.kaartTekst}</p>
      {open ? (
        <div className="mt-5">
          <AppInstallatie />
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-h-[52px] items-center justify-center rounded-lg bg-[#14D9C9] px-5 text-base font-bold text-[#0B1238] transition hover:brightness-105"
          >
            {t.kaartHoe}
          </button>
          <button type="button" onClick={nietNu} className="min-h-[44px] text-sm font-semibold text-white/70 underline underline-offset-4">
            {t.kaartWeg}
          </button>
        </div>
      )}
    </section>
  );
}
