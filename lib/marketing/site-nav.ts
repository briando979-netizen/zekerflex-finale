import { AANBOD, aanbodHref, PIJLERS, type PijlerSleutel } from "@/lib/marketing/aanbod";
import { APPS } from "@/lib/marketing/apps";
import { NIET_FLEXWERK_NAV_KEYS, zichtbarePijlers } from "@/lib/marketing/flexwerk-only";

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

const OVER_ITEMS: MenuItem[] = [
  { title: "Ons verhaal", desc: "Waarom ZekerFlex bestaat en wat we anders doen.", href: "/over-ons#verhaal" },
  { title: "Drie uitgangspunten", desc: "Onafhankelijk, zeker en transparant.", href: "/over-ons#uitgangspunten" },
  { title: "Werken bij ons", desc: "Stuur een open sollicitatie — goede mensen zijn altijd welkom.", href: "/over-ons#werken-bij" },
  { title: "Contact", desc: "Vragen of samenwerken? Mail info@zekerflex.com.", href: "mailto:info@zekerflex.com" },
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
];

// "Apps & spelletjes": de knoppen "Ga naar …" uit lib/marketing/apps.ts
const APPS_MENU: MenuItem[] = APPS.map((a) => ({ title: a.knop, desc: a.tekst, href: a.href }));

const AANBOD_MENU: MenuVariant = {
  eyebrow: "Alles onder één dak",
  cta: { label: "Het hele aanbod", href: "/aanbod" },
  items: [
    ...PIJLERS.map((p) => ({ title: p.naam, desc: p.kort, href: `/aanbod#${p.sleutel}` })),
    // alle losse online tools (website, webshop, logo, domein, mail, checks) op één pagina (lib/marketing/online-tools.ts)
    { title: "Alles voor je bedrijf online", desc: "Website, webshop, logo, domein, mail en gratis checks op één pagina.", href: "/online" },
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
          { title: "Vind werk", desc: "Diensten die matchen op je vak, je reistijd en je beschikbaarheid.", href: "/voor-freelancers#matching" },
          { title: "Starten als freelancer", desc: "Van aanmelding tot je eerste dienst — alles geregeld behalve het werk zelf.", href: "/voor-freelancers" },
          { title: "Verzekeren", desc: "Welke verzekering je als zzp'er of flexwerker zelf regelt.", href: "/voor-freelancers#verzekering" },
        ],
      },
      bedrijven: {
        eyebrow: "Zo werkt ZekerFlex voor bedrijven",
        cta: CTA_BV,
        items: [
          { title: "Voor bedrijven", desc: "Zet een dienst uit — ZekerFlex matcht direct de beste kandidaten.", href: "/voor-bedrijven" },
          { title: "Matching & toewijzing", desc: "Automatisch per vestiging, gewogen op reistijd en betrouwbaarheid.", href: "/voor-bedrijven#matching" },
          { title: "GPS check-in & urengoedkeuring", desc: "Uren goedkeuren in één klik — de facturen volgen vanzelf.", href: "/voor-bedrijven#checkin" },
          { title: "Facturatie & Wet DBA-monitor", desc: "Geaggregeerde facturatie en vroege risicosignalen per samenwerking.", href: "/voor-bedrijven#facturatie" },
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
          { title: "€ 3,50 per gewerkt uur", desc: "Vaste platformkosten — alleen wanneer er iemand werkt.", href: "/prijzen#bedrijven" },
          { title: "Personeel zonder abonnement", desc: "Geen opstart- of plaatsingskosten, geen staffels om te doorgronden.", href: "/prijzen#bedrijven" },
          { title: "Tarievenoverzicht", desc: "Richttarief per functie en branche, ook als pdf.", href: "/tarieven-overzicht" },
          { title: "Veelgestelde vragen", desc: "Wanneer de fee telt, offerte op maat, btw.", href: "/prijzen#faq" },
        ],
      },
    },
  },
  {
    key: "shop",
    href: "/shop",
    label: "Shop",
    match: "/shop",
    overzicht: "Naar de shop",
    menu: {
      werknemers: {
        eyebrow: "ZekerFlex essentials",
        cta: { label: "Bekijk de shop", href: "/shop" },
        items: [
          { title: "Werkdag essentials", desc: "Praktische items voor onderweg, op locatie en in je tas.", href: "/shop" },
          { title: "Kleding & accessoires", desc: "Draag het merk dat werk zekerheid geeft.", href: "/shop#kleding" },
        ],
      },
      bedrijven: {
        eyebrow: "ZekerFlex shop",
        cta: { label: "Naar de shop", href: "/shop" },
        items: [
          { title: "Teamwear", desc: "Herkenbaar en verzorgd op iedere locatie.", href: "/shop#kleding" },
          { title: "Cadeaus voor je team", desc: "Kleine essentials met een grote glimlach.", href: "/shop#cadeaus" },
        ],
      },
    },
  },
  {
    // De eigen apps van ZekerFlex als aparte categorie, los van de voorbeelden op
    // /website-maken (lib/marketing/apps.ts): direct "Ga naar …".
    // (/apps zelf is de pagina met de ZekerFlex-apps per doelgroep; dit is een andere categorie)
    key: "apps",
    href: "/apps-en-spelletjes",
    label: "Apps & spelletjes",
    match: "/apps-en-spelletjes",
    overzicht: "Alle apps en spelletjes",
    menu: {
      werknemers: { eyebrow: "Even iets anders", cta: { label: "Alles bekijken", href: "/apps-en-spelletjes" }, items: APPS_MENU },
      bedrijven: { eyebrow: "Onze eigen apps", cta: { label: "Alles bekijken", href: "/apps-en-spelletjes" }, items: APPS_MENU },
    },
  },
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
      werknemers: { eyebrow: "Kennis & informatie", cta: CTA_WN, items: KENNIS_ITEMS },
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

/** Extra ingang onder "Online & klanten": de sites die we echt hebben gemaakt (19 nov 2026: de oude voorbeeldsites per branche tonen we niet meer). */
export const VOORBEELDSITES = { label: "Websites die we maakten", href: "/website-maken#voorbeelden" };
/** Onder dezelfde kolom: alle losse online tools op één pagina (/online, lib/marketing/online-tools.ts). De brede uitklap tekent AANBOD_KOLOMMEN, niet AANBOD_MENU.items, dus de link staat hier. */
export const ALLES_ONLINE = { label: "Alles voor je bedrijf online", href: "/online" };

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
    { label: "Website laten maken", sub: "Op je eigen domein", href: "/aanbod/website", icoon: "web" },
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
 * (shop, apps) weg uit de bovenbalk en het mobiele menu. Zonder de vlag (de
 * standaard) blijft het menu precies zoals het was.
 */
export function zichtbareNav(nav: NavEntry[], alleenFlexwerk: boolean): NavEntry[] {
  return alleenFlexwerk ? nav.filter((n) => !NIET_FLEXWERK_NAV_KEYS.includes(n.key)) : nav;
}

/**
 * De aanbod-kolommen voor de brede uitklap: met de vlag aan alleen de
 * flexwerk-pijlers (personeel, geld); de pijlers "online" en "branche" vallen
 * weg (en daarmee ook de losse links VOORBEELDSITES/ALLES_ONLINE onder "online").
 */
export function zichtbareAanbodKolommen(alleenFlexwerk: boolean): MegaKolom[] {
  return zichtbarePijlers(AANBOD_KOLOMMEN, alleenFlexwerk);
}

/** Start-knop: werknemers naar een account, bedrijven naar de organisatie-aanmelding. */
export const startHref = (a: Audience): string => (a === "bedrijven" ? CTA_BV.href : CTA_WN.href);

export const isExternal = (href: string): boolean => /^(mailto:|tel:|https?:)/.test(href);
