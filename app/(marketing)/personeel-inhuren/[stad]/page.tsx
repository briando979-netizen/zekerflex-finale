import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section, SectionHead, CtaBand, FaqList } from "@/components/marketing/primitives";
import { CITIES, cityBySlug } from "@/lib/seo-cities";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return CITIES.map((c) => ({ stad: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ stad: string }> }): Promise<Metadata> {
  const c = cityBySlug((await params).stad);
  if (!c) return {};
  const title = `Personeel inhuren in ${c.name} — klus plaatsen, flexkrachten & uitzendkrachten`;
  const description = `Snel flexpersoneel in ${c.name} voor ${c.sectors.join(", ")}. Plaats een klus, wij matchen op reistijd en vakmanschap. € 3,50 per gewerkt uur, geen abonnement, Wet DBA-proof — een voordelig alternatief voor het uitzendbureau.`;
  return {
    title: { absolute: `${title} | ZekerFlex` },
    description,
    keywords: [`personeel inhuren ${c.name}`, `uitzendbureau ${c.name}`, `flexkrachten ${c.name}`, `zzp'er inhuren ${c.name}`, `klus plaatsen ${c.name}`, `tijdelijk personeel ${c.name}`],
    ...canonical(`/personeel-inhuren/${c.slug}`, { title, description }),
  };
}

export default async function PersoneelInhurenStadPage({ params }: { params: Promise<{ stad: string }> }) {
  const c = cityBySlug((await params).stad);
  if (!c) notFound();
  const faq = [
    {
      q: `Hoe snel heb ik personeel in ${c.name}?`,
      a: `Je plaatst een klus in een paar minuten. ZekerFlex stuurt hem direct naar geverifieerde flexkrachten binnen reisafstand van je locatie in ${c.name}; vaak is een klus dezelfde dag gevuld.`,
    },
    {
      q: "Wat kost het?",
      a: "Je betaalt het uurtarief van de flexkracht plus € 3,50 per gewerkt uur aan ZekerFlex. Geen abonnement, geen inschrijfkosten en geen uitzendmarge van 30–50%.",
    },
    {
      q: "Is het verschil met een uitzendbureau?",
      a: "Je kiest zelf: zzp'ers en flexwerkers via het platform, of uitzendkrachten via het ZekerFlex-uitzendbureau (zonder KVK, met loonadministratie, StiPP en ABU-cao geregeld). Alles in één omgeving, met uren, facturen en betalingen automatisch.",
    },
    {
      q: "Is het Wet DBA-proof?",
      a: "Ja. Elke zzp-opdracht loopt onder een goedgekeurde modelovereenkomst en het platform bewaakt de urenverdeling per opdrachtgever, zodat er geen schijnzelfstandigheid ontstaat.",
    },
    {
      q: "Moet mijn bedrijf geverifieerd zijn?",
      a: "Ja — voor de veiligheid van flexkrachten controleren we je KVK-inschrijving. Tot die tijd kun je al één testklus plaatsen en reacties ontvangen.",
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            breadcrumbJsonLd([["Home", "/"], ["Voor bedrijven", "/voor-bedrijven"], [`Personeel inhuren ${c.name}`, `/personeel-inhuren/${c.slug}`]]),
            {
              "@context": "https://schema.org",
              "@type": "Service",
              name: `Flexpersoneel inhuren in ${c.name}`,
              serviceType: "Flexwerk- en uitzendplatform",
              provider: { "@type": "Organization", name: "ZekerFlex" },
              areaServed: { "@type": "City", name: c.name },
              offers: { "@type": "Offer", price: "3.50", priceCurrency: "EUR", description: "Platformfee per gewerkt uur" },
            },
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
          eyebrow={`${c.name} · voor bedrijven`}
          title={`Personeel inhuren in ${c.name}`}
          intro={`${c.local} Met ZekerFlex plaats je een klus en vind je binnen uren betrouwbare flexkrachten voor ${c.sectors.join(", ")} — voor € 3,50 per gewerkt uur, zonder abonnement.`}
        />
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/register?type=bedrijf" className="btn-primary">
            Gratis klus plaatsen
          </Link>
          <Link href="/demo" className="btn-ghost">
            Demo aanvragen
          </Link>
        </div>
        <ul className="mt-12 grid gap-4 sm:grid-cols-3">
          {[
            ["Gematcht op reistijd", `Je klus gaat eerst naar mensen die snel in ${c.name} kunnen zijn — minder no-shows, minder reiskosten.`],
            ["Alles geregeld", "Urenregistratie met GPS-check-in, automatische facturen, modelovereenkomst en verzekering."],
            ["Zzp of uitzend", "Kies per klus voor zzp'ers/flexwerkers of uitzendkrachten via het ZekerFlex-uitzendbureau."],
          ].map(([t, b]) => (
            <li key={t} className="rounded-2xl border border-hair bg-white p-5">
              <p className="font-display font-bold text-ink">{t}</p>
              <p className="mt-2 text-sm text-neutralx-600">{b}</p>
            </li>
          ))}
        </ul>
      </Section>
      <Section tone="soft">
        <SectionHead eyebrow="Veelgestelde vragen" title={`Flexkrachten in ${c.name}`} />
        <div className="mt-8 max-w-3xl">
          <FaqList items={faq} />
        </div>
        <h2 className="mt-14 font-display text-lg font-bold text-ink">Personeel inhuren in andere steden</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {CITIES.filter((x) => x.slug !== c.slug).map((x) => (
            <li key={x.slug}>
              <Link href={`/personeel-inhuren/${x.slug}`} className="inline-block rounded-full border border-hairstrong bg-white px-3 py-1 text-sm text-neutralx-700 hover:border-brand-500">
                {x.name}
              </Link>
            </li>
          ))}
        </ul>
      </Section>
      <CtaBand
        title={`Vandaag nog iemand nodig in ${c.name}?`}
        body="Plaats je klus in een paar minuten. Je betaalt alleen voor gewerkte uren."
        primaryHref="/register?type=bedrijf"
        primaryLabel="Klus plaatsen"
        secondaryHref={`/freelance-werk/${c.slug}`}
        secondaryLabel={`Werk zoeken in ${c.name}`}
      />
    </>
  );
}
