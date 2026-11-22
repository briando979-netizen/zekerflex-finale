// ---------------------------------------------------------------------------
// /bijbaan en /bijbaan/<stad> (22 nov 2026). "Bijbaan" had de meeste vertoningen in Search Console (±4,7K in 28 dagen),
// maar er was geen pagina voor: /bijbaan gaf een 404. Zelfde opzet als de branchepagina's (lib/seo-sectors.ts,
// lib/seo-stad-pagina.ts): één config, een overzicht en een pagina per stad uit lib/seo-cities.ts, met de cijfers van
// het CBS per stad (lib/seo-stad.ts). Eerlijk: werken kan vanaf 18 (16/17 → /nog-geen-18), zonder KVK als uitzendkracht
// via een aangesloten uitzendbureau of als zzp'er, en geen beloftes over aantallen klussen, verdiensten of snelheid.
// Puur: components/marketing/BijbaanLanding.tsx tekent het, tests/seo-bijbaan.test.ts en de gelijkenismeting lezen het.
// ---------------------------------------------------------------------------

import type { Metadata } from "next";
import { CITIES, type City } from "@/lib/seo-cities";
import { SECTORS, rollenKort, werkKop, type Sector } from "@/lib/seo-sectors";
import { canonical } from "@/lib/seo";
import { seoBeschrijving, seoTitel, TITEL_MAX } from "@/lib/seo-tekst";
import { JONGEREN_PAD } from "@/lib/marketing/jongeren";
import {
  andereGemeente,
  burenVraag,
  buurLabel,
  cijferBlok,
  dichtbij,
  getal,
  jongerenVraag,
  matenVoor,
  per1000,
  stadCijfers,
  waardeVan,
  type CijferBlok,
  type Link,
  type Vraag,
} from "@/lib/seo-stad";
import { NEDERLAND_CIJFERS } from "@/lib/seo-stad-cijfers.generated";
import { UITZEND_WERKER, cijferTekst, stadTekst } from "@/lib/seo-stad-pagina";

export const BIJBAAN_PAD = "/bijbaan";

/** Waar een bijbaan-klus op ZekerFlex in kan zitten: de branches uit lib/seo-sectors.ts, met de naam waarop jongeren zoeken. */
const SOORT_NAAM: Record<string, string> = {
  horeca: "Horeca",
  retail: "Winkel",
  logistiek: "Magazijn",
  evenementen: "Evenementen",
  schoonmaak: "Schoonmaak",
  promotie: "Promotie",
  bezorging: "Bezorging",
};
const SOORT_VOLGORDE = ["horeca", "retail", "logistiek", "evenementen", "schoonmaak", "promotie", "bezorging"] as const;

export const BIJBAAN_SECTOREN: Sector[] = SOORT_VOLGORDE.flatMap((k) => SECTORS.filter((s) => s.key === k));

const soortNaam = (s: Sector): string => (Object.hasOwn(SOORT_NAAM, s.key) ? (SOORT_NAAM[s.key] ?? s.label) : s.label);

export interface Soort {
  titel: string;
  tekst: string;
  /** op de stadspagina: het CBS-cijfer van die branche in die stad */
  cijfer?: string;
  href: string;
}

export const BIJBAAN_STAPPEN: [string, string][] = [
  ["Meld je aan", "Via de website of de app. Aanmelden is gratis."],
  ["Kies hoe je werkt", "Met een KVK-nummer als zzp'er, of zonder KVK als uitzendkracht via een aangesloten uitzendbureau."],
  ["Reageer op diensten", "Je ziet vooraf het uurtarief en de reistijd. De opdrachtgever kiest wie hij inroostert."],
];

export const LEEFTIJD_VRAAG: Vraag = {
  q: "Vanaf welke leeftijd kan ik een bijbaan vinden via ZekerFlex?",
  a: "Vanaf 18 jaar. Ben je 16 of 17, laat dan je e-mailadres achter op de pagina 'Nog geen 18': we sturen je een bericht zodra je via ZekerFlex aan de slag kunt.",
};
const KVK_VRAAG: Vraag = {
  q: "Heb ik een KVK-nummer nodig voor een bijbaan?",
  a: "Nee. Zonder KVK werk je als uitzendkracht via een aangesloten uitzendbureau; dat bureau is dan je werkgever. Met een KVK-nummer werk je als zzp'er.",
};

export const JONGEREN_LINK: Link = { href: JONGEREN_PAD, label: "Laat je e-mailadres achter" };
export const JONGEREN_HINT = "Ben je 16 of 17?";

/** De knoppen onder de kop en in de band onderaan. */
export const KNOPPEN: [Link, Link] = [
  { href: "/welkom", label: "Start vandaag" },
  { href: "/app", label: "Download de app" },
];
export const CTA_TEKST = "Meld je gratis aan en kies zelf op welke diensten je reageert.";

// ---- het overzicht: /bijbaan ----------------------------------------------

export interface BijbaanHubPagina {
  eyebrow: string;
  titel: string;
  intro: string;
  soorten: Soort[];
  steden: { href: string; label: string; sub: string }[];
  /** de bron van het cijfer bij elke stad */
  bron: string;
  faq: Vraag[];
}

export function bijbaanHub(): BijbaanHubPagina {
  return {
    eyebrow: "Bijbaan · vanaf 18 jaar",
    titel: "Bijbaan zoeken: flexibele klussen bij jou in de buurt",
    intro:
      "Een bijbaan naast je studie, school of andere baan? Op ZekerFlex pak je losse diensten in de horeca, in winkels en magazijnen, op evenementen, in de schoonmaak, de promotie en de bezorging. Met of zonder KVK, en je kiest zelf wanneer je werkt.",
    soorten: BIJBAAN_SECTOREN.map((s) => ({ titel: soortNaam(s), tekst: rollenKort(s), href: `/${s.workerSlug}` })),
    steden: CITIES.map((c) => {
      const k = stadCijfers(c.slug);
      const waar = k && andereGemeente(c, k) ? ` (gemeente ${k.gemeente})` : "";
      return { href: `${BIJBAAN_PAD}/${c.slug}`, label: `Bijbaan in ${c.name}`, sub: k ? `${getal(k.jongeren.n)} inwoners van 18 tot en met 24 jaar${waar}` : c.province };
    }),
    bron: `Inwoners van 18 tot en met 24 jaar per gemeente: CBS StatLine, tabel ${NEDERLAND_CIJFERS.jongeren.tabel}, 1 januari ${NEDERLAND_CIJFERS.jongeren.jaar}.`,
    faq: [
      LEEFTIJD_VRAAG,
      KVK_VRAAG,
      { q: "Wat verdien ik met een bijbaan via ZekerFlex?", a: "Dat verschilt per dienst. Het uurtarief staat bij elke dienst, voordat je reageert, net als de reistijd." },
      { q: "Kost het iets om je aan te melden?", a: "Nee. Aanmelden en werken via ZekerFlex is gratis voor werkers." },
      { q: "Kan ik naast mijn studie of school werken?", a: "Ja. Je kiest zelf op welke diensten je reageert, dus je plant ze rond je colleges, lessen of andere baan." },
      UITZEND_WERKER,
    ],
  };
}

// ---- per stad: /bijbaan/<stad> --------------------------------------------

export interface BijbaanStadPagina {
  eyebrow: string;
  titel: string;
  intro: string;
  cijfers: CijferBlok | null;
  stad: { kop: string; tekst: string };
  faqKop: string;
  soortenKop: string;
  soortenUitleg: string;
  soorten: Soort[];
  faq: Vraag[];
  rijen: { kop: string; links: Link[] }[];
  ctaTitel: string;
}

/** De branches op volgorde van wat er in deze stad naar verhouding veel is (vestigingen per inwoner tegen heel Nederland). */
function soortenVoor(c: City): Soort[] {
  const k = stadCijfers(c.slug);
  return BIJBAAN_SECTOREN.map((s, i) => {
    const m = matenVoor(s.key)[0];
    const g = matenVoor(s.key).find((x) => x.niveau === "gemeente");
    const score = k && g && g.niveau === "gemeente" ? per1000(g, k) / per1000(g, NEDERLAND_CIJFERS) : 0;
    const cijfer = k && m ? `${getal(waardeVan(m, k).n)} ${m.tegel}${m.niveau === "regio" ? ` in ${k.corop}` : ""}` : undefined;
    return { soort: { titel: soortNaam(s), tekst: rollenKort(s), href: `/${s.workerSlug}/${c.slug}`, ...(cijfer ? { cijfer } : {}) }, score, i };
  })
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.soort);
}

export function bijbaanStad(c: City): BijbaanStadPagina {
  const faq: Vraag[] = [
    jongerenVraag(c),
    {
      q: `Hoeveel bijbanen zijn er in ${c.name}?`,
      a: `Dat wisselt per dag, dus we noemen hier geen aantal. In de app zie je de open diensten in en rond ${c.name}, met het uurtarief en de reistijd erbij.`,
    },
    burenVraag(c, "bijbaan"),
    LEEFTIJD_VRAAG,
    KVK_VRAAG,
    UITZEND_WERKER,
  ].filter((x): x is Vraag => x !== null);
  return {
    eyebrow: `Bijbaan ${c.name} · vanaf 18 jaar`,
    titel: `Bijbaan in ${c.name}: flexibele klussen bij jou in de buurt`,
    intro: `Een bijbaan naast je studie, school of baan? Pak losse diensten in en rond ${c.name}, met of zonder KVK, wanneer het jou uitkomt.`,
    cijfers: cijferBlok(c, "bijbaan", "bijbaan", `Werk en jongeren in ${c.name} in cijfers`),
    stad: { kop: `Werken in ${c.name}`, tekst: stadTekst(c) },
    faqKop: `Vragen over een bijbaan in ${c.name}`,
    soortenKop: `Wat voor bijbaan in ${c.name}?`,
    soortenUitleg: "Op volgorde van wat hier naar verhouding veel is (vestigingen per inwoner tegen heel Nederland), met een cijfer van het CBS erbij.",
    soorten: soortenVoor(c),
    faq,
    rijen: [
      {
        kop: `Bijbaan dichtbij ${c.name}`,
        links: [...dichtbij(c, 6).map((b) => ({ href: `${BIJBAAN_PAD}/${b.city.slug}`, label: buurLabel(b) })), { href: BIJBAAN_PAD, label: `Alle ${CITIES.length} steden` }],
      },
      {
        kop: `Werk per branche in ${c.name}`,
        links: [...SECTORS.map((s) => ({ href: `/${s.workerSlug}/${c.slug}`, label: werkKop(s) })), { href: `/freelance-werk/${c.slug}`, label: `Alle klussen in ${c.name}` }],
      },
    ],
    ctaTitel: `Begin met je bijbaan in ${c.name}`,
  };
}

/** De zichtbare tekst van een stadspagina, in de volgorde van de pagina (zoals paginaTekst in lib/seo-stad-pagina.ts). */
export function bijbaanStadTekst(p: BijbaanStadPagina): string {
  const delen: string[] = [p.eyebrow, p.titel, p.intro, ...KNOPPEN.map((k) => k.label), JONGEREN_HINT, JONGEREN_LINK.label];
  if (p.cijfers) delen.push(...cijferTekst(p.cijfers));
  delen.push(p.stad.kop, p.stad.tekst, p.soortenKop, p.soortenUitleg);
  for (const s of p.soorten) delen.push(s.titel, ...(s.cijfer ? [s.cijfer] : []), s.tekst);
  delen.push("Zo begin je");
  for (const [t, b] of BIJBAAN_STAPPEN) delen.push(t, b);
  delen.push("Veelgestelde vragen", p.faqKop);
  for (const f of p.faq) delen.push(f.q, f.a);
  for (const r of p.rijen) delen.push(r.kop, ...r.links.map((l) => l.label));
  delen.push(p.ctaTitel, CTA_TEKST, ...KNOPPEN.map((k) => k.label));
  return delen.join("\n");
}

// ---- metadata -------------------------------------------------------------

/** De eerste titel die past (TITEL_MAX), anders de korte met het merk. */
function eersteDiePast(kandidaten: string[], terugval: string): string {
  return kandidaten.find((t) => t.length <= TITEL_MAX) ?? seoTitel(terugval);
}

export function bijbaanHubMetadata(): Metadata {
  const kop = "Bijbaan zoeken: flexibele klussen dichtbij";
  const title = eersteDiePast([`${kop} | ZekerFlex`, kop], "Bijbaan zoeken");
  const description = seoBeschrijving(
    "Bijbaan vanaf 18 jaar, met of zonder KVK: horeca, winkels, magazijnen, evenementen, schoonmaak, promotie of bezorging. Kies zelf je diensten.",
  );
  return {
    title: { absolute: title },
    description,
    keywords: ["bijbaan", "bijbaan zoeken", "bijbaan 18 jaar", "student bijbaan", "weekendwerk", "bijverdienen", "flexibele bijbaan"],
    ...canonical(BIJBAAN_PAD, { title: "Bijbaan zoeken: flexibele klussen bij jou in de buurt", description }),
  };
}

export function bijbaanStadMetadata(c: City): Metadata {
  const lang = `Bijbaan in ${c.name}: flexibele klussen bij jou in de buurt`;
  const kort = `Bijbaan in ${c.name}: flexibele klussen dichtbij`;
  const title = eersteDiePast([lang, `${kort} | ZekerFlex`, kort], `Bijbaan in ${c.name}`);
  const description = seoBeschrijving(
    `Bijbaan in ${c.name} vanaf 18 jaar, met of zonder KVK: horeca, winkel, magazijn, evenementen, schoonmaak, promotie of bezorging. Kies zelf je diensten.`,
  );
  return {
    title: { absolute: title },
    description,
    keywords: [`bijbaan ${c.name}`, `bijbaan ${c.name} 18 jaar`, `student bijbaan ${c.name}`, `weekendwerk ${c.name}`, `bijverdienen ${c.name}`],
    ...canonical(`${BIJBAAN_PAD}/${c.slug}`, { title: lang, description }),
  };
}
