"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";

interface Tier {
  name: string;
  fromHours: number;
  factor: number;
}
interface Data {
  monthHours: number;
  tier: Tier;
  next: Tier | null;
  feePerHourCents: number;
  baseFeePerHourCents: number;
  hoursToNext: number | null;
  tiers: Tier[];
}

const euro = (c: number, loc: string) => new Intl.NumberFormat(loc, { style: "currency", currency: "EUR" }).format(c / 100);

/** Werkgever: staffelkorting — this month's hours and the fee per hour. */
export function VolumeCard() {
  const { locale, t: dict } = useI18n();
  const v = dict.volumeKaart;
  const loc = locale === "nl" ? "nl-NL" : "en-GB";
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => {
    void fetch("/api/werkgever/volume", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => x && setD(x));
  }, []);
  if (!d) return null;
  const pct = d.next ? Math.min(100, Math.round(((d.monthHours - d.tier.fromHours) / (d.next.fromHours - d.tier.fromHours)) * 100)) : 100;

  return (
    <div className="card space-y-4 p-5">
      <div className="flex flex-wrap items-end gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">{v.kop}</span>
          <span className="block text-xs text-neutralx-500">{v.uitleg}</span>
        </span>
        <span className="text-right">
          <span className="num block font-display text-2xl font-bold text-ink">{euro(d.feePerHourCents, loc)}</span>
          <span className="block text-xs text-neutralx-500">{fmt(v.perUurStaffel, { naam: d.tier.name })}</span>
        </span>
      </div>
      <div>
        <div className="h-2 overflow-hidden rounded-full bg-paper-soft">
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-xs text-neutralx-500">
          {fmt(v.urenMaand, { uren: d.monthHours.toLocaleString(loc) })}
          {d.next && d.hoursToNext !== null
            ? fmt(v.nogTot, { uren: d.hoursToNext.toLocaleString(loc), naam: d.next.name, prijs: euro(Math.round(d.baseFeePerHourCents * d.next.factor), loc) })
            : v.hoogste}
        </p>
      </div>
      <ul className="grid gap-1.5 text-xs sm:grid-cols-5">
        {d.tiers.map((t) => (
          <li key={t.name} className={`rounded-lg border px-2 py-1.5 ${t.name === d.tier.name ? "border-brand-500 bg-brand-50 font-semibold text-brand-700" : "border-hair text-neutralx-600"}`}>
            <span className="block">{t.name}</span>
            <span className="block">{fmt(v.perU, { prijs: euro(Math.round(d.baseFeePerHourCents * t.factor), loc) })}</span>
            <span className="block text-[10px] text-neutralx-500">{fmt(v.vanaf, { uren: t.fromHours.toLocaleString(loc) })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
