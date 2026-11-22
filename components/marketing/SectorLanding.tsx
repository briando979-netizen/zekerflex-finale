import Link from "next/link";
import { ldJson } from "@/lib/seo/json-ld";
import { Section, SectionHead, CtaBand, FaqList } from "@/components/marketing/primitives";
import { CITIES, type City } from "@/lib/seo-cities";
import { SECTORS, inhurenHubKop, inhurenKop, personeelNaam, werkHubKop, werkKop, type Sector } from "@/lib/seo-sectors";
import { SNEL_STAPPEN } from "@/lib/seo-stad";
import { BedrijfsVragen } from "@/components/marketing/VraagLanding";
import { sectorFoto } from "@/lib/marketing/fotos";
import { HeroMetFoto } from "@/components/marketing/HeroMetFoto";
import { LinkRij, StadBlok, StadCijfers, Voordelen } from "@/components/marketing/StadCijfers";
import { breadcrumbJsonLd } from "@/lib/seo";
import { klusUrl } from "@/lib/klusconcept/concept";
import { STUDENT_BEDRIJF, UITZEND_BEDRIJF, UITZEND_WERKER, sectorStadPagina, sectorWerkStadPagina, type StadPagina, type Vraag } from "@/lib/seo-stad-pagina";
import { WERKEN_ALS_PAD, functieLink, functiesVan } from "@/lib/seo-functies";

// Shared template that renders a sector's hub + per-city landing pages from the
// SECTORS config. Each page combines sector copy with the city's real local
// context, so the set reads as unique pages, not spun duplicates.
// 22 nov 2026: de koppen zoals mensen zoeken (lib/seo-sectors.ts: werkKop, inhurenKop), op de stadspagina's de eigen
// tekst van die stad (lib/seo-cities.ts: local) en links naar de andere branches in dezelfde stad, en geen belofte meer
// over hoe snel een klus gevuld is of hoe snel iemand betaald wordt.
// 22 nov 2026 (later): de stadspagina's komen uit lib/seo-stad-pagina.ts, met de cijfers van het CBS per stad, de
// steden die het dichtst bij liggen en eigen vragen; de algemene uitleg en vragen staan op het overzicht van de branche.

const low = (s: Sector) => s.label.toLowerCase();

// ---- metadata: in lib/seo-sector-meta.ts (puur, te testen); hier doorgegeven voor de paginabestanden ----
export { sectorCityMetadata, sectorHubMetadata, sectorWorkerCityMetadata, sectorWorkerHubMetadata } from "@/lib/seo-sector-meta";

const faqJsonLd = (faq: Vraag[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
});

// ---- shared faq -----------------------------------------------------------
function hubFaq(s: Sector): Vraag[] {
  return [
    // 22 nov 2026: de vraag zoals bedrijven hem stellen; de stappen zonder belofte over snelheid (lib/seo-stad.ts)
    { q: `Hoe kom ik snel aan ${personeelNaam(s)}?`, a: SNEL_STAPPEN },
    {
      q: "Wat kost het?",
      a: "Je betaalt het uurtarief van de kracht plus € 3,50 per gewerkt uur aan ZekerFlex. Geen abonnement, geen inschrijfkosten en geen uitzendmarge van 30–50%.",
    },
    {
      q: "Kan ik mijn vaste ploeg opbouwen?",
      a: "Ja — krachten die bevallen zet je bij favorieten of in een vaste pool en roostert je met één tik opnieuw in.",
    },
    {
      q: "Wat als iemand niet bevalt of niet komt opdagen?",
      a: "Je ziet vooraf reviews en ervaring, en je kunt iemand blokkeren zodat je die nooit meer krijgt. Valt er iemand uit, dan staat je klus meteen weer open bij andere beschikbare krachten in de buurt.",
    },
    STUDENT_BEDRIJF,
    UITZEND_BEDRIJF,
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

// ---- de delen van een stadspagina (lib/seo-stad-pagina.ts) ----------------

/** De knoppen en de regel met de rekentool onder de kop (de kop zelf, de h1, staat in de pagina). */
function StadKnoppen({ p }: { p: StadPagina }) {
  const [eerste, tweede] = p.knoppen;
  return (
    <>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link href={eerste.href} className="btn-primary">
          {eerste.label}
        </Link>
        <Link href={tweede.href} className="btn-ghost">
          {tweede.label}
        </Link>
      </div>
      <p className="mt-5 text-sm text-neutralx-600">
        {p.hint.tekst}{" "}
        <Link href={p.hint.link.href} className="font-semibold text-brand-600 underline">
          {p.hint.link.label}
        </Link>
      </p>
    </>
  );
}

function StadVragen({ p }: { p: StadPagina }) {
  return (
    <>
      <SectionHead eyebrow="Veelgestelde vragen" title={p.faqKop} />
      <div className="mt-8 max-w-3xl">
        <FaqList items={p.faq} />
        <p className="mt-4 text-sm">
          <Link href={p.meer.href} className="font-semibold text-brand-600 hover:underline">
            {p.meer.label}
          </Link>
        </p>
      </div>
      {p.rijen.map((r) => (
        <LinkRij key={r.kop} kop={r.kop} links={r.links} />
      ))}
    </>
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
          __html: ldJson([breadcrumbJsonLd([["Home", "/"], [inhurenHubKop(s), `/${s.slug}`]]), faqJsonLd(faq)]),
        }}
      />
      <Section>
        <HeroMetFoto foto={sectorFoto(s.key, 0)}>
        <SectionHead
          kop="h1"
          eyebrow={`${s.label} · voor bedrijven`}
          title={`${inhurenHubKop(s)}, door heel Nederland`}
          intro={`Uitval, no-shows of ${s.peak}? Plaats een klus en ZekerFlex deelt hem met geverifieerde ${s.roles} in de buurt van je locatie. Je betaalt het uurtarief van de kracht plus € 3,50 per gewerkt uur, zonder uitzendmarge en zonder abonnement.`}
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
        <h2 className="mt-14 font-display text-xl font-bold text-ink">{inhurenKop(s)} per stad</h2>
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
        <SectionHead eyebrow="Veelgestelde vragen" title={`Vragen over ${inhurenHubKop(s).toLowerCase()}`} />
        <div className="mt-8 max-w-3xl">
          <FaqList items={faq} />
          {/* 22 nov 2026: de antwoordpagina's voor bedrijven (lib/seo-vragen.ts), die van deze branche eerst */}
          <BedrijfsVragen branche={s.key} />
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
  const p = sectorStadPagina(s, c);
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: ldJson([
            breadcrumbJsonLd([
              ["Home", "/"],
              [inhurenHubKop(s), `/${s.slug}`],
              [`${s.label} ${c.name}`, `/${s.slug}/${c.slug}`],
            ]),
            {
              "@context": "https://schema.org",
              "@type": "Service",
              name: `${inhurenKop(s)} in ${c.name}`,
              serviceType: s.serviceType,
              provider: { "@type": "Organization", name: "ZekerFlex" },
              areaServed: { "@type": "City", name: c.name },
              offers: { "@type": "Offer", price: "3.50", priceCurrency: "EUR", description: "Platformfee per gewerkt uur" },
            },
            faqJsonLd(p.faq),
          ]),
        }}
      />
      <Section>
        <HeroMetFoto foto={sectorFoto(s.key, c.slug)}>
          <SectionHead kop="h1" eyebrow={p.eyebrow} title={p.titel} intro={p.intro} />
          <StadKnoppen p={p} />
        </HeroMetFoto>
        {p.cijfers ? <StadCijfers blok={p.cijfers} /> : null}
        <Voordelen lijst={p.voordelen} />
        <StadBlok kop={p.stad.kop} tekst={p.stad.tekst} />
      </Section>
      <Section tone="soft">
        <StadVragen p={p} />
      </Section>
      <CtaBand {...p.cta} />
    </>
  );
}

// ===========================================================================
// Werker-kant: vacature-/flexwerk-pagina's om de aanbodkant organisch te vullen.
// ===========================================================================

const workerFaq = (s: Sector): Vraag[] => [
  {
    q: "Heb ik een KVK nodig?",
    a: "Nee. Met een KVK-nummer werk je als zzp'er; zonder KVK werk je als uitzendkracht via een aangesloten uitzendbureau. Dat bureau is dan je werkgever en regelt je contract, loon en pensioen volgens zijn cao.",
  },
  {
    q: "Wanneer word ik betaald?",
    a: "Als zzp'er kies je dat zelf: gratis wachten tot de opdrachtgever betaalt (binnen 30 dagen), of eerder tegen een kleine fee. Als uitzendkracht betaalt het uitzendbureau je loon, met een loonstrook.",
  },
  {
    q: "Kan ik zelf kiezen wanneer ik werk?",
    a: `Ja. Je ziet open ${s.label.toLowerCase()}-diensten in de buurt en pakt alleen wat jou uitkomt — avonden, weekenden of structureel.`,
  },
  UITZEND_WERKER,
];

function workerBenefits(s: Sector): [string, string][] {
  return [
    ["Kies je eigen diensten", `Je ziet open ${low(s)}-diensten in de buurt en pakt alleen wat jou uitkomt.`],
    ["Vooraf weten wat je verdient", "Bij elke dienst zie je het uurtarief en de reistijd. Als zzp'er kies je zelf hoe snel je geld op je rekening staat."],
    ["Met of zonder KVK", "Werk als zzp'er, of als uitzendkracht via een aangesloten uitzendbureau — dat bureau regelt je loon, pensioen en cao."],
  ];
}

/** Wat het werk inhoudt (lib/seo-sectors.ts: werkUitleg). */
function WerkBlok({ kop, tekst, link }: { kop: string; tekst: string; link?: { href: string; label: string } | undefined }) {
  return (
    <div className="mt-12 max-w-3xl">
      <h2 className="font-display text-xl font-bold text-ink">{kop}</h2>
      <p className="mt-3 leading-relaxed text-neutralx-600">
        {tekst}
        {link ? (
          <>
            {" "}
            <Link href={link.href} className="font-semibold text-brand-600 hover:underline">
              {link.label}
            </Link>
          </>
        ) : null}
      </p>
    </div>
  );
}

export function SectorWorkerHub({ sector: s }: { sector: Sector }) {
  const faq = workerFaq(s);
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: ldJson([breadcrumbJsonLd([["Home", "/"], [werkKop(s), `/${s.workerSlug}`]]), faqJsonLd(faq)]),
        }}
      />
      <Section>
        <HeroMetFoto foto={sectorFoto(s.key, 1)}>
        <SectionHead
          kop="h1"
          eyebrow={`${s.label} · voor werkers`}
          title={werkHubKop(s)}
          intro={`Zoek je werk als ${s.worker}? Op ZekerFlex vind je diensten voor ${s.roles}, met of zonder KVK. Je kiest zelf wanneer je werkt en ziet vooraf wat je verdient. Door heel Nederland.`}
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
        <Voordelen lijst={workerBenefits(s)} />
        <WerkBlok kop={`Wat doe je als ${s.worker}?`} tekst={s.werkUitleg} />
        {/* 22 nov 2026: per functie de taken, de tijden en het richttarief (lib/seo-functies.ts) */}
        {functiesVan(s.key).length > 0 ? (
          <LinkRij kop="Per functie: taken, tijden en tarief" links={[...functiesVan(s.key).map(functieLink), { href: WERKEN_ALS_PAD, label: "Alle functies" }]} />
        ) : null}
        <h2 className="mt-14 font-display text-xl font-bold text-ink">{werkKop(s)} per stad</h2>
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
        <LinkRij
          kop="Ander werk"
          links={[...SECTORS.filter((x) => x.slug !== s.slug).map((x) => ({ href: `/${x.workerSlug}`, label: x.label })), { href: "/bijbaan", label: "Bijbaan" }]}
        />
      </Section>
      <Section tone="soft">
        <SectionHead eyebrow="Veelgestelde vragen" title={`Werken als ${s.worker}`} />
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
        secondaryLabel={`Werkgever? ${inhurenKop(s)}`}
      />
    </>
  );
}

export function SectorWorkerCity({ sector: s, city: c }: { sector: Sector; city: City }) {
  const p = sectorWerkStadPagina(s, c);
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: ldJson([
            breadcrumbJsonLd([
              ["Home", "/"],
              [werkKop(s), `/${s.workerSlug}`],
              [`${s.label} ${c.name}`, `/${s.workerSlug}/${c.slug}`],
            ]),
            faqJsonLd(p.faq),
          ]),
        }}
      />
      <Section>
        <HeroMetFoto foto={sectorFoto(s.key, c.slug + "w")}>
          <SectionHead kop="h1" eyebrow={p.eyebrow} title={p.titel} intro={p.intro} />
          <StadKnoppen p={p} />
        </HeroMetFoto>
        {p.cijfers ? <StadCijfers blok={p.cijfers} /> : null}
        <Voordelen lijst={p.voordelen} />
        {p.werk ? <WerkBlok kop={p.werk.kop} tekst={p.werk.tekst} link={p.werk.link} /> : null}
        <StadBlok kop={p.stad.kop} tekst={p.stad.tekst} />
      </Section>
      <Section tone="soft">
        <StadVragen p={p} />
      </Section>
      <CtaBand {...p.cta} />
    </>
  );
}
