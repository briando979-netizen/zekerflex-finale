import type { Metadata } from "next";
import { ldJson } from "@/lib/seo/json-ld";
import Link from "next/link";
import { Section, SectionHead, CtaBand, FaqList } from "@/components/marketing/primitives";
import { HeroMetFoto } from "@/components/marketing/HeroMetFoto";
import { sectorFoto } from "@/lib/marketing/fotos";
import { CITIES } from "@/lib/seo-cities";
import { SECTORS, inhurenHubKop } from "@/lib/seo-sectors";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";
import { klusUrl } from "@/lib/klusconcept/concept";
import { seoBeschrijving, seoTitel } from "@/lib/seo-tekst";

// 22 nov 2026: "personeel inhuren" is het zoekwoord met de meeste vertoningen (Search Console, plek 31), en
// "flexibel personeel inhuren" en "personeel inhuren zakelijk" komen erbij. Plus vragen met FAQPage voor Google.
const TITLE = "Flexibel personeel inhuren in heel Nederland — klus plaatsen voor flex- en uitzendkrachten";
const DESCRIPTION =
  "Plaats een klus en huur flexkrachten en zzp'ers in heel Nederland in, of krijg uitzendkrachten via een aangesloten uitzendbureau. Matching op reistijd en vak, € 3,50 per gewerkt uur, geen abonnement.";

export const metadata: Metadata = {
  title: { absolute: seoTitel(TITLE) },
  description: seoBeschrijving(DESCRIPTION),
  keywords: ["personeel inhuren", "klus plaatsen", "uitzendbureau", "uitzendbureau alternatief", "flexkrachten inhuren", "zzp'er inhuren", "tijdelijk personeel"],
  ...canonical("/personeel-inhuren", { title: TITLE, description: DESCRIPTION }),
};

const FAQ = [
  {
    q: "Hoe huur ik personeel in via ZekerFlex?",
    a: "Je plaatst een klus met de datum, de plek, het werk en het uurtarief. ZekerFlex deelt hem met passende, geverifieerde zzp'ers en flexwerkers binnen reisafstand. Je ziet wie reageert, met reviews en ervaring, en kiest zelf wie je inroostert.",
  },
  {
    q: "Wat kost personeel inhuren?",
    a: "Je betaalt het uurtarief van de kracht plus € 3,50 per gewerkt uur aan ZekerFlex. Geen abonnement, geen inschrijfkosten en geen uitzendmarge. Je betaalt alleen voor uren die echt gewerkt zijn.",
  },
  {
    q: "Is ZekerFlex een uitzendbureau?",
    a: "Nee. ZekerFlex is zelf geen uitzendbureau, maar een platform waarop je zelf zzp'ers en flexwerkers inhuurt. Wil je liever uitzendkrachten, dan krijg je die via een aangesloten uitzendbureau: dat bureau is de werkgever en regelt het contract, de loonadministratie en het pensioen volgens zijn cao.",
  },
  {
    q: "Kan ik zakelijk een zzp'er inhuren zonder gedoe met de Wet DBA?",
    a: "ZekerFlex legt de afspraken per opdracht vast en signaleert onder meer als iemand veel uren bij jou maakt. Dat geeft geen garantie over de arbeidsrelatie: hoe er in de praktijk gewerkt wordt, blijft bepalend.",
  },
  {
    q: "Kan ik ook voor één dag of één dienst iemand inhuren?",
    a: "Ja. Je plaatst een klus voor precies de dienst die je nodig hebt, zonder vast contract of abonnement. Krachten die bevallen zet je bij je favorieten, zodat je ze een volgende keer opnieuw vraagt.",
  },
];

export default function PersoneelInhurenPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: ldJson([
            breadcrumbJsonLd([["Home", "/"], ["Personeel inhuren", "/personeel-inhuren"]]),
            {
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
            },
          ]),
        }}
      />
      <Section>
        <HeroMetFoto foto={sectorFoto("algemeen", 0)}>
        <SectionHead
          kop="h1"
          eyebrow="Voor bedrijven"
          title="Flexibel personeel inhuren, door heel Nederland"
          intro="Plaats een klus en ZekerFlex vindt geverifieerde zzp'ers en flexwerkers in de buurt van je locatie. Je betaalt € 3,50 per gewerkt uur, zonder abonnement. Liever uitzendkrachten? Die krijg je via een aangesloten uitzendbureau; dat bureau is dan de werkgever."
        />
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href={klusUrl()} className="btn-primary">
            Gratis klus plaatsen
          </Link>
          <Link href="/voor-bedrijven" className="btn-ghost">
            Hoe het werkt
          </Link>
        </div>
        </HeroMetFoto>
        <h2 className="mt-14 font-display text-xl font-bold text-ink">Personeel inhuren per stad</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {CITIES.map((c) => (
            <li key={c.slug}>
              <Link href={`/personeel-inhuren/${c.slug}`} className="block rounded-xl border border-hair bg-white px-4 py-3 text-sm hover:border-brand-500">
                <span className="font-semibold text-ink">Personeel inhuren {c.name}</span>
                <span className="block text-xs text-neutralx-500">{c.sectors.slice(0, 3).join(", ")}</span>
              </Link>
            </li>
          ))}
        </ul>
        <h2 className="mt-14 font-display text-xl font-bold text-ink">Personeel inhuren per sector</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SECTORS.map((s) => (
            <li key={s.slug}>
              <Link href={`/${s.slug}`} className="block rounded-xl border border-hair bg-white px-4 py-3 text-sm hover:border-brand-500">
                <span className="font-semibold text-ink">{inhurenHubKop(s)}</span>
                <span className="block text-xs text-neutralx-500">{s.rolesShort}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
      <Section tone="soft">
        <SectionHead eyebrow="Veelgestelde vragen" title="Personeel inhuren via ZekerFlex" />
        <div className="mt-8 max-w-3xl">
          <FaqList items={FAQ} />
        </div>
      </Section>
      <CtaBand
        title="Vandaag nog iemand nodig?"
        body="Plaats je klus in een paar minuten — je betaalt alleen voor gewerkte uren."
        primaryHref={klusUrl()}
        primaryLabel="Klus plaatsen"
        secondaryHref="/prijzen"
        secondaryLabel="Prijzen"
      />
    </>
  );
}
