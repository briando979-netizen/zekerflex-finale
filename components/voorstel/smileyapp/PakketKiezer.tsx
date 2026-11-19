"use client";

import { useState } from "react";
import Link from "next/link";
import { BASE, looptijdTekst, prijsTekst, type Pakket } from "@/lib/voorstel/smileyapp";
import { buitenDeKiezer, kiesPakket, kiezerVragen, type Antwoorden, type Keuze, type VraagSleutel } from "@/lib/voorstel/smileyapp-kiezer";
import { Gezicht } from "@/components/voorstel/smileyapp/Gezicht";

// "Welk pakket past bij mij?": drie vragen, één pakket. De keuzes en de
// uitkomst volgen uit de onderdelen van de pakketten die de pagina meegeeft
// (lib/voorstel/smileyapp-kiezer.ts); de prijs komt via prijsTekst() uit
// diezelfde gegevens. Er wordt niets bewaard of verstuurd.

type Gekozen = Partial<Record<VraagSleutel, number>>;

export function PakketKiezer({ pakketten, compact = false }: { pakketten: readonly Pakket[]; compact?: boolean }) {
  const vragen = kiezerVragen(pakketten);
  // per vraag de plek van de gekozen keuze
  const [gekozen, setGekozen] = useState<Gekozen>({});

  const nodig = (s: VraagSleutel): Keuze["nodig"] | undefined => {
    const i = gekozen[s];
    return i === undefined ? undefined : vragen.find((v) => v.sleutel === s)?.keuzes[i]?.nodig;
  };
  const a = { vragenlijsten: nodig("vragenlijsten"), beoordelingen: nodig("beoordelingen"), gebruikers: nodig("gebruikers") };
  const compleet = a.vragenlijsten !== undefined && a.beoordelingen !== undefined && a.gebruikers !== undefined;
  const advies = compleet ? kiesPakket(a as Antwoorden, pakketten) : null;
  const beantwoord = Object.keys(gekozen).length;
  const anders = buitenDeKiezer(pakketten);
  const bron = pakketten.find((p) => p.id === advies?.pakket.id);

  return (
    <section aria-labelledby="sm-kiezer-kop" className={`rounded-[2rem] bg-smiley-mint ${compact ? "p-6" : "p-6 sm:p-10"}`}>
      <div className="flex items-start gap-4">
        <Gezicht score={9} kleur="#1E6B4A" knipoog className="sm-wiebel hidden h-14 w-14 shrink-0 sm:block" />
        <div>
          <h2 id="sm-kiezer-kop" className={`font-display font-bold leading-tight ${compact ? "text-2xl" : "text-3xl sm:text-4xl"}`}>
            Welk pakket past bij mij?
          </h2>
          <p className="mt-2 max-w-2xl leading-relaxed text-smiley-mute">Drie vragen. De uitkomst volgt uit wat er in de pakketten zit.</p>
        </div>
      </div>

      <div className={`mt-6 grid gap-4 ${compact ? "" : "lg:grid-cols-3"}`}>
        {vragen.map((v, nr) => (
          <fieldset key={v.sleutel} className="min-w-0 rounded-3xl bg-white p-5 ring-1 ring-smiley-ink/10">
            <legend className="float-left mb-3 w-full font-display text-lg font-bold leading-snug">
              <span className="mr-2 inline-grid h-7 w-7 place-items-center rounded-full bg-smiley-ink align-middle text-sm text-smiley-sun">{nr + 1}</span>
              {v.vraag}
            </legend>
            <div className="clear-both flex flex-wrap gap-2">
              {v.keuzes.map((k, i) => {
                const aan = gekozen[v.sleutel] === i;
                return (
                  <label
                    key={k.label}
                    className={`relative cursor-pointer rounded-full px-4 py-2.5 text-sm font-bold ring-1 transition-colors focus-within:ring-2 focus-within:ring-smiley-leaf ${aan ? "bg-smiley-ink text-white ring-smiley-ink" : "bg-smiley-cream text-smiley-ink ring-smiley-ink/15 hover:bg-smiley-mint"}`}
                  >
                    <input type="radio" name={`sm-kiezer-${v.sleutel}`} checked={aan} onChange={() => setGekozen((g) => ({ ...g, [v.sleutel]: i }))} className="sr-only" />
                    {k.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <div role="status" className="mt-5">
        {advies && bron ? (
          <div className="rounded-3xl bg-smiley-ink p-6 text-white sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-smiley-sun">Past bij jou</p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
              <p className="font-display text-3xl font-bold">{advies.pakket.naam}</p>
              <p className="font-display text-2xl font-bold text-smiley-sun">
                {prijsTekst(advies.pakket)}
                {advies.pakket.prijs !== null && <span className="ml-2 font-sans text-sm font-semibold text-white/75">maandelijks</span>}
              </p>
            </div>
            {looptijdTekst(advies.pakket) && <p className="mt-1 text-sm font-semibold text-white/75">{looptijdTekst(advies.pakket)}</p>}
            <p className="mt-4 max-w-2xl leading-relaxed text-white/90">{advies.reden}</p>
            {a.beoordelingen !== "meer" && !advies.maatwerk && (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/70">Over welke periode het aantal beoordelingen geldt, staat niet bij het pakket. Vraag het na in de demo.</p>
            )}
            {anders.length > 0 && (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/70">
                {anders.map((p) => `Het ${p.naam}`).join(" en ")} {anders.length === 1 ? "werkt" : "werken"} anders en {anders.length === 1 ? "volgt" : "volgen"} niet uit deze drie vragen: bekijk {anders.length === 1 ? "het" : "ze"} bij alle pakketten.
              </p>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={`${BASE}/demo?pakket=${advies.pakket.id}`} className="rounded-full bg-smiley-sun px-6 py-3.5 font-bold text-smiley-ink transition-transform hover:-translate-y-0.5">
                Demo van dit pakket
              </Link>
              <Link href={`${BASE}#pakketten`} className="rounded-full px-6 py-3.5 font-bold text-white ring-1 ring-white/30 hover:bg-white/10">
                Bekijk alle pakketten
              </Link>
            </div>
          </div>
        ) : (
          <p className="rounded-3xl bg-white/70 p-4 text-sm font-semibold text-smiley-mute">
            {beantwoord === 0 ? "Beantwoord de drie vragen, dan zie je hier welk pakket past." : `Nog ${3 - beantwoord} ${3 - beantwoord === 1 ? "vraag" : "vragen"} te gaan.`}
          </p>
        )}
      </div>
    </section>
  );
}
