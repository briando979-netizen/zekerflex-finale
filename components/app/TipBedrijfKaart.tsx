"use client";

import { useEffect, useState } from "react";
import { useFT } from "@/components/i18n/useFT";
import { TIP_WEG_SLEUTEL, tipLink } from "@/lib/klusconcept/via";

// "Ken je een bedrijf dat mensen zoekt?" in de werker-app (/dashboard/klussen). Een deelknop (Web Share API, anders de link
// kopiëren) naar /klus-plaatsen?via=werker: een bedrijf plaatst daar zonder account een klus. Geen bonus, geen geld, geen
// gegevens van de werker in de link. Wegklikbaar, onthouden per apparaat (localStorage, in try/catch).

export function TipBedrijfKaart() {
  const t = useFT().tipBedrijf;
  // eerst niet tonen: pas na het lezen van localStorage weten we of hij al weggeklikt is (geen flits, geen hydratieverschil)
  const [zichtbaar, setZichtbaar] = useState(false);
  const [melding, setMelding] = useState<{ tekst: string; fout: boolean } | null>(null);

  useEffect(() => {
    try {
      setZichtbaar(localStorage.getItem(TIP_WEG_SLEUTEL) !== "1");
    } catch {
      // opslag geblokkeerd: de kaart blijft gewoon zichtbaar
      setZichtbaar(true);
    }
  }, []);

  if (!zichtbaar) return null;

  async function delen() {
    setMelding(null);
    const link = tipLink(window.location.origin);
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: t.deelTitel, text: t.deelTekst, url: link });
        return;
      }
      await navigator.clipboard.writeText(link);
      setMelding({ tekst: t.gekopieerd, fout: false });
    } catch (err) {
      // de werker sloot het deelmenu zelf: geen fout
      if (err instanceof DOMException && err.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(link);
        setMelding({ tekst: t.gekopieerd, fout: false });
      } catch {
        setMelding({ tekst: t.mislukt, fout: true });
      }
    }
  }

  function weg() {
    try {
      localStorage.setItem(TIP_WEG_SLEUTEL, "1");
    } catch {
      // opslag geblokkeerd: dan verdwijnt hij alleen voor deze keer
    }
    setZichtbaar(false);
  }

  return (
    <section aria-labelledby="tip-bedrijf-kop" className="card mb-5 p-5">
      <h2 id="tip-bedrijf-kop" className="font-display text-base font-bold text-ink">{t.titel}</h2>
      <p className="mt-1 text-sm text-neutralx-600">{t.uitleg}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" data-track="tip-bedrijf-delen" onClick={() => void delen()} className="btn-primary min-h-[44px] px-4 py-2 text-sm">
          {t.deel}
        </button>
        <button type="button" data-track="tip-bedrijf-weg" onClick={weg} className="btn-ghost min-h-[44px] px-3 py-2 text-sm">
          {t.weg}
        </button>
      </div>
      {melding && (
        <p role={melding.fout ? "alert" : "status"} className={`mt-2 text-xs font-medium ${melding.fout ? "text-crit" : "text-ink"}`}>
          {melding.tekst}
        </p>
      )}
    </section>
  );
}
