"use client";

import { useState } from "react";
import { OnderSheet } from "@/components/app/OnderSheet";
import type { Locale } from "@/lib/i18n/config";
import {
  NIVEAU_LABELS,
  OPLEIDING_NIVEAUS,
  RICHTING_LABELS,
  filterRichtingen,
  heeftRichting,
  type Opleiding,
  type OpleidingNiveau,
  type OpleidingRichting,
} from "@/lib/onboarding/opleiding";

// De twee sheets voor "Opleiding" (optioneel): eerst het niveau, daarna (bij MBO, HBO of Universiteit)
// de studierichting met een zoekveld en een lijst met een vinkje bij de gekozen richting.

type Teksten = { niveauTitel: string; wis: string; richtingTitel: string; zoek: string; geenResultaat: string; annuleren: string; gekozen: string };

const RIJ = "flex w-full items-center justify-between gap-3 border-t border-hair px-6 py-3.5 text-left text-base text-ink hover:bg-paper-soft focus-visible:bg-paper-soft";

export function OpleidingSheets({
  open,
  waarde,
  locale,
  teksten,
  onKies,
  onSluit,
}: {
  open: boolean;
  waarde: Opleiding | null;
  locale: Locale;
  teksten: Teksten;
  /** null = de keuze wissen */
  onKies: (o: Opleiding | null) => void;
  onSluit: () => void;
}) {
  const [niveau, setNiveau] = useState<OpleidingNiveau | null>(null);
  const [zoek, setZoek] = useState("");

  function sluit() {
    setNiveau(null);
    setZoek("");
    onSluit();
  }
  function kiesNiveau(n: OpleidingNiveau) {
    if (heeftRichting(n)) {
      setZoek("");
      setNiveau(n);
      return;
    }
    onKies({ niveau: n });
    sluit();
  }
  function kiesRichting(r: OpleidingRichting) {
    if (niveau) onKies({ niveau, richting: r });
    sluit();
  }

  const richtingen = filterRichtingen(zoek, locale);

  return (
    <>
      <OnderSheet open={open && niveau === null} titelId="opl-niveau" titel={teksten.niveauTitel} onSluit={sluit}>
        <div role="radiogroup" aria-labelledby="opl-niveau" className="mt-2 overflow-y-auto">
          {OPLEIDING_NIVEAUS.map((n) => (
            <button key={n} type="button" role="radio" aria-checked={waarde?.niveau === n} onClick={() => kiesNiveau(n)} className={RIJ}>
              {NIVEAU_LABELS[locale][n]}
              {waarde?.niveau === n && <span aria-hidden className="text-brand-600">✓</span>}
            </button>
          ))}
          {waarde && (
            <button
              type="button"
              onClick={() => {
                onKies(null);
                sluit();
              }}
              className={`${RIJ} text-neutralx-600`}
            >
              {teksten.wis}
            </button>
          )}
          <button type="button" onClick={sluit} className={`${RIJ} justify-center font-semibold text-brand-600`}>
            {teksten.annuleren}
          </button>
        </div>
      </OnderSheet>

      <OnderSheet open={open && niveau !== null} titelId="opl-richting" titel={teksten.richtingTitel} onSluit={sluit}>
        <div className="px-6 pb-3">
          <label className="block">
            <span className="sr-only">{teksten.zoek}</span>
            <input
              type="search"
              value={zoek}
              onChange={(e) => setZoek(e.target.value)}
              placeholder={teksten.zoek}
              autoComplete="off"
              className="field-input"
            />
          </label>
        </div>
        <div role="listbox" aria-labelledby="opl-richting" className="overflow-y-auto">
          {richtingen.length === 0 && <p role="status" className="border-t border-hair px-6 py-4 text-sm text-neutralx-500">{teksten.geenResultaat}</p>}
          {richtingen.map((r) => {
            const aan = waarde?.niveau === niveau && waarde?.richting === r;
            return (
              <button key={r} type="button" role="option" aria-selected={aan} onClick={() => kiesRichting(r)} className={RIJ}>
                <span>
                  {RICHTING_LABELS[locale][r]}
                  {aan && <span className="sr-only"> ({teksten.gekozen})</span>}
                </span>
                {aan && <span aria-hidden className="text-brand-600">✓</span>}
              </button>
            );
          })}
        </div>
        <button type="button" onClick={sluit} className={`${RIJ} justify-center font-semibold text-brand-600`}>
          {teksten.annuleren}
        </button>
      </OnderSheet>
    </>
  );
}
