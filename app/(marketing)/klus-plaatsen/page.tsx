import { vt } from "@/lib/i18n/site";
import { getSiteT } from "@/lib/i18n/server";
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
import { featureEnabled } from "@/lib/flags";
import { EERSTE_MAAND_GRATIS_VLAG } from "@/lib/billing/partnerdeal-vrij";
import { beschikbareWerkers } from "@/lib/marketing/beschikbare-werkers";

export const metadata: Metadata = {
  title: vt("Klus plaatsen — zie direct wat het kost"),
  description:
    vt("Stel zonder account een klus samen en zie meteen wat het kost en hoeveel krachten er in de buurt wonen. Plaatsen is gratis; je betaalt pas na het werk."),
  keywords: ["klus plaatsen", "personeel aanvragen", "flexkracht aanvragen", "dienst plaatsen", "zzp'er inhuren", "uitzendkracht aanvragen"],
  ...canonical("/klus-plaatsen"),
};

// The supply count reads the database (cached 10 min in lib/shifts/supply-map.ts).
export const dynamic = "force-dynamic";

// De veelgestelde vragen; de gratis eerste maand alleen zolang de vlag eerste-maand-gratis aan staat (anders klopt het niet).
const faq = (gratisMaand: boolean) => [
  {
    q: vt("Kost het plaatsen van een klus iets?"),
    a: `Nee. Een klus plaatsen en een account maken zijn gratis. Je betaalt het uurtarief van de kracht plus € 3,50 platformkosten per gewerkt uur, en alleen als er echt gewerkt is.${
      gratisMaand ? " Je eerste maand betaal je geen platformkosten, vanaf je eerste dienst." : ""
    }`,
  },
  {
    q: vt("Kan het ook zonder account?"),
    a: vt("Ja. Laat onder de kosten je naam en je telefoonnummer of e-mailadres achter. Wij nemen binnen één werkdag contact op en zetten je klus samen met je online. Pas dan maak je een account."),
  },
  {
    q: vt("Wat gebeurt er met mijn klus als ik op plaatsen klik?"),
    a: vt("Je klus wordt in je eigen browser bewaard. Na het aanmelden staat hij klaar bij Diensten → Nieuwe dienst. Daar kies je nog je vestiging en controleer je alles voordat de klus echt online gaat."),
  },
  {
    q: vt("Hoe komen jullie aan het aantal krachten in de buurt?"),
    a: vt("We tellen anoniem hoeveel mensen met een ZekerFlex-profiel in de omgeving wonen, in vakken van zo'n 16 kilometer. We tonen het pas als het er genoeg zijn, en nooit iemands adres."),
  },
];

export default async function KlusPlaatsenPage(props: { searchParams: Promise<{ functie?: string; plaats?: string; via?: string | string[] }> }) {
  const tx = await getSiteT();
  const { functie, plaats, via: viaRuw } = await props.searchParams;
  // bewijs bovenaan (zelfde telling als /bedrijven, lib/marketing/beschikbare-werkers.ts; null = niets tonen) en de gratis eerste maand
  const [werkers, gratisMaand] = await Promise.all([
    beschikbareWerkers().catch(() => null),
    featureEnabled(EERSTE_MAAND_GRATIS_VLAG).catch(() => false),
  ]);
  const FAQ = faq(gratisMaand);
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
            breadcrumbJsonLd([["Home", "/"], ["Voor bedrijven", "/bedrijven"], ["Klus plaatsen", "/klus-plaatsen"]]),
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
            <Link href="/bedrijven" className="hover:underline">
              {tx("Voor bedrijven")}
            </Link>{" "}
            {tx("· klus plaatsen")}
          </p>
          <h1 className="mt-4 max-w-3xl text-balance font-display text-4xl font-bold leading-[1.08] md:text-6xl">
            {tx("Stel je klus samen")}
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/70">
            {tx("Zonder account. Vul in wat je nodig hebt en zie meteen wat het kost. Zet hem daarna online met een gratis account, of laat je nummer achter en wij doen het samen met je.")}
          </p>
          {werkers !== null || gratisMaand ? (
            <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-brand-mint">
              {werkers !== null ? <li>{werkers} geverifieerde mensen, nu beschikbaar</li> : null}
              {gratisMaand ? <li>{tx("Eerste maand geen platformkosten")}</li> : null}
              <li>{tx("Je betaalt pas na het werk")}</li>
            </ul>
          ) : null}
        </div>
      </div>

      <Section tone="soft">
        <KlusConcept
          templates={templates}
          minRateCents={MIN_SHIFT_RATE_CENTS}
          cities={cities}
          initial={{ ...(templateKey ? { templateKey } : {}), ...(city ? { city } : {}) }}
          via={via}
          gratisMaand={gratisMaand}
        />
      </Section>

      <Section tone="paper">
        <SectionHead eyebrow={tx("Veelgestelde vragen")} title={tx("Over een klus plaatsen")} />
        <div className="mt-10">
          <FaqList items={FAQ.map((f) => ({ q: tx(f.q), a: tx(f.a) }))} />
        </div>
      </Section>
    </>
  );
}
