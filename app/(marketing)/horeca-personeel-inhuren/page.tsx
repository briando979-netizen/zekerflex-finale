import type { Metadata } from "next";
import { ldJson } from "@/lib/seo/json-ld";
import Link from "next/link";
import { Section, SectionHead, CtaBand, FaqList } from "@/components/marketing/primitives";
import { CITIES } from "@/lib/seo-cities";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";

const TITLE = "Horeca personeel inhuren — flexkrachten & uitzendkrachten voor de horeca";
const DESCRIPTION =
  "Snel betrouwbaar horecapersoneel inhuren in heel Nederland: bedieners, afwassers, koks, barpersoneel en runners. Plaats een klus, vul je gat vaak nog dezelfde dag. € 3,50 per gewerkt uur, geen uitzendmarge — het voordelige alternatief voor het horeca-uitzendbureau.";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} | ZekerFlex` },
  description: DESCRIPTION,
  keywords: [
    "horeca personeel inhuren",
    "horeca uitzendbureau",
    "horeca flexkrachten",
    "horeca uitzendkracht",
    "bedienend personeel inhuren",
    "afwasser inhuren",
    "barpersoneel inhuren",
    "horeca personeel last minute",
  ],
  ...canonical("/horeca-personeel-inhuren", { title: TITLE, description: DESCRIPTION }),
};

const faq = [
  {
    q: "Hoe snel heb ik horecapersoneel?",
    a: "Je plaatst je klus in een paar minuten. ZekerFlex stuurt hem direct naar geverifieerde horecakrachten binnen reisafstand van je zaak — bij uitval of een drukke avond is een gat vaak dezelfde dag gevuld.",
  },
  {
    q: "Wat kost het?",
    a: "Je betaalt het uurtarief van de kracht plus € 3,50 per gewerkt uur aan ZekerFlex. Geen abonnement, geen inschrijfkosten en geen uitzendmarge van 30–50%.",
  },
  {
    q: "Kan ik mijn vaste ploeg opbouwen?",
    a: "Ja — krachten die bevallen zet je bij favorieten of in een vaste pool en roostert je met één tik opnieuw in voor je weekend- en eventdiensten.",
  },
];

export default function HorecaHubPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: ldJson([
            breadcrumbJsonLd([["Home", "/"], ["Horeca personeel inhuren", "/horeca-personeel-inhuren"]]),
            {
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
            },
          ]),
        }}
      />
      <Section>
        <SectionHead
          eyebrow="Horeca · voor zaken"
          title="Horeca personeel inhuren, door heel Nederland"
          intro="Uitval, no-shows of een drukke avond? Plaats een klus en ZekerFlex vindt binnen uren betrouwbare bedieners, afwassers, koks, barpersoneel en runners in de buurt. Je betaalt € 3,50 per gewerkt uur, zonder uitzendmarge en zonder abonnement."
        />
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/register?type=bedrijf" className="btn-primary">
            Gratis klus plaatsen
          </Link>
          <Link href="/demo" className="btn-ghost">
            Demo aanvragen
          </Link>
        </div>
        <h2 className="mt-14 font-display text-xl font-bold text-ink">Horeca personeel inhuren per stad</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {CITIES.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/horeca-personeel-inhuren/${c.slug}`}
                className="block rounded-xl border border-hair bg-white px-4 py-3 text-sm hover:border-brand-500"
              >
                <span className="font-semibold text-ink">Horeca personeel {c.name}</span>
                <span className="block text-xs text-neutralx-500">bediening · keuken · bar · afwas</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
      <Section tone="soft">
        <SectionHead eyebrow="Veelgestelde vragen" title="Horecapersoneel inhuren" />
        <div className="mt-8 max-w-3xl">
          <FaqList items={faq} />
        </div>
      </Section>
      <CtaBand
        title="Vanavond nog een kracht nodig?"
        body="Plaats je klus in een paar minuten — je betaalt alleen voor gewerkte uren."
        primaryHref="/register?type=bedrijf"
        primaryLabel="Klus plaatsen"
        secondaryHref="/personeel-inhuren"
        secondaryLabel="Alle sectoren"
      />
    </>
  );
}
