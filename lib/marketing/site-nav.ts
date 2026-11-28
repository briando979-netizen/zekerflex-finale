import { vt } from "@/lib/i18n/site";
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

// de hoofdknop per doelgroep, overal dezelfde tekst (22 nov 2026, gebruikersonderzoek punt 8; zie HOOFDKNOP hieronder)
export const CTA_WN = { label: vt("Maak gratis je profiel"), href: "/register" };
export const CTA_BV = { label: vt("Plaats een klus"), href: "/klus-plaatsen" };

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
 * De twee knoppen rechtsboven in de kopbalk, per kant: Inloggen en de hoofdknop. `mobiel` is de korte knop naast de menuknop
 * op de telefoon (Inloggen: wie via de site een account maakte, moet het inloggen meteen vinden, 21 nov 2026).
 */
// 22 nov 2026 (gebruikersonderzoek punt 8): "Inloggen" ging bij werkers naar het introscherm /welkom in plaats van naar het
// inlogscherm, en werkers zagen 6 verschillende knopteksten. Nu per kant hetzelfde: Inloggen gaat altijd naar /login, en er
// is één hoofdknop met één tekst (werker: "Maak gratis je profiel" naar /register, bedrijf: "Plaats een klus" naar
// /klus-plaatsen). "Ga naar de app" is weg: "Download de app" staat één keer in het menu (de tegel).
export const HOOFDKNOP: Record<Audience, KopKnop> = { werknemers: CTA_WN, bedrijven: CTA_BV };
const INLOGGEN: KopKnop = { label: vt("Inloggen"), href: "/login" };

export const KOP_KNOPPEN: Record<Audience, { eerste: KopKnop; tweede: KopKnop; mobiel: KopKnop }> = {
  werknemers: { eerste: INLOGGEN, tweede: HOOFDKNOP.werknemers, mobiel: INLOGGEN },
  bedrijven: { eerste: INLOGGEN, tweede: HOOFDKNOP.bedrijven, mobiel: INLOGGEN },
};

const OVER_ITEMS: MenuItem[] = [
  { title: vt("Ons verhaal"), desc: vt("Waarom ZekerFlex bestaat en wat we anders doen."), href: "/over-ons#verhaal" },
  // 21 nov 2026 (eigenaar): "Drie uitgangspunten" uit het menu
  { title: vt("Werken bij ons"), desc: vt("Stuur een open sollicitatie — goede mensen zijn altijd welkom."), href: "/over-ons#werken-bij" },
  // 22 nov 2026: de community op de site zelf (lib/community); hier en niet onder Kennis, want Kennis bij werkers blijft kort (21 nov)
  { title: vt("Community"), desc: vt("Praat mee met werkers en bedrijven: vragen, ervaringen en tips."), href: "/community" },
  { title: vt("Contact"), desc: vt("Vragen of samenwerken? Mail info@zekerflex.com."), href: "mailto:info@zekerflex.com" },
];
// 21 nov 2026 (eigenaar): Kennis bij werknemers alleen Informatie, Kennisbank, Blogs en FAQ (zoals YoungOnes)
const KENNIS_WN: MenuItem[] = [
  { title: vt("Informatie"), desc: vt("De basis in één oogopslag: wat, voor wie, wat kost het."), href: "/kennis#informatie" },
  { title: vt("Kennisbank"), desc: vt("Uitgelegde onderwerpen: Wet DBA, StiPP, uitbetaling en meer."), href: "/kennis#kennisbank" },
  { title: vt("Blogs"), desc: vt("Achtergrond over flexibel werk en het platform."), href: "/kennis/blog" },
  { title: vt("FAQ"), desc: vt("Kort antwoord op de vragen die we het vaakst krijgen."), href: "/kennis/faq" },
];
const KENNIS_ITEMS: MenuItem[] = [
  { title: vt("Informatie"), desc: vt("De basis in één oogopslag: wat, voor wie, wat kost het."), href: "/kennis#informatie" },
  { title: vt("Kennisbank"), desc: vt("Uitgelegde onderwerpen: Wet DBA, StiPP, uitbetaling en meer."), href: "/kennis#kennisbank" },
  { title: vt("Wet DBA voor bedrijven"), desc: vt("Schijnzelfstandigheid, gezag en handhaving — helder uitgelegd."), href: "/kennis/wet-dba" },
  { title: vt("Whitepapers"), desc: vt("Belasting, administratie en verzekering — als pdf om te bewaren."), href: "/kennis/whitepapers" },
  { title: vt("Rekentools"), desc: vt("Uurtarief, kosten van een flexkracht en de Wet DBA-check — gratis."), href: "/rekentools" },
  { title: vt("Nieuwsroom"), desc: vt("Het laatste nieuws over werk, regels en ondernemen, kort uitgelegd."), href: "/nieuws" },
  { title: vt("Blogs"), desc: vt("Achtergrond over flexibel werk en het platform."), href: "/kennis/blog" },
  { title: vt("FAQ"), desc: vt("Kort antwoord op de vragen die we het vaakst krijgen."), href: "/kennis/faq" },
  // 21 nov 2026 (eigenaar: "Prijzen weg, tarievenoverzicht bij de vragen, de rekenhulp een plekje geven")
  { title: vt("Tarievenoverzicht"), desc: vt("Richttarief per functie en branche, ook als pdf."), href: "/tarieven-overzicht" },
  { title: vt("Platformkosten berekenen"), desc: vt("Wat je per maand betaalt bij jouw aantal uren."), href: "/rekentools/platformkosten-berekenen" },
  // 22 nov 2026: korte antwoorden voor bedrijven (lib/seo-vragen.ts)
  { title: vt("Vragen van bedrijven"), desc: vt("Wat kost een flexwerker, platform of uitzendbureau, en de Wet DBA."), href: "/vragen" },
];

// Branches (21 nov 2026, eigenaar: "bij werknemers een menu Branches, zoals YoungOnes"): de branchepagina's uit lib/seo-sectors.ts.
// Werknemers gaan naar de vacatures per branche, bedrijven naar personeel inhuren per branche.
const BRANCHE_NAAM: Record<string, string> = { horeca: "Horeca & catering", logistiek: "Logistiek & magazijn" };
const brancheNaam = (s: Sector): string => (Object.hasOwn(BRANCHE_NAAM, s.key) ? BRANCHE_NAAM[s.key]! : s.label);
// 22 nov 2026: daaronder de functiepagina's (/werken-als, lib/seo-functies.ts), voor wie op een functie zoekt
const BRANCHES_WN: MenuItem[] = [
  ...SECTORS.map((s) => ({ title: brancheNaam(s), desc: s.rolesShort, href: `/${s.workerSlug}` })),
  { title: vt("Per functie"), desc: vt("Werken als orderpicker, barista, schoonmaker …"), href: "/werken-als" },
];
const BRANCHES_BV: MenuItem[] = SECTORS.map((s) => ({ title: brancheNaam(s), desc: s.rolesShort, href: `/${s.slug}` }));

// 22 nov 2026: "Apps & spelletjes" en de pagina /online zijn weg (geen flexwerk), dus ook hun menu-items
const AANBOD_MENU: MenuVariant = {
  eyebrow: vt("Alles onder één dak"),
  cta: { label: vt("Het hele aanbod"), href: "/aanbod" },
  items: [
    ...PIJLERS.map((p) => ({ title: p.naam, desc: p.kort, href: `/aanbod#${p.sleutel}` })),
    { title: vt("Ik zoek werk"), desc: vt("Als flexwerker, uitzendkracht of zzp'er. Meedoen is gratis."), href: "/voor-freelancers" },
  ],
};

export const NAV: NavEntry[] = [
  {
    // Al het aanbod (personeel, online, branchepakketten, geld) uit
    // lib/marketing/aanbod.ts; uitzenden is daar één onderdeel van.
    key: "aanbod",
    href: "/aanbod",
    label: vt("Aanbod"),
    match: "/aanbod",
    overzicht: "Het hele aanbod",
    mega: true,
    menu: { werknemers: AANBOD_MENU, bedrijven: AANBOD_MENU },
  },
  {
    key: "hoe",
    href: "/#hoe-het-werkt",
    label: vt("Hoe het werkt"),
    match: "hoe-het-werkt",
    overzicht: "Zo werkt het",
    menu: {
      werknemers: {
        eyebrow: vt("Zo werkt ZekerFlex"),
        cta: CTA_WN,
        items: [
          { title: vt("Vind werk"), desc: vt("Diensten die matchen op je vak, je reistijd en je beschikbaarheid."), href: "/freelance-werk" },
          { title: vt("Starten als freelancer"), desc: vt("Van aanmelding tot je eerste dienst — alles geregeld behalve het werk zelf."), href: "/voor-freelancers" },
          // 21 nov (eigenaar: "YoungOnes heeft dat bij workers onder Hoe het werkt, zet die ook bij ZekerFlex neer")
          { title: vt("Starten als uitzendkracht"), desc: vt("Werken zonder KVK, op contract bij een uitzendbureau."), href: "/starten-als-uitzendkracht" },
          // 22 nov 2026 (eigenaar: "dooie klik"): /voor-freelancers heeft geen #verzekering; de uitleg staat in de whitepaper
          { title: vt("Verzekeren"), desc: vt("Welke verzekering je als zzp'er of flexwerker zelf regelt."), href: "/kennis/whitepapers/verzekering" },
        ],
      },
      bedrijven: {
        eyebrow: vt("Zo werkt ZekerFlex voor bedrijven"),
        cta: CTA_BV,
        items: [
          // 22 nov 2026: /voor-bedrijven is samengevoegd in /bedrijven (de bedrijvenkant), en geen belofte van "direct de beste
          // kandidaten" meer (gebruikersonderzoek punt 2). "Matching & toewijzing" wees naar een anker op de oude pagina: weg.
          { title: vt("Voor bedrijven"), desc: vt("Je klus komt bij geverifieerde werkers in de buurt; jij kiest wie je inroostert."), href: "/bedrijven" },
          // 21 nov 2026 (eigenaar): "GPS check-in & urengoedkeuring" en "Facturatie & Wet DBA-monitor" uit het menu
          { title: vt("Helpcentrum voor opdrachtgevers"), desc: vt("Account, PO-nummers, diensten plaatsen en uren goedkeuren — stap voor stap."), href: "/kennis/werkgevers" },
          // 21 nov 2026: uitzendbureaus zetten hun klussen op ZekerFlex en blijven zelf werkgever (lib/uitzend/partners-kern.ts)
          { title: vt("Voor uitzendbureaus"), desc: vt("Zet je uitzendklussen op ZekerFlex, onder je eigen naam."), href: "/uitzendpartner" },
          { title: vt("Vraag een demo aan"), desc: vt("30 minuten, vrijblijvend — we laten zien hoe het platform werkt."), href: "/demo" },
        ],
      },
    },
  },
  {
    key: "prijzen",
    href: "/prijzen",
    label: vt("Prijzen"),
    match: "/prijzen",
    overzicht: "Alle prijzen",
    menu: {
      werknemers: {
        eyebrow: vt("Eerlijk en voorspelbaar"),
        cta: CTA_WN,
        items: [
          { title: vt("Gratis voor werknemers"), desc: vt("Voor altijd. Meedoen kost je niets."), href: "/prijzen#freelancers" },
          { title: vt("Sneller uitbetalen"), desc: vt("Direct indienen, binnen 3 werkdagen indienen of gratis wachten — jij kiest per keer."), href: "/kennis/uitbetaling-en-facturen" },
          { title: vt("Veelgestelde vragen"), desc: vt("Verborgen kosten, wanneer de fee telt, en meer."), href: "/prijzen#faq" },
        ],
      },
      bedrijven: {
        eyebrow: vt("Eerlijk en voorspelbaar"),
        cta: CTA_BV,
        items: [
          // 21 nov 2026 (eigenaar): "die 3,50 kan weg" en "personeel zonder abonnement ook weg"
          { title: vt("Tarievenoverzicht"), desc: vt("Richttarief per functie en branche, ook als pdf."), href: "/tarieven-overzicht" },
          { title: vt("Veelgestelde vragen"), desc: vt("Wanneer de fee telt, offerte op maat, btw."), href: "/prijzen#faq" },
        ],
      },
    },
  },
  {
    key: "branches",
    href: "/voor-freelancers#branches",
    label: vt("Branches"),
    match: "-vacatures",
    overzicht: "Alle branches",
    menu: {
      werknemers: { eyebrow: vt("Branches uitgelicht"), cta: CTA_WN, items: BRANCHES_WN },
      bedrijven: { eyebrow: vt("Personeel per branche"), cta: CTA_BV, items: BRANCHES_BV },
    },
  },
  // 22 nov 2026: de knoppen Shop en Apps & spelletjes zijn weg, met de webshop en de apps-pagina's
  {
    key: "over",
    href: "/over-ons",
    label: vt("Over ons"),
    match: "/over-ons",
    overzicht: "Over ZekerFlex",
    menu: {
      werknemers: { eyebrow: vt("Waar we voor staan"), cta: CTA_WN, items: OVER_ITEMS },
      bedrijven: { eyebrow: vt("Waar we voor staan"), cta: CTA_BV, items: OVER_ITEMS },
    },
  },
  {
    key: "kennis",
    href: "/kennis",
    label: vt("Kennis"),
    match: "/kennis",
    overzicht: "Alle kennis",
    menu: {
      werknemers: { eyebrow: vt("Kennis & informatie"), cta: CTA_WN, items: KENNIS_WN },
      bedrijven: { eyebrow: vt("Kennis & informatie"), cta: CTA_BV, items: KENNIS_ITEMS },
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
  items: { naam: string; href: string }[];
}
export const AANBOD_KOLOMMEN: MegaKolom[] = PIJLERS.map((p) => ({
  sleutel: p.sleutel,
  naam: p.naam,
  kort: p.kort,
  href: `/aanbod#${p.sleutel}`,
  items: AANBOD.filter((a) => a.pijler === p.sleutel).map((a) => ({
    naam: a.naam,
    href: aanbodHref(a),
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
    { label: vt("Open klussen"), sub: vt("Bij jou in de buurt"), href: "/klussen", icoon: "zoek" },
    { label: vt("Klussen op de kaart"), sub: vt("Zie waar werk is"), href: "/open-diensten", icoon: "kaart" },
    // 21 nov: "Via het uitzendbureau" weg (eigenaar: geen aparte pagina, uitzendklussen staan gewoon in de app)
    { label: vt("Starten als freelancer"), sub: vt("Zo begin je"), href: "/voor-freelancers", icoon: "loon" },
    { label: vt("Download de app"), sub: vt("Diensten en uren"), href: "/app", icoon: "app" },
  ],
  bedrijven: [
    { label: vt("Plaats een klus"), sub: vt("Zonder account, zie de kosten"), href: "/klus-plaatsen", icoon: "plus" },
    { label: vt("Personeel inhuren"), sub: vt("Per stad en branche"), href: "/personeel-inhuren", icoon: "team" },
    // 22 nov 2026 (gebruikersonderzoek, KAN WEG): het Tarievenoverzicht stond hier én onder Kennis (waar de eigenaar het op
    // 21 nov zette); hier nu de overzichtspagina, die eerst een losse link "Alles voor bedrijven →" onder de tegels was
    { label: vt("Alles voor bedrijven"), sub: vt("Hoe het werkt, wat het kost"), href: "/bedrijven", icoon: "web" },
    { label: vt("Vraag een demo aan"), sub: vt("30 minuten, vrijblijvend"), href: "/demo", icoon: "demo" },
  ],
};

// De losse link "Alles voor werknemers →" / "Alles voor bedrijven →" onder de tegels (DOELGROEP_PAGINA) is weg (22 nov 2026,
// gebruikersonderzoek, KAN WEG): bij werkers ging hij naar dezelfde pagina als de tegel "Starten als freelancer", bij bedrijven
// is hij een tegel geworden.

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

/** Start-knop: werknemers naar een account, bedrijven naar een klus plaatsen (zonder account, met de kosten). */
export const startHref = (a: Audience): string => (a === "bedrijven" ? CTA_BV.href : CTA_WN.href);

export const isExternal = (href: string): boolean => /^(mailto:|tel:|https?:)/.test(href);
