"use client";

import Link from "next/link";
import { BASIS, BUNDEL, MODULES, MODULE_SLEUTELS } from "@/lib/horeca/modules";
import { euro } from "@/lib/horeca/weergave";
import type { BeheerData, Doe } from "@/components/horeca/beheer/types";

// Modules & abonnement: de basis zit er altijd in, losse modules zet de zaak
// aan of uit. Wat nog niet klaar is, staat er eerlijk als "binnenkort" en is
// niet aan te zetten (de server weigert het ook).

export function ModulesTab({ data, doe }: { data: BeheerData; doe: Doe }) {
  const aan = new Set(data.zaak.modules);
  return (
    <div className="space-y-5">
      <section className="card flex flex-wrap items-end justify-between gap-4 p-5">
        <div>
          <h2 className="font-display text-lg font-bold text-ink">Jullie abonnement</h2>
          <p className="mt-1 text-sm text-neutralx-600">
            {BASIS.naam} {euro(BASIS.prijsCentPerMaand)} plus de modules die aan staan. Alles aan? Dan betaal je {euro(BUNDEL.prijsCentPerMaand)} voor {BUNDEL.naam}.
          </p>
          <p className="mt-1 text-xs text-neutralx-500">Voorbeeldprijzen; je betaalt nog niets zolang het abonnement niet is gestart.</p>
        </div>
        <p className="font-display text-3xl font-bold text-ink">
          {euro(data.maand.totaalCent)}
          <span className="text-base font-semibold text-neutralx-500"> / maand</span>
        </p>
      </section>

      <ul className="grid gap-4 md:grid-cols-2">
        <li className="card p-5">
          <p className="flex items-center justify-between gap-2">
            <span className="font-display text-lg font-bold text-ink">{BASIS.naam}</span>
            <span className="pill-ok">Altijd aan</span>
          </p>
          <p className="mt-1 text-sm text-neutralx-600">{BASIS.kort}</p>
          <p className="mt-2 text-sm font-semibold text-ink">{euro(BASIS.prijsCentPerMaand)} per maand</p>
        </li>
        {MODULE_SLEUTELS.map((k) => {
          const m = MODULES[k];
          const isAan = aan.has(k);
          const nodig = m.vereist.map((v) => MODULES[v].naam);
          return (
            <li key={k} className="card flex flex-col p-5">
              <p className="flex items-center justify-between gap-2">
                <span className="font-display text-lg font-bold text-ink">{m.naam}</span>
                {!m.klaar ? <span className="pill-neutral">Binnenkort</span> : isAan ? <span className="pill-ok">Aan</span> : <span className="pill-neutral">Uit</span>}
              </p>
              <p className="mt-1 text-sm text-neutralx-600">{m.kort}</p>
              <ul className="mt-2 space-y-1 text-sm text-ink">
                {m.punten.map((p) => (
                  <li key={p} className="flex gap-2">
                    <span aria-hidden className="text-ok">
                      ✓
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm font-semibold text-ink">
                {m.prijsCentPerMaand ? `${euro(m.prijsCentPerMaand)} per maand` : "Geen maandbedrag"}
                {m.prijsUitleg && <span className="font-normal text-neutralx-500">, {m.prijsUitleg}</span>}
              </p>
              {nodig.length > 0 && <p className="mt-1 text-xs text-neutralx-500">Werkt samen met: {nodig.join(", ")} (gaat vanzelf mee aan).</p>}
              <div className="mt-auto flex flex-wrap gap-2 pt-4">
                {m.klaar ? (
                  <button
                    type="button"
                    className={isAan ? "btn-ghost" : "btn-primary"}
                    onClick={() => void doe({ actie: "module", module: k, aan: !isAan }, isAan ? `${m.naam} staat uit.` : `${m.naam} staat aan.`)}
                  >
                    {isAan ? "Uitzetten" : "Aanzetten"}
                  </button>
                ) : (
                  <p className="text-sm text-neutralx-500">Deze module komt binnenkort in het horeca-pakket.</p>
                )}
                {k === "personeel" && isAan && (
                  <Link href="/werkgever/diensten" className="btn-ghost">
                    Dienst plaatsen
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
