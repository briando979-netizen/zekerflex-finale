import { PIJLERS } from "@/lib/marketing/aanbod";

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
  { title: "Blogs", desc: "Nieuws en achtergrond over flexibel werk en het platform.", href: "/kennis/blog" },
  { title: "FAQ", desc: "Kort antwoord op de vragen die we het vaakst krijgen.", href: "/kennis/faq" },
];

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
    menu: { werknemers: AANBOD_MENU, bedrijven: AANBOD_MENU },
  },
  {
    key: "hoe",
    href: "/#hoe-het-werkt",
    label: "Hoe het werkt",
    match: "hoe-het-werkt",
    menu: {
      werknemers: {
        eyebrow: "Zo werkt ZekerFlex",
        cta: CTA_WN,
        items: [
          { title: "Vind werk", desc: "Diensten die matchen op je vak, je reistijd en je beschikbaarheid.", href: "/voor-freelancers#matching" },
          { title: "Starten als freelancer", desc: "Van aanmelding tot je eerste dienst — alles geregeld behalve het werk zelf.", href: "/voor-freelancers" },
          { title: "Via het uitzendbureau", desc: "Liever loonstrook, vakantiegeld en pensioen? Werk als uitzendkracht.", href: "/uitzendbureau" },
          { title: "Verzekeren", desc: "Aansprakelijkheid en ongevallen gedekt tijdens elke opdracht.", href: "/voor-freelancers#verzekering" },
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
    key: "over",
    href: "/over-ons",
    label: "Over ons",
    match: "/over-ons",
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
    menu: {
      werknemers: { eyebrow: "Kennis & informatie", cta: CTA_WN, items: KENNIS_ITEMS },
      bedrijven: { eyebrow: "Kennis & informatie", cta: CTA_BV, items: KENNIS_ITEMS },
    },
  },
];
