"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { compareFlexCost } from "@/lib/rekentools/kosten";
import { centsFrom, euroCents, euroWhole, hoursNl, numberFrom } from "@/lib/rekentools/invoer";
import { Groep, Veld } from "@/components/marketing/rekentools/Veld";

export function KostenFlexkracht() {
  const [workers, setWorkers] = useState("1");
  const [hoursPerWeek, setHoursPerWeek] = useState("24");
  const [weeks, setWeeks] = useState("12");
  const [wage, setWage] = useState("16,00");
  const [factor, setFactor] = useState("1,9");
  const [rate, setRate] = useState("25,00");

  const r = useMemo(
    () =>
      compareFlexCost({
        workers: numberFrom(workers),
        hoursPerWeek: numberFrom(hoursPerWeek),
        weeks: numberFrom(weeks),
        wageCents: centsFrom(wage),
        factor: numberFrom(factor),
        rateCents: centsFrom(rate),
      }),
    [workers, hoursPerWeek, weeks, wage, factor, rate],
  );

  const max = Math.max(r.bureau.perHourCents, r.zekerflex.perHourCents, 1);
  const verdict =
    r.totalHours <= 0
      ? null
      : r.savingCents > 0
        ? { good: true, text: `Via ZekerFlex bespaar je ${euroWhole(r.savingCents)}`, sub: `${euroCents(r.savingPerHourCents)} per uur, over ${hoursNl(r.totalHours)} uur` }
        : r.savingCents < 0
          ? { good: false, text: `Bij deze aannames is het uitzendbureau ${euroWhole(-r.savingCents)} goedkoper`, sub: "Pas het tarief of de omrekenfactor aan naar jouw situatie." }
          : { good: false, text: "Bij deze aannames is het even duur", sub: `Over ${hoursNl(r.totalHours)} uur` };

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
      <div className="space-y-5">
        <Groep title="Wat heb je nodig?">
          <Veld id="kf-workers" label="Aantal krachten" value={workers} onChange={setWorkers} />
          <Veld id="kf-hours" label="Uren per week" value={hoursPerWeek} onChange={setHoursPerWeek} suffix="per kracht" />
          <Veld id="kf-weeks" label="Hoeveel weken" value={weeks} onChange={setWeeks} suffix="weken" />
        </Groep>
        <Groep title="Via een uitzendbureau">
          <Veld id="kf-wage" label="Bruto uurloon van de kracht" value={wage} onChange={setWage} prefix="€" />
          <Veld
            id="kf-factor"
            label="Omrekenfactor"
            value={factor}
            onChange={setFactor}
            suffix="× uurloon"
            hint="Vaak tussen 1,6 en 2,2. Vraag je eigen factor na bij je bureau."
          />
        </Groep>
        <Groep title="Via ZekerFlex">
          <Veld
            id="kf-rate"
            label="Uurtarief van de zzp'er of flexwerker"
            value={rate}
            onChange={setRate}
            prefix="€"
            hint="De kracht bepaalt zelf het tarief. Daarbovenop komen alleen de platformkosten."
          />
        </Groep>
      </div>

      <div className="rounded-3xl border border-hair bg-white p-6 shadow-sm md:p-8 lg:sticky lg:top-24" aria-live="polite">
        <p className="eyebrow">Per uur, excl. btw</p>
        <dl className="mt-5 space-y-5">
          <div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-sm text-neutralx-600">Uitzendbureau</dt>
              <dd className="num font-display text-2xl font-bold text-ink">{euroCents(r.bureau.perHourCents)}</dd>
            </div>
            <div className="mt-2 h-2.5 rounded-full bg-paper-soft" aria-hidden>
              <div className="h-2.5 rounded-full bg-neutralx-400" style={{ width: `${(r.bureau.perHourCents / max) * 100}%` }} />
            </div>
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-sm text-neutralx-600">Via ZekerFlex</dt>
              <dd className="num font-display text-2xl font-bold text-ink">{euroCents(r.zekerflex.perHourCents)}</dd>
            </div>
            <div className="mt-2 h-2.5 rounded-full bg-paper-soft" aria-hidden>
              <div className="h-2.5 rounded-full bg-brand-500" style={{ width: `${(r.zekerflex.perHourCents / max) * 100}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-neutralx-500">
              {euroCents(r.zekerflex.rateCents)} tarief + {euroCents(r.zekerflex.feePerHourCents)} platformkosten
              {r.zekerflex.feePerHourCents < 350 ? " (met staffelkorting)" : ""}
            </p>
          </div>
        </dl>

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-hair pt-5 text-sm">
          <dt className="text-neutralx-600">Totaal uitzendbureau</dt>
          <dd className="num text-right font-semibold text-ink">{euroWhole(r.bureau.totalCents)}</dd>
          <dt className="text-neutralx-600">Totaal via ZekerFlex</dt>
          <dd className="num text-right font-semibold text-ink">{euroWhole(r.zekerflex.totalCents)}</dd>
          <dt className="text-neutralx-600">Waarvan platformkosten</dt>
          <dd className="num text-right text-neutralx-600">{euroWhole(r.zekerflex.feeTotalCents)}</dd>
        </dl>

        {verdict ? (
          <div className={`mt-6 rounded-2xl p-4 ${verdict.good ? "bg-mintwash" : "bg-paper-soft"}`}>
            <p className={`font-display text-lg font-semibold ${verdict.good ? "text-brand-700" : "text-ink"}`}>{verdict.text}</p>
            <p className="mt-0.5 text-sm text-neutralx-600">{verdict.sub}</p>
          </div>
        ) : (
          <p className="mt-6 rounded-2xl bg-paper-soft p-4 text-sm text-neutralx-600">Vul het aantal krachten, uren en weken in.</p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/register?type=bedrijf" className="btn-primary">
            Gratis klus plaatsen
          </Link>
          <Link href="/uitzendbureau" className="btn-ghost">
            Liever uitzendkrachten?
          </Link>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-neutralx-500">
          Indicatie. Toeslagen voor avond, weekend of feestdag en reiskosten zijn aan geen van beide kanten meegerekend.
          Bij ZekerFlex daalt de platformfee vanaf 500 uur per maand, over alle krachten van je organisatie samen.
        </p>
      </div>
    </div>
  );
}
