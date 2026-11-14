"use client";

import { useState } from "react";
import { Notice, Panel } from "@/components/admin/kit";

// Beheer → Geld → Weg naar winst: melden dat het geld van een factuur per bankoverschrijving binnen is. Eerst controleren
// (welke factuur, welk bedrijf, welk bedrag), dan pas op betaald. Alleen bij een open factuur voor platformkosten, en alleen
// als het ontvangen bedrag precies het factuurbedrag is (lib/billing/overschrijving-betaald-kern.ts).

interface Factuur {
  number: string;
  bedrijf: string | null;
  totalCents: number;
}
const euro = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;

async function stuur(body: unknown): Promise<Factuur> {
  const r = await fetch("/api/admin/facturen/betaald", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = (await r.json().catch(() => null)) as { factuur?: Factuur; error?: { message?: string } } | null;
  if (!r.ok || !d?.factuur) throw new Error(d?.error?.message ?? "Dat lukte niet. Probeer het opnieuw.");
  return d.factuur;
}

export function BetaaldMeldenPaneel() {
  const [nummer, setNummer] = useState("");
  const [bedrag, setBedrag] = useState("");
  const [bezig, setBezig] = useState("");
  const [gevonden, setGevonden] = useState<Factuur | null>(null);
  const [melding, setMelding] = useState<{ tekst: string; fout?: boolean } | null>(null);

  async function doe(actie: "bekijk" | "zet") {
    setBezig(actie);
    setMelding(null);
    try {
      const f = await stuur({ actie, nummer: nummer.trim(), ...(actie === "zet" ? { bedrag } : {}) });
      if (actie === "bekijk") setGevonden(f);
      else {
        setMelding({ tekst: `Factuur ${f.number}${f.bedrijf ? ` van ${f.bedrijf}` : ""} staat op betaald (${euro(f.totalCents)}).` });
        setGevonden(null);
        setNummer("");
        setBedrag("");
      }
    } catch (e) {
      setMelding({ tekst: (e as Error).message, fout: true });
      if (actie === "bekijk") setGevonden(null);
    } finally {
      setBezig("");
    }
  }

  return (
    <Panel title="Geld binnen per bankoverschrijving?" subtitle="Een bedrijf dat overmaakt, zet het factuurnummer in de omschrijving. Zie je het geld op de rekening, zet de factuur dan hier op betaald.">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="a-label">
          Factuurnummer
          <input
            className="a-input"
            value={nummer}
            maxLength={40}
            onChange={(e) => {
              setNummer(e.target.value);
              // een ander nummer = opnieuw controleren
              setGevonden(null);
            }}
            placeholder="Het nummer op de factuur"
            autoComplete="off"
          />
        </label>
        <label className="a-label">
          Ontvangen bedrag (€)
          <input className="a-input" inputMode="decimal" value={bedrag} maxLength={30} onChange={(e) => setBedrag(e.target.value)} placeholder="Zoals op het bankafschrift, bijv. 42,35" autoComplete="off" />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="a-btn a-btn-ghost disabled:opacity-50" onClick={() => void doe("bekijk")} disabled={bezig !== "" || nummer.trim().length < 3}>
          {bezig === "bekijk" ? "Bezig…" : "Controleer de factuur"}
        </button>
      </div>
      {gevonden ? (
        <div className="mt-3 rounded-xl p-3" style={{ border: "1px solid var(--a-border)" }}>
          <p className="text-sm" style={{ color: "var(--a-text)" }}>
            Factuur <strong>{gevonden.number}</strong>
            {gevonden.bedrijf ? (
              <>
                {" "}
                van <strong>{gevonden.bedrijf}</strong>
              </>
            ) : null}
            , bedrag <strong>{euro(gevonden.totalCents)}</strong>. Is dit de goede factuur en heb je precies dit bedrag ontvangen?
          </p>
          <button type="button" className="a-btn a-btn-primary mt-3 disabled:opacity-50" onClick={() => void doe("zet")} disabled={bezig !== "" || !bedrag.trim()}>
            {bezig === "zet" ? "Bezig…" : "Ja, zet deze factuur op betaald"}
          </button>
        </div>
      ) : null}
      <p className="mt-3 text-xs" style={{ color: "var(--a-mute)" }}>
        Dit kan alleen bij een open factuur voor platformkosten, en alleen met het hele factuurbedrag. Bij andere facturen hangt er een uitbetaling of levering aan de betaling; die lopen niet met de hand. Deze knop boekt de betaling niet in de boekhouding. Upload daarna het bankafschrift in Boekhouding → Bank, dan klopt ook het grootboek.
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
