import { AANBOD, aanbodHref, PIJLERS, type PijlerSleutel } from "@/lib/marketing/aanbod";
import { NIET_FLEXWERK_NAV_KEYS, zichtbarePijlers } from "@/lib/marketing/flexwerk-only";
import { SECTORS, type Sector } from "@/lib/seo-sectors";

// ---------------------------------------------------------------------------
// Het hoofdmenu (bovenbalk) van de eigen site: de standaard. Puur en browser-
// veilig: SiteHeader toont het, de Site-ontwerper (tabblad Menu) laat het zien
// en lib/ontwerp/hoofdmenu.ts legt er de eigen aanpassingen overheen.
// ---------------------------------------------------------------------------

export type Audience = "werknemers" | "bedrijven";

export interface MenuItem {
  title: string;
  desc: string;
  href: string;
}
export interface MenuVariant {
  eyebrow: string;
  cta: { label: string; href: string };
  items: MenuItem[];
}
export interface NavEntry {
  key: string;
  href: string;
  label: string;
  match: string;
  /** linktekst naar de pagina zelf, onder de uitgeklapte items in het mobiele menu (eigen knop: "Naar <label>") */
  overzicht?: string;
  /** brede uitklap met per pijler direct de producten (alleen "Aanbod") */
  mega?: boolean;
  menu?: Record<Audience, MenuVariant>;
}

export const CTA_WN = { label: "Account aanmaken", href: "/register" };
export const CTA_BV = { label: "Organisatie aanmelden", href: "/register?type=bedrijf" };

/**
 * Bij welke kant een pagina hoort (21 nov 2026, eigenaar: "bij bedrijven moet inloggen via het web blijven"). Op een
 * bedrijvenpagina staat rechtsboven Inloggen (web) en Start vandaag (aanmelden als bedrijf); op een werkerspagina Ga naar de
 * app. Een pagina die bij geen van beide hoort (over ons, kennis, …) volgt de laatste keuze in deze browser.
 */
const BEDRIJVEN_PADEN = [
  "/bedrijven",
  "/voor-bedrijven",
  "/partners",
  "/uitzendpartner",
  "/personeel-inhuren",
  "/klus-plaatsen",
  "/demo",
  "/intercedenten",
  "/tarieven-overzicht",
  "/voor-bureaus",
  "/producten",
  "/prijzen",
  "/kennis/werkgevers",
  "/leren/personeel-krijgen",
  // vragen van bedrijven (22 nov 2026, lib/seo-vragen.ts)
  "/vragen",
] as const;
const WERKNEMERS_PADEN = ["/voor-freelancers", "/starten-als-uitzendkracht", "/freelance-werk", "/klussen", "/open-diensten", "/app", "/leren/klussen-krijgen", "/bijbaan", "/werken-als"] as const;

export function kantVanPad(pad: string): Audience | null {
  const onder = (basis: string) => pad === basis || pad.startsWith(`${basis}/`);
  if (pad === "/") return "werknemers";
  if (BEDRIJVEN_PADEN.some(onder)) return "bedrijven";
  if (WERKNEMERS_PADEN.some(onder)) return "werknemers";
  return null;
}

export interface KopKnop {
  label: string;
  href: string;
}

/**
 * De twee knoppen rechtsboven in de kopbalk, per kant (21 nov 2026, eigenaar: "die login knopje bedoelde ik, bij werknemers moet
 * daar staan ga naar de app"). Bij werkers wordt Inloggen "Ga naar de app" (/app: installeren, en daar ook inloggen of een account
 * aanmaken in de browser); Start vandaag blijft account aanmaken. Bedrijven loggen in of melden zich aan. `mobiel` is de korte
 * knop naast de menuknop.
 */
// 21 nov 2026 (eigenaar, middag: "via de web inlog kwamen heel veel mensen en maakten een account … fix dat"): wie via de site
// een account maakte, vond op de telefoon het inloggen niet meer. Bij werkers staat daarom ook Inloggen: op de telefoon als knop
// naast het menu, in het menu boven de andere twee, en op de computer als link naast Ga naar de app.
export const KOP_KNOPPEN: Record<Audience, { eerste: KopKnop; tweede: KopKnop; mobiel: KopKnop; inloggen?: KopKnop }> = {
  // 22 nov 2026 (eigenaar): werkers komen in de browser binnen zoals in de app: eerst de welkomstcarrousel, dan aanmaken of
  // inloggen. /start?voor=werker stuurt een ingelogde werker meteen door en toont de carrousel maar één keer.
  werknemers: {
    eerste: { label: "Ga naar de app", href: "/app" },
    tweede: { label: "Start vandaag", href: "/welkom" },
    mobiel: { label: "Inloggen", href: "/start?voor=werker" },
    inloggen: { label: "Inloggen", href: "/start?voor=werker" },
  },
  bedrijven: {
    eerste: { label: "Inloggen", href: "/login" },
    tweede: { label: "Start vandaag", href: CTA_BV.href },
    mobiel: { label: "Inloggen", href: "/login" },
  },
};

const OVER_ITEMS: MenuItem[] = [
  { title: "Ons verhaal", desc: "Waarom ZekerFlex bestaat en wat we anders doen.", href: "/over-ons#verhaal" },
  // 21 nov 2026 (eigenaar): "Drie uitgangspunten" uit het menu
  { title: "Werken bij ons", desc: "Stuur een open sollicitatie — goede mensen zijn altijd welkom.", href: "/over-ons#werken-bij" },
  // 22 nov 2026: de community op de site zelf (lib/community); hier en niet onder Kennis, want Kennis bij werkers blijft kort (21 nov)
  { title: "Community", desc: "Praat mee met werkers en bedrijven: vragen, ervaringen en tips.", href: "/community" },
  { title: "Contact", desc: "Vragen of samenwerken? Mail info@zekerflex.com.", href: "mailto:info@zekerflex.com" },
];
// 21 nov 2026 (eigenaar): Kennis bij werknemers alleen Informatie, Kennisbank, Blogs en FAQ (zoals YoungOnes)
const KENNIS_WN: MenuItem[] = [
  { title: "Informatie", desc: "De basis in één oogopslag: wat, voor wie, wat kost het.", href: "/kennis#informatie" },
  { title: "Kennisbank", desc: "Uitgelegde onderwerpen: Wet DBA, StiPP, uitbetaling en meer.", href: "/kennis#kennisbank" },
  { title: "Blogs", desc: "Achtergrond over flexibel werk en het platform.", href: "/kennis/blog" },
  { title: "FAQ", desc: "Kort antwoord op de vragen die we het vaakst krijgen.", href: "/kennis/faq" },
];
const KENNIS_ITEMS: MenuItem[] = [
  { title: "Informatie", desc: "De basis in één oogopslag: wat, voor wie, wat kost het.", href: "/kennis#informatie" },
  { title: "Kennisbank", desc: "Uitgelegde onderwerpen: Wet DBA, StiPP, uitbetaling en meer.", href: "/kennis#kennisbank" },
  { title: "Wet DBA voor bedrijven", desc: "Schijnzelfstandigheid, gezag en handhaving — helder uitgelegd.", href: "/kennis/wet-dba" },
  { title: "Whitepapers", desc: "Belasting, administratie en verzekering — als pdf om te bewaren.", href: "/kennis/whitepapers" },
  { title: "Rekentools", desc: "Uurtarief, kosten van een flexkracht en de Wet DBA-check — gratis.", href: "/rekentools" },
  { title: "Nieuwsroom", desc: "Het laatste nieuws over werk, regels en ondernemen, kort uitgelegd.", href: "/nieuws" },
  { title: "Blogs", desc: "Achtergrond over flexibel werk en het platform.", href: "/kennis/blog" },
  { title: "FAQ", desc: "Kort antwoord op de vragen die we het vaakst krijgen.", href: "/kennis/faq" },
  // 21 nov 2026 (eigenaar: "Prijzen weg, tarievenoverzicht bij de vragen, de rekenhulp een plekje geven")
  { title: "Tarievenoverzicht", desc: "Richttarief per functie en branche, ook als pdf.", href: "/tarieven-overzicht" },
  { title: "Platformkosten berekenen", desc: "Wat je per maand betaalt bij jouw aantal uren.", href: "/rekentools/platformkosten-berekenen" },
  // 22 nov 2026: korte antwoorden voor bedrijven (lib/seo-vragen.ts)
  { title: "Vragen van bedrijven", desc: "Wat kost een flexwerker, platform of uitzendbureau, en de Wet DBA.", href: "/vragen" },
];

// Branches (21 nov 2026, eigenaar: "bij werknemers een menu Branches, zoals YoungOnes"): de branchepagina's uit lib/seo-sectors.ts.
// Werknemers gaan naar de vacatures per branche, bedrijven naar personeel inhuren per branche.
const BRANCHE_NAAM: Record<string, string> = { horeca: "Horeca & catering", logistiek: "Logistiek & magazijn" };
const brancheNaam = (s: Sector): string => (Object.hasOwn(BRANCHE_NAAM, s.key) ? BRANCHE_NAAM[s.key]! : s.label);
// 22 nov 2026: daaronder de functiepagina's (/werken-als, lib/seo-functies.ts), voor wie op een functie zoekt
const BRANCHES_WN: MenuItem[] = [
  ...SECTORS.map((s) => ({ title: brancheNaam(s), desc: s.rolesShort, href: `/${s.workerSlug}` })),
  { title: "Per functie", desc: "Werken als orderpicker, barista, schoonmaker …", href: "/werken-als" },
];
const BRANCHES_BV: MenuItem[] = SECTORS.map((s) => ({ title: brancheNaam(s), desc: s.rolesShort, href: `/${s.slug}` }));

// 22 nov 2026: "Apps & spelletjes" en de pagina /online zijn weg (geen flexwerk), dus ook hun menu-items
const AANBOD_MENU: MenuVariant = {
  eyebrow: "Alles onder één dak",
  cta: { label: "Het hele aanbod", href: "/aanbod" },
  items: [
    ...PIJLERS.map((p) => ({ title: p.naam, desc: p.kort, href: `/aanbod#${p.sleutel}` })),
    { title: "Ik zoek werk", desc: "Als flexwerker, uitzendkracht of zzp'er. Meedoen is gratis.", href: "/voor-freelancers" },
  ],
};

export const NAV: NavEntry[] = [
  {
    // Al het aanbod (personeel, online, branchepakketten, geld) uit
    // lib/marketing/aanbod.ts; uitzenden is daar één onderdeel van.
    key: "aanbod",
    href: "/aanbod",
    label: "Aanbod",
    match: "/aanbod",
    overzicht: "Het hele aanbod",
    mega: true,
    menu: { werknemers: AANBOD_MENU, bedrijven: AANBOD_MENU },
  },
  {
    key: "hoe",
    href: "/#hoe-het-werkt",
    label: "Hoe het werkt",
    match: "hoe-het-werkt",
    overzicht: "Zo werkt het",
    menu: {
      werknemers: {
        eyebrow: "Zo werkt ZekerFlex",
        cta: CTA_WN,
        items: [
          { title: "Vind werk", desc: "Diensten die matchen op je vak, je reistijd en je beschikbaarheid.", href: "/freelance-werk" },
          { title: "Starten als freelancer", desc: "Van aanmelding tot je eerste dienst — alles geregeld behalve het werk zelf.", href: "/voor-freelancers" },
          // 21 nov (eigenaar: "YoungOnes heeft dat bij workers onder Hoe het werkt, zet die ook bij ZekerFlex neer")
          { title: "Starten als uitzendkracht", desc: "Werken zonder KVK, op contract bij een uitzendbureau.", href: "/starten-als-uitzendkracht" },
          // 22 nov 2026 (eigenaar: "dooie klik"): /voor-freelancers heeft geen #verzekering; de uitleg staat in de whitepaper
          { title: "Verzekeren", desc: "Welke verzekering je als zzp'er of flexwerker zelf regelt.", href: "/kennis/whitepapers/verzekering" },
        ],
      },
      bedrijven: {
        eyebrow: "Zo werkt ZekerFlex voor bedrijven",
        cta: CTA_BV,
        items: [
          { title: "Voor bedrijven", desc: "Zet een dienst uit — ZekerFlex matcht direct de beste kandidaten.", href: "/voor-bedrijven" },
          { title: "Matching & toewijzing", desc: "Automatisch per vestiging, gewogen op reistijd en betrouwbaarheid.", href: "/voor-bedrijven#matching" },
          // 21 nov 2026 (eigenaar): "GPS check-in & urengoedkeuring" en "Facturatie & Wet DBA-monitor" uit het menu
          { title: "Helpcentrum voor opdrachtgevers", desc: "Account, PO-nummers, diensten plaatsen en uren goedkeuren — stap voor stap.", href: "/kennis/werkgevers" },
          // 21 nov 2026: uitzendbureaus zetten hun klussen op ZekerFlex en blijven zelf werkgever (lib/uitzend/partners-kern.ts)
          { title: "Voor uitzendbureaus", desc: "Zet je uitzendklussen op ZekerFlex, onder je eigen naam.", href: "/uitzendpartner" },
          { title: "Vraag een demo aan", desc: "30 minuten, vrijblijvend — we laten zien hoe het platform werkt.", href: "/demo" },
        ],
      },
    },
  },
  {
    key: "prijzen",
    href: "/prijzen",
    label: "Prijzen",
    match: "/prijzen",
    overzicht: "Alle prijzen",
    menu: {
      werknemers: {
        eyebrow: "Eerlijk en voorspelbaar",
        cta: CTA_WN,
        items: [
          { title: "Gratis voor werknemers", desc: "Voor altijd. Meedoen kost je niets.", href: "/prijzen#freelancers" },
          { title: "Sneller uitbetalen", desc: "Direct indienen, binnen 3 werkdagen indienen of gratis wachten — jij kiest per keer.", href: "/kennis/uitbetaling-en-facturen" },
          { title: "Veelgestelde vragen", desc: "Verborgen kosten, wanneer de fee telt, en meer.", href: "/prijzen#faq" },
        ],
      },
      bedrijven: {
        eyebrow: "Eerlijk en voorspelbaar",
        cta: CTA_BV,
        items: [
          // 21 nov 2026 (eigenaar): "die 3,50 kan weg" en "personeel zonder abonnement ook weg"
          { title: "Tarievenoverzicht", desc: "Richttarief per functie en branche, ook als pdf.", href: "/tarieven-overzicht" },
          { title: "Veelgestelde vragen", desc: "Wanneer de fee telt, offerte op maat, btw.", href: "/prijzen#faq" },
        ],
      },
    },
  },
  {
    key: "branches",
    href: "/voor-freelancers#branches",
    label: "Branches",
    match: "-vacatures",
    overzicht: "Alle branches",
    menu: {
      werknemers: { eyebrow: "Branches uitgelicht", cta: CTA_WN, items: BRANCHES_WN },
      bedrijven: { eyebrow: "Personeel per branche", cta: CTA_BV, items: BRANCHES_BV },
    },
  },
  // 22 nov 2026: de knoppen Shop en Apps & spelletjes zijn weg, met de webshop en de apps-pagina's
  {
    key: "over",
    href: "/over-ons",
    label: "Over ons",
    match: "/over-ons",
    overzicht: "Over ZekerFlex",
    menu: {
      werknemers: { eyebrow: "Waar we voor staan", cta: CTA_WN, items: OVER_ITEMS },
      bedrijven: { eyebrow: "Waar we voor staan", cta: CTA_BV, items: OVER_ITEMS },
    },
  },
  {
    key: "kennis",
    href: "/kennis",
    label: "Kennis",
    match: "/kennis",
    overzicht: "Alle kennis",
    menu: {
      werknemers: { eyebrow: "Kennis & informatie", cta: CTA_WN, items: KENNIS_WN },
      bedrijven: { eyebrow: "Kennis & informatie", cta: CTA_BV, items: KENNIS_ITEMS },
    },
  },
];

/**
 * Eigen links die de eigenaar in de Site-ontwerper onder een standaardknop zette
 * (bouwNav in lib/ontwerp/hoofdmenu.ts zet ze achter de standaarditems). De brede
 * Aanbod-uitklap toont de producten zelf en deze links er los onder.
 */
export function eigenLinks(n: NavEntry, a: Audience): MenuItem[] {
  const standaard = NAV.find((s) => s.key === n.key)?.menu?.[a].items.length ?? 0;
  return n.menu?.[a].items.slice(standaard) ?? [];
}

/** Per pijler de producten, voor de brede uitklap "Aanbod" en het mobiele menu. */
export interface MegaKolom {
  sleutel: PijlerSleutel;
  naam: string;
  kort: string;
  href: string;
  items: { naam: string; href: string; binnenkort: boolean }[];
}
export const AANBOD_KOLOMMEN: MegaKolom[] = PIJLERS.map((p) => ({
  sleutel: p.sleutel,
  naam: p.naam,
  kort: p.kort,
  href: `/aanbod#${p.sleutel}`,
  items: AANBOD.filter((a) => a.pijler === p.sleutel).map((a) => ({
    naam: a.naam,
    href: aanbodHref(a),
    binnenkort: a.status === "binnenkort",
  })),
}));

/**
 * Snelle acties bovenaan het mobiele menu: wat iemand het vaakst komt doen,
 * afhankelijk van de gekozen doelgroep. Elk een bestaande pagina.
 */
export type SnelIcoon = "zoek" | "kaart" | "loon" | "app" | "plus" | "team" | "web" | "demo";
export interface SnelleActie {
  label: string;
  sub: string;
  href: string;
  icoon: SnelIcoon;
}
export const SNELLE_ACTIES: Record<Audience, SnelleActie[]> = {
  werknemers: [
    { label: "Open klussen", sub: "Bij jou in de buurt", href: "/klussen", icoon: "zoek" },
    { label: "Klussen op de kaart", sub: "Zie waar werk is", href: "/open-diensten", icoon: "kaart" },
    // 21 nov: "Via het uitzendbureau" weg (eigenaar: geen aparte pagina, uitzendklussen staan gewoon in de app)
    { label: "Starten als freelancer", sub: "Zo begin je", href: "/voor-freelancers", icoon: "loon" },
    { label: "Download de app", sub: "Diensten en uren", href: "/app", icoon: "app" },
  ],
  bedrijven: [
    { label: "Klus plaatsen", sub: "Zonder account, zie de kosten", href: "/klus-plaatsen", icoon: "plus" },
    { label: "Personeel inhuren", sub: "Per stad en branche", href: "/personeel-inhuren", icoon: "team" },
    { label: "Tarievenoverzicht", sub: "Richttarief per functie", href: "/tarieven-overzicht", icoon: "loon" },
    { label: "Vraag een demo aan", sub: "30 minuten, vrijblijvend", href: "/demo", icoon: "demo" },
  ],
};

/** Overzichtspagina per doelgroep (link onder de snelle acties). */
export const DOELGROEP_PAGINA: Record<Audience, { label: string; href: string }> = {
  werknemers: { label: "Alles voor werknemers", href: "/voor-freelancers" },
  bedrijven: { label: "Alles voor bedrijven", href: "/voor-bedrijven" },
};

/**
 * Met de vlag `publiek-alleen-flexwerk` aan vallen de niet-flexwerk-knoppen
 * (aanbod, prijzen) weg uit de bovenbalk en het mobiele menu. Zonder de vlag (de
 * standaard) blijft het menu precies zoals het was.
 */
export function zichtbareNav(nav: NavEntry[], alleenFlexwerk: boolean): NavEntry[] {
  return alleenFlexwerk ? nav.filter((n) => !NIET_FLEXWERK_NAV_KEYS.includes(n.key)) : nav;
}

/**
 * De aanbod-kolommen voor de brede uitklap: met de vlag aan alleen de
 * flexwerk-pijlers (personeel, geld); de pijlers "online" en "branche" vallen
 * weg.
 */
export function zichtbareAanbodKolommen(alleenFlexwerk: boolean): MegaKolom[] {
  return zichtbarePijlers(AANBOD_KOLOMMEN, alleenFlexwerk);
}

/** Start-knop: werknemers naar een account, bedrijven naar de organisatie-aanmelding. */
export const startHref = (a: Audience): string => (a === "bedrijven" ? CTA_BV.href : CTA_WN.href);

export const isExternal = (href: string): boolean => /^(mailto:|tel:|https?:)/.test(href);
