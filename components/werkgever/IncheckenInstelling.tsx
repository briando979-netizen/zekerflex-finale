"use client";

import { useState } from "react";
import { useT } from "@/components/i18n/I18nProvider";

// Werkgever: moeten je werkers inchecken? Ja (standaard) of nee (lib/checkin/vereist.ts). Bij nee dienen ze na afloop hun uren
// in en is jouw goedkeuring het bewijs. De keuze wordt meteen bewaard; de teruggegeven stand van de server is leidend.

export function IncheckenInstelling({ initial }: { initial: boolean }) {
  const c = useT().company;
  const [vereist, setVereist] = useState(initial);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);

  const kies = async (volgende: boolean) => {
    if (volgende === vereist || bezig) return;
    if (!volgende && !window.confirm(c.incheckBevestigUit)) return;
    setBezig(true);
    setMelding(null);
    try {
      const r = await fetch("/api/werkgever/incheck-instelling", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vereist: volgende }) });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.error?.message ?? c.incheckMislukt);
      const nu = d?.vereist !== false;
      setVereist(nu);
      setMelding({ ok: true, tekst: nu ? c.incheckOpgeslagenAan : c.incheckOpgeslagenUit });
    } catch (e) {
      setMelding({ ok: false, tekst: e instanceof Error && e.message ? e.message : c.incheckMislukt });
    } finally {
      setBezig(false);
    }
  };

  const optie = "flex items-start gap-3 rounded-xl border p-3";
  return (
    <fieldset className="p-5" disabled={bezig}>
      <legend className="sr-only">{c.incheckTitel}</legend>
      <p className="text-sm text-neutralx-600">{c.incheckUitleg}</p>
      <div className="mt-3 space-y-2">
        <label className={`${optie} ${vereist ? "border-brand-500 bg-brand-mint" : "border-hair"}`}>
          <input type="radio" name="incheck-vereist" checked={vereist} onChange={() => void kies(true)} className="mt-1 h-4 w-4 accent-brand-500" />
          <span>
            <span className="block text-sm font-semibold text-ink">{c.incheckJa}</span>
            <span className="block text-xs text-neutralx-500">{c.incheckJaUitleg}</span>
          </span>
        </label>
        <label className={`${optie} ${!vereist ? "border-brand-500 bg-brand-mint" : "border-hair"}`}>
          <input type="radio" name="incheck-vereist" checked={!vereist} onChange={() => void kies(false)} className="mt-1 h-4 w-4 accent-brand-500" />
          <span>
            <span className="block text-sm font-semibold text-ink">{c.incheckNee}</span>
            <span className="block text-xs text-neutralx-500">{c.incheckNeeUitleg}</span>
          </span>
        </label>
      </div>
      {melding && (
        <p role={melding.ok ? "status" : "alert"} className={`mt-3 text-sm ${melding.ok ? "text-brand-700" : "text-crit"}`}>
          {melding.tekst}
        </p>
      )}
    </fieldset>
  );
}
