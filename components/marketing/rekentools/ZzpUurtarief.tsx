"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { nettoFromRate, requiredRate, URENCRITERIUM_HOURS } from "@/lib/rekentools/uurtarief";
import { centsFrom, euroCents, euroWhole, hoursNl, numberFrom } from "@/lib/rekentools/invoer";
import { Groep, Veld } from "@/components/marketing/rekentools/Veld";

type Mode = "tarief" | "netto";

export function ZzpUurtarief() {
  const [mode, setMode] = useState<Mode>("tarief");
  const [netto, setNetto] = useState("3.000");
  const [rate, setRate] = useState("45,00");
  const [hoursPerWeek, setHoursPerWeek] = useState("40");
  const [billablePct, setBillablePct] = useState("75");
  const [vacationWeeks, setVacationWeeks] = useState("5");
  const [offDays, setOffDays] = useState("10");
  const [costs, setCosts] = useState("300");
  const [pension, setPension] = useState("250");
  const [aov, setAov] = useState("250");
  const [taxPct, setTaxPct] = useState("30");

  const r = useMemo(() => {
    const base = {
      hoursPerWeek: numberFrom(hoursPerWeek),
      billablePct: numberFrom(billablePct),
      vacationWeeks: numberFrom(vacationWeeks),
      offDays: numberFrom(offDays),
      costsPerMonthCents: centsFrom(costs),
      pensionPerMonthCents: centsFrom(pension),
      aovPerMonthCents: centsFrom(aov),
      taxPct: numberFrom(taxPct),
    };
    return mode === "tarief"
      ? requiredRate({ ...base, nettoPerMonthCents: centsFrom(netto) })
      : nettoFromRate({ ...base, rateCents: centsFrom(rate) });
  }, [mode, netto, rate, hoursPerWeek, billablePct, vacationWeeks, offDays, costs, pension, aov, taxPct]);

  // One colour family for money (gold), neutrals for what goes elsewhere.
  const parts = [
    { key: "netto", label: "Netto voor jou", cents: Math.max(0, r.nettoCents), className: "bg-money" },
    { key: "pensioen", label: "Pensioen en AOV", cents: r.pensionAovCents, className: "bg-money-bright" },
    { key: "belasting", label: "Belasting (reservering)", cents: r.taxCents, className: "bg-neutralx-400" },
    { key: "kosten", label: "Zakelijke kosten", cents: r.costsCents, className: "bg-hairstrong" },
  ];
  const total = parts.reduce((s, p) => s + p.cents, 0);
  const noHours = r.billableHours <= 0;

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
      <div className="space-y-5">
        <div
          role="group"
          aria-label="Wat wil je berekenen?"
          className="grid grid-cols-2 rounded-3xl border border-hair bg-white p-1 sm:inline-grid sm:rounded-full"
        >
          {(
            [
              ["tarief", "Welk tarief heb ik nodig?"],
              ["netto", "Wat houd ik over?"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={mode === key}
              onClick={() => setMode(key)}
              className={`rounded-full px-3 py-2 text-sm font-semibold leading-tight transition-colors sm:px-4 ${
                mode === key ? "bg-ink text-white" : "text-neutralx-600 hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <Groep title={mode === "tarief" ? "Wat wil je overhouden?" : "Wat reken je?"}>
          {mode === "tarief" ? (
            <Veld
              id="zt-netto"
              label="Netto per maand"
              value={netto}
              onChange={setNetto}
              prefix="€"
              hint="Wat je privé wilt kunnen uitgeven, na belasting, pensioen en verzekering."
            />
          ) : (
            <Veld id="zt-rate" label="Je uurtarief, excl. btw" value={rate} onChange={setRate} prefix="€" />
          )}
        </Groep>

        <Groep title="Je werktijd">
          <Veld id="zt-hours" label="Uren per week" value={hoursPerWeek} onChange={setHoursPerWeek} suffix="uur" />
          <Veld
            id="zt-billable"
            label="Declarabel"
            value={billablePct}
            onChange={setBillablePct}
            suffix="%"
            hint="Het deel dat je kunt factureren. De rest gaat op aan klanten zoeken en administratie."
          />
          <Veld id="zt-vacation" label="Vakantie" value={vacationWeeks} onChange={setVacationWeeks} suffix="weken per jaar" />
          <Veld id="zt-off" label="Feestdagen en ziekte" value={offDays} onChange={setOffDays} suffix="dagen per jaar" />
        </Groep>

        <Groep title="Je vaste lasten">
          <Veld
            id="zt-costs"
            label="Zakelijke kosten"
            value={costs}
            onChange={setCosts}
            prefix="€"
            suffix="per maand"
            hint="Telefoon, laptop, gereedschap, vervoer, boekhouder, aansprakelijkheidsverzekering."
          />
          <Veld id="zt-pension" label="Pensioen opzij" value={pension} onChange={setPension} prefix="€" suffix="per maand" />
          <Veld
            id="zt-aov"
            label="Arbeidsongeschiktheid (AOV)"
            value={aov}
            onChange={setAov}
            prefix="€"
            suffix="per maand"
          />
          <Veld
            id="zt-tax"
            label="Belasting reserveren"
            value={taxPct}
            onChange={setTaxPct}
            suffix="% van je winst"
            hint="Vuistregel: 30 tot 40%. Met zelfstandigenaftrek en heffingskortingen valt het vaak lager uit."
          />
        </Groep>
      </div>

      <div className="rounded-3xl border border-hair bg-white p-6 shadow-sm md:p-8 lg:sticky lg:top-24" aria-live="polite">
        {mode === "tarief" ? (
          <>
            <p className="eyebrow">Je minimale uurtarief</p>
            <p className="num mt-3 font-display text-5xl font-bold text-ink">{noHours ? "—" : euroCents(r.rateCents)}</p>
            <p className="mt-1 text-sm text-neutralx-600">
              excl. btw · {noHours ? "vul je werkuren in" : `${euroWhole(r.dayRateCents)} per dag van 8 uur`}
            </p>
          </>
        ) : (
          <>
            <p className="eyebrow">Netto per maand</p>
            <p className={`num mt-3 font-display text-5xl font-bold ${r.nettoCents < 0 ? "text-red-700" : "text-ink"}`}>
              {euroWhole(r.nettoPerMonthCents)}
            </p>
            <p className="mt-1 text-sm text-neutralx-600">
              {r.nettoCents < 0 ? "Je kosten zijn hoger dan je omzet bij dit tarief." : `${euroWhole(r.nettoCents)} per jaar`}
            </p>
          </>
        )}

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-hair pt-5 text-sm">
          <dt className="text-neutralx-600">Declarabele uren per jaar</dt>
          <dd className="num text-right font-semibold text-ink">{hoursNl(r.billableHours)}</dd>
          <dt className="text-neutralx-600">Omzet per jaar</dt>
          <dd className="num text-right font-semibold text-ink">{euroWhole(r.revenueCents)}</dd>
        </dl>

        {total > 0 ? (
          <div className="mt-5">
            <div className="flex h-3 overflow-hidden rounded-full bg-paper-soft" aria-hidden>
              {parts.map((p) => (p.cents > 0 ? <div key={p.key} className={p.className} style={{ width: `${(p.cents / total) * 100}%` }} /> : null))}
            </div>
            <ul className="mt-3 space-y-1.5 text-sm">
              {parts.map((p) => (
                <li key={p.key} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-neutralx-600">
                    <span className={`h-2.5 w-2.5 rounded-full ${p.className}`} aria-hidden />
                    {p.label}
                  </span>
                  <span className="num text-ink">{euroWhole(p.cents)} per jaar</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p
          className={`mt-5 rounded-2xl p-4 text-sm ${r.meetsUrencriterium ? "bg-mintwash text-brand-700" : "bg-paper-soft text-neutralx-600"}`}
        >
          {r.meetsUrencriterium
            ? `Met ${hoursNl(r.workedHours)} werkuren per jaar haal je het urencriterium van ${hoursNl(URENCRITERIUM_HOURS)} uur. Dan kun je in aanmerking komen voor de zelfstandigenaftrek.`
            : `Met ${hoursNl(r.workedHours)} werkuren per jaar haal je het urencriterium van ${hoursNl(URENCRITERIUM_HOURS)} uur niet. Zonder zelfstandigenaftrek betaal je meer belasting.`}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/register" className="btn-primary">
            Gratis profiel maken
          </Link>
          <Link href="/klussen" className="btn-ghost">
            Bekijk open klussen
          </Link>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-neutralx-500">
          Via ZekerFlex houd je je hele tarief: de platformkosten betaalt de opdrachtgever en wachten op de gewone
          uitbetaling is gratis. Dit is een indicatie, geen
          belastingadvies. Je werkelijke belasting hangt af van je aftrekposten, heffingskortingen en de Zvw-bijdrage.
        </p>
      </div>
    </div>
  );
}
