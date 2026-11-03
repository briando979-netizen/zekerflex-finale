"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  DBA_GROUP_LABELS,
  DBA_MAX_SCORE,
  DBA_QUESTIONS,
  dbaLevelText,
  dbaText,
  scoreDba,
  type DbaAnswer,
  type DbaGroup,
  type DbaLevel,
  type DbaRol,
} from "@/lib/rekentools/dba-check";
import { useEersteGebruik } from "@/components/marketing/rekentools/Veld";
import { StuurUitkomst } from "@/components/marketing/rekentools/StuurUitkomst";

const OPTIONS: [DbaAnswer, string][] = [
  ["ja", "Ja"],
  ["deels", "Deels"],
  ["nee", "Nee"],
];

const ROLLEN: [DbaRol, string][] = [
  ["opdrachtgever", "Ik ben opdrachtgever"],
  ["zzp", "Ik ben zzp'er"],
];

const GROUPS = Object.keys(DBA_GROUP_LABELS) as DbaGroup[];

const LEVEL_CLASS: Record<DbaLevel, string> = {
  laag: "bg-mintwash text-brand-700",
  letop: "bg-warn/10 text-warn",
  hoog: "bg-red-50 text-red-800",
};

export function DbaCheck() {
  const used = useEersteGebruik("wet-dba-check");
  const [rol, setRol] = useState<DbaRol>("opdrachtgever");
  const [answers, setAnswers] = useState<Partial<Record<string, DbaAnswer>>>({});
  const r = useMemo(() => scoreDba(answers), [answers]);
  const level = r.level ? { ...dbaLevelText(r.level, rol), className: LEVEL_CLASS[r.level] } : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
      <div className="space-y-5" onChange={used}>
        <div
          role="group"
          aria-label="Wie vult de check in?"
          className="grid grid-cols-2 rounded-3xl border border-hair bg-white p-1 sm:inline-grid sm:rounded-full"
        >
          {ROLLEN.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={rol === key}
              onClick={() => {
                setRol(key);
                used();
              }}
              className={`rounded-full px-3 py-2 text-sm font-semibold leading-tight transition-colors sm:px-4 ${
                rol === key ? "bg-ink text-white" : "text-neutralx-600 hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {GROUPS.map((g) => (
          <section key={g} className="rounded-2xl border border-hair bg-white p-5">
            <h2 className="font-display text-base font-semibold text-ink">{DBA_GROUP_LABELS[g]}</h2>
            <div className="mt-3 divide-y divide-hair">
              {DBA_QUESTIONS.filter((q) => q.group === g).map((q) => (
                <fieldset key={q.id} className="py-4 first:pt-1 last:pb-0">
                  <legend className="text-[0.95rem] leading-relaxed text-ink">{dbaText(q, rol).q}</legend>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {OPTIONS.map(([value, label]) => {
                      const checked = answers[q.id] === value;
                      return (
                        <label
                          key={value}
                          className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-500 ${
                            checked ? "border-ink bg-ink text-white" : "border-hair bg-paper text-neutralx-600 hover:text-ink"
                          }`}
                        >
                          <input
                            type="radio"
                            name={q.id}
                            value={value}
                            checked={checked}
                            onChange={() => setAnswers((a) => ({ ...a, [q.id]: value }))}
                            className="sr-only"
                          />
                          {label}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="rounded-3xl border border-hair bg-white p-6 shadow-sm md:p-8 lg:sticky lg:top-24" aria-live="polite">
        <p className="eyebrow">Je uitkomst</p>
        {!level ? (
          <>
            <p className="mt-3 font-display text-2xl font-bold text-ink">
              {r.answered} van {DBA_QUESTIONS.length} beantwoord
            </p>
            <div className="mt-3 h-2.5 rounded-full bg-paper-soft" aria-hidden>
              <div className="h-2.5 rounded-full bg-brand-500 transition-all" style={{ width: `${(r.answered / DBA_QUESTIONS.length) * 100}%` }} />
            </div>
            <p className="mt-3 text-sm text-neutralx-600">Beantwoord alle vragen. Het gaat om hoe het werk in de praktijk loopt, niet om wat er op papier staat.</p>
          </>
        ) : (
          <>
            <div className={`mt-3 rounded-2xl p-4 ${level.className}`}>
              <p className="font-display text-lg font-semibold">{level.title}</p>
              <p className="mt-1 text-sm leading-relaxed">{level.body}</p>
            </div>
            <p className="mt-3 text-xs text-neutralx-500">
              {r.score.toLocaleString("nl-NL")} van {DBA_MAX_SCORE} risicopunten
            </p>
          </>
        )}

        {r.attention.length > 0 ? (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-ink">Aandachtspunten</h3>
            <ul className="mt-2 space-y-3 text-sm leading-relaxed text-neutralx-600">
              {r.attention.map(({ question, partly }) => (
                <li key={question.id} className="flex gap-2.5">
                  <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-warn" aria-hidden />
                  <span>
                    <span className="font-semibold text-ink">{DBA_GROUP_LABELS[question.group]}{partly ? " (deels)" : ""}: </span>
                    {dbaText(question, rol).tip}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {r.strengths.length > 0 ? (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-ink">Wat al goed zit</h3>
            <ul className="mt-2 space-y-1.5 text-sm text-neutralx-600">
              {r.strengths.map((q) => (
                <li key={q.id} className="flex gap-2.5">
                  <span className="text-brand-500" aria-hidden>✓</span>
                  {dbaText(q, rol).good}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          {rol === "zzp" ? (
            <>
              <Link href="/register" className="btn-primary">
                Gratis profiel maken
              </Link>
              <Link href="/rekentools/zzp-uurtarief-berekenen" className="btn-ghost">
                Bereken je uurtarief
              </Link>
            </>
          ) : (
            <>
              <Link href="/register?type=bedrijf" className="btn-primary">
                Gratis klus plaatsen
              </Link>
              <Link href="/kennis/wet-dba" className="btn-ghost">
                Meer over de Wet DBA
              </Link>
            </>
          )}
        </div>
        {r.answered > 0 ? (
          <button type="button" onClick={() => setAnswers({})} className="mt-4 text-sm font-semibold text-neutralx-600 underline hover:text-ink">
            Opnieuw beginnen
          </button>
        ) : null}
        <p className="mt-4 text-xs leading-relaxed text-neutralx-500">
          Een indicatie op basis van de punten waar rechters en de Belastingdienst naar kijken, geen juridisch advies.
          Uiteindelijk telt het totaalbeeld.{" "}
          {rol === "zzp"
            ? "Op ZekerFlex kies je zelf je klussen en bepaal je zelf je uurtarief."
            : "Via ZekerFlex leg je de afspraken per opdracht vast en krijg je een seintje bij signalen zoals veel uren bij één opdrachtgever."}
        </p>
        {r.complete && rol === "opdrachtgever" ? (
          <StuurUitkomst
            label="Je uitkomst met alle tips in je mail?"
            payload={{
              tool: "wet-dba-check",
              answers: Object.fromEntries(Object.entries(answers).filter((e): e is [string, DbaAnswer] => Boolean(e[1]))),
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
