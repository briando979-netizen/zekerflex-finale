"use client";

import { useCallback, useEffect, useState } from "react";
import type { AutoStand } from "@/lib/bouwer/auto-uitrol-regels";

// Admin -> ZekerFlex AI -> Live zetten: de Auto-uitrol. Aan/uit en de noodrem; daaronder wat de laatste ronde deed en waarom.
// Standaard UIT: de eigenaar zet hem zelf aan. De server doet het werk (lib/bouwer/auto-uitrol.ts), dit scherm bedient alleen de schakelaars.
interface AutoAntwoord {
  aan: boolean;
  noodrem: boolean;
  stand: AutoStand;
  meldingen: { id: string; titel: string; tekst: string }[];
}

const tijd = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", dateStyle: "short", timeStyle: "short" }) : "nog niet");
const kort = (sha: string | null | undefined) => (sha ? sha.slice(0, 10) : "-");

export function AutoUitrolPaneel() {
  const [d, setD] = useState<AutoAntwoord | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");

  const laad = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/bouwer/auto-uitrol", { cache: "no-store" });
      if (!r.ok) throw new Error("laden mislukt");
      setD((await r.json()) as AutoAntwoord);
      setFout("");
    } catch {
      setFout("De stand van de Auto-uitrol kon niet worden geladen.");
    }
  }, []);
  useEffect(() => {
    void laad();
    const id = setInterval(() => void laad(), 30_000);
    return () => clearInterval(id);
  }, [laad]);

  const zet = async (body: { aan?: boolean; noodrem?: boolean }) => {
    setBezig(true);
    try {
      const r = await fetch("/api/admin/bouwer/auto-uitrol", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error("opslaan mislukt");
      setD((await r.json()) as AutoAntwoord);
      setFout("");
    } catch {
      setFout("Dat opslaan mislukte.");
    } finally {
      setBezig(false);
    }
  };

  if (!d) return fout ? <p role="alert" className="text-xs text-[#F07C6B]">{fout}</p> : null;
  const s = d.stand;
  return (
    <section className="rounded-xl border border-white/10 bg-[#0e1116] p-4" aria-labelledby="auto-uitrol-kop">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="auto-uitrol-kop" className="text-sm font-semibold text-white">Auto-uitrol</h3>
          <p className="mt-0.5 text-xs text-white/50">
            {d.noodrem ? "De noodrem staat aan: er wordt niets automatisch uitgerold." : d.aan ? "Aan: nieuwe versies van main worden vanzelf gecontroleerd en live gezet." : "Uit: er wordt niets automatisch uitgerold."} Database-wijzigingen rol je altijd zelf uit.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={bezig} onClick={() => void zet({ aan: !d.aan })} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50">
            {d.aan ? "Auto-uitrol uitzetten" : "Auto-uitrol aanzetten"}
          </button>
          <button type="button" disabled={bezig} onClick={() => void zet({ noodrem: !d.noodrem })} className="rounded-lg border border-[#F07C6B]/50 px-3 py-1.5 text-xs font-semibold text-[#F07C6B] hover:bg-[#F07C6B]/10 disabled:opacity-50">
            {d.noodrem ? "Noodrem losmaken" : "Noodrem: alles stoppen"}
          </button>
        </div>
      </div>
      {d.meldingen.map((m) => (
        <p key={m.id} role="alert" className="mt-3 rounded-lg bg-[#F0B04B]/10 px-3 py-2 text-xs text-[#F0B04B]">
          <strong>{m.titel}.</strong> {m.tekst}
        </p>
      ))}
      <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-white/70 sm:grid-cols-2">
        <div><dt className="inline text-white/40">Laatste ronde: </dt><dd className="inline">{tijd(s.laatsteRonde)}</dd></div>
        <div><dt className="inline text-white/40">Laatste controle: </dt><dd className="inline">{s.laatsteControle ? `${kort(s.laatsteControle.sha)} ${s.laatsteControle.ok ? "schoon" : "faalt"}` : "nog niet"}</dd></div>
        <div><dt className="inline text-white/40">Laatste uitrol: </dt><dd className="inline">{s.laatsteUitrol ? `${kort(s.laatsteUitrol.sha)} (${s.laatsteUitrol.uitkomst === "klaar" ? "klaar" : s.laatsteUitrol.uitkomst === "geweigerd" ? "mislukt, niet opnieuw geprobeerd" : "gevraagd"}) ${tijd(s.laatsteUitrol.op)}` : "nog niet"}</dd></div>
        <div className="sm:col-span-2"><dt className="inline text-white/40">Waarom (laatste ronde): </dt><dd className="inline">{s.laatsteBeslissing?.reden ?? "nog geen ronde"}</dd></div>
      </dl>
      {fout ? <p role="alert" className="mt-2 text-xs text-[#F07C6B]">{fout}</p> : null}
    </section>
  );
}