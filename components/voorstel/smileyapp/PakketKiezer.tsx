"use client";

import { useState } from "react";
import Link from "next/link";
import { BASE, type Pakket } from "@/lib/voorstel/smileyapp";
import { buitenDeKiezer, kiesPakket, kiezerVragen, type Antwoorden, type Keuze, type VraagSleutel } from "@/lib/voorstel/smileyapp-kiezer";
import { euroTaal } from "@/lib/voorstel/smileyapp-taal";
import { KIEZER_NL, vul, type KiezerTeksten } from "@/lib/voorstel/smileyapp-teksten";
import { Gezicht } from "@/components/voorstel/smileyapp/Gezicht";

// "Welk pakket past bij mij?": drie vragen, één pakket. De keuzes en de
// uitkomst volgen uit de onderdelen van de pakketten die de pagina meegeeft
// (lib/voorstel/smileyapp-kiezer.ts); de prijs is het bedrag uit diezelfde
// gegevens, opgemaakt met euroTaal(). Er wordt niets bewaard of verstuurd.
// `teksten` en `basis`: op /en en /de geeft de pagina de vertaalde teksten en
// het basispad van die taal mee; zonder is alles Nederlands zoals het was.

type Gekozen = Partial<Record<VraagSleutel, number>>;

export function PakketKiezer({
  pakketten,
  compact = false,
  teksten: t = KIEZER_NL,
  basis = BASE,
}: {
  pakketten: readonly Pakket[];
  compact?: boolean;
  teksten?: KiezerTeksten;
  /** het basispad van de taal: de knoppen leiden naar de demo-aanvraag en de pakketten in die taal */
  basis?: string;
}) {
  const vragen = kiezerVragen(pakketten, t);
  // per vraag de plek van de gekozen keuze
  const [gekozen, setGekozen] = useState<Gekozen>({});

  const nodig = (s: VraagSleutel): Keuze["nodig"] | undefined => {
    const i = gekozen[s];
    return i === undefined ? undefined : vragen.find((v) => v.sleutel === s)?.keuzes[i]?.nodig;
  };
  const a = { vragenlijsten: nodig("vragenlijsten"), beoordelingen: nodig("beoordelingen"), gebruikers: nodig("gebruikers") };
  const compleet = a.vragenlijsten !== undefined && a.beoordelingen !== undefined && a.gebruikers !== undefined;
  const advies = compleet ? kiesPakket(a as Antwoorden, pakketten, t) : null;
  const beantwoord = Object.keys(gekozen).length;
  const anders = buitenDeKiezer(pakketten);
  const bron = pakketten.find((p) => p.id === advies?.pakket.id);
  // het bedrag komt uit het pakket zelf; alleen de schrijfwijze volgt de taal
  const prijs = !advies ? "" : advies.pakket.prijs === null ? t.opAanvraag : euroTaal(advies.pakket.prijs, t.taal);
  const looptijd = !advies || advies.pakket.minimaalMaanden === null ? "" : vul(t.looptijd, { n: advies.pakket.minimaalMaanden });
  const andersNamen = anders.map((p) => vul(t.pakketNaam, { naam: p.naam })).join(t.en);
  const teGaan = 3 - beantwoord;

  return (
    <section aria-labelledby="sm-kiezer-kop" className={`rounded-[2rem] bg-smiley-mint ${compact ? "p-6" : "p-6 sm:p-10"}`}>
      <div className="flex items-start gap-4">
        <Gezicht score={9} kleur="#1E6B4A" knipoog className="sm-wiebel hidden h-14 w-14 shrink-0 sm:block" />
        <div>
          <h2 id="sm-kiezer-kop" className={`font-display font-bold leading-tight ${compact ? "text-2xl" : "text-3xl sm:text-4xl"}`}>
            {t.kop}
          </h2>
          <p className="mt-2 max-w-2xl leading-relaxed text-smiley-mute">{t.intro}</p>
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
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-smiley-sun">{t.pastBijJou}</p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
              <p className="font-display text-3xl font-bold">{advies.pakket.naam}</p>
              <p className="font-display text-2xl font-bold text-smiley-sun">
                {prijs}
                {advies.pakket.prijs !== null && <span className="ml-2 font-sans text-sm font-semibold text-white/75">{t.maandelijks}</span>}
              </p>
            </div>
            {looptijd && <p className="mt-1 text-sm font-semibold text-white/75">{looptijd}</p>}
            <p className="mt-4 max-w-2xl leading-relaxed text-white/90">{advies.reden}</p>
            {a.beoordelingen !== "meer" && !advies.maatwerk && (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/70">{t.periode}</p>
            )}
            {anders.length > 0 && (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/70">{vul(anders.length === 1 ? t.andersEen : t.andersMeer, { namen: andersNamen })}</p>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={`${basis}/demo?pakket=${advies.pakket.id}`} className="rounded-full bg-smiley-sun px-6 py-3.5 font-bold text-smiley-ink transition-transform hover:-translate-y-0.5">
                {t.demoKnop}
              </Link>
              <Link href={`${basis}#pakketten`} className="rounded-full px-6 py-3.5 font-bold text-white ring-1 ring-white/30 hover:bg-white/10">
                {t.alleKnop}
              </Link>
            </div>
          </div>
        ) : (
          <p className="rounded-3xl bg-white/70 p-4 text-sm font-semibold text-smiley-mute">
            {beantwoord === 0 ? t.leeg : teGaan === 1 ? t.nogEen : vul(t.nogMeer, { n: teGaan })}
          </p>
        )}
      </div>
    </section>
  );
}
