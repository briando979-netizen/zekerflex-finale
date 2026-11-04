"use client";

import { useEffect, useRef, useState } from "react";
import { kies, type Gekozen, type OptieGroep } from "@/lib/horeca/opties";

// ---------------------------------------------------------------------------
// Kiezen bij een gerecht: per groep één keuze (rondjes) of meer (vinkjes),
// verplichte groepen eerst ingevuld, de meerprijs telt direct mee. Voor de gast
// (licht, in de kleuren van de zaak) en voor bediening en kassa (donker).
// ---------------------------------------------------------------------------

const euro = (cent: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cent / 100);

export interface Gekozenen {
  opties: Gekozen[];
  tekst: string;
  prijsCent: number;
}

export function KeuzeVenster({
  naam,
  prijsCent,
  groepen,
  donker = false,
  kies: klaar,
  sluit,
}: {
  naam: string;
  prijsCent: number;
  groepen: readonly OptieGroep[];
  donker?: boolean;
  kies: (g: Gekozenen) => void;
  sluit: () => void;
}) {
  const [keuze, setKeuze] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(groepen.filter((g) => g.verplicht && !g.meer).map((g) => [g.naam, []])),
  );
  const [fout, setFout] = useState<string | null>(null);
  const eerste = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    eerste.current?.focus();
  }, []);
  const gekozen: Gekozen[] = Object.entries(keuze).map(([groep, keuzes]) => ({ groep, keuzes }));
  const uit = kies(groepen, gekozen, naam);
  const meer = "fout" in uit ? groepen.reduce((s, g) => s + g.keuzes.filter((k) => keuze[g.naam]?.includes(k.naam)).reduce((x, k) => x + k.prijsCent, 0), 0) : uit.meerprijsCent;

  function zet(g: OptieGroep, k: string, aan: boolean) {
    setFout(null);
    setKeuze((x) => {
      const nu = x[g.naam] ?? [];
      return { ...x, [g.naam]: g.meer ? (aan ? [...nu, k] : nu.filter((y) => y !== k)) : aan ? [k] : [] };
    });
  }

  function voegToe() {
    if ("fout" in uit) return setFout(uit.fout);
    klaar({ opties: gekozen.filter((g) => g.keuzes.length), tekst: uit.tekst, prijsCent: prijsCent + uit.meerprijsCent });
  }

  const kleur = donker
    ? { paneel: "bg-[#141A17] text-white ring-1 ring-white/10", zacht: "text-[#B8C4BD]", optie: "bg-white/[0.05] ring-white/10", aan: "bg-white text-[#0B0F0D] ring-white", knop: "bg-[#22C55E] text-[#04130A]", fout: "bg-[#450A0A] text-[#FECACA]" }
    : { paneel: "bg-white text-[#0A120E]", zacht: "text-[#4B5563]", optie: "bg-white ring-[#0A120E]/15", aan: "bg-[var(--rs-nacht,#0A120E)] text-white ring-transparent", knop: "bg-[var(--rs-accent-knop,#0A120E)] text-[var(--rs-op-accent,#fff)]", fout: "bg-[#FDE2E2] text-[#B91C1C]" };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={sluit}>
      <div role="dialog" aria-modal="true" aria-labelledby="keuze-kop" className={`max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl p-5 sm:rounded-3xl ${kleur.paneel}`} style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 id="keuze-kop" className="font-display text-2xl font-bold">
            {naam}
          </h2>
          <button ref={eerste} type="button" onClick={sluit} className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${donker ? "ring-white/20" : "ring-black/15"} ${kleur.zacht}`}>
            Sluiten
          </button>
        </div>
        <div className="mt-4 space-y-5">
          {groepen.map((g) => (
            <fieldset key={g.naam}>
              <legend className="text-base font-bold">
                {g.naam}
                <span className={`ml-2 text-sm font-normal ${kleur.zacht}`}>{g.verplicht ? (g.meer ? "kies er minstens één" : "kies er één") : g.meer ? "mag meer" : "mag"}</span>
              </legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {g.keuzes.map((k) => {
                  const aan = keuze[g.naam]?.includes(k.naam) ?? false;
                  return (
                    <label key={k.naam} className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-3 ring-1 ${aan ? kleur.aan : kleur.optie}`}>
                      <span className="flex items-center gap-2">
                        <input type={g.meer ? "checkbox" : "radio"} name={`keuze-${g.naam}`} className="h-4 w-4" checked={aan} onChange={(e) => zet(g, k.naam, g.meer ? e.target.checked : true)} />
                        <span className="font-semibold">{k.naam}</span>
                      </span>
                      {k.prijsCent > 0 && <span className="text-sm">+{euro(k.prijsCent)}</span>}
                    </label>
                  );
                })}
              </div>
              {!g.verplicht && !g.meer && (keuze[g.naam]?.length ?? 0) > 0 && (
                <button type="button" onClick={() => setKeuze((x) => ({ ...x, [g.naam]: [] }))} className={`mt-1 text-sm underline ${kleur.zacht}`}>
                  Geen {g.naam.toLowerCase()}
                </button>
              )}
            </fieldset>
          ))}
        </div>
        {fout && (
          <p role="alert" className={`mt-4 rounded-xl px-3 py-2 text-sm font-semibold ${kleur.fout}`}>
            {fout}
          </p>
        )}
        <button type="button" onClick={voegToe} className={`mt-5 min-h-12 w-full rounded-full px-5 py-3 text-lg font-bold ${kleur.knop}`}>
          Toevoegen · {euro(prijsCent + meer)}
        </button>
      </div>
    </div>
  );
}
