import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead, FaqList } from "@/components/marketing/primitives";
import { KlusConcept, type ConceptTemplate } from "@/components/marketing/KlusConcept";
import { MIN_SHIFT_RATE_CENTS, SHIFT_TEMPLATES } from "@/lib/shifts/create";
import { getSupplyMap } from "@/lib/shifts/supply-map";
import { supplyLabel, supplyNear } from "@/lib/klusconcept/concept";
import { leesVia } from "@/lib/klusconcept/via";
import { CITIES } from "@/lib/seo-cities";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";

export const metadata: Metadata = {
  title: "Klus plaatsen — stel je klus samen en zie direct wat het kost",
  description:
    "Stel zonder account een klus samen: functie, plaats, tijden, aantal mensen en tarief. Je ziet meteen wat het kost en hoeveel krachten er in de buurt wonen. Plaatsen is gratis; je betaalt pas als er gewerkt is.",
  keywords: ["klus plaatsen", "personeel aanvragen", "flexkracht aanvragen", "dienst plaatsen", "zzp'er inhuren", "uitzendkracht aanvragen"],
  ...canonical("/klus-plaatsen"),
};

// The supply count reads the database (cached 10 min in lib/shifts/supply-map.ts).
export const dynamic = "force-dynamic";

const FAQ = [
  {
    q: "Kost het plaatsen van een klus iets?",
    a: "Nee. Een klus plaatsen en een account maken zijn gratis. Je betaalt het uurtarief van de kracht plus € 3,50 platformkosten per gewerkt uur, en alleen als er echt gewerkt is.",
  },
  {
    q: "Wat gebeurt er met mijn klus als ik op plaatsen klik?",
    a: "Je klus wordt in je eigen browser bewaard. Na het aanmelden staat hij klaar bij Diensten → Nieuwe dienst. Daar kies je nog je vestiging en controleer je alles voordat de klus echt online gaat.",
  },
  {
    q: "Hoe komen jullie aan het aantal krachten in de buurt?",
    a: "We tellen anoniem hoeveel mensen met een ZekerFlex-profiel in de omgeving wonen, in vakken van zo'n 16 kilometer. We tonen het pas als het er genoeg zijn, en nooit iemands adres.",
  },
];

export default async function KlusPlaatsenPage(props: { searchParams: Promise<{ functie?: string; plaats?: string; via?: string | string[] }> }) {
  const { functie, plaats, via: viaRuw } = await props.searchParams;
  // de tip van een werker (/klus-plaatsen?via=werker): alleen de bron "werker", als totaal geteld (lib/klusconcept/via.ts)
  const via = leesVia(viaRuw);
  // From a sector/city page (klusUrl): only a known template and a known city are taken over.
  const templateKey = SHIFT_TEMPLATES.some((t) => t.key === functie) ? functie : undefined;
  const city = CITIES.find((c) => c.name.toLowerCase() === (plaats ?? "").trim().toLowerCase())?.name;
  const cells = (await getSupplyMap().catch(() => null))?.cells ?? [];
  const cities = CITIES.map((c) => ({ name: c.name, supply: supplyLabel(supplyNear(cells, c)) }));
  const templates: ConceptTemplate[] = SHIFT_TEMPLATES.map((t) => ({
    key: t.key,
    label: t.label,
    rateCents: Math.max(t.hourlyRateCents, MIN_SHIFT_RATE_CENTS),
    breakMinutes: t.breakMinutes,
    description: t.description,
    branche: t.branche,
  }));

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: ldJson([
            breadcrumbJsonLd([["Home", "/"], ["Voor bedrijven", "/voor-bedrijven"], ["Klus plaatsen", "/klus-plaatsen"]]),
            {
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
            },
          ]),
        }}
      />
      <div className="hero-ink text-white">
        {/* op de telefoon een compactere kop (12 nov, meting op 390 px): anders lag het eerste veld onder de cookiemelding */}
        <div className="shell py-8 md:py-20">
          <p className="eyebrow text-brand-mint">
            <Link href="/voor-bedrijven" className="hover:underline">
              Voor bedrijven
            </Link>{" "}
            · klus plaatsen
          </p>
          <h1 className="mt-4 max-w-3xl text-balance font-display text-4xl font-bold leading-[1.08] md:text-6xl">
            Stel je klus samen
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/70">
            Zonder account. Vul in wat je nodig hebt en zie meteen wat het kost. Bevalt het, dan zet je de klus met een
            gratis account online.
          </p>
        </div>
      </div>

      <Section tone="soft">
        <KlusConcept
          templates={templates}
          minRateCents={MIN_SHIFT_RATE_CENTS}
          cities={cities}
          initial={{ ...(templateKey ? { templateKey } : {}), ...(city ? { city } : {}) }}
        via={via}
        />
      </Section>

      <Section tone="paper">
        <SectionHead eyebrow="Veelgestelde vragen" title="Over een klus plaatsen" />
        <div className="mt-10">
          <FaqList items={FAQ} />
        </div>
      </Section>
    </>
  );
}
