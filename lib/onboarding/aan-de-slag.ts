// ---------------------------------------------------------------------------
// "Aan de slag" per product (masterplan Fase 1, 11 nov): ÉÉN lijst per dashboard. Tot nu toe had elk
// scherm zijn eigen lijst (de rijschool, de horecazaak, de webshop en de website in de studio); de
// stappen, voorwaarden en teksten staan nu hier, en elk scherm roept deze lijst aan en houdt zijn eigen
// vormgeving (de studio heeft zijn eigen stijl, het werkgeversdeel de kaart OnboardingProgress).
// Puur (geen prisma, geen kv, geen React): de aanroeper levert de feiten die hij kent; een stap
// waarvan het feit ontbreekt (undefined) verschijnt niet, zodat een scherm met weinig gegevens
// (het startscherm) niet een stap toont die het niet kan afvinken. Alles gewoon Nederlands.
// ---------------------------------------------------------------------------
import type { OnboardingProgressTexts } from "@/components/app/OnboardingProgress";
import type { Stap } from "@/lib/onboarding/voortgang";

export type ProductMetLijst = "website" | "webshop" | "horeca" | "rijschool";

export type AanDeSlagSleutel =
  | "website-paginas"
  | "website-logo"
  | "website-contact"
  | "website-online"
  | "website-domein"
  | "webshop-product"
  | "webshop-verzending"
  | "webshop-bedrijf"
  | "webshop-wettelijk"
  | "webshop-online"
  | "webshop-domein"
  | "horeca-menukaart"
  | "horeca-gegevens"
  | "horeca-modules"
  | "horeca-tafels"
  | "horeca-scherm"
  | "horeca-online"
  | "rijschool-pakketten"
  | "rijschool-werktijden"
  | "rijschool-auto"
  | "rijschool-gegevens"
  | "rijschool-werkgebied"
  | "rijschool-online";

export type AdsStap = Stap<AanDeSlagSleutel>;

/** Een stap alleen opnemen als zijn feit bekend is. */
const alsBekend = (feit: unknown, stap: AdsStap): AdsStap[] => (feit === undefined ? [] : [stap]);

// --- website (studio) -------------------------------------------------------------------------

const W = "/studio/website";

export interface WebsiteFeiten {
  paginas?: number | undefined;
  logo?: boolean | undefined;
  /** naam, e-mail en telefoon ingevuld */
  contactKlaar?: boolean | undefined;
  online: boolean;
  eigenDomein?: boolean | null | undefined;
}

export function websiteStappen(f: WebsiteFeiten): AdsStap[] {
  return [
    ...alsBekend(f.paginas, { key: "website-paginas", done: (f.paginas ?? 0) > 1, href: `${W}/bouwer`, minuten: 15 }),
    ...alsBekend(f.logo, { key: "website-logo", done: f.logo === true, href: `${W}/ontwerp`, minuten: 3 }),
    ...alsBekend(f.contactKlaar, { key: "website-contact", done: f.contactKlaar === true, href: `${W}/instellingen`, minuten: 3 }),
    { key: "website-online", done: f.online, href: `${W}/bouwer`, minuten: 2 },
    ...alsBekend(f.eigenDomein === null ? undefined : f.eigenDomein, { key: "website-domein", done: f.eigenDomein === true, href: `${W}/instellingen`, minuten: 5, optioneel: true }),
  ];
}

// --- webshop (studio) -------------------------------------------------------------------------

const S = "/studio/webshop";

export interface WebshopFeiten {
  /** producten die klanten zien */
  actieveProducten?: number | undefined;
  /** bestellen staat aan, bezorgen of afhalen is gekozen en de betaaltekst is ingevuld */
  verzendingBetalenKlaar?: boolean | undefined;
  /** naam, KVK, adres en e-mail ingevuld */
  bedrijfsgegevensKlaar?: boolean | undefined;
  /** de pagina's verzenden-en-retourneren en voorwaarden bestaan */
  wettelijkePaginas?: boolean | undefined;
  online: boolean;
  eigenDomein?: boolean | null | undefined;
}

export function webshopStappen(f: WebshopFeiten): AdsStap[] {
  return [
    ...alsBekend(f.actieveProducten, { key: "webshop-product", done: (f.actieveProducten ?? 0) > 0, href: `${S}/producten`, minuten: 10 }),
    ...alsBekend(f.verzendingBetalenKlaar, { key: "webshop-verzending", done: f.verzendingBetalenKlaar === true, href: `${S}/verzending`, minuten: 5 }),
    ...alsBekend(f.bedrijfsgegevensKlaar, { key: "webshop-bedrijf", done: f.bedrijfsgegevensKlaar === true, href: `${S}/instellingen`, minuten: 3 }),
    // de wettelijke pagina's tellen pas als gecontroleerd als de winkel ook online staat (zoals het studio-overzicht dat deed)
    ...alsBekend(f.wettelijkePaginas, { key: "webshop-wettelijk", done: f.wettelijkePaginas === true && f.online, href: `${S}/paginas`, minuten: 5 }),
    { key: "webshop-online", done: f.online, href: S, minuten: 2 },
    ...alsBekend(f.eigenDomein === null ? undefined : f.eigenDomein, { key: "webshop-domein", done: f.eigenDomein === true, href: `${S}/instellingen`, minuten: 5, optioneel: true }),
  ];
}

// --- horeca -----------------------------------------------------------------------------------

const H = "/werkgever/horeca";

export interface HorecaFeiten {
  menuItems?: number | undefined;
  /** adres en telefoon ingevuld */
  adresEnTelefoon?: boolean | undefined;
  modules?: readonly string[] | undefined;
  tafels?: number | undefined;
  /** gekoppelde schermen (keuken, bar, handheld) */
  apparaten?: number | undefined;
  online: boolean;
}

export function horecaStappen(f: HorecaFeiten): AdsStap[] {
  return [
    ...alsBekend(f.menuItems, { key: "horeca-menukaart", done: (f.menuItems ?? 0) > 0, href: `${H}?tab=menukaart`, minuten: 15 }),
    ...alsBekend(f.adresEnTelefoon, { key: "horeca-gegevens", done: f.adresEnTelefoon === true, href: `${H}?tab=gegevens`, minuten: 3 }),
    ...alsBekend(f.modules, { key: "horeca-modules", done: (f.modules ?? []).length > 0, href: `${H}?tab=modules`, minuten: 3 }),
    // tafels en QR bestaan alleen met de module bestellen: zonder die module is deze stap al klaar
    ...(f.modules !== undefined && f.tafels !== undefined
      ? [{ key: "horeca-tafels" as const, done: f.tafels > 0 || !f.modules.includes("bestellen"), href: `${H}?tab=tafels`, minuten: 5 }]
      : []),
    ...alsBekend(f.apparaten, { key: "horeca-scherm", done: (f.apparaten ?? 0) > 0, href: `${H}?tab=schermen`, minuten: 5 }),
    { key: "horeca-online", done: f.online, href: `${H}?tab=overzicht`, minuten: 2 },
  ];
}

// --- rijschool --------------------------------------------------------------------------------

const R = "/werkgever/rijschool";

export interface RijschoolFeiten {
  /** pakketten of lessoorten aangemaakt */
  pakketten?: number | undefined;
  /** minstens één instructeur met werktijden */
  werktijden?: boolean | undefined;
  voertuigen?: number | undefined;
  /** KVK-nummer en adres ingevuld */
  kvkEnAdres?: boolean | undefined;
  werkgebied?: boolean | undefined;
  online: boolean;
}

export function rijschoolStappen(f: RijschoolFeiten): AdsStap[] {
  return [
    ...alsBekend(f.pakketten, { key: "rijschool-pakketten", done: (f.pakketten ?? 0) > 0, href: `${R}?tab=pakketten`, minuten: 5 }),
    ...alsBekend(f.werktijden, { key: "rijschool-werktijden", done: f.werktijden === true, href: `${R}?tab=team`, minuten: 5 }),
    ...alsBekend(f.voertuigen, { key: "rijschool-auto", done: (f.voertuigen ?? 0) > 0, href: `${R}?tab=team`, minuten: 3 }),
    ...alsBekend(f.kvkEnAdres, { key: "rijschool-gegevens", done: f.kvkEnAdres === true, href: `${R}?tab=instellingen`, minuten: 3 }),
    ...alsBekend(f.werkgebied, { key: "rijschool-werkgebied", done: f.werkgebied === true, href: `${R}?tab=website`, minuten: 5 }),
    { key: "rijschool-online", done: f.online, href: `${R}?tab=instellingen`, minuten: 2 },
  ];
}

/** Het tabblad uit een adres als /werkgever/horeca?tab=menukaart; null zonder tabblad. */
export function tabVanHref(href: string): string | null {
  return new URLSearchParams(href.split("?")[1] ?? "").get("tab");
}

// --- teksten ----------------------------------------------------------------------------------

/** `title` is de zin op de regel (zoals de schermen die al hadden); `why` de uitleg voor de kaart OnboardingProgress. */
export const AAN_DE_SLAG_STAPPEN: Record<AanDeSlagSleutel, { title: string; why: string }> = {
  "website-paginas": { title: "Vul je pagina's met eigen teksten en foto's", why: "Een website met je eigen verhaal en foto's overtuigt bezoekers; de voorbeeldteksten zijn alleen om mee te beginnen." },
  "website-logo": { title: "Voeg je logo toe", why: "Je logo maakt je website herkenbaar en laat zien dat het van jou is." },
  "website-contact": { title: "Vul je contactgegevens in (naam, e-mail, telefoon)", why: "Zo kunnen bezoekers je bereiken, en staan ze correct op je website." },
  "website-online": { title: "Zet je website online (Publiceren)", why: "Pas als je hem publiceert kunnen bezoekers hem zien en vinden." },
  "website-domein": { title: "Koppel je eigen domeinnaam (mag later)", why: "Zo staat je website op je eigen adres, bijvoorbeeld bakkerjansen.nl." },
  "webshop-product": { title: "Voeg je eerste product toe", why: "Een winkel zonder producten kan niets verkopen. Foto, naam en prijs is genoeg om te beginnen." },
  "webshop-verzending": { title: "Stel verzending en betalen in", why: "Kies hoe klanten bestellen (bezorgen of afhalen) en hoe ze betalen, zodat ze kunnen afrekenen." },
  "webshop-bedrijf": { title: "Vul je bedrijfsgegevens aan (naam, KVK, adres, e-mail)", why: "Die gegevens zijn verplicht in een webshop en staan onder andere op je wettelijke pagina's." },
  "webshop-wettelijk": { title: "Loop de wettelijke pagina's na (verzenden, retourneren, voorwaarden)", why: "Klanten en de wet verwachten duidelijke regels over verzenden, retourneren en voorwaarden." },
  "webshop-online": { title: "Zet je webshop online (Publiceren)", why: "Pas als je hem publiceert kunnen klanten bestellen." },
  "webshop-domein": { title: "Koppel je eigen domeinnaam (mag later)", why: "Zo staat je webshop op je eigen adres." },
  "horeca-menukaart": { title: "Menukaart vullen (de voorbeelden mag je aanpassen of weghalen)", why: "Gasten zien wat er te kiezen is, met prijzen en allergenen. Alle andere onderdelen bouwen hierop." },
  "horeca-gegevens": { title: "Adres, telefoon en openingstijden invullen", why: "Gasten vinden je en weten wanneer je open bent." },
  "horeca-modules": { title: "Modules kiezen die jullie willen gebruiken", why: "Reserveren, bestellen, kassa en takenlijsten zet je aan wanneer jij ze nodig hebt." },
  "horeca-tafels": { title: "Tafels aanmaken en de QR-codes printen", why: "Elke tafel krijgt een eigen QR-code, zodat gasten zelf kunnen bestellen." },
  "horeca-scherm": { title: "Een scherm koppelen (keuken, bar of handheld)", why: "Bestellingen verschijnen direct op het scherm van keuken en bar." },
  "horeca-online": { title: "De site online zetten (bovenaan)", why: "Je website met menukaart en openingstijden is pas zichtbaar als je hem publiceert." },
  "rijschool-pakketten": { title: "Controleer je pakketten en prijzen (het zijn voorbeeldprijzen)", why: "Leerlingen zien wat een pakket of een los uur kost; de voorbeeldprijzen moeten de jouwe worden." },
  "rijschool-werktijden": { title: "Zet de werktijden van je instructeurs goed", why: "Zonder werktijden kun je geen lessen plannen en kunnen leerlingen niet boeken." },
  "rijschool-auto": { title: "Voeg je lesauto toe", why: "Een les hoort bij een auto en een instructeur; zo houdt de agenda rekening met beide." },
  "rijschool-gegevens": { title: "Vul je adres en KVK-nummer in (verplicht op je website)", why: "Die gegevens zijn verplicht op de website van een rijschool." },
  "rijschool-werkgebied": { title: "Vul je werkgebied en teksten in", why: "Zo weten nieuwe leerlingen of je bij hen in de buurt lesgeeft." },
  "rijschool-online": { title: "Zet je website online", why: "Zo kunnen nieuwe leerlingen je vinden en een proefles aanvragen." },
};

const kaart = (title: string): OnboardingProgressTexts => ({
  title,
  sub: (nog, totaal, min) => `Nog ${nog} van ${totaal} stappen, ongeveer ${min} min.`,
  stepOf: (n, totaal) => `Stap ${n} van ${totaal}`,
  minutes: (min) => (min === 0 ? "wij doen dit" : `± ${min} min`),
  optional: "tip",
  start: "Verder",
});

export const AAN_DE_SLAG_KAART: Record<ProductMetLijst, OnboardingProgressTexts> = {
  website: kaart("Aan de slag met je website"),
  webshop: kaart("Aan de slag met je webshop"),
  horeca: kaart("Aan de slag met je horecazaak"),
  rijschool: kaart("Aan de slag met je rijschool"),
};
