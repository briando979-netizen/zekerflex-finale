"use client";

import { useCallback, useEffect, useState } from "react";
import type { AutoModus, AutoStand } from "@/lib/bouwer/auto-uitrol-regels";

// Admin -> ZekerFlex AI -> Live zetten: de Auto-uitrol met drie standen: Uit, Kijken en Aan. Standaard bij het aanzetten is Kijken (een droge
// ronde): de server doet alles behalve uitrollen en laat hieronder zien wat hij ZOU doen. Aan vraagt eerst een bevestiging.
// De server doet het werk (lib/bouwer/auto-uitrol.ts); dit scherm bedient alleen de schakelaars en toont de stand.
interface AutoAntwoord {
  aan: boolean;
  modus: AutoModus;
  noodrem: boolean;
  noodremReden: string | null;
  stand: AutoStand;
  meldingen: { id: string; titel: string; tekst: string }[];
}

const tijd = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", dateStyle: "short", timeStyle: "short" }) : "nog niet");
const kort = (sha: string | null | undefined) => (sha ? sha.slice(0, 10) : "-");

const UITLEG: Record<AutoModus, string> = {
  uit: "Uit: de server doet niets automatisch. Er wordt niet gekeken, niet gecontroleerd en niets uitgerold.",
  kijken: "Kijken: een droge ronde. De server leest main, wacht de rustperiode af, laat de controle draaien en let op migraties, tijd en geheugen, maar rolt NOOIT uit en verandert niets. Hieronder staat wat hij zou doen.",
  aan: "Aan: de server rolt zelf uit zodra een nieuwe versie van main 3 minuten rustig is en de controle schoon is. Een database-wijziging rol je altijd zelf uit. Faalt de controle achteraf, dan stopt hij vanzelf.",
};

export function AutoUitrolPaneel() {
  const [d, setD] = useState<AutoAntwoord | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [bevestig, setBevestig] = useState(false);

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

  const zet = async (body: { modus?: AutoModus; bevestigd?: boolean; noodrem?: boolean }) => {
    setBezig(true);
    try {
      const r = await fetch("/api/admin/bouwer/auto-uitrol", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const antwoord = (await r.json().catch(() => null)) as (AutoAntwoord & { error?: { message?: string } }) | null;
      if (!r.ok) throw new Error(antwoord?.error?.message ?? "opslaan mislukt");
      setD(antwoord);
      setBevestig(false);
      setFout("");
    } catch (e) {
      setFout(e instanceof Error && e.message ? e.message : "Dat opslaan mislukte.");
    } finally {
      setBezig(false);
    }
  };

  if (!d) return fout ? <p role="alert" className="text-xs text-[#F07C6B]">{fout}</p> : null;
  const s = d.stand;
  const lijst = [...(s.beslissingen ?? [])].reverse();
  const knop = (modus: AutoModus, label: string) => (
    <button
      type="button"
      disabled={bezig}
      aria-pressed={d.modus === modus}
      onClick={() => (modus === "aan" ? setBevestig(true) : void zet({ modus }))}
      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${d.modus === modus ? "border-white/40 bg-white/15 text-white" : "border-white/15 text-white/70 hover:bg-white/10"}`}
    >
      {label}
    </button>
  );
  return (
    <section className="rounded-xl border border-white/10 bg-[#0e1116] p-4" aria-labelledby="auto-uitrol-kop">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="auto-uitrol-kop" className="text-sm font-semibold text-white">Auto-uitrol: {d.modus === "uit" ? "uit" : d.modus === "kijken" ? "kijken (droog)" : "aan"}</h3>
          <p className="mt-0.5 text-xs text-white/50">
            {d.stand.stop ? `Gestopt door de nacontrole (${d.stand.stop.reden}). Kies Kijken of Aan om weer te starten.` : d.noodrem ? `De noodrem staat aan${d.noodremReden ? ` (${d.noodremReden})` : ""}: er wordt niets gedaan.` : UITLEG[d.modus]}
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Stand van de Auto-uitrol">
          {knop("uit", "Uit")}
          {knop("kijken", "Kijken")}
          {knop("aan", "Aan")}
          <button type="button" disabled={bezig} onClick={() => void zet({ noodrem: !d.noodrem })} className="rounded-lg border border-[#F07C6B]/50 px-3 py-1.5 text-xs font-semibold text-[#F07C6B] hover:bg-[#F07C6B]/10 disabled:opacity-50">
            {d.noodrem ? "Noodrem losmaken" : "Noodrem: alles stoppen"}
          </button>
        </div>
      </div>
      {bevestig ? (
        <div role="alertdialog" aria-label="Auto-uitrol aanzetten bevestigen" className="mt-3 rounded-lg border border-[#F0B04B]/40 bg-[#F0B04B]/10 p-3 text-xs text-[#F0B04B]">
          <p className="font-semibold">Weet je zeker dat de Auto-uitrol echt mag uitrollen?</p>
          <p className="mt-1">Daarna gaat elke nieuwe versie van main vanzelf live als de controle schoon is en er geen database-wijziging bij zit. Kijk eerst of de beslissingen hieronder kloppen met wat je zou verwachten.</p>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={bezig} onClick={() => void zet({ modus: "aan", bevestigd: true })} className="rounded-lg bg-[#F0B04B] px-3 py-1.5 font-semibold text-black disabled:opacity-50">Ja, zet aan</button>
            <button type="button" disabled={bezig} onClick={() => setBevestig(false)} className="rounded-lg border border-white/20 px-3 py-1.5 font-semibold text-white">Annuleren</button>
          </div>
        </div>
      ) : null}
      {d.meldingen.map((m) => (
        <p key={m.id} role="alert" className="mt-3 rounded-lg bg-[#F0B04B]/10 px-3 py-2 text-xs text-[#F0B04B]">
          <strong>{m.titel}.</strong> {m.tekst}
        </p>
      ))}
      <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-white/70 sm:grid-cols-2">
        <div><dt className="inline text-white/40">Laatste ronde: </dt><dd className="inline">{tijd(s.laatsteRonde)}</dd></div>
        <div><dt className="inline text-white/40">Laatste controle: </dt><dd className="inline">{s.laatsteControle ? `${kort(s.laatsteControle.sha)} ${s.laatsteControle.ok ? "schoon" : "faalt"}` : "nog niet"}</dd></div>
        <div><dt className="inline text-white/40">Laatste uitrol: </dt><dd className="inline">{s.laatsteUitrol ? `${kort(s.laatsteUitrol.sha)} (${s.laatsteUitrol.uitkomst === "klaar" ? "klaar" : s.laatsteUitrol.uitkomst === "geweigerd" ? "mislukt, niet opnieuw geprobeerd" : "gevraagd"}) ${tijd(s.laatsteUitrol.op)}` : "nog niet"}</dd></div>
        <div className="sm:col-span-2"><dt className="inline text-white/40">Nacontrole na de uitrol: </dt><dd className="inline">{s.nacontrole ? `loopt voor ${kort(s.nacontrole.sha)}` : s.laatsteNacontrole ? `${kort(s.laatsteNacontrole.sha)}: ${s.laatsteNacontrole.uitslag === "ok" ? "in orde" : s.laatsteNacontrole.uitslag === "stop" ? "gefaald" : "onbekend"} (${s.laatsteNacontrole.reden})` : "nog niet"}</dd></div>
        <div className="sm:col-span-2"><dt className="inline text-white/40">Waarom (laatste ronde): </dt><dd className="inline">{s.laatsteBeslissing?.reden ?? "nog geen ronde"}</dd></div>
      </dl>
      <div className="mt-3">
        <h4 className="text-xs font-semibold text-white/80">{d.modus === "kijken" ? "Wat de Auto-uitrol zou doen (laatste beslissingen)" : "Laatste beslissingen"}</h4>
        {lijst.length === 0 ? (
          <p className="mt-1 text-xs text-white/40">Nog geen beslissingen. Ze verschijnen zodra de Auto-uitrol op Kijken of Aan staat en een ronde draait.</p>
        ) : (
          <ul className="mt-1 space-y-1 text-xs text-white/70">
            {lijst.map((b, i) => (
              <li key={`${b.op}-${i}`}>
                <span className="text-white/40">{tijd(b.op)}</span> · <span className="font-mono">{kort(b.sha)}</span> · {b.kijken ? "(droog) " : ""}{b.reden}
              </li>
            ))}
          </ul>
        )}
      </div>
      {fout ? <p role="alert" className="mt-2 text-xs text-[#F07C6B]">{fout}</p> : null}
    </section>
  );
}