"use client";

import { useState } from "react";
import { useT } from "@/components/i18n/I18nProvider";
import { Schakelaar } from "@/components/werkgever/Schakelaar";

// "Klussen automatisch heropenen" (naar YoungOnes, 23 nov 2026): een schakelaar, standaard aan. Aan = zegt een werker af van een volle klus,
// dan gaat die meteen weer open en zoekt ZekerFlex een vervanger (zoals het altijd werkte). Uit = de klus blijft op "volledig bezet" staan en het
// bedrijf zet hem zelf weer open (lib/werkgever/heropenen.ts). De keuze wordt meteen bewaard; de teruggegeven stand van de server is leidend.
// Alleen een beheerder wijzigt (het geldt voor al je klussen); een ander ziet de stand met een uitleg.

export function HeropenenInstelling({ initial, kanBeheren }: { initial: boolean; kanBeheren: boolean }) {
  const c = useT().klusInstellingen;
  const [aan, setAan] = useState(initial);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);

  const wissel = async () => {
    if (bezig || !kanBeheren) return;
    setBezig(true);
    setMelding(null);
    try {
      const r = await fetch("/api/werkgever/heropenen-instelling", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ automatisch: !aan }) });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(String(r.status));
      const nu = d?.automatisch !== false;
      setAan(nu);
      setMelding({ ok: true, tekst: nu ? c.heropenenOpgeslagenAan : c.heropenenOpgeslagenUit });
    } catch {
      setMelding({ ok: false, tekst: c.heropenenMislukt });
    } finally {
      setBezig(false);
    }
  };

  return (
    <div className="p-5">
      <div className="flex items-start gap-4">
        <p id="heropenen-uitleg" className="min-w-0 flex-1 text-sm leading-relaxed text-neutralx-600">
          {c.heropenenUitleg}
        </p>
        {/* de gedeelde schakelaar van de werkgeversapp: rechts naast de uitleg (components/werkgever/Schakelaar.tsx) */}
        <Schakelaar
          aan={aan}
          label={c.heropenenTitel}
          beschrijvingId="heropenen-uitleg"
          uit={bezig || !kanBeheren}
          onWissel={() => void wissel()}
          tekst={aan ? c.heropenenAan : c.heropenenUit}
        />
      </div>
      {!kanBeheren && <p className="mt-3 text-xs text-neutralx-500">{c.heropenenAlleenBeheerder}</p>}
      {melding && (
        <p role={melding.ok ? "status" : "alert"} className={`mt-3 text-sm ${melding.ok ? "text-brand-700" : "text-crit"}`}>
          {melding.tekst}
        </p>
      )}
    </div>
  );
}
