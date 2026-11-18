import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand, FaqList, Section, SectionHead, Stat } from "@/components/marketing/primitives";
import { FotoKolom } from "@/components/marketing/HeroMetFoto";
import { StapNummer } from "@/components/marketing/Verkopen";
import { paginaFoto } from "@/lib/marketing/fotos";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";
import { LEREN_PAD } from "@/lib/leren/klussen-krijgen";
import {
  AANBOD_BEDRIJF,
  FEE_TEKST,
  FOUTEN_BEDRIJF,
  LEREN_BEDRIJF_AANMELD_PAD,
  LEREN_BEDRIJF_CONTACT_PAD,
  LEREN_BEDRIJF_KLUS_PAD,
  LEREN_BEDRIJF_PAD,
  STAPPEN_BEDRIJF,
  VRAGEN_BEDRIJF,
  prijsTekstBedrijf,
} from "@/lib/leren/personeel-krijgen";

const title = "Zo krijg je als bedrijf goede mensen via een platform: zeven stappen";
const description =
  "Weinig aanmeldingen op je klussen, of mensen die niet terugkomen? Leer in zeven stappen hoe je via een platform betrouwbare flexwerkers krijgt: een duidelijke klus, eerlijk tarief, op tijd plaatsen, snel reageren, goed ontvangen, favorieten en uren goedkeuren. Gratis gids en klus-check.";

export const metadata: Metadata = {
  title,
  description,
  keywords: ["flexwerkers vinden", "personeel via platform", "klus plaatsen tips", "weinig aanmeldingen klus", "uitzendkracht via app", "horeca personeel platform"],
  ...canonical(LEREN_BEDRIJF_PAD, { title, description }),
};

// /leren/personeel-krijgen (18 nov 2026): de bedrijvenkant van de gids "klussen krijgen". Inhoud en prijzen in
// lib/leren/personeel-krijgen.ts. Servercomponent, geen scripts. Alleen wat nu echt kan; niets over een polis, geen garantie.

export default function PersoneelKrijgenPage() {
  const kruimels = breadcrumbJsonLd([
    ["Home", "/"],
    ["Leren: personeel krijgen", LEREN_BEDRIJF_PAD],
  ]);
  const vragen = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: VRAGEN_BEDRIJF.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(kruimels) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(vragen) }} />

      <div className="hero-ink text-white">
        <div className="shell grid items-center gap-10 py-14 md:py-20 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="eyebrow text-brand-mint">Gratis gids voor bedrijven</p>
            <h1 className="mt-4 text-balance font-display text-4xl font-bold leading-tight md:text-6xl">Zo krijg je als bedrijf goede mensen via een platform</h1>
            <p className="mt-6 max-w-2xl text-lg text-white/70">
              Een klus plaatsen is in een minuut gedaan. Goede mensen krijgen, en ze laten terugkomen, is iets anders. Deze zeven stappen zijn wat de bedrijven doen bij wie de klussen wél vullen, bij ZekerFlex en bij elk ander platform.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#stappen" className="btn-mint">
                Lees de zeven stappen
              </a>
              <Link href={LEREN_BEDRIJF_KLUS_PAD} className="btn-ghost-invert">
                Klus plaatsen
              </Link>
            </div>
          </div>
          <FotoKolom foto={paginaFoto("leren-bedrijven")} />
        </div>
      </div>

      <Section tone="paper">
        <div className="grid gap-6 sm:grid-cols-3">
          <Stat value="2 dagen" label="Plaats een klus minstens zo ver vooruit; dan vult hij het best." />
          <Stat value="1 uur" label="Reageer binnen die tijd op een aanmelding, anders is de werker weg." />
          <Stat value={`${FEE_TEKST} per uur`} label="De platformfee per gewerkt uur, los van het tarief van de werker; lager bij meer uren." />
        </div>
      </Section>

      <Section tone="soft" id="stappen">
        <SectionHead eyebrow="De gids" title="Zeven stappen die werken" intro="In deze volgorde. Elke stap eindigt met één ding dat je vandaag kunt regelen." />
        <ol className="mt-8 space-y-4">
          {STAPPEN_BEDRIJF.map((s, i) => (
            <li key={s.kop} className="flex gap-4 rounded-2xl border border-hair bg-white p-6">
              <StapNummer n={i + 1} />
              <div>
                <h3 className="font-display text-lg font-bold text-ink">{s.kop}</h3>
                <p className="mt-2 text-[0.975rem] leading-relaxed text-neutralx-600">{s.tekst}</p>
                <p className="mt-3 rounded-lg bg-paper-soft px-3 py-2 text-sm text-ink">
                  <span className="font-semibold">Doe vandaag:</span> {s.doe}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section tone="paper" id="fouten">
        <SectionHead eyebrow="Wat misgaat" title="De vijf fouten die we het vaakst zien" />
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {FOUTEN_BEDRIJF.map((f) => (
            <li key={f.kop} className="rounded-2xl border border-hair bg-white p-5">
              <p className="font-display text-base font-bold text-ink">{f.kop}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutralx-600">{f.tekst}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section tone="soft" id="aanbod">
        <SectionHead eyebrow="Hulp erbij" title="Gratis waar het kan, op aanvraag waar het meer is" intro="De gids en de klus-check kosten niets. Een snelstart of training plannen we op aanvraag; je krijgt vooraf een prijs." />
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-hair text-xs font-semibold uppercase tracking-wide text-neutralx-500">
                <th className="py-3 pr-4">Wat</th>
                <th className="py-3 pr-4">Voor wie</th>
                <th className="py-3 pr-4">Wat je krijgt</th>
                <th className="py-3 pr-4">Prijs</th>
                <th className="py-3">Hoe</th>
              </tr>
            </thead>
            <tbody>
              {AANBOD_BEDRIJF.map((a) => (
                <tr key={a.naam} className="border-b border-hair align-top">
                  <td className="py-4 pr-4 font-semibold text-ink">{a.naam}</td>
                  <td className="py-4 pr-4 text-neutralx-600">{a.voorWie}</td>
                  <td className="py-4 pr-4 text-neutralx-600">{a.wat}</td>
                  <td className="py-4 pr-4 whitespace-nowrap font-semibold text-ink">
                    {prijsTekstBedrijf(a).bedrag}
                    {prijsTekstBedrijf(a).toelichting && <span className="block text-xs font-normal text-neutralx-500">{prijsTekstBedrijf(a).toelichting}</span>}
                  </td>
                  <td className="py-4 text-neutralx-600">{a.hoe}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={LEREN_BEDRIJF_CONTACT_PAD} className="btn-primary">
            Klus-check of snelstart aanvragen
          </Link>
          <Link href={LEREN_PAD} className="btn-ghost">
            De gids voor werkers
          </Link>
        </div>
      </Section>

      <Section tone="paper" id="vragen">
        <SectionHead eyebrow="Vragen" title="Wat bedrijven ons vragen" />
        <div className="mt-8">
          <FaqList items={[...VRAGEN_BEDRIJF]} />
        </div>
      </Section>

      <CtaBand
        title="Plaats je eerste klus zoals in stap 1"
        body="Een account is gratis en een klus plaatsen ook. Zet adres, tijd, kleding en aanspreekpunt erbij, en reageer snel op wie zich aanmeldt."
        primaryHref={LEREN_BEDRIJF_AANMELD_PAD}
        primaryLabel="Bedrijfsaccount aanmaken"
        secondaryHref={LEREN_BEDRIJF_KLUS_PAD}
        secondaryLabel="Klus plaatsen zonder account"
      />
    </>
  );
}
