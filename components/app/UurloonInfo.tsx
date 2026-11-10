"use client";

import { useState } from "react";
import { useFT } from "@/components/i18n/useFT";
import { OnderSheet } from "@/components/app/OnderSheet";
import type { UurloonOpbouw } from "@/lib/payroll/uurloon-opbouw";

// Het rondje met de i naast het uurloon van een uitzendklus: een onderste sheet met de opbouw
// (bruto uurloon, vakantiegeld, vakantiedagen, totaal) op basis van de leeftijd van de werker.
const euro = (cents: number) => `€ ${(cents / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => String(n).replace(".", ",");

export function UurloonInfo({ opbouw }: { opbouw: UurloonOpbouw }) {
  const t = useFT().uurloon;
  const [open, setOpen] = useState(false);
  const leeftijd =
    opbouw.leeftijd === null ? null : opbouw.leeftijd >= 21 ? t.ouder.replace("{n}", "21") : t.jaar.replace("{n}", String(opbouw.leeftijd));
  const rij = "flex items-start justify-between gap-4";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t.info}
        className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full border border-hairstrong text-xs font-semibold text-ink hover:bg-paper-soft"
      >
        <span aria-hidden>i</span>
      </button>
      <OnderSheet open={open} titelId="uurloon-titel" titel={t.title} onSluit={() => setOpen(false)}>
        <div className="overflow-y-auto px-6 pb-2">
          <p className="text-sm leading-relaxed text-neutralx-700">
            {leeftijd === null ? t.introZonder : t.introLeeftijd.replace("{leeftijd}", leeftijd)}
          </p>
          <div className="mt-4 rounded-xl bg-paper-soft p-4 text-sm">
            <div className={rij}>
              <div>
                <p className="text-ink">{t.bruto}</p>
                {leeftijd !== null && <p className="text-xs text-neutralx-500">{leeftijd}</p>}
                {opbouw.minimumToegepast && <p className="text-xs text-neutralx-500">{t.brutoMin}</p>}
              </div>
              <p className="num whitespace-nowrap font-semibold text-ink">{euro(opbouw.brutoCents)}</p>
            </div>
            <div className={`${rij} mt-4`}>
              <div>
                <p className="text-ink">{t.vakantiegeld}</p>
                <p className="text-xs text-neutralx-500">{t.vakantiegeldSub.replace("{pct}", pct(opbouw.vakantiegeldPct))}</p>
              </div>
              <p className="num whitespace-nowrap font-semibold text-ink">{euro(opbouw.vakantiegeldCents)}</p>
            </div>
            <div className={`${rij} mt-4`}>
              <div>
                <p className="text-ink">{t.vakantiedagen}</p>
                <p className="text-xs text-neutralx-500">{t.vakantiedagenSub.replace("{pct}", pct(opbouw.vakantiedagenPct))}</p>
              </div>
              <p className="num whitespace-nowrap font-semibold text-ink">{euro(opbouw.vakantiedagenCents)}</p>
            </div>
            <div className={`${rij} mt-4 border-t border-hair pt-4`}>
              <p className="font-bold text-ink">{t.totaal}</p>
              <p className="num whitespace-nowrap font-bold text-ink">{euro(opbouw.totaalCents)}</p>
            </div>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-neutralx-500">{t.voet}</p>
        </div>
        <div className="px-6 pb-6 pt-3">
          <button type="button" onClick={() => setOpen(false)} className="btn-primary block w-full py-3.5 text-center text-base">
            {t.sluiten}
          </button>
        </div>
      </OnderSheet>
    </>
  );
}
