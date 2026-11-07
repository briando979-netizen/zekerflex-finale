"use client";

import { useEffect, useRef, useState } from "react";
import { BonDelen } from "@/components/horeca/live/BonDelen";
import { btwSpecificatie, methodeLabel } from "@/lib/horeca/kassa";
import type { BonData, BonKop } from "@/components/horeca/live/types";

// ---------------------------------------------------------------------------
// De kassabon: zaak, bonnummer, regels, totaal, fooi, betaalwijze en de
// btw-specificatie. Op het scherm als voorbeeld; bij printen alleen de bon, op
// de breedte van een bonprinter (80 mm). Werkt met elke printer die de browser
// kent (AirPrint, Android-afdrukservice, een gewone printer).
// ---------------------------------------------------------------------------

const bedrag = (c: number) => (c / 100).toFixed(2).replace(".", ",");
const wanneer = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(iso));

const PRINT = `@media print {
  @page { margin: 3mm; }
  body * { visibility: hidden !important; }
  #zf-bon-print, #zf-bon-print * { visibility: visible !important; }
  #zf-bon-print { position: absolute; left: 0; top: 0; width: 74mm; background: #fff; color: #000; }
  #zf-bon-print .zf-bon { box-shadow: none !important; border: 0 !important; padding: 0 !important; }
  #zf-bon-print .zf-bon + .zf-bon { page-break-before: always; }
}`;

function Rij({ l, r, vet = false }: { l: string; r: string; vet?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${vet ? "font-bold" : ""}`}>
      <span className="min-w-0">{l}</span>
      <span className="flex-shrink-0 tabular-nums">{r}</span>
    </div>
  );
}

export function BonWeergave({ kop, bon }: { kop: BonKop; bon: BonData }) {
  const spec = btwSpecificatie(bon.regels);
  const lijn = <div className="my-2 border-t border-dashed border-black/40" aria-hidden />;
  return (
    <article className="zf-bon mx-auto w-[300px] max-w-full rounded-md bg-white p-4 font-mono text-[12px] leading-snug text-black shadow-lg" aria-label={`Bon ${bon.bonNummer ?? ""}`}>
      <header className="text-center">
        <p className="text-[14px] font-bold">{kop.naam}</p>
        {(kop.adres || kop.plaats) && <p>{[kop.adres, kop.plaats].filter(Boolean).join(", ")}</p>}
        {kop.telefoon && <p>Tel. {kop.telefoon}</p>}
        {(kop.kvk || kop.btwNummer) && <p>{[kop.kvk && `KVK ${kop.kvk}`, kop.btwNummer && `Btw ${kop.btwNummer}`].filter(Boolean).join(" · ")}</p>}
      </header>
      {lijn}
      <Rij l={`Bon ${bon.bonNummer ?? ""}`} r={wanneer(bon.op)} />
      {bon.tafel && <Rij l={bon.tafel} r={bon.door ? `door ${bon.door}` : ""} />}
      {lijn}
      {bon.regels.map((r, i) => (
        <Rij key={i} l={`${r.aantal} x ${r.naam}`} r={bedrag(r.prijsCent * r.aantal)} />
      ))}
      {lijn}
      <Rij l="Totaal" r={`€ ${bedrag(bon.bedragCent)}`} vet />
      {bon.fooiCent > 0 && <Rij l="Fooi" r={`€ ${bedrag(bon.fooiCent)}`} />}
      <Rij l={`Betaald (${methodeLabel(bon.methode)})`} r={`€ ${bedrag(bon.bedragCent + bon.fooiCent)}`} />
      {lijn}
      <div className="grid grid-cols-3 gap-1 tabular-nums">
        <span>Btw</span>
        <span className="text-right">over</span>
        <span className="text-right">btw</span>
        {spec.map((b) => (
          <span key={b.tarief} className="contents">
            <span>{b.tarief}%</span>
            <span className="text-right">{bedrag(b.exclCent)}</span>
            <span className="text-right">{bedrag(b.btwCent)}</span>
          </span>
        ))}
      </div>
      {kop.voettekst && (
        <>
          {lijn}
          <p className="text-center">{kop.voettekst}</p>
        </>
      )}
    </article>
  );
}

/** Na afrekenen: de bon(nen) groot in beeld, printen of klaar. */
export function BonVenster({ kop, bonnen, sluit }: { kop: BonKop; bonnen: BonData[]; sluit: () => void }) {
  const klaar = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    void klaar.current?.focus();
  }, []);
  const totaal = bonnen.reduce((s, b) => s + b.bedragCent + b.fooiCent, 0);
  const [keuze, setKeuze] = useState(0);
  const gekozen = bonnen[keuze] ?? bonnen[0];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3">
      <style>{PRINT}</style>
      <div role="dialog" aria-modal="true" aria-labelledby="bon-kop" className="flex max-h-[95dvh] w-full max-w-md flex-col rounded-3xl bg-[#141A17] p-5 ring-1 ring-white/10">
        <h2 id="bon-kop" className="text-center font-display text-2xl font-bold text-white">
          Betaald <span className="text-[#86EFAC]">€ {bedrag(totaal)}</span>
        </h2>
        <p className="mt-1 text-center text-sm text-[#B8C4BD]">{bonnen.length > 1 ? `${bonnen.length} bonnen` : "De bon staat klaar."}</p>
        <div className="mt-4 flex-1 overflow-y-auto">
          <div id="zf-bon-print" className="space-y-4">
            {bonnen.map((b) => (
              <BonWeergave key={b.id} kop={kop} bon={b} />
            ))}
          </div>
          {gekozen?.token && (
            <section aria-labelledby="bon-gast" className="mt-4 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
              <h3 id="bon-gast" className="font-display text-lg font-bold text-white">
                Bon voor de gast
              </h3>
              {bonnen.length > 1 && (
                <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Kies de bon">
                  {bonnen.map((b, i) => (
                    <button
                      key={b.id}
                      type="button"
                      aria-pressed={i === keuze}
                      onClick={() => setKeuze(i)}
                      className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ring-white/25 ${i === keuze ? "bg-white text-[#141A17]" : "text-white"}`}
                    >
                      Bon {b.bonNummer ?? i + 1}
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-3">
                <BonDelen key={gekozen.token} token={gekozen.token} qr donker />
              </div>
            </section>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => window.print()} className="min-h-12 rounded-xl bg-white/10 font-bold text-white ring-1 ring-white/20 hover:bg-white/15">
            Bon printen
          </button>
          <button ref={klaar} type="button" onClick={sluit} className="min-h-12 rounded-xl bg-[#22C55E] font-bold text-[#04130A] hover:bg-[#4ADE80]">
            Klaar
          </button>
        </div>
      </div>
    </div>
  );
}
