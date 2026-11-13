"use client";

import { useEffect, useState } from "react";
import type { PaginaIndeling, VasteSectie } from "@/lib/ontwerp/vaste-paginas";
import { SleepGreep, useSleep } from "@/components/admin/ontwerper/Sleep";
import { verplaatsNaar } from "@/lib/ontwerp/sleep";

// ---------------------------------------------------------------------------
// Tabblad Pagina's, deel "Vaste pagina's indelen": de onderdelen van een vaste pagina (Voor bedrijven, Voor freelancers)
// onder de kop verslepen en verbergen. "Opslaan" zet de indeling meteen live; "Standaard" zet de oorspronkelijke terug.
// De regels staan in lib/ontwerp/vaste-paginas.ts; de teksten van deze pagina's staan in het tabblad Teksten.
// ---------------------------------------------------------------------------

const paneel = { background: "var(--a-panel)", border: "1px solid var(--a-border)" };
const verborgenStijl = { background: "var(--a-elev)", border: "1px dashed var(--a-border)" };
const veld = { background: "var(--a-panel)", border: "1px solid var(--a-border)", color: "var(--a-text)" };
const mute = { color: "var(--a-mute)" };
const klein = "grid h-7 w-7 flex-shrink-0 place-items-center rounded-md text-xs disabled:opacity-30";
const knopStijl = { background: "var(--a-elev)", color: "var(--a-text)" };

interface Pagina {
  id: string;
  naam: string;
  pad: string;
  secties: VasteSectie[];
  indeling: PaginaIndeling;
  eigen: boolean;
}
type Antwoord = { paginas?: Pagina[]; error?: { message?: string } };

async function stuur(pad = "", init?: RequestInit): Promise<Pagina[]> {
  const r = await fetch(`/api/admin/ontwerp/vaste-paginas${pad}`, { cache: "no-store", ...init, headers: { "Content-Type": "application/json" } });
  const d = (await r.json().catch(() => null)) as Antwoord | null;
  if (!r.ok || !d?.paginas) throw new Error(d?.error?.message ?? "Dat lukte niet. Probeer het opnieuw.");
  return d.paginas;
}

const gelijk = (a: PaginaIndeling, b: PaginaIndeling) => JSON.stringify([a.volgorde, [...a.verborgen].sort()]) === JSON.stringify([b.volgorde, [...b.verborgen].sort()]);

export function VastePaginasPaneel({ onVoorbeeldPad, onVernieuw }: { onVoorbeeldPad: (pad: string | null) => void; onVernieuw: () => void }) {
  const [paginas, setPaginas] = useState<Pagina[] | null>(null);
  const [gekozen, setGekozen] = useState<string | null>(null);
  const [indeling, setIndeling] = useState<PaginaIndeling | null>(null);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ tekst: string; fout?: boolean } | null>(null);

  useEffect(() => {
    stuur()
      .then(setPaginas)
      .catch((e: Error) => setMelding({ tekst: e.message, fout: true }));
  }, []);

  const pagina = paginas?.find((p) => p.id === gekozen) ?? null;

  // een hook hoort boven elke vroege return; zonder gekozen pagina valt er niets te verslepen
  const sleep = useSleep((van, naar) => {
    if (indeling) zet({ ...indeling, volgorde: verplaatsNaar(indeling.volgorde, van, naar) });
  });

  function zet(n: PaginaIndeling) {
    setIndeling(n);
    setMelding(null);
  }

  function kies(id: string) {
    const p = paginas?.find((x) => x.id === id) ?? null;
    setGekozen(p ? p.id : null);
    setIndeling(p ? p.indeling : null);
    setMelding(null);
    // het voorbeeld toont de gekozen pagina
    onVoorbeeldPad(p ? p.pad : null);
  }

  async function opslaan() {
    if (!pagina || !indeling) return;
    setBezig(true);
    setMelding(null);
    try {
      const nieuw = await stuur("", { method: "PUT", body: JSON.stringify({ pagina: pagina.id, indeling }) });
      setPaginas(nieuw);
      setIndeling(nieuw.find((p) => p.id === pagina.id)?.indeling ?? indeling);
      setMelding({ tekst: `Opgeslagen. De pagina ${pagina.naam} toont nu deze indeling.` });
      onVernieuw();
    } catch (e) {
      setMelding({ tekst: (e as Error).message, fout: true });
    } finally {
      setBezig(false);
    }
  }

  async function standaard() {
    if (!pagina || !window.confirm(`De indeling van ${pagina.naam} terugzetten naar de standaard?`)) return;
    setBezig(true);
    setMelding(null);
    try {
      const nieuw = await stuur(`?pagina=${encodeURIComponent(pagina.id)}`, { method: "DELETE" });
      setPaginas(nieuw);
      setIndeling(nieuw.find((p) => p.id === pagina.id)?.indeling ?? null);
      setMelding({ tekst: `${pagina.naam} heeft weer de standaardindeling.` });
      onVernieuw();
    } catch (e) {
      setMelding({ tekst: (e as Error).message, fout: true });
    } finally {
      setBezig(false);
    }
  }

  const verborgen = new Set(indeling?.verborgen ?? []);
  const info = new Map((pagina?.secties ?? []).map((s) => [s.id, s]));
  const gewijzigd = Boolean(pagina && indeling && !gelijk(indeling, pagina.indeling));

  return (
    <section className="mb-4 space-y-2 rounded-xl p-3" style={paneel} aria-labelledby="vaste-paginas-kop">
      <h3 id="vaste-paginas-kop" className="text-xs font-semibold" style={{ color: "var(--a-text)" }}>
        Vaste pagina&apos;s indelen
      </h3>
      <p className="text-[11px]" style={mute}>
        Kies een pagina en sleep de onderdelen naar een andere plek (pak ze bij ⠿), of haal het vinkje weg om er een te verbergen. De kop van de pagina blijft bovenaan.
      </p>
      {paginas ? (
        <label className="block text-[11px]" style={mute}>
          Pagina
          <select value={gekozen ?? ""} onChange={(e) => kies(e.target.value)} className="mt-1 block w-full rounded-lg px-2 py-1.5 text-xs" style={veld}>
            <option value="">Kies een pagina…</option>
            {paginas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.naam}
                {p.eigen ? " (eigen indeling)" : ""}
              </option>
            ))}
          </select>
        </label>
      ) : melding ? null : (
        <p className="text-[11px]" style={mute}>
          Laden…
        </p>
      )}

      {pagina && indeling ? (
        <>
          <ol className="space-y-1.5" aria-label={`Onderdelen van ${pagina.naam}, van boven naar beneden`} {...sleep.lijst}>
            {indeling.volgorde.map((id, i) => {
              const s = info.get(id);
              const aan = !verborgen.has(id);
              return (
                // verborgen: gestippelde rand en een andere achtergrond (geen doorzichtigheid: de tekst moet leesbaar blijven)
                <li key={id} data-sleep-rij="" className="flex items-center gap-2 rounded-xl px-3 py-2" style={aan ? paneel : verborgenStijl}>
                  <SleepGreep naam={s?.naam ?? id} />
                  <label className="flex min-w-0 flex-1 items-start gap-2">
                    <input
                      type="checkbox"
                      checked={aan}
                      onChange={(e) => zet({ ...indeling, verborgen: e.target.checked ? indeling.verborgen.filter((x) => x !== id) : [...indeling.verborgen, id] })}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold" style={{ color: "var(--a-text)" }}>
                        {s?.naam ?? id}
                        {aan ? "" : " (verborgen)"}
                      </span>
                      <span className="block text-[11px]" style={mute}>
                        {s?.uitleg}
                      </span>
                    </span>
                  </label>
                  <button type="button" onClick={() => zet({ ...indeling, volgorde: verplaatsNaar(indeling.volgorde, i, i - 1) })} disabled={i === 0} aria-label={`${s?.naam ?? id} omhoog`} className={klein} style={knopStijl}>
                    ↑
                  </button>
                  <button type="button" onClick={() => zet({ ...indeling, volgorde: verplaatsNaar(indeling.volgorde, i, i + 1) })} disabled={i === indeling.volgorde.length - 1} aria-label={`${s?.naam ?? id} omlaag`} className={klein} style={knopStijl}>
                    ↓
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void opslaan()} disabled={bezig || !gewijzigd} className="a-button a-button-primary text-xs disabled:opacity-50">
              {bezig ? "Bezig…" : "Opslaan (meteen live)"}
            </button>
            <button type="button" onClick={() => void standaard()} disabled={bezig || !pagina.eigen} className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50" style={knopStijl}>
              Standaard
            </button>
            {gewijzigd ? (
              <span className="text-[11px]" style={mute}>
                Nog niet opgeslagen
              </span>
            ) : null}
          </div>
        </>
      ) : null}
      {melding ? (
        <p role={melding.fout ? "alert" : "status"} className="text-xs font-semibold" style={{ color: melding.fout ? "var(--a-crit)" : "var(--a-ok-ink)" }}>
          {melding.tekst}
        </p>
      ) : null}
    </section>
  );
}
