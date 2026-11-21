import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead, FaqList } from "@/components/marketing/primitives";
import { PlatformFeeEstimate } from "@/components/marketing/PlatformFeeEstimate";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";

// De rekenhulp voor de platformkosten heeft een eigen plek (21 nov 2026, eigenaar: "Prijzen weg uit het menu, deze een plekje
// geven"). Dezelfde rekenhulp als op /prijzen (components/marketing/PlatformFeeEstimate.tsx, staffel uit lib/pricing/tiers.ts).
const PATH = "/rekentools/platformkosten-berekenen";
const title = "Platformkosten berekenen — wat kost ZekerFlex per maand?";
const description =
  "Reken uit wat je per maand aan platformkosten betaalt bij jouw aantal gewerkte uren, met de staffelkorting erin. Gratis, zonder account.";

export const metadata: Metadata = {
  title,
  description,
  keywords: ["platformkosten berekenen", "kosten zekerflex", "flexkrachten kosten per uur", "staffelkorting platformkosten"],
  ...canonical(PATH, { title, description }),
};

const FAQ = [
  { q: "Wanneer betaal ik platformkosten?", a: "Alleen voor uren die echt gewerkt en goedgekeurd zijn. Geen werk, geen kosten." },
  { q: "Wordt het goedkoper bij meer uren?", a: "Ja. De platformkosten dalen met het aantal goedgekeurde uren in die maand, volgens een vaste staffel. De rekenhulp hierboven rekent die korting mee." },
  { q: "Zijn er andere kosten?", a: "Je betaalt het uurtarief van de kracht plus de platformkosten. Er zijn geen opstartkosten en er is geen abonnement nodig." },
];

export default function PlatformkostenPage() {
  const vragen = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: ldJson([breadcrumbJsonLd([["Home", "/"], ["Rekentools", "/rekentools"], ["Platformkosten berekenen", PATH]]), vragen]) }}
      />
      <Section>
        <Link href="/rekentools" className="text-sm font-semibold text-brand-600 hover:underline">
          ← Alle rekentools
        </Link>
        <div className="mt-6">
          <SectionHead
            kop="h1"
            eyebrow="Rekentool voor bedrijven"
            title="Bereken je platformkosten per maand"
            intro="Vul in hoeveel uur er per maand bij jou gewerkt wordt. Je ziet meteen wat je aan platformkosten betaalt, met de staffelkorting en de btw erbij."
          />
        </div>
        <div className="mt-10 max-w-2xl">
          <PlatformFeeEstimate />
        </div>
        <p className="mt-8 text-[0.975rem] text-neutralx-600">
          Wat kost een kracht per functie en branche?{" "}
          <Link href="/tarieven-overzicht" className="font-semibold text-brand-600 underline">
            Bekijk het tarievenoverzicht
          </Link>
        </p>
      </Section>
      <Section tone="soft">
        <SectionHead eyebrow="Veelgestelde vragen" title="Goed om te weten" />
        <div className="mt-8 max-w-3xl">
          <FaqList items={FAQ} />
        </div>
      </Section>
    </>
  );
}
