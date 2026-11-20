"use client";

import { useState } from "react";
import { useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";
import { MAX_UREN_HOOGSTE } from "@/lib/werkgever/max-uren-kern";

// Maximum uren per werker bij dit bedrijf in 12 maanden (lib/werkgever/max-uren.ts), op de bedrijfspagina. Opslaan via
// PUT /api/orgs (OrgProfileExtra.maxUrenPerWerker); 0 = geen grens.

export function MaxUrenInstelling({ initial }: { initial: number }) {
  const c = useT().company;
  const [waarde, setWaarde] = useState(String(initial || 0));
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);
  const n = Math.max(0, Math.min(MAX_UREN_HOOGSTE, Math.round(Number(waarde) || 0)));

  const opslaan = async () => {
    setBezig(true);
    setMelding(null);
    try {
      const r = await fetch("/api/orgs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maxUrenPerWerker: n }) });
      if (!r.ok) throw new Error(String(r.status));
      setMelding({ ok: true, tekst: n > 0 ? fmt(c.maxUrenOpgeslagen, { n }) : c.maxUrenGeenOpgeslagen });
    } catch {
      setMelding({ ok: false, tekst: c.maxUrenMislukt });
    } finally {
      setBezig(false);
    }
  };

  return (
    <div className="p-5">
      <p className="text-sm text-neutralx-600">{c.maxUrenUitleg}</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block text-sm font-semibold text-ink">
          {c.maxUrenLabel}
          <input
            type="number"
            min={0}
            max={MAX_UREN_HOOGSTE}
            step={10}
            value={waarde}
            onChange={(e) => setWaarde(e.target.value)}
            className="mt-1 block w-40 rounded-xl border border-hair px-3 py-2 font-normal"
          />
        </label>
        <button type="button" onClick={() => void opslaan()} disabled={bezig} className="btn-primary disabled:opacity-50">
          {bezig ? c.maxUrenBezig : c.maxUrenOpslaan}
        </button>
      </div>
      <p className="mt-1 text-xs text-neutralx-400">{c.maxUrenGeen}</p>
      {melding && (
        <p role={melding.ok ? "status" : "alert"} className={`mt-2 text-sm ${melding.ok ? "text-brand-700" : "text-crit"}`}>
          {melding.tekst}
        </p>
      )}
    </div>
  );
}
