"use client";

import Link from "next/link";
import { useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";
import { BELGISCHE_CONTRACTEN, LATERE_CONTRACTEN, type BelgischContract } from "@/lib/belgie/klus-kern";
import { BELGIE_ONDERGRENS_CENTS, FLEXI_HORECA_MINIMUM, belgischLoonOordeel } from "@/lib/belgie/lonen";
import { bedragTekst, type WeergaveTaal } from "@/lib/klusconcept/weergave";

// Het blok "Contract in België" in het klusformulier (components/app/NewShiftForm.tsx), alleen bij een werklocatie in België
// (28 nov 2026, lib/belgie/klus-kern.ts). Het bedrijf kiest student of flexi-job; uitzend en zelfstandige staan er uitgeschakeld
// bij met "volgt later". Onder het GGMMI-uurloon een waarschuwing (geen blokkade); de harde ondergrens bewaakt het formulier zelf
// met zijn minimum (lib/belgie/lonen.ts → belgischMinimumCents) en de server nog eens. De keuze gaat mee als verborgen velden.

export function BelgieKlusKeuze({
  soort,
  onSoort,
  horeca,
  onHoreca,
  uurloonCents,
  dag,
  taal,
  fout,
}: {
  soort: BelgischContract | null;
  onSoort: (soort: BelgischContract) => void;
  horeca: boolean;
  onHoreca: (horeca: boolean) => void;
  uurloonCents: number;
  /** de dag van de klus (yyyy-mm-dd), voor het GGMMI dat dan geldt */
  dag: string;
  taal: WeergaveTaal;
  /** het formulier werd ingediend zonder soort */
  fout: boolean;
}) {
  const b = useT().belgie;
  const oordeel = belgischLoonOordeel({ soort, horeca, uurloonCents, dag });
  const label: Record<BelgischContract, { titel: string; uitleg: string }> = {
    student: { titel: b.soortStudent, uitleg: b.soortStudentUitleg },
    flexi: { titel: b.soortFlexi, uitleg: b.soortFlexiUitleg },
  };
  const later: Record<(typeof LATERE_CONTRACTEN)[number], string> = { uitzend: b.soortUitzend, zelfstandige: b.soortZelfstandige };

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-neutralx-600">{b.formUitleg}</p>
      <fieldset aria-describedby={fout && !soort ? "belgie-soort-fout" : undefined}>
        <legend className="field-label">{b.soortLabel}</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {BELGISCHE_CONTRACTEN.map((s) => (
            <label
              key={s}
              className={`flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${soort === s ? "border-brand-500 bg-brand-50" : "border-hair bg-white"}`}
            >
              <input type="radio" name="belgieContractKeuze" value={s} checked={soort === s} onChange={() => onSoort(s)} className="mt-1 accent-brand-500" />
              <span>
                <span className="block font-semibold text-ink">{label[s].titel}</span>
                <span className="mt-0.5 block text-xs text-neutralx-600">{label[s].uitleg}</span>
              </span>
            </label>
          ))}
          {LATERE_CONTRACTEN.map((s) => (
            <label key={s} className="flex min-h-[44px] items-start gap-3 rounded-xl border border-hair bg-paper-soft p-3 text-sm text-neutralx-500">
              <input type="radio" name="belgieContractKeuze" value={s} disabled className="mt-1" />
              <span>
                <span className="block font-semibold">{later[s]}</span>
                <span className="mt-0.5 block text-xs">{b.volgtLater}</span>
              </span>
            </label>
          ))}
        </div>
        {fout && !soort && (
          <p id="belgie-soort-fout" role="alert" className="mt-2 text-sm font-medium text-crit">
            {b.kiesSoort}
          </p>
        )}
      </fieldset>

      {soort === "flexi" && (
        <div>
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={horeca} onChange={(e) => onHoreca(e.target.checked)} className="accent-brand-500" />
            {b.horecaLabel}
          </label>
          {horeca && <p className="text-xs text-neutralx-500">{fmt(b.horecaUitleg, { min: bedragTekst(FLEXI_HORECA_MINIMUM.cents, taal) })}</p>}
        </div>
      )}
      {soort === "student" && <p className="text-xs text-neutralx-500">{fmt(b.studentLoon, { min: bedragTekst(BELGIE_ONDERGRENS_CENTS, taal) })}</p>}

      {uurloonCents > 0 && !oordeel.blokkade && oordeel.onderGgmmi && (
        <p role="status" className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-neutralx-700">
          {fmt(b.onderGgmmi, { bedrag: bedragTekst(uurloonCents, taal), ggmmi: bedragTekst(oordeel.ggmmiCents, taal) })}
        </p>
      )}

      <p className="text-xs">
        <Link href="/belgie/voorwaarden" target="_blank" className="inline-flex min-h-[44px] items-center font-semibold text-brand-600 hover:underline sm:min-h-0">
          {b.voorwaardenLink}
        </Link>
      </p>

      <input type="hidden" name="belgieContract" value={soort ?? ""} />
      <input type="hidden" name="belgieHoreca" value={soort === "flexi" && horeca ? "on" : ""} />
    </div>
  );
}
