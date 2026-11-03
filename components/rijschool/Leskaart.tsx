"use client";

import { FASES, SCORES, type Voortgang } from "@/lib/rijschool/leskaart";
import { ScoreBolletjes, Voortgangsbalk } from "@/components/rijschool/ui";
import { datumKort } from "@/lib/rijschool/format";

// De leskaart als overzicht: per fase hoe ver de leerling is en per onderdeel
// de laatste beoordeling met de notitie van de instructeur. Gedeeld door de
// leerling-app en de instructeur-app.

export function Leskaart({ voortgang, kleur, onUitleg }: { voortgang: Voortgang; kleur: string; onUitleg?: (sleutel: string) => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-hair bg-white p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm text-neutralx-600">Op weg naar je examen</p>
            <p className="num font-display text-4xl font-bold">{voortgang.procent}%</p>
          </div>
          {voortgang.examenklaar && <span className="pill-ok">Klaar voor het examen</span>}
        </div>
        <div className="mt-3">
          <Voortgangsbalk procent={voortgang.procent} kleur={kleur} label="Totale voortgang" />
        </div>
        <p className="mt-3 text-xs text-neutralx-500">
          Schaal: {SCORES.map((s) => `${s.score} = ${s.label.toLowerCase()}`).join(" · ")}
        </p>
      </div>
      {FASES.map((fase) => {
        const p = voortgang.perFase.find((f) => f.sleutel === fase.sleutel)?.procent ?? 0;
        return (
          <section key={fase.sleutel} className="rounded-2xl border border-hair bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">{fase.titel}</h3>
              <span className="num text-sm font-semibold text-neutralx-600">{p}%</span>
            </div>
            <div className="mt-2">
              <Voortgangsbalk procent={p} kleur={kleur} label={`Voortgang ${fase.titel}`} />
            </div>
            <ul className="mt-3 divide-y divide-hair">
              {fase.onderdelen.map((o) => {
                const s = voortgang.stand[o.sleutel];
                return (
                  <li key={o.sleutel} className="py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      {onUitleg ? (
                        <button type="button" className="text-left text-sm font-medium underline-offset-2 hover:underline" onClick={() => onUitleg(o.sleutel)}>
                          {o.titel}
                        </button>
                      ) : (
                        <span className="text-sm font-medium">{o.titel}</span>
                      )}
                      {s ? <ScoreBolletjes score={s.score} kleur={kleur} /> : <span className="text-xs text-neutralx-500">Nog niet aan bod</span>}
                    </div>
                    {s?.notitie && (
                      <p className="mt-1 text-xs text-neutralx-600">
                        “{s.notitie}” <span className="text-neutralx-500">({datumKort(s.at)})</span>
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
