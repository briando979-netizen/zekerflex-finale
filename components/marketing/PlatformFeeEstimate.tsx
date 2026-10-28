"use client";

import { useMemo, useState } from "react";

const TIERS = [
  { fromHours: 0, rateCents: 350 },
  { fromHours: 500, rateCents: 325 },
  { fromHours: 2_000, rateCents: 300 },
  { fromHours: 10_000, rateCents: 275 },
  { fromHours: 50_000, rateCents: 250 },
] as const;

const euro = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
});

export function PlatformFeeEstimate() {
  const [hours, setHours] = useState(100);
  const estimate = useMemo(() => {
    let remaining = hours;
    let previousThreshold = 0;
    let subtotalCents = 0;

    for (const [index, tier] of TIERS.entries()) {
      const nextTier = TIERS[index + 1];
      const tierCapacity = nextTier ? nextTier.fromHours - previousThreshold : remaining;
      const tierHours = Math.min(remaining, tierCapacity);
      subtotalCents += tierHours * tier.rateCents;
      remaining -= tierHours;
      previousThreshold = tier.fromHours;

      if (remaining <= 0) break;
    }

    return { subtotalCents, vatCents: Math.round(subtotalCents * 0.21) };
  }, [hours]);

  return (
    <div className="mt-10 rounded-3xl border border-hair bg-white p-6 shadow-sm md:p-8">
      <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <label htmlFor="fee-estimate-hours" className="block font-display text-xl font-semibold text-ink">
            Bereken je maandelijkse platformkosten
          </label>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-neutralx-600">
            Vul het verwachte aantal goedgekeurde uren in. De staffelkorting geldt naarmate je deze maand meer uren goedkeurt.
          </p>
          <div className="mt-5 flex max-w-xs items-center gap-3">
            <input
              id="fee-estimate-hours"
              type="number"
              min={0}
              max={100_000}
              step={1}
              value={hours}
              onChange={(event) => {
                const value = Number(event.target.value);
                setHours(Number.isFinite(value) ? Math.min(100_000, Math.max(0, Math.floor(value))) : 0);
              }}
              className="w-32 rounded-xl border border-hair bg-paper px-4 py-3 text-lg font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
              aria-describedby="fee-estimate-note"
            />
            <span className="text-sm text-neutralx-600">uur per maand</span>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 rounded-2xl bg-paper-soft p-5 md:min-w-72">
          <dt className="text-sm text-neutralx-600">Platformkosten excl. btw</dt>
          <dd className="text-right font-semibold text-ink">{euro.format(estimate.subtotalCents / 100)}</dd>
          <dt className="text-sm text-neutralx-600">Btw (21%)</dt>
          <dd className="text-right font-semibold text-ink">{euro.format(estimate.vatCents / 100)}</dd>
          <dt className="border-t border-hair pt-3 font-semibold text-ink">Totaal incl. btw</dt>
          <dd className="border-t border-hair pt-3 text-right font-display text-xl font-bold text-ink">
            {euro.format((estimate.subtotalCents + estimate.vatCents) / 100)}
          </dd>
        </dl>
      </div>
      <p id="fee-estimate-note" className="mt-5 text-xs leading-relaxed text-neutralx-500">
        Indicatie op basis van de gepubliceerde staffels. De factuur volgt de goedgekeurde uren en het tarief dat op dat moment geldt; bedragen zijn afgerond en exclusief eventuele andere dienstkosten.
      </p>
    </div>
  );
}
