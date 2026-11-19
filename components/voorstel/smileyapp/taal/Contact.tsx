import type { ReactNode } from "react";
import Image from "next/image";
import { CONTACT, INTERESSES, KLANTLOGIN, PARTNER, beeld, type Pakket } from "@/lib/voorstel/smileyapp";
import type { Vertaling } from "@/lib/voorstel/smileyapp-taal";
import { TEKSTEN, looptijdTaal, prijsTaal } from "@/lib/voorstel/smileyapp-talen";
import { vul } from "@/lib/voorstel/smileyapp-teksten";
import { AanvraagFormulier } from "@/components/voorstel/smileyapp/AanvraagFormulier";
import { Vinkje } from "@/components/voorstel/smileyapp/Blokken";
import { GeslotenFormulier } from "@/components/voorstel/smileyapp/GeslotenFormulier";

// Contact en "partner worden" van het SmileyApp-voorstel in het Engels en het
// Duits (deel 6b): dezelfde opbouw als de Nederlandse pagina's. Het
// contactformulier staat ook hier dicht (GeslotenFormulier, zonder
// formulier-element); het partnerformulier is hetzelfde werkende formulier met
// dezelfde API, met de taal erbij. De pagina zet lang op de omlijsting en
// levert de kop (h1); hier staat de rest. Prijzen komen via prijsTaal uit het
// pakket zelf. Server-onderdelen.

/** Contact, onder de hero. `gekozen`: het pakket uit ?pakket=<id>, zoals de site het nu toont. */
export function ContactTaal({ taal, gekozen }: { taal: Vertaling; gekozen: Pakket | undefined }) {
  const alles = TEKSTEN[taal];
  const t = alles.contact;
  const f = alles.kader.footer;
  const looptijd = gekozen ? looptijdTaal(gekozen, taal) : "";
  return (
    <section className="mx-auto grid max-w-[1200px] gap-10 px-4 py-16 sm:px-8 lg:grid-cols-[1fr_1.4fr] lg:py-20">
      <div className="space-y-6">
        {gekozen && (
          <div className="rounded-[2rem] bg-smiley-sun p-6">
            <p className="text-xs font-bold uppercase tracking-[0.2em]">{t.koos}</p>
            <p lang="nl" className="mt-2 font-display text-2xl font-bold">
              {gekozen.naam}
            </p>
            <p className="mt-1 font-semibold">
              {prijsTaal(gekozen, taal)}
              {gekozen.prijs !== null && ` ${alles.pakketten.maandelijks}`}
              {looptijd && ` · ${looptijd}`}
            </p>
          </div>
        )}
        <div className="rounded-[2rem] bg-white p-6 ring-1 ring-smiley-ink/10 sm:p-8">
          <h2 className="font-display text-2xl font-bold">{t.gegevens}</h2>
          <address className="mt-5 space-y-2 not-italic leading-relaxed">
            <p className="font-bold">{CONTACT.naam}</p>
            <p>
              <a href={`mailto:${CONTACT.email}`} className="font-semibold text-smiley-leaf underline underline-offset-2">
                {CONTACT.email}
              </a>
            </p>
            <p>
              {f.postadres}: {CONTACT.postadres}
            </p>
            <p>
              {f.kantooradres}: {CONTACT.kantooradres}
            </p>
            <p>
              {f.kvk}: {CONTACT.kvk}
            </p>
          </address>
          <p className="mt-5 text-sm text-smiley-mute">
            {f.onderdeelVan}{" "}
            <a href={CONTACT.onderdeelVanUrl} rel="noopener noreferrer" className="font-semibold text-smiley-leaf underline underline-offset-2">
              {CONTACT.onderdeelVan}
            </a>
            .
          </p>
          <p className="mt-5 text-sm text-smiley-mute">
            {alles.demo.alKlant}{" "}
            <a href={KLANTLOGIN} className="font-semibold text-smiley-leaf underline underline-offset-2">
              {alles.demo.naarLogin}
            </a>
            .
          </p>
        </div>
        <Image src={beeld("widget.webp")} alt={t.widgetAlt} width={272} height={315} className="sm-zweef mx-auto h-auto w-40 [--sm-draai:-4deg]" />
      </div>
      <GeslotenFormulier id="contact" kop={t.formulierKop} gekozen={gekozen?.naam} onderwerp={gekozen ? vul(t.onderwerpPakket, { naam: gekozen.naam }) : t.onderwerp} teksten={alles.gesloten} />
    </section>
  );
}

/** De donkere strook van "partner worden"; `children` is de kop (h1) die de pagina zelf levert. */
export function PartnerHero({ taal, children }: { taal: Vertaling; children: ReactNode }) {
  const t = TEKSTEN[taal].partner;
  return (
    <section className="relative overflow-hidden bg-smiley-ink text-white">
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-smiley-green/25 blur-3xl" />
      <div className="relative mx-auto grid max-w-[1200px] items-center gap-12 px-4 py-16 sm:px-8 lg:grid-cols-[1.2fr_1fr] lg:py-24">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-smiley-sun">{t.boven}</p>
          {children}
          <p className="mt-5 text-xl font-semibold text-smiley-green">{t.sub}</p>
          <ul className="mt-9 grid gap-3 sm:grid-cols-3">
            {PARTNER.kort.map((k, i) => (
              <li key={k.titel} className="flex items-center gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10 sm:flex-col sm:items-start">
                <Image src={k.beeld} alt="" width={90} height={90} className="h-12 w-12" />
                <span className="min-w-0 break-words text-sm font-bold [hyphens:auto]">{t.kort[i] ?? k.titel}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="sm-onthul overflow-hidden rounded-[2rem] ring-1 ring-white/10">
          <Image src={PARTNER.beeld} alt={t.beeldAlt} width={542} height={368} priority className="h-auto w-full" />
        </div>
      </div>
    </section>
  );
}

/** "Partner worden", onder de hero. `team`: kan iemand van SmileyApp in het beheer inloggen? */
export function PartnerTaal({ taal, team }: { taal: Vertaling; team: boolean }) {
  const alles = TEKSTEN[taal];
  const t = alles.partner;
  return (
    <section className="mx-auto grid max-w-[1200px] gap-10 px-4 py-16 sm:px-8 lg:grid-cols-[1fr_1.3fr] lg:py-20">
      <div>
        <h2 className="break-words font-display text-3xl font-bold leading-tight [hyphens:auto] sm:text-4xl">{t.uitlegKop}</h2>
        <div className="mt-5 space-y-4 text-lg leading-relaxed text-smiley-mute">
          {t.uitleg.map((u) => (
            <p key={u}>{u}</p>
          ))}
        </div>
        <ul className="mt-8 space-y-3.5">
          {t.voordelen.map((v) => (
            <li key={v} className="flex gap-3 font-semibold">
              <Vinkje />
              {v}
            </li>
          ))}
        </ul>
      </div>
      {/* de waarde die meegaat blijft de Nederlandse uit INTERESSES (de server kent alleen die); alleen het etiket is vertaald */}
      <AanvraagFormulier soort="partner" kop={t.formulierKop} mail={CONTACT.email} teamActief={team} interesses={INTERESSES} interesseLabels={alles.gesloten.interesses} teksten={alles.formulier} />
    </section>
  );
}
