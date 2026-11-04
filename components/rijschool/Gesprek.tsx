"use client";

import { useEffect, useRef, useState } from "react";
import { BERICHT_MAX, type BerichtRij } from "@/lib/rijschool/berichten-lijst";
import { knop } from "@/lib/rijschool/kleuren";
import { datumKort, metHoofdletter, tijd } from "@/lib/rijschool/format";

// Het gesprek tussen een leerling en de rijschool (lib/rijschool/berichten.ts),
// voor de leerling-app en het beheer. Eigen berichten rechts in de kleur van de
// rijschool, die van de ander links; een datumregel bij elke nieuwe dag.

export function Gesprek({
  berichten,
  eigen,
  kleur,
  naamAnder,
  leeg,
  onStuur,
}: {
  berichten: BerichtRij[];
  /** wie dit scherm gebruikt: diens berichten staan rechts */
  eigen: "leerling" | "school";
  kleur: string;
  /** met wie je praat, voor schermlezers en de lege staat */
  naamAnder: string;
  leeg: string;
  /** verstuur; gooit een fout met een Nederlandse melding als het niet lukt */
  onStuur: (tekst: string) => Promise<void>;
}) {
  const [tekst, setTekst] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const lijst = useRef<HTMLDivElement>(null);
  const eigenKleur = knop(/^#[0-9a-fA-F]{6}$/.test(kleur) ? kleur : "#1D4E89");
  const isEigen = (b: BerichtRij) => b.vanLeerling === (eigen === "leerling");
  const laatsteEigen = [...berichten].reverse().find(isEigen);

  // bij een nieuw bericht naar onderen
  useEffect(() => {
    const el = lijst.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [berichten.length]);

  async function verstuur(e: { preventDefault: () => void }) {
    e.preventDefault();
    if (!tekst.trim() || bezig) return;
    setBezig(true);
    setFout(null);
    try {
      await onStuur(tekst);
      setTekst("");
    } catch (err) {
      setFout(err instanceof Error ? err.message : "Versturen lukte niet. Probeer het opnieuw.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {berichten.length === 0 ? (
        <p className="rounded-xl bg-paper-soft p-4 text-sm text-neutralx-600">{leeg}</p>
      ) : (
        // role="log" op een omhullende div: op de <ol> zelf verliezen de <li>'s hun lijst (axe listitem)
        <div ref={lijst} role="log" aria-live="polite" aria-label={`Berichten met ${naamAnder}`} className="max-h-[60vh] overflow-y-auto rounded-xl bg-paper-soft p-3">
          <ol className="space-y-2">
            {berichten.map((b, i) => {
              const dag = datumKort(b.at);
              const nieuweDag = i === 0 || datumKort(berichten[i - 1]?.at ?? b.at) !== dag;
              const mijn = isEigen(b);
              return (
                <li key={b.id}>
                  {nieuweDag && <p className="my-2 text-center text-xs font-medium text-neutralx-500">{metHoofdletter(dag)}</p>}
                  <div className={`flex ${mijn ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${mijn ? "rounded-br-md" : "rounded-bl-md bg-white ring-1 ring-hair"}`}
                      style={mijn ? { background: eigenKleur.achtergrond, color: eigenKleur.tekst } : undefined}
                    >
                      {!mijn && !b.vanLeerling && b.afzender && <p className="mb-0.5 text-xs font-semibold text-neutralx-600">{b.afzender}</p>}
                      <p className="whitespace-pre-line break-words">{b.tekst}</p>
                      <p className={`mt-1 text-right text-[0.7rem] ${mijn ? "opacity-80" : "text-neutralx-500"}`}>
                        <span className="sr-only">{mijn ? "Jij, " : `${b.afzender || naamAnder}, `}</span>
                        {tijd(b.at)}
                        {mijn && b.id === laatsteEigen?.id && b.gelezen ? " · gelezen" : ""}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <form onSubmit={verstuur} className="space-y-2">
        <label className="block">
          <span className="field-label">Je bericht</span>
          <textarea
            className="field-input min-h-[5.5rem]"
            value={tekst}
            onChange={(e) => setTekst(e.target.value)}
            onKeyDown={(e) => {
              // Ctrl/Cmd + Enter verstuurt; gewone Enter is een nieuwe regel
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void verstuur(e);
            }}
            maxLength={BERICHT_MAX}
            rows={3}
            aria-describedby={fout ? "gesprek-fout" : undefined}
          />
        </label>
        {fout && (
          <p id="gesprek-fout" role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-crit">
            {fout}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-neutralx-500" aria-live="polite">
            {tekst.length > BERICHT_MAX - 200 ? `Nog ${BERICHT_MAX - tekst.length} tekens` : ""}
          </span>
          <button type="submit" disabled={bezig || !tekst.trim()} className="rounded-full px-5 py-2.5 text-sm font-semibold disabled:opacity-50" style={{ background: eigenKleur.achtergrond, color: eigenKleur.tekst }}>
            {bezig ? "Versturen…" : "Versturen"}
          </button>
        </div>
      </form>
    </div>
  );
}
