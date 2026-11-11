// ---------------------------------------------------------------------------
// "Aan de slag" per product (masterplan Fase 1, 11 nov): dezelfde kaart als "Maak je bedrijf af" bij
// personeel (components/app/OnboardingProgress.tsx + lib/onboarding/voortgang.ts), nu ook voor website,
// webshop, horeca en rijschool. Dit bestand is puur: de aanroeper levert echte feiten (uit
// lib/werkgever/werkruimte-cijfers.ts en lib/rijschool/kerncijfers.ts), dit bestand rekent en geeft de
// teksten. Een stap telt alleen mee als zijn feit er is: weten we iets niet (undefined), dan verschijnt de
// stap niet in plaats van eeuwig "open" te staan. Alles gewoon Nederlands; geen beloftes buiten de feiten.
// ---------------------------------------------------------------------------
import type { OnboardingProgressTexts } from "@/components/app/OnboardingProgress";
import { horecaTabs } from "@/lib/horeca/tabs";
import type { Stap } from "@/lib/onboarding/voortgang";

export type ProductMetKaart = "website" | "webshop" | "horeca" | "rijschool";

export type AanDeSlagSleutel =
  | "website-ontwerp"
  | "website-online"
  | "website-domein"
  | "website-bezoek"
  | "webshop-ontwerp"
  | "webshop-producten"
  | "webshop-betalen"
  | "webshop-verzending"
  | "webshop-online"
  | "horeca-menukaart"
  | "horeca-tafels"
  | "horeca-modules"
  | "horeca-online"
  | "rijschool-team"
  | "rijschool-pakketten"
  | "rijschool-leerlingen"
  | "rijschool-agenda"
  | "rijschool-online";

type AdsStap = Stap<AanDeSlagSleutel>;

/** Alleen de stappen waarvan het feit bekend is. */
const alsBekend = (feit: unknown, stap: AdsStap): AdsStap[] => (feit === undefined ? [] : [stap]);

// --- website ----------------------------------------------------------------------------------

export interface WebsiteFeiten {
  /** er is een site gemaakt (WebsiteCijfers is niet null) */
  aangemaakt: boolean;
  online: boolean;
  /** een eigen domeinnaam gekoppeld */
  eigenDomein?: boolean | undefined;
  bezoekers7d?: number | undefined;
}

export function websiteStappen(f: WebsiteFeiten): AdsStap[] {
  return [
    { key: "website-ontwerp", done: f.aangemaakt, href: "/studio/website/ontwerpen", minuten: 5 },
    { key: "website-online", done: f.online, href: "/studio/website", minuten: 2 },
    ...alsBekend(f.eigenDomein, { key: "website-domein", done: f.eigenDomein === true, href: "/studio/website/instellingen", minuten: 5, optioneel: true }),
    ...alsBekend(f.bezoekers7d, { key: "website-bezoek", done: (f.bezoekers7d ?? 0) > 0, href: "/studio/website", minuten: 1, optioneel: true }),
  ];
}

// --- webshop ----------------------------------------------------------------------------------

export interface WebshopFeiten {
  aangemaakt: boolean;
  producten: number;
  online: boolean;
  /** betalen is ingesteld (Studio → Webshop → Betalen) */
  betalenKlaar?: boolean | undefined;
  verzendingKlaar?: boolean | undefined;
}

export function webshopStappen(f: WebshopFeiten): AdsStap[] {
  return [
    { key: "webshop-ontwerp", done: f.aangemaakt, href: "/studio/webshop/ontwerpen", minuten: 5 },
    { key: "webshop-producten", done: f.producten > 0, href: "/studio/webshop/producten", minuten: 10 },
    ...alsBekend(f.betalenKlaar, { key: "webshop-betalen", done: f.betalenKlaar === true, href: "/studio/webshop/betalen", minuten: 5 }),
    ...alsBekend(f.verzendingKlaar, { key: "webshop-verzending", done: f.verzendingKlaar === true, href: "/studio/webshop/verzending", minuten: 3 }),
    { key: "webshop-online", done: f.online, href: "/studio/webshop", minuten: 2 },
  ];
}

// --- horeca -----------------------------------------------------------------------------------

export interface HorecaFeiten {
  menuItems: number;
  tafels: number;
  modules: readonly string[];
  online: boolean;
}

export function horecaStappen(f: HorecaFeiten): AdsStap[] {
  const tabs = new Set(horecaTabs(f.modules).map((t) => t.id));
  return [
    { key: "horeca-menukaart", done: f.menuItems > 0, href: "/werkgever/horeca?tab=menukaart", minuten: 10 },
    // tafels en QR bestaan alleen met de module bestellen
    ...(tabs.has("tafels") ? [{ key: "horeca-tafels" as const, done: f.tafels > 0, href: "/werkgever/horeca?tab=tafels", minuten: 5 }] : []),
    { key: "horeca-modules", done: f.modules.length > 0, href: "/werkgever/horeca?tab=modules", minuten: 3, optioneel: true },
    { key: "horeca-online", done: f.online, href: "/werkgever/horeca?tab=gegevens", minuten: 3 },
  ];
}

// --- rijschool --------------------------------------------------------------------------------

export interface RijschoolFeiten {
  leerlingenActief: number;
  lessenKomendeWeek: number;
  online: boolean;
  instructeurs?: number | undefined;
  pakketten?: number | undefined;
}

export function rijschoolStappen(f: RijschoolFeiten): AdsStap[] {
  return [
    ...alsBekend(f.instructeurs, { key: "rijschool-team", done: (f.instructeurs ?? 0) > 0, href: "/werkgever/rijschool?tab=team", minuten: 5 }),
    ...alsBekend(f.pakketten, { key: "rijschool-pakketten", done: (f.pakketten ?? 0) > 0, href: "/werkgever/rijschool?tab=pakketten", minuten: 5 }),
    { key: "rijschool-leerlingen", done: f.leerlingenActief > 0, href: "/werkgever/rijschool?tab=leerlingen", minuten: 3 },
    { key: "rijschool-agenda", done: f.lessenKomendeWeek > 0, href: "/werkgever/rijschool?tab=agenda", minuten: 3 },
    { key: "rijschool-online", done: f.online, href: "/werkgever/rijschool?tab=website", minuten: 3 },
  ];
}

// --- teksten ----------------------------------------------------------------------------------

export const AAN_DE_SLAG_STAPPEN: Record<AanDeSlagSleutel, { title: string; why: string }> = {
  "website-ontwerp": { title: "Kies een ontwerp voor je website", why: "Je begint met een voorbeeld in een stijl die bij je past. Teksten, foto's en kleuren pas je daarna zelf aan." },
  "website-online": { title: "Zet je website online", why: "Pas als je hem publiceert kunnen bezoekers hem zien en vinden." },
  "website-domein": { title: "Koppel je eigen domeinnaam", why: "Zo staat je website op je eigen adres, bijvoorbeeld bakkerjansen.nl." },
  "website-bezoek": { title: "Deel je website", why: "Zet het adres op je social media, je mail en je kaartjes. Zo komen de eerste bezoekers." },
  "webshop-ontwerp": { title: "Kies een ontwerp voor je webshop", why: "Je begint met een complete voorbeeldwinkel in een stijl die bij je past." },
  "webshop-producten": { title: "Zet je eerste producten erin", why: "Een winkel zonder producten kan niets verkopen. Foto, naam en prijs is genoeg om te beginnen." },
  "webshop-betalen": { title: "Stel betalen in", why: "Zo kunnen klanten direct afrekenen en komt het geld bij jou." },
  "webshop-verzending": { title: "Stel verzending in", why: "Kies hoe klanten bestellen: laten bezorgen of ophalen, en wat dat kost." },
  "webshop-online": { title: "Zet je webshop online", why: "Pas als je hem publiceert kunnen klanten bestellen." },
  "horeca-menukaart": { title: "Zet je menukaart erin", why: "Gasten zien wat er te kiezen is, met prijzen en allergenen. Alle andere onderdelen bouwen hierop." },
  "horeca-tafels": { title: "Maak je tafels aan", why: "Elke tafel krijgt een eigen QR-code, zodat gasten zelf kunnen bestellen." },
  "horeca-modules": { title: "Kies je modules", why: "Reserveren, bestellen, kassa en takenlijsten zet je aan wanneer jij ze nodig hebt." },
  "horeca-online": { title: "Zet je zaak online", why: "Je website met menukaart en openingstijden is pas zichtbaar als je hem publiceert." },
  "rijschool-team": { title: "Voeg je instructeurs toe", why: "Zonder instructeurs kun je geen lessen plannen." },
  "rijschool-pakketten": { title: "Maak je lespakketten", why: "Leerlingen zien wat een pakket of een los uur kost." },
  "rijschool-leerlingen": { title: "Voeg je eerste leerling toe", why: "Leerlingen kunnen zich ook zelf aanmelden via je website, met een proefles." },
  "rijschool-agenda": { title: "Plan je eerste les", why: "In de agenda staat wie wanneer rijdt, en leerlingen krijgen een herinnering." },
  "rijschool-online": { title: "Zet je rijschoolwebsite online", why: "Zo kunnen nieuwe leerlingen je vinden en een proefles aanvragen." },
};

const kaart = (title: string): OnboardingProgressTexts => ({
  title,
  sub: (nog, totaal, min) => `Nog ${nog} van ${totaal} stappen, ongeveer ${min} min.`,
  stepOf: (n, totaal) => `Stap ${n} van ${totaal}`,
  minutes: (min) => (min === 0 ? "wij doen dit" : `± ${min} min`),
  optional: "tip",
  start: "Verder",
});

export const AAN_DE_SLAG_KAART: Record<ProductMetKaart, OnboardingProgressTexts> = {
  website: kaart("Aan de slag met je website"),
  webshop: kaart("Aan de slag met je webshop"),
  horeca: kaart("Aan de slag met je horecazaak"),
  rijschool: kaart("Aan de slag met je rijschool"),
};
