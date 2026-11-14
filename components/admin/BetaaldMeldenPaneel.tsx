"use client";

import { useState } from "react";
import { Notice, Panel } from "@/components/admin/kit";

// Beheer → Geld → Weg naar winst: melden dat het geld van een factuur per bankoverschrijving binnen is. De factuur gaat dan
// op betaald. Alleen bij een open factuur voor platformkosten (lib/billing/overschrijving-betaald-kern.ts).

export function BetaaldMeldenPaneel() {
  const [nummer, setNummer] = useState("");
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ tekst: string; fout?: boolean } | null>(null);

  async function meld() {
    const n = nummer.trim();
    if (!window.confirm(`Staat het geld van factuur ${n} echt op de rekening? De factuur gaat dan op betaald.`)) return;
    setBezig(true);
    setMelding(null);
    try {
      const r = await fetch("/api/admin/facturen/betaald", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nummer: n }) });
      const d = (await r.json().catch(() => null)) as { factuur?: { number: string }; error?: { message?: string } } | null;
      if (!r.ok || !d?.factuur) throw new Error(d?.error?.message ?? "Dat lukte niet. Probeer het opnieuw.");
      setMelding({ tekst: `Factuur ${d.factuur.number} staat op betaald.` });
      setNummer("");
    } catch (e) {
      setMelding({ tekst: (e as Error).message, fout: true });
    } finally {
      setBezig(false);
    }
  }

  return (
    <Panel title="Geld binnen per bankoverschrijving?" subtitle="Een bedrijf dat overmaakt, zet het factuurnummer in de omschrijving. Zie je het geld op de rekening, vul dan hier dat nummer in.">
      <label className="a-label">
        Factuurnummer
        <input className="a-input max-w-[16rem]" value={nummer} maxLength={40} onChange={(e) => setNummer(e.target.value)} placeholder="Het nummer op de factuur" autoComplete="off" />
      </label>
      <button type="button" className="a-btn a-btn-primary mt-3 disabled:opacity-50" onClick={() => void meld()} disabled={bezig || nummer.trim().length < 3}>
        {bezig ? "Bezig…" : "Zet deze factuur op betaald"}
      </button>
      <p className="mt-2 text-xs" style={{ color: "var(--a-mute)" }}>
        Dit kan alleen bij een open factuur voor platformkosten. Bij andere facturen hangt er een uitbetaling of levering aan de betaling; die lopen niet met de hand.
      </p>
      {melding ? (
        <div className="mt-3">
          <Notice tone={melding.fout ? "crit" : "ok"} role={melding.fout ? "alert" : "status"}>
            {melding.tekst}
          </Notice>
        </div>
      ) : null}
    </Panel>
  );
}
