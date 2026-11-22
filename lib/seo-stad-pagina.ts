// ---------------------------------------------------------------------------
// De tekst van de stadspagina's per branche (werkgevers- en werkerkant), als gewone gegevens (22 nov 2026).
// components/marketing/SectorLanding.tsx tekent ze; tests/seo-stad-gelijkenis.test.ts meet met dezelfde tekst hoe
// gelijk twee steden van één branche zijn. De algemene uitleg van een branche staat op het overzicht (/<branche>-…);
// de stadspagina heeft een korte intro, de cijfers van die stad (lib/seo-stad.ts), de buren en eigen vragen.
// Puur: geen JSX, geen database.
// ---------------------------------------------------------------------------

import { CITIES, type City } from "@/lib/seo-cities";
import { SECTORS, inhurenHubKop, inhurenKop, personeelNaam, rollenKort, werkHubKop, werkKop, type Sector } from "@/lib/seo-sectors";
import { klusUrl } from "@/lib/klusconcept/concept";
import { aantalVraag, burenVraag, buurLabel, cijferBlok, dichtbij, snelVraag, studentenVraag, type CijferBlok, type Link, type Vraag } from "@/lib/seo-stad";

export type { Link, Vraag } from "@/lib/seo-stad";

const low = (s: Sector) => s.label.toLowerCase();

// ZekerFlex is zelf geen uitzendbureau (lib/uitzend/model.ts: ZEKERFLEX_UITZENDER = false); wie op "uitzendbureau" zoekt,
// krijgt hier het eerlijke antwoord (tests/uitzend-openbaar-eerlijk.test.ts).
export const UITZEND_BEDRIJF: Vraag = {
  q: "Is ZekerFlex een uitzendbureau?",
  a: "Nee. ZekerFlex is zelf geen uitzendbureau, maar een platform waarop je zelf zzp'ers en flexwerkers inhuurt, zonder uitzendmarge. Uren, facturen en betalingen lopen dan via het platform. Wil je liever uitzendkrachten, dan krijg je die via een aangesloten uitzendbureau: dat bureau is de werkgever en regelt het contract, de loonadministratie en het pensioen volgens zijn cao.",
};
// Search Console 22 nov 2026: "student inhuren breda", "student inhuren logistiek". Werken kan vanaf 18 (zie /nog-geen-18).
export const STUDENT_BEDRIJF: Vraag = {
  q: "Kan ik ook studenten inhuren?",
  a: "Ja. Studenten vanaf 18 jaar melden zich aan als zzp'er of werken als uitzendkracht via een aangesloten uitzendbureau. Ze kiezen zelf hun diensten, vaak 's avonds en in het weekend. Bij elke reactie zie je wie het is en wat die eerder deed, en je kiest zelf wie je inroostert.",
};
export const UITZEND_WERKER: Vraag = {
  q: "Is ZekerFlex een uitzendbureau?",
  a: "Nee. ZekerFlex is zelf geen uitzendbureau, maar een app met freelance klussen en uitzendklussen. Bij een uitzendklus teken je je contract bij het uitzendbureau van die dienst: dat bureau is je werkgever en betaalt je loon.",
};

export interface StadPagina {
  eyebrow: string;
  titel: string;
  intro: string;
  knoppen: [Link, Link];
  hint: { tekst: string; link: Link };
  cijfers: CijferBlok | null;
  voordelen: [string, string][];
  /** wat het werk inhoudt, kort, met een link naar het overzicht van de branche (alleen werkerkant) */
  werk: { kop: string; tekst: string; link: Link } | null;
  stad: { kop: string; tekst: string };
  faqKop: string;
  faq: Vraag[];
  /** de algemene vragen staan op het overzicht */
  meer: Link;
  rijen: { kop: string; links: Link[] }[];
  cta: { title: string; body: string; primaryHref: string; primaryLabel: string; secondaryHref: string; secondaryLabel: string };
}

/** De eigen regel van de stad en wat er gevraagd wordt (lib/seo-cities.ts). */
export const stadTekst = (c: City): string => `${c.local} In ${c.name} en omgeving is er vooral vraag in ${c.sectors.join(", ")}.`;

/** De eerste zin van de uitleg van een branche: de rest staat op het overzicht. */
export function eersteZin(tekst: string): string {
  const i = tekst.indexOf(". ");
  return i === -1 ? tekst : tekst.slice(0, i + 1);
}

/** De zes steden die het dichtst bij liggen, met de afstand, en "Alle steden" naar het overzicht. */
function burenRij(kop: string, c: City, pad: (slug: string) => string, alle: string): { kop: string; links: Link[] } {
  return {
    kop,
    links: [...dichtbij(c, 6).map((b) => ({ href: pad(b.city.slug), label: buurLabel(b) })), { href: alle, label: `Alle ${CITIES.length} steden` }],
  };
}

const geenNull = (x: Vraag | null): x is Vraag => x !== null;

// ---- werkgeverskant: /<branche>-personeel-inhuren/<stad> ------------------

export function sectorStadPagina(s: Sector, c: City): StadPagina {
  // eerst de vragen met de cijfers van deze stad, dan de algemene
  const faq: Vraag[] = [
    aantalVraag(c, s.key),
    burenVraag(c, "bedrijf"),
    studentenVraag(c),
    // 22 nov 2026: de vraag zoals bedrijven hem stellen, met de stappen en de cijfers van deze stad (geen belofte over snelheid)
    snelVraag(c, s.key, personeelNaam(s)),
    {
      q: `Wat kost een flexkracht in de ${low(s)}?`,
      a: "Je betaalt het uurtarief van de kracht plus € 3,50 per gewerkt uur aan ZekerFlex. Geen abonnement, geen inschrijfkosten en geen uitzendmarge van 30–50%.",
    },
    UITZEND_BEDRIJF,
  ].filter(geenNull);
  return {
    eyebrow: `${s.label} ${c.name} · voor bedrijven`,
    titel: `${inhurenKop(s)} in ${c.name}`,
    intro: `Uitval of ${s.peak} in ${c.name}? Plaats een klus voor ${rollenKort(s)}: het uurtarief plus € 3,50 per gewerkt uur, zonder uitzendmarge.`,
    knoppen: [
      { href: klusUrl({ sector: s.key, city: c.name }), label: "Gratis klus plaatsen" },
      { href: "/demo", label: "Demo aanvragen" },
    ],
    hint: { tekst: "Wat kost een flexkracht tegenover een uitzendbureau?", link: { href: "/rekentools/kosten-uitzendkracht-berekenen", label: "Reken het uit" } },
    cijfers: cijferBlok(c, s.key, "bedrijf", `${s.label} in ${c.name} in cijfers`),
    voordelen: [
      ["Gematcht op reistijd", `Eerst naar krachten die snel in ${c.name} kunnen zijn.`],
      ["Jij houdt de regie", "Jij kiest wie je inroostert."],
      ["Alles geregeld", "Uren, facturen en een modelovereenkomst."],
    ],
    werk: null,
    stad: { kop: `${s.label} in ${c.name}`, tekst: stadTekst(c) },
    faqKop: `Vragen over ${inhurenKop(s).toLowerCase()} in ${c.name}`,
    faq,
    meer: { href: `/${s.slug}`, label: `Meer vragen over ${inhurenHubKop(s).toLowerCase()}` },
    rijen: [
      {
        kop: `Ander personeel in ${c.name}`,
        links: [
          ...SECTORS.filter((x) => x.slug !== s.slug).map((x) => ({ href: `/${x.slug}/${c.slug}`, label: x.label })),
          { href: `/personeel-inhuren/${c.slug}`, label: "Alle branches" },
        ],
      },
      burenRij(`${inhurenKop(s)} dichtbij ${c.name}`, c, (slug) => `/${s.slug}/${slug}`, `/${s.slug}`),
    ],
    cta: {
      title: `Vandaag nog een kracht nodig in ${c.name}?`,
      body: "Plaats je klus in een paar minuten. Je betaalt alleen voor gewerkte uren — geen abonnement, geen uitzendmarge.",
      primaryHref: klusUrl({ sector: s.key, city: c.name }),
      primaryLabel: "Klus plaatsen",
      secondaryHref: `/personeel-inhuren/${c.slug}`,
      secondaryLabel: `Alle sectoren in ${c.name}`,
    },
  };
}

// ---- werkerkant: /<branche>-vacatures/<stad> ------------------------------

export function sectorWerkStadPagina(s: Sector, c: City): StadPagina {
  const faq: Vraag[] = [
    aantalVraag(c, s.key),
    burenVraag(c, "werker"),
    {
      q: `Kan ik in ${c.name} werken zonder KVK?`,
      a: "Ja, als uitzendkracht via een aangesloten uitzendbureau: dat bureau is dan je werkgever. Met een KVK-nummer werk je als zzp'er.",
    },
    UITZEND_WERKER,
  ].filter(geenNull);
  return {
    eyebrow: `${s.label} ${c.name} · voor werkers`,
    titel: `${werkKop(s)} in ${c.name}`,
    intro: `Werk als ${s.worker} in ${c.name}, met of zonder KVK: ${rollenKort(s)}. Je kiest zelf je diensten.`,
    knoppen: [
      { href: "/register?type=freelancer", label: "Gratis aanmelden" },
      { href: `/freelance-werk/${c.slug}`, label: `Diensten in ${c.name}` },
    ],
    hint: { tekst: "Werk je als zzp'er?", link: { href: "/rekentools/zzp-uurtarief-berekenen", label: "Bereken welk uurtarief je nodig hebt" } },
    cijfers: cijferBlok(c, s.key, "werker", `${s.label} in ${c.name} in cijfers`, s.worker),
    voordelen: [
      ["Kies je eigen diensten", "Pak wat jou uitkomt."],
      ["Vooraf weten wat je verdient", "Uurtarief en reistijd staan erbij."],
      ["Met of zonder KVK", "Zzp'er, of uitzendkracht via een aangesloten uitzendbureau."],
    ],
    werk: { kop: `Wat doe je als ${s.worker}?`, tekst: eersteZin(s.werkUitleg), link: { href: `/${s.workerSlug}`, label: `Meer over ${werkHubKop(s).toLowerCase()}` } },
    stad: { kop: `Werken in ${c.name}`, tekst: stadTekst(c) },
    faqKop: `Werken als ${s.worker} in ${c.name}`,
    faq,
    meer: { href: `/${s.workerSlug}`, label: `Meer vragen over werken als ${s.worker}` },
    rijen: [
      {
        kop: `Ander werk in ${c.name}`,
        links: [
          ...SECTORS.filter((x) => x.slug !== s.slug).map((x) => ({ href: `/${x.workerSlug}/${c.slug}`, label: x.label })),
          { href: `/bijbaan/${c.slug}`, label: `Bijbaan in ${c.name}` },
          { href: `/freelance-werk/${c.slug}`, label: `Alle klussen in ${c.name}` },
        ],
      },
      burenRij(`${werkKop(s)} dichtbij ${c.name}`, c, (slug) => `/${s.workerSlug}/${slug}`, `/${s.workerSlug}`),
    ],
    cta: {
      title: `Aan de slag in ${c.name}?`,
      body: "Meld je gratis aan en pak vandaag nog je eerste dienst.",
      primaryHref: "/register?type=freelancer",
      primaryLabel: "Gratis aanmelden",
      secondaryHref: `/${s.slug}/${c.slug}`,
      secondaryLabel: `Werkgever in ${c.name}?`,
    },
  };
}

// ---- de zichtbare tekst, in de volgorde van de pagina ----------------------

/** Alles wat een bezoeker leest (zonder menu, kop en voettekst), in de volgorde van de pagina: voor de gelijkenismeting. */
export function paginaTekst(p: StadPagina): string {
  const delen: string[] = [p.eyebrow, p.titel, p.intro, ...p.knoppen.map((k) => k.label), p.hint.tekst, p.hint.link.label];
  if (p.cijfers) delen.push(...cijferTekst(p.cijfers));
  for (const [t, b] of p.voordelen) delen.push(t, b);
  if (p.werk) delen.push(p.werk.kop, p.werk.tekst, p.werk.link.label);
  delen.push(p.stad.kop, p.stad.tekst, "Veelgestelde vragen", p.faqKop);
  for (const f of p.faq) delen.push(f.q, f.a);
  delen.push(p.meer.label);
  for (const r of p.rijen) delen.push(r.kop, ...r.links.map((l) => l.label));
  delen.push(p.cta.title, p.cta.body, p.cta.primaryLabel, p.cta.secondaryLabel);
  return delen.join("\n");
}

export function cijferTekst(b: CijferBlok): string[] {
  return [
    b.kop,
    ...b.tegels.flatMap((t) => [t.waarde, t.label]),
    ...b.alineas,
    b.tabel.kop,
    ...b.tabel.kolommen,
    ...b.tabel.rijen.flatMap((r) => [r.label, r.aantal, r.per1000]),
    b.bronTekst,
    ...b.bronnen.map((x) => x.tabel),
  ];
}
