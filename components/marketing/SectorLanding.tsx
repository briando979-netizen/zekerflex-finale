import Link from "next/link";
import { ldJson } from "@/lib/seo/json-ld";
import { Section, SectionHead, CtaBand, FaqList } from "@/components/marketing/primitives";
import { CITIES, type City } from "@/lib/seo-cities";
import { SECTORS, inhurenHubKop, inhurenKop, werkHubKop, werkKop, type Sector } from "@/lib/seo-sectors";
import { sectorFoto } from "@/lib/marketing/fotos";
import { HeroMetFoto } from "@/components/marketing/HeroMetFoto";
import { breadcrumbJsonLd } from "@/lib/seo";
import { klusUrl } from "@/lib/klusconcept/concept";

// Shared template that renders a sector's hub + per-city landing pages from the
// SECTORS config. Each page combines sector copy with the city's real local
// context, so the set reads as unique pages, not spun duplicates.
// 22 nov 2026: de koppen zoals mensen zoeken (lib/seo-sectors.ts: werkKop, inhurenKop), op de stadspagina's de eigen
// tekst van die stad (lib/seo-cities.ts: local) en links naar de andere branches in dezelfde stad, en geen belofte meer
// over hoe snel een klus gevuld is of hoe snel iemand betaald wordt.

const low = (s: Sector) => s.label.toLowerCase();

// ---- metadata: in lib/seo-sector-meta.ts (puur, te testen); hier doorgegeven voor de paginabestanden ----
export { sectorCityMetadata, sectorHubMetadata, sectorWorkerCityMetadata, sectorWorkerHubMetadata } from "@/lib/seo-sector-meta";

type Vraag = { q: string; a: string };

const faqJsonLd = (faq: Vraag[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
});

// ZekerFlex is zelf geen uitzendbureau (lib/uitzend/model.ts: ZEKERFLEX_UITZENDER = false); wie op "uitzendbureau" zoekt,
// krijgt hier het eerlijke antwoord (tests/uitzend-openbaar-eerlijk.test.ts).
const UITZEND_BEDRIJF: Vraag = {
  q: "Is ZekerFlex een uitzendbureau?",
  a: "Nee. ZekerFlex is zelf geen uitzendbureau, maar een platform waarop je zelf zzp'ers en flexwerkers inhuurt, zonder uitzendmarge. Uren, facturen en betalingen lopen dan via het platform. Wil je liever uitzendkrachten, dan krijg je die via een aangesloten uitzendbureau: dat bureau is de werkgever en regelt het contract, de loonadministratie en het pensioen volgens zijn cao.",
};
// Search Console 22 nov 2026: "student inhuren breda", "student inhuren logistiek". Werken kan vanaf 18 (zie /nog-geen-18).
const STUDENT_BEDRIJF: Vraag = {
  q: "Kan ik ook studenten inhuren?",
  a: "Ja. Studenten vanaf 18 jaar melden zich aan als zzp'er of werken als uitzendkracht via een aangesloten uitzendbureau. Ze kiezen zelf hun diensten, vaak 's avonds en in het weekend. Bij elke reactie zie je wie het is en wat die eerder deed, en je kiest zelf wie je inroostert.",
};
const UITZEND_WERKER: Vraag = {
  q: "Is ZekerFlex een uitzendbureau?",
  a: "Nee. ZekerFlex is zelf geen uitzendbureau, maar een app met freelance klussen en uitzendklussen. Bij een uitzendklus teken je je contract bij het uitzendbureau van die dienst: dat bureau is je werkgever en betaalt je loon.",
};

// ---- shared faq -----------------------------------------------------------
function cityFaq(s: Sector, c: City): Vraag[] {
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
    STUDENT_BEDRIJF,
    UITZEND_BEDRIJF,
  ];
}

function hubFaq(s: Sector): Vraag[] {
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

/** Een rij ronde links (andere steden, andere branches). */
function LinkRij({ kop, links }: { kop: string; links: { href: string; label: string }[] }) {
  return (
    <>
      <h2 className="mt-14 font-display text-lg font-bold text-ink">{kop}</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="inline-block rounded-full border border-hairstrong bg-white px-3 py-1 text-sm text-neutralx-700 hover:border-brand-500">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

/** De eigen tekst van de stad en wat er daar gevraagd wordt (lib/seo-cities.ts), zodat elke stadspagina iets eigens heeft. */
function StadBlok({ kop, c }: { kop: string; c: City }) {
  return (
    <div className="mt-12 max-w-3xl">
      <h2 className="font-display text-xl font-bold text-ink">{kop}</h2>
      <p className="mt-3 leading-relaxed text-neutralx-600">
        {c.local} In {c.name} en omgeving is er vooral vraag in {c.sectors.join(", ")}.
      </p>
    </div>
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
            faqJsonLd(faq),
          ]),
        }}
      />
      <Section>
        <HeroMetFoto foto={sectorFoto(s.key, c.slug)}>
        <SectionHead
          kop="h1"
          eyebrow={`${s.label} ${c.name} · voor bedrijven`}
          title={`${inhurenKop(s)} in ${c.name}`}
          intro={`Een gat in je rooster door uitval of ${s.peak} in ${c.name}? Plaats een klus en ZekerFlex deelt hem met geverifieerde ${s.roles} binnen reisafstand. Je betaalt het uurtarief van de kracht plus € 3,50 per gewerkt uur, zonder uitzendmarge en zonder abonnement.`}
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
            ["Gematcht op reistijd", `Je klus gaat eerst naar krachten die snel in ${c.name} kunnen zijn — minder no-shows, minder gedoe op de drukte.`],
            ["Jij houdt de regie", "Kies zelf wie je inroostert op basis van reviews en ervaring, blokkeer wie niet bevalt, en bouw je vaste ploeg met favorieten."],
            ["Alles geregeld", "Urenregistratie met check-in, automatische facturen en een modelovereenkomst. Uitzendkrachten krijg je via een aangesloten uitzendbureau."],
          ].map(([t, b]) => (
            <li key={t} className="rounded-2xl border border-hair bg-white p-5">
              <p className="font-display font-bold text-ink">{t}</p>
              <p className="mt-2 text-sm text-neutralx-600">{b}</p>
            </li>
          ))}
        </ul>
        <StadBlok kop={`${s.label} in ${c.name}`} c={c} />
      </Section>
      <Section tone="soft">
        <SectionHead eyebrow="Veelgestelde vragen" title={`Vragen over ${inhurenKop(s).toLowerCase()} in ${c.name}`} />
        <div className="mt-8 max-w-3xl">
          <FaqList items={faq} />
        </div>
        <LinkRij
          kop={`Ander personeel in ${c.name}`}
          links={[
            ...SECTORS.filter((x) => x.slug !== s.slug).map((x) => ({ href: `/${x.slug}/${c.slug}`, label: x.label })),
            { href: `/personeel-inhuren/${c.slug}`, label: "Alle branches" },
          ]}
        />
        <LinkRij
          kop={`${inhurenKop(s)} in andere steden`}
          links={CITIES.filter((x) => x.slug !== c.slug).map((x) => ({ href: `/${s.slug}/${x.slug}`, label: x.name }))}
        />
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

function workerBenefits(s: Sector, where: string): [string, string][] {
  return [
    ["Kies je eigen diensten", `Je ziet open ${low(s)}-diensten in de buurt${where} en pakt alleen wat jou uitkomt.`],
    ["Vooraf weten wat je verdient", "Bij elke dienst zie je het uurtarief en de reistijd. Als zzp'er kies je zelf hoe snel je geld op je rekening staat."],
    ["Met of zonder KVK", "Werk als zzp'er, of als uitzendkracht via een aangesloten uitzendbureau — dat bureau regelt je loon, pensioen en cao."],
  ];
}

/** Wat het werk inhoudt (lib/seo-sectors.ts: werkUitleg). */
function WerkBlok({ s }: { s: Sector }) {
  return (
    <div className="mt-12 max-w-3xl">
      <h2 className="font-display text-xl font-bold text-ink">Wat doe je als {s.worker}?</h2>
      <p className="mt-3 leading-relaxed text-neutralx-600">{s.werkUitleg}</p>
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
        <ul className="mt-12 grid gap-4 sm:grid-cols-3">
          {workerBenefits(s, "").map(([t, b]) => (
            <li key={t} className="rounded-2xl border border-hair bg-white p-5">
              <p className="font-display font-bold text-ink">{t}</p>
              <p className="mt-2 text-sm text-neutralx-600">{b}</p>
            </li>
          ))}
        </ul>
        <WerkBlok s={s} />
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
        <LinkRij kop="Ander werk" links={SECTORS.filter((x) => x.slug !== s.slug).map((x) => ({ href: `/${x.workerSlug}`, label: x.label }))} />
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
              [werkKop(s), `/${s.workerSlug}`],
              [`${s.label} ${c.name}`, `/${s.workerSlug}/${c.slug}`],
            ]),
            faqJsonLd(faq),
          ]),
        }}
      />
      <Section>
        <HeroMetFoto foto={sectorFoto(s.key, c.slug + "w")}>
        <SectionHead
          kop="h1"
          eyebrow={`${s.label} ${c.name} · voor werkers`}
          title={`${werkKop(s)} in ${c.name}`}
          intro={`Zoek je werk als ${s.worker} in ${c.name}? Op ZekerFlex vind je diensten voor ${s.roles}, met of zonder KVK. Je kiest zelf wanneer je werkt en ziet vooraf wat je verdient.`}
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
        <WerkBlok s={s} />
        <StadBlok kop={`Werken in ${c.name}`} c={c} />
      </Section>
      <Section tone="soft">
        <SectionHead eyebrow="Veelgestelde vragen" title={`Werken als ${s.worker} in ${c.name}`} />
        <div className="mt-8 max-w-3xl">
          <FaqList items={faq} />
        </div>
        <LinkRij
          kop={`Ander werk in ${c.name}`}
          links={[
            ...SECTORS.filter((x) => x.slug !== s.slug).map((x) => ({ href: `/${x.workerSlug}/${c.slug}`, label: x.label })),
            { href: `/freelance-werk/${c.slug}`, label: `Alle klussen in ${c.name}` },
          ]}
        />
        <LinkRij
          kop={`${werkKop(s)} in andere steden`}
          links={CITIES.filter((x) => x.slug !== c.slug).map((x) => ({ href: `/${s.workerSlug}/${x.slug}`, label: x.name }))}
        />
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
