import type { Metadata } from "next";
import { ldJson } from "@/lib/seo/json-ld";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section, SectionHead, CtaBand, FaqList } from "@/components/marketing/primitives";
import { CITIES, cityBySlug } from "@/lib/seo-cities";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";

// Sector-specific landing pages (horeca × city). High-intent long-tail SEO
// surface — "horeca personeel inhuren <stad>", "horeca uitzendbureau <stad>" —
// that funnels into the same lead capture + auto-outreach as the generic pages.
export const dynamicParams = false;

export function generateStaticParams() {
  return CITIES.map((c) => ({ stad: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ stad: string }> }): Promise<Metadata> {
  const c = cityBySlug((await params).stad);
  if (!c) return {};
  const title = `Horeca personeel inhuren in ${c.name} — flexkrachten & uitzendkrachten`;
  const description = `Snel betrouwbaar horecapersoneel in ${c.name}: bedieners, afwassers, koks, barpersoneel en runners. Plaats een klus, vul je gat vaak nog dezelfde dag. € 3,50 per gewerkt uur, geen uitzendmarge — een voordelig alternatief voor het horeca-uitzendbureau.`;
  return {
    title: { absolute: `${title} | ZekerFlex` },
    description,
    keywords: [
      `horeca personeel inhuren ${c.name}`,
      `horeca uitzendbureau ${c.name}`,
      `horeca flexkrachten ${c.name}`,
      `horeca uitzendkracht ${c.name}`,
      `bedienend personeel ${c.name}`,
      `afwasser inhuren ${c.name}`,
      `barpersoneel ${c.name}`,
      `horeca personeel ${c.name} last minute`,
    ],
    ...canonical(`/horeca-personeel-inhuren/${c.slug}`, { title, description }),
  };
}

export default async function HorecaStadPage({ params }: { params: Promise<{ stad: string }> }) {
  const c = cityBySlug((await params).stad);
  if (!c) notFound();
  const faq = [
    {
      q: `Hoe snel heb ik een horecakracht in ${c.name}?`,
      a: `Je plaatst je klus in een paar minuten. ZekerFlex stuurt hem direct naar geverifieerde horecakrachten binnen reisafstand van je zaak in ${c.name} — bij uitval of een drukke avond is een gat vaak dezelfde dag gevuld.`,
    },
    {
      q: "Wat kost een flexkracht in de horeca?",
      a: "Je betaalt het uurtarief van de kracht plus € 3,50 per gewerkt uur aan ZekerFlex. Geen abonnement, geen inschrijfkosten en geen uitzendmarge van 30–50% — alles transparant.",
    },
    {
      q: "Kan ik dezelfde mensen terugvragen voor mijn vaste ploeg?",
      a: "Ja. Krachten die goed bevallen zet je bij je favorieten of in een vaste pool, zodat je ze met één tik opnieuw inroostert voor je weekend- of eventdiensten.",
    },
    {
      q: "Wat als iemand niet bevalt of niet komt opdagen?",
      a: "Je ziet vooraf reviews en ervaring, en je kunt iemand blokkeren zodat je die nooit meer krijgt. Valt er iemand uit, dan staat je klus meteen weer open bij andere beschikbare krachten in de buurt.",
    },
    {
      q: "Zzp'er of uitzendkracht?",
      a: "Jij kiest per klus: zelfstandige horecakrachten via het platform, of uitzendkrachten via het ZekerFlex-uitzendbureau (zonder KVK, met loonadministratie, StiPP en ABU-cao geregeld). Uren, facturen en betalingen lopen automatisch.",
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: ldJson([
            breadcrumbJsonLd([
              ["Home", "/"],
              ["Horeca personeel inhuren", "/horeca-personeel-inhuren"],
              [`Horeca ${c.name}`, `/horeca-personeel-inhuren/${c.slug}`],
            ]),
            {
              "@context": "https://schema.org",
              "@type": "Service",
              name: `Horecapersoneel inhuren in ${c.name}`,
              serviceType: "Horeca flexwerk- en uitzendplatform",
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
          eyebrow={`Horeca ${c.name} · voor zaken`}
          title={`Horeca personeel inhuren in ${c.name}`}
          intro={`Een gat in je rooster door uitval of een drukke avond in ${c.name}? Met ZekerFlex plaats je een klus en vind je binnen uren betrouwbare bedieners, afwassers, koks, barpersoneel of runners — voor € 3,50 per gewerkt uur, zonder uitzendmarge en zonder abonnement.`}
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
            ["Snel bij uitval", `Je klus gaat eerst naar horecakrachten die snel in ${c.name} kunnen zijn — minder no-shows, minder stress op de druk.`],
            ["Jij houdt de regie", "Kies zelf wie je inroostert op basis van reviews en ervaring, blokkeer wie niet bevalt, en bouw je vaste ploeg met favorieten."],
            ["Alles geregeld", "Urenregistratie met check-in, automatische facturen, modelovereenkomst en verzekering — zzp of uitzend, jij kiest."],
          ].map(([t, b]) => (
            <li key={t} className="rounded-2xl border border-hair bg-white p-5">
              <p className="font-display font-bold text-ink">{t}</p>
              <p className="mt-2 text-sm text-neutralx-600">{b}</p>
            </li>
          ))}
        </ul>
      </Section>
      <Section tone="soft">
        <SectionHead eyebrow="Veelgestelde vragen" title={`Horecapersoneel in ${c.name}`} />
        <div className="mt-8 max-w-3xl">
          <FaqList items={faq} />
        </div>
        <h2 className="mt-14 font-display text-lg font-bold text-ink">Horeca personeel inhuren in andere steden</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {CITIES.filter((x) => x.slug !== c.slug).map((x) => (
            <li key={x.slug}>
              <Link
                href={`/horeca-personeel-inhuren/${x.slug}`}
                className="inline-block rounded-full border border-hairstrong bg-white px-3 py-1 text-sm text-neutralx-700 hover:border-brand-500"
              >
                {x.name}
              </Link>
            </li>
          ))}
        </ul>
      </Section>
      <CtaBand
        title={`Vanavond nog een kracht nodig in ${c.name}?`}
        body="Plaats je klus in een paar minuten. Je betaalt alleen voor gewerkte uren — geen abonnement, geen uitzendmarge."
        primaryHref="/register?type=bedrijf"
        primaryLabel="Klus plaatsen"
        secondaryHref={`/personeel-inhuren/${c.slug}`}
        secondaryLabel={`Alle sectoren in ${c.name}`}
      />
    </>
  );
}
