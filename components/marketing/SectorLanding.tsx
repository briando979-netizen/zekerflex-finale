import type { Metadata } from "next";
import Link from "next/link";
import { ldJson } from "@/lib/seo/json-ld";
import { Section, SectionHead, CtaBand, FaqList } from "@/components/marketing/primitives";
import { CITIES, type City } from "@/lib/seo-cities";
import { SECTORS, type Sector } from "@/lib/seo-sectors";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";

// Shared template that renders a sector's hub + per-city landing pages from the
// SECTORS config. Each page combines sector copy with the city's real local
// context, so the set reads as unique pages, not spun duplicates.

const low = (s: Sector) => s.label.toLowerCase();

// ---- metadata -------------------------------------------------------------
export function sectorHubMetadata(s: Sector): Metadata {
  const title = `${s.label} personeel inhuren — flexkrachten & uitzendkrachten voor de ${low(s)}`;
  const description = `Snel betrouwbaar ${low(s)}personeel inhuren in heel Nederland: ${s.roles}. Plaats een klus, vul je gat vaak nog dezelfde dag. € 3,50 per gewerkt uur, geen uitzendmarge — het voordelige alternatief voor het ${low(s)}-uitzendbureau.`;
  return {
    title: { absolute: `${title} | ZekerFlex` },
    description,
    keywords: [
      `${low(s)} personeel inhuren`,
      `${low(s)} uitzendbureau`,
      `${low(s)} flexkrachten`,
      `${low(s)} uitzendkracht`,
      `${low(s)} personeel last minute`,
    ],
    ...canonical(`/${s.slug}`, { title, description }),
  };
}

export function sectorCityMetadata(s: Sector, c: City): Metadata {
  const title = `${s.label} personeel inhuren in ${c.name} — flexkrachten & uitzendkrachten`;
  const description = `Snel betrouwbaar ${low(s)}personeel in ${c.name}: ${s.roles}. Plaats een klus, vul je gat vaak nog dezelfde dag. € 3,50 per gewerkt uur, geen uitzendmarge — een voordelig alternatief voor het ${low(s)}-uitzendbureau.`;
  return {
    title: { absolute: `${title} | ZekerFlex` },
    description,
    keywords: [
      `${low(s)} personeel inhuren ${c.name}`,
      `${low(s)} uitzendbureau ${c.name}`,
      `${low(s)} flexkrachten ${c.name}`,
      `${low(s)} uitzendkracht ${c.name}`,
      `${low(s)} personeel ${c.name} last minute`,
    ],
    ...canonical(`/${s.slug}/${c.slug}`, { title, description }),
  };
}

// ---- shared faq -----------------------------------------------------------
function cityFaq(s: Sector, c: City) {
  return [
    {
      q: `Hoe snel heb ik een ${s.worker} in ${c.name}?`,
      a: `Je plaatst je klus in een paar minuten. ZekerFlex stuurt hem direct naar geverifieerde krachten binnen reisafstand van je locatie in ${c.name} — bij uitval of ${s.peak} is een gat vaak dezelfde dag gevuld.`,
    },
    {
      q: `Wat kost een flexkracht in de ${low(s)}?`,
      a: "Je betaalt het uurtarief van de kracht plus € 3,50 per gewerkt uur aan ZekerFlex. Geen abonnement, geen inschrijfkosten en geen uitzendmarge van 30–50% — alles transparant.",
    },
    {
      q: "Kan ik dezelfde mensen terugvragen voor mijn vaste ploeg?",
      a: "Ja. Krachten die goed bevallen zet je bij je favorieten of in een vaste pool, zodat je ze met één tik opnieuw inroostert.",
    },
    {
      q: "Wat als iemand niet bevalt of niet komt opdagen?",
      a: "Je ziet vooraf reviews en ervaring, en je kunt iemand blokkeren zodat je die nooit meer krijgt. Valt er iemand uit, dan staat je klus meteen weer open bij andere beschikbare krachten in de buurt.",
    },
    {
      q: "Zzp'er of uitzendkracht?",
      a: "Jij kiest per klus: zelfstandige krachten via het platform, of uitzendkrachten via het ZekerFlex-uitzendbureau (zonder KVK, met loonadministratie, StiPP en ABU-cao geregeld). Uren, facturen en betalingen lopen automatisch.",
    },
  ];
}

function hubFaq(s: Sector) {
  return [
    {
      q: `Hoe snel heb ik ${low(s)}personeel?`,
      a: `Je plaatst je klus in een paar minuten. ZekerFlex stuurt hem direct naar geverifieerde krachten binnen reisafstand van je locatie — bij uitval of ${s.peak} is een gat vaak dezelfde dag gevuld.`,
    },
    {
      q: "Wat kost het?",
      a: "Je betaalt het uurtarief van de kracht plus € 3,50 per gewerkt uur aan ZekerFlex. Geen abonnement, geen inschrijfkosten en geen uitzendmarge van 30–50%.",
    },
    {
      q: "Kan ik mijn vaste ploeg opbouwen?",
      a: "Ja — krachten die bevallen zet je bij favorieten of in een vaste pool en roostert je met één tik opnieuw in.",
    },
  ];
}

// ---- hub page -------------------------------------------------------------
export function SectorHub({ sector: s }: { sector: Sector }) {
  const faq = hubFaq(s);
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: ldJson([
            breadcrumbJsonLd([["Home", "/"], [`${s.label} personeel inhuren`, `/${s.slug}`]]),
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
          eyebrow={`${s.label} · voor bedrijven`}
          title={`${s.label} personeel inhuren, door heel Nederland`}
          intro={`Uitval, no-shows of ${s.peak}? Plaats een klus en ZekerFlex vindt binnen uren betrouwbare ${s.roles} in de buurt. Je betaalt € 3,50 per gewerkt uur, zonder uitzendmarge en zonder abonnement.`}
        />
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/register?type=bedrijf" className="btn-primary">
            Gratis klus plaatsen
          </Link>
          <Link href="/demo" className="btn-ghost">
            Demo aanvragen
          </Link>
        </div>
        <h2 className="mt-14 font-display text-xl font-bold text-ink">{s.label} personeel inhuren per stad</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {CITIES.map((c) => (
            <li key={c.slug}>
              <Link href={`/${s.slug}/${c.slug}`} className="block rounded-xl border border-hair bg-white px-4 py-3 text-sm hover:border-brand-500">
                <span className="font-semibold text-ink">{s.label} personeel {c.name}</span>
                <span className="block text-xs text-neutralx-500">{s.rolesShort}</span>
              </Link>
            </li>
          ))}
        </ul>
        <h2 className="mt-14 font-display text-lg font-bold text-ink">Andere sectoren</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {SECTORS.filter((x) => x.slug !== s.slug).map((x) => (
            <li key={x.slug}>
              <Link href={`/${x.slug}`} className="inline-block rounded-full border border-hairstrong bg-white px-3 py-1 text-sm text-neutralx-700 hover:border-brand-500">
                {x.label}
              </Link>
            </li>
          ))}
        </ul>
      </Section>
      <Section tone="soft">
        <SectionHead eyebrow="Veelgestelde vragen" title={`${s.label}personeel inhuren`} />
        <div className="mt-8 max-w-3xl">
          <FaqList items={faq} />
        </div>
      </Section>
      <CtaBand
        title="Vandaag nog een kracht nodig?"
        body="Plaats je klus in een paar minuten — je betaalt alleen voor gewerkte uren."
        primaryHref="/register?type=bedrijf"
        primaryLabel="Klus plaatsen"
        secondaryHref="/personeel-inhuren"
        secondaryLabel="Alle sectoren"
      />
    </>
  );
}

// ---- city page ------------------------------------------------------------
export function SectorCity({ sector: s, city: c }: { sector: Sector; city: City }) {
  const faq = cityFaq(s, c);
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: ldJson([
            breadcrumbJsonLd([
              ["Home", "/"],
              [`${s.label} personeel inhuren`, `/${s.slug}`],
              [`${s.label} ${c.name}`, `/${s.slug}/${c.slug}`],
            ]),
            {
              "@context": "https://schema.org",
              "@type": "Service",
              name: `${s.label}personeel inhuren in ${c.name}`,
              serviceType: s.serviceType,
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
          eyebrow={`${s.label} ${c.name} · voor bedrijven`}
          title={`${s.label} personeel inhuren in ${c.name}`}
          intro={`Een gat in je rooster door uitval of ${s.peak} in ${c.name}? Met ZekerFlex plaats je een klus en vind je binnen uren betrouwbare ${s.roles} — voor € 3,50 per gewerkt uur, zonder uitzendmarge en zonder abonnement.`}
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
            ["Snel bij uitval", `Je klus gaat eerst naar krachten die snel in ${c.name} kunnen zijn — minder no-shows, minder gedoe op de drukte.`],
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
        <SectionHead eyebrow="Veelgestelde vragen" title={`${s.label}personeel in ${c.name}`} />
        <div className="mt-8 max-w-3xl">
          <FaqList items={faq} />
        </div>
        <h2 className="mt-14 font-display text-lg font-bold text-ink">{s.label} personeel inhuren in andere steden</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {CITIES.filter((x) => x.slug !== c.slug).map((x) => (
            <li key={x.slug}>
              <Link href={`/${s.slug}/${x.slug}`} className="inline-block rounded-full border border-hairstrong bg-white px-3 py-1 text-sm text-neutralx-700 hover:border-brand-500">
                {x.name}
              </Link>
            </li>
          ))}
        </ul>
      </Section>
      <CtaBand
        title={`Vandaag nog een kracht nodig in ${c.name}?`}
        body="Plaats je klus in een paar minuten. Je betaalt alleen voor gewerkte uren — geen abonnement, geen uitzendmarge."
        primaryHref="/register?type=bedrijf"
        primaryLabel="Klus plaatsen"
        secondaryHref={`/personeel-inhuren/${c.slug}`}
        secondaryLabel={`Alle sectoren in ${c.name}`}
      />
    </>
  );
}
