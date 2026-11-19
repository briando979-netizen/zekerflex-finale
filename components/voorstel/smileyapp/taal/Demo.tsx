import type { ReactNode } from "react";
import Link from "next/link";
import { CONTACT, KLANTLOGIN, PAKKETTEN, pakket, type Pakket } from "@/lib/voorstel/smileyapp";
import { TIJDEN, leesBron, voorkeurDagen } from "@/lib/voorstel/smileyapp-aanvraag-regels";
import { taalBasis, type Vertaling } from "@/lib/voorstel/smileyapp-taal";
import { TEKSTEN, dagTaal } from "@/lib/voorstel/smileyapp-talen";
import { AanvraagFormulier } from "@/components/voorstel/smileyapp/AanvraagFormulier";
import { Vinkje } from "@/components/voorstel/smileyapp/Blokken";
import { Gezicht } from "@/components/voorstel/smileyapp/Gezicht";
import { PakketKiezer } from "@/components/voorstel/smileyapp/PakketKiezer";

// De demo-aanvraag van het SmileyApp-voorstel in het Engels (/en/demo) en het
// Duits (/de/demo): dezelfde opbouw, hetzelfde formulier en dezelfde API als de
// Nederlandse pagina (app/voorstel/smileyapp/demo/page.tsx). De pagina zet lang
// op de omlijsting, levert de kop (h1), haalt de pakketten op en vraagt of er
// een team is; hier staat de rest. Het formulier stuurt de taal mee, zodat het
// team in het beheer ziet in welke taal iemand geholpen wil worden.

export type DemoZoek = { pakket?: string | string[]; bron?: string | string[] };

/** De donkere strook bovenaan; `children` is de kop (h1) die de pagina zelf levert. */
export function DemoHero({ taal, children }: { taal: Vertaling; children: ReactNode }) {
  const t = TEKSTEN[taal].demo;
  return (
    <section className="relative overflow-hidden bg-smiley-ink text-white">
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-smiley-green/25 blur-3xl" />
      <Gezicht score={10} kleur="#FDD11A" knipoog className="sm-zweef pointer-events-none absolute -right-10 top-8 h-48 w-48 opacity-25 sm:right-16" />
      <div className="relative mx-auto max-w-[1200px] px-4 py-16 sm:px-8 lg:py-24">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-smiley-sun">{t.boven}</p>
        {children}
        <p className="mt-5 max-w-2xl text-xl font-semibold leading-relaxed text-smiley-green">{t.intro}</p>
      </div>
    </section>
  );
}

interface Props {
  taal: Vertaling;
  /** de pakketten zoals de site ze nu toont (smileyappPakketten) */
  pakketten: readonly Pakket[];
  /** kan iemand van SmileyApp in het beheer inloggen? */
  team: boolean;
  /** ?pakket=<id> van een prijskaart en ?bron=<woord> van de QR-code */
  zoek: DemoZoek;
  nu: Date;
}

export function DemoTaal({ taal, pakketten, team, zoek, nu }: Props) {
  const t = TEKSTEN[taal];
  const b = taalBasis(taal);
  const q = zoek.pakket;
  const bron = leesBron(Array.isArray(zoek.bron) ? zoek.bron[0] : zoek.bron);
  const gekozen = pakket(Array.isArray(q) ? q[0] : q, pakketten);
  // de dagen in Nederlandse tijd, op de server berekend: server en browser tonen dezelfde lijst
  const dagen = voorkeurDagen(nu).map((d) => ({ waarde: d, label: dagTaal(d, taal) }));
  return (
    <section className="mx-auto grid max-w-[1200px] gap-10 px-4 py-16 sm:px-8 lg:grid-cols-[1fr_1.3fr] lg:py-20">
      <div className="space-y-6">
        {gekozen && (
          <div className="rounded-[2rem] bg-smiley-sun p-6">
            <p className="text-xs font-bold uppercase tracking-[0.2em]">{t.demo.demoVan}</p>
            <p lang="nl" className="mt-2 font-display text-2xl font-bold">
              {gekozen.naam}
            </p>
          </div>
        )}
        <div>
          <h2 className="font-display text-3xl font-bold leading-tight sm:text-4xl">{t.demo.zoWerkt}</h2>
          <ol className="mt-6 space-y-4">
            {t.hoe.stappen.map((s, i) => (
              <li key={s.titel} className="flex gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-smiley-ink font-display text-lg font-bold text-smiley-sun">{i + 1}</span>
                <span>
                  <span className="block font-display text-xl font-bold">{s.titel}</span>
                  <span className="mt-1 block leading-relaxed text-smiley-mute">{s.tekst}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-[2rem] bg-smiley-mint p-6 sm:p-8">
          <h2 className="font-display text-2xl font-bold">{t.demo.functiesKop}</h2>
          <ul className="mt-5 space-y-3">
            {t.demo.functies.map((f) => (
              <li key={f} className="flex gap-3 font-semibold">
                <Vinkje />
                {f}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm leading-relaxed text-smiley-mute">
          {t.demo.vergelijk}{" "}
          <Link href={`${b}#pakketten`} className="font-semibold text-smiley-leaf underline underline-offset-2">
            {t.demo.bekijkPakketten}
          </Link>
          . {t.demo.alKlant}{" "}
          <a href={KLANTLOGIN} className="font-semibold text-smiley-leaf underline underline-offset-2">
            {t.demo.naarLogin}
          </a>
          .
        </p>
      </div>
      <div className="space-y-6">
        <PakketKiezer pakketten={pakketten} compact teksten={t.kiezer} basis={b} />
        <AanvraagFormulier
          key={gekozen?.id ?? "geen"}
          soort="demo"
          {...(bron ? { bron } : {})}
          kop={t.demo.formulierKop}
          mail={CONTACT.email}
          teamActief={team}
          pakketten={PAKKETTEN.map((p) => ({ waarde: p.id, label: p.naam }))}
          gekozenPakket={gekozen?.id ?? ""}
          dagen={dagen}
          tijden={TIJDEN}
          teksten={t.formulier}
        />
      </div>
    </section>
  );
}
