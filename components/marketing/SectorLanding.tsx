import type { Metadata } from "next";
import Link from "next/link";
import { ldJson } from "@/lib/seo/json-ld";
import { Section, SectionHead, CtaBand, FaqList } from "@/components/marketing/primitives";
import { CITIES, type City } from "@/lib/seo-cities";
import { SECTORS, type Sector } from "@/lib/seo-sectors";
import { sectorFoto } from "@/lib/marketing/fotos";
import { HeroMetFoto } from "@/components/marketing/HeroMetFoto";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";
import { klusUrl } from "@/lib/klusconcept/concept";

// Shared template that renders a sector's hub + per-city landing pages from the
// SECTORS config. Each page combines sector copy with the city's real local
// context, so the set reads as unique pages, not spun duplicates.

const low = (s: Sector) => s.label.toLowerCase();

// ---- metadata: in lib/seo-sector-meta.ts (puur, te testen); hier doorgegeven voor de paginabestanden ----
export { sectorCityMetadata, sectorHubMetadata, sectorWorkerCityMetadata, sectorWorkerHubMetadata } from "@/lib/seo-sector-meta";

// ---- shared faq -----------------------------------------------------------
function cityFaq(s: Sector, c: City) {
  return [
    {
      q: `Hoe snel heb ik een ${s.worker} in ${c.name}?`,
      a: `Je plaatst je klus in een paar minuten. ZekerFlex deelt hem met passende, geverifieerde krachten binnen reisafstand van je locatie in ${c.name}. Hoe snel je reacties krijgt, hangt af van wie op dat moment beschikbaar is.`,
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
      a: "Zelfstandige krachten huur je via het platform; uren, facturen en betalingen lopen dan automatisch. Wil je liever uitzendkrachten, dan krijg je die via een aangesloten uitzendbureau: dat bureau is de werkgever en regelt het contract, de loonadministratie en het pensioen volgens zijn cao.",
    },
  ];
}

function hubFaq(s: Sector) {
  return [
    {
      q: `Hoe snel heb ik ${low(s)}personeel?`,
      a: `Je plaatst je klus in een paar minuten. ZekerFlex deelt hem met passende, geverifieerde krachten binnen reisafstand van je locatie. Hoe snel je reacties krijgt, hangt af van wie beschikbaar is.`,
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

// One line under the hero buttons that points at the matching free rekentool.
function ToolHint({ worker = false }: { worker?: boolean }) {
  return worker ? (
    <p className="mt-5 text-sm text-neutralx-600">
      Werk je als zzp&apos;er?{" "}
      <Link href="/rekentools/zzp-uurtarief-berekenen" className="font-semibold text-brand-600 underline">
        Bereken welk uurtarief je nodig hebt
      </Link>
    </p>
  ) : (
    <p className="mt-5 text-sm text-neutralx-600">
      Wat kost een flexkracht tegenover een uitzendbureau?{" "}
      <Link href="/rekentools/kosten-uitzendkracht-berekenen" className="font-semibold text-brand-600 underline">
        Reken het uit
      </Link>
    </p>
  );
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
        <HeroMetFoto foto={sectorFoto(s.key, 0)}>
        <SectionHead
          kop="h1"
          eyebrow={`${s.label} · voor bedrijven`}
          title={`${s.label} personeel inhuren, door heel Nederland`}
          intro={`Uitval, no-shows of ${s.peak}? Plaats een klus en ZekerFlex vindt binnen uren betrouwbare ${s.roles} in de buurt. Je betaalt € 3,50 per gewerkt uur, zonder uitzendmarge en zonder abonnement.`}
        />
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href={klusUrl({ sector: s.key })} className="btn-primary">
            Gratis klus plaatsen
          </Link>
          <Link href="/demo" className="btn-ghost">
            Demo aanvragen
          </Link>
        </div>
        <ToolHint />
        </HeroMetFoto>
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
        primaryHref={klusUrl({ sector: s.key })}
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
        <HeroMetFoto foto={sectorFoto(s.key, c.slug)}>
        <SectionHead
          kop="h1"
          eyebrow={`${s.label} ${c.name} · voor bedrijven`}
          title={`${s.label} personeel inhuren in ${c.name}`}
          intro={`Een gat in je rooster door uitval of ${s.peak} in ${c.name}? Met ZekerFlex plaats je een klus en vind je binnen uren betrouwbare ${s.roles} — voor € 3,50 per gewerkt uur, zonder uitzendmarge en zonder abonnement.`}
        />
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href={klusUrl({ sector: s.key, city: c.name })} className="btn-primary">
            Gratis klus plaatsen
          </Link>
          <Link href="/demo" className="btn-ghost">
            Demo aanvragen
          </Link>
        </div>
        <ToolHint />
        </HeroMetFoto>
        <ul className="mt-12 grid gap-4 sm:grid-cols-3">
          {[
            ["Snel bij uitval", `Je klus gaat eerst naar krachten die snel in ${c.name} kunnen zijn — minder no-shows, minder gedoe op de drukte.`],
            ["Jij houdt de regie", "Kies zelf wie je inroostert op basis van reviews en ervaring, blokkeer wie niet bevalt, en bouw je vaste ploeg met favorieten."],
            ["Alles geregeld", "Urenregistratie met check-in, automatische facturen en een modelovereenkomst. Uitzendkrachten krijg je via een aangesloten uitzendbureau."],
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
        primaryHref={klusUrl({ sector: s.key, city: c.name })}
        primaryLabel="Klus plaatsen"
        secondaryHref={`/personeel-inhuren/${c.slug}`}
        secondaryLabel={`Alle sectoren in ${c.name}`}
      />
    </>
  );
}

// ===========================================================================
// Werker-kant: vacature-/flexwerk-pagina's om de aanbodkant organisch te vullen.
// ===========================================================================

const workerFaq = (s: Sector) => [
  {
    q: "Heb ik een KVK nodig?",
    a: `Nee — je werkt als zelfstandige (met KVK) óf zonder KVK als uitzendkracht via een aangesloten uitzendbureau; dat bureau is dan je werkgever en regelt je contract, loon en pensioen volgens zijn cao.`,
  },
  {
    q: "Wanneer word ik betaald?",
    a: "Snel: afhankelijk van de opdracht direct of binnen enkele dagen na goedgekeurde uren. Je uren en uitbetaling zie je live in de app.",
  },
  {
    q: "Kan ik zelf kiezen wanneer ik werk?",
    a: `Ja. Je ziet open ${s.label.toLowerCase()}-diensten in de buurt en pakt alleen wat jou uitkomt — avonden, weekenden of structureel.`,
  },
];

function workerBenefits(s: Sector, where: string): [string, string][] {
  return [
    ["Kies je eigen diensten", `Je ziet open ${low(s)}-diensten in de buurt${where} en pakt alleen wat jou uitkomt.`],
    ["Snel uitbetaald", "Na goedgekeurde uren volgt je geld snel — vaak direct of binnen enkele dagen. Alles live in de app."],
    ["Met of zonder KVK", "Werk als zzp'er, of als uitzendkracht via een aangesloten uitzendbureau — dat bureau regelt je loon, pensioen en cao."],
  ];
}

export function SectorWorkerHub({ sector: s }: { sector: Sector }) {
  const faq = workerFaq(s);
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: ldJson([
            breadcrumbJsonLd([["Home", "/"], [`Werken in de ${low(s)}`, `/${s.workerSlug}`]]),
            {
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
            },
          ]),
        }}
      />
      <Section>
        <HeroMetFoto foto={sectorFoto(s.key, 1)}>
        <SectionHead
          kop="h1"
          eyebrow={`Werken in de ${low(s)}`}
          title={`Flexibel werken in de ${low(s)}`}
          intro={`Pak diensten als ${s.roles}, werk wanneer jij wil en word snel uitbetaald — met of zonder KVK. Door heel Nederland.`}
        />
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/register?type=freelancer" className="btn-primary">
            Gratis aanmelden
          </Link>
          <Link href="/freelance-werk" className="btn-ghost">
            Bekijk alle diensten
          </Link>
        </div>
        <ToolHint worker />
        </HeroMetFoto>
        <ul className="mt-12 grid gap-4 sm:grid-cols-3">
          {workerBenefits(s, "").map(([t, b]) => (
            <li key={t} className="rounded-2xl border border-hair bg-white p-5">
              <p className="font-display font-bold text-ink">{t}</p>
              <p className="mt-2 text-sm text-neutralx-600">{b}</p>
            </li>
          ))}
        </ul>
        <h2 className="mt-14 font-display text-xl font-bold text-ink">Werken in de {low(s)} per stad</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {CITIES.map((c) => (
            <li key={c.slug}>
              <Link href={`/${s.workerSlug}/${c.slug}`} className="block rounded-xl border border-hair bg-white px-4 py-3 text-sm hover:border-brand-500">
                <span className="font-semibold text-ink">{s.label} werk {c.name}</span>
                <span className="block text-xs text-neutralx-500">{s.rolesShort}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
      <Section tone="soft">
        <SectionHead eyebrow="Veelgestelde vragen" title={`Werken in de ${low(s)}`} />
        <div className="mt-8 max-w-3xl">
          <FaqList items={faq} />
        </div>
      </Section>
      <CtaBand
        title="Klaar om te beginnen?"
        body="Meld je gratis aan en pak vandaag nog je eerste dienst."
        primaryHref="/register?type=freelancer"
        primaryLabel="Gratis aanmelden"
        secondaryHref={`/${s.slug}`}
        secondaryLabel={`Werkgever? ${s.label} personeel inhuren`}
      />
    </>
  );
}

export function SectorWorkerCity({ sector: s, city: c }: { sector: Sector; city: City }) {
  const faq = workerFaq(s);
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: ldJson([
            breadcrumbJsonLd([
              ["Home", "/"],
              [`Werken in de ${low(s)}`, `/${s.workerSlug}`],
              [`${s.label} ${c.name}`, `/${s.workerSlug}/${c.slug}`],
            ]),
            {
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
            },
          ]),
        }}
      />
      <Section>
        <HeroMetFoto foto={sectorFoto(s.key, c.slug + "w")}>
        <SectionHead
          kop="h1"
          eyebrow={`Werken in de ${low(s)} · ${c.name}`}
          title={`Werken in de ${low(s)} in ${c.name}`}
          intro={`Flexibel werken in de ${low(s)} in ${c.name}? Pak diensten als ${s.roles}, werk wanneer jij wil en word snel uitbetaald — met of zonder KVK.`}
        />
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/register?type=freelancer" className="btn-primary">
            Gratis aanmelden
          </Link>
          <Link href={`/freelance-werk/${c.slug}`} className="btn-ghost">
            Diensten in {c.name}
          </Link>
        </div>
        <ToolHint worker />
        </HeroMetFoto>
        <ul className="mt-12 grid gap-4 sm:grid-cols-3">
          {workerBenefits(s, ` van ${c.name}`).map(([t, b]) => (
            <li key={t} className="rounded-2xl border border-hair bg-white p-5">
              <p className="font-display font-bold text-ink">{t}</p>
              <p className="mt-2 text-sm text-neutralx-600">{b}</p>
            </li>
          ))}
        </ul>
      </Section>
      <Section tone="soft">
        <SectionHead eyebrow="Veelgestelde vragen" title={`Werken in de ${low(s)} in ${c.name}`} />
        <div className="mt-8 max-w-3xl">
          <FaqList items={faq} />
        </div>
        <h2 className="mt-14 font-display text-lg font-bold text-ink">Werken in de {low(s)} in andere steden</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {CITIES.filter((x) => x.slug !== c.slug).map((x) => (
            <li key={x.slug}>
              <Link href={`/${s.workerSlug}/${x.slug}`} className="inline-block rounded-full border border-hairstrong bg-white px-3 py-1 text-sm text-neutralx-700 hover:border-brand-500">
                {x.name}
              </Link>
            </li>
          ))}
        </ul>
      </Section>
      <CtaBand
        title={`Aan de slag in ${c.name}?`}
        body="Meld je gratis aan en pak vandaag nog je eerste dienst."
        primaryHref="/register?type=freelancer"
        primaryLabel="Gratis aanmelden"
        secondaryHref={`/${s.slug}/${c.slug}`}
        secondaryLabel={`Werkgever in ${c.name}?`}
      />
    </>
  );
}
