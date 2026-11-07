import { ADMIN_HUBS } from "@/lib/admin/nav";
import { BANK_AAN } from "@/lib/app-mode";

// ---------------------------------------------------------------------------
// ZekerFlex OS — de appcatalogus. Elk scherm van het platform is hier één app:
// de werker-app, het werkgever-portaal, de beheeromgeving, de winkel en de
// losse gereedschappen. Puur en browser-veilig (alleen data), zodat het
// bureaublad, het startmenu en het zoeken dezelfde lijst gebruiken.
//
// De beheer-apps komen uit ADMIN_HUBS (lib/admin/nav.ts): dat register is al
// de bron voor het beheermenu en wordt door tests bewaakt, dus een nieuwe
// beheerpagina staat vanzelf ook in het OS.
// ---------------------------------------------------------------------------

export const OS_ROLLEN = ["werker", "werkgever", "verkoper", "admin"] as const;
export type OsRol = (typeof OS_ROLLEN)[number];

/** De iconen die het OS tekent (components/os/Iconen.tsx). */
export type OsIcoon =
  | "werk"
  | "agenda"
  | "uren"
  | "geld"
  | "bank"
  | "chat"
  | "mail"
  | "telefoon"
  | "mensen"
  | "bedrijf"
  | "website"
  | "winkel"
  | "kaart"
  | "kennis"
  | "rekenen"
  | "ai"
  | "video"
  | "groei"
  | "schild"
  | "instellingen"
  | "ster"
  | "doos";

/** Eén kleur = één betekenis (AGENTS.md): groen doen, blauw gepland, goud geld, violet vertrouwen, leisteen neutraal. */
export type OsTint = "groen" | "blauw" | "goud" | "violet" | "leisteen";

export interface OsCategorie {
  id: string;
  naam: string;
  tint: OsTint;
}

export const OS_CATEGORIEEN: OsCategorie[] = [
  { id: "werk", naam: "Werk", tint: "groen" },
  { id: "planning", naam: "Planning", tint: "blauw" },
  { id: "geld", naam: "Geld", tint: "goud" },
  { id: "communicatie", naam: "Communicatie", tint: "blauw" },
  { id: "bedrijf", naam: "Mijn bedrijf", tint: "violet" },
  { id: "online", naam: "Online & verkoop", tint: "groen" },
  { id: "branche", naam: "Branchesoftware", tint: "violet" },
  { id: "groei", naam: "Groei", tint: "groen" },
  { id: "ai", naam: "AI & automatisering", tint: "violet" },
  { id: "gereedschap", naam: "Gereedschap", tint: "leisteen" },
  { id: "beheer", naam: "Beheer", tint: "leisteen" },
  { id: "account", naam: "Account", tint: "leisteen" },
];

export interface OsApp {
  /** uniek; ook de sleutel van een venster en van een vastgezette app */
  id: string;
  naam: string;
  /** één regel uitleg, in gewoon Nederlands */
  uitleg: string;
  href: string;
  icoon: OsIcoon;
  categorie: string;
  /** eigen kleur; standaard die van de categorie */
  tint?: OsTint;
  rollen: OsRol[];
  /** extra woorden waarop je de app kunt vinden */
  zoek?: string[];
  /** opent in een groot venster (kaart, ontwerper, video) */
  groot?: boolean;
  /** opent in een nieuw tabblad in plaats van een venster (zware of losse omgeving) */
  nieuwTabblad?: boolean;
}

const WERKER: OsRol[] = ["werker"];
const WERKGEVER: OsRol[] = ["werkgever"];
const VERKOPER: OsRol[] = ["verkoper"];
const IEDEREEN: OsRol[] = ["werker", "werkgever", "verkoper", "admin"];
const ZAKELIJK: OsRol[] = ["werkgever", "admin"];

/** De apps van de werker-app (/dashboard). */
const WERKER_APPS: OsApp[] = [
  { id: "w-start", naam: "Startscherm", uitleg: "Je dag in één oogopslag.", href: "/dashboard", icoon: "werk", categorie: "werk", rollen: WERKER, zoek: ["overzicht", "home"] },
  { id: "w-klussen", naam: "Klussen zoeken", uitleg: "Diensten bij jou in de buurt die bij je vak passen.", href: "/dashboard/klussen", icoon: "werk", categorie: "werk", rollen: WERKER, zoek: ["ontdekken", "vacatures", "werk", "markt"] },
  { id: "w-diensten", naam: "Mijn klussen", uitleg: "Wat je hebt aangenomen, van vandaag tot volgende maand.", href: "/dashboard/diensten", icoon: "agenda", categorie: "werk", rollen: WERKER, zoek: ["geaccepteerd", "planning"] },
  { id: "w-uren", naam: "Uren", uitleg: "Uren indienen en volgen tot ze zijn goedgekeurd.", href: "/dashboard/uren", icoon: "uren", categorie: "werk", rollen: WERKER },
  { id: "w-inchecken", naam: "Inchecken", uitleg: "Op locatie in- en uitchecken met je telefoon.", href: "/dashboard/incheck", icoon: "werk", categorie: "werk", rollen: WERKER, zoek: ["gps", "checkin"] },
  { id: "w-beschikbaarheid", naam: "Beschikbaarheid", uitleg: "Wanneer je kunt werken, per dag en dagdeel.", href: "/dashboard/beschikbaarheid", icoon: "agenda", categorie: "planning", rollen: WERKER },
  { id: "w-agenda", naam: "Agenda-koppeling", uitleg: "Je diensten in je eigen agenda-app.", href: "/dashboard/agenda-koppeling", icoon: "agenda", categorie: "planning", rollen: WERKER, zoek: ["ical", "google agenda"] },
  { id: "w-favorieten", naam: "Favoriete opdrachtgevers", uitleg: "Volg bedrijven en hoor het als ze werk plaatsen.", href: "/dashboard/favorieten", icoon: "ster", categorie: "werk", rollen: WERKER },
  { id: "w-uitbetalingen", naam: "Uitbetalingen", uitleg: "Wat je krijgt, wanneer, en hoe snel je het wilt.", href: "/dashboard/uitbetalingen", icoon: "geld", categorie: "geld", rollen: WERKER, zoek: ["geld", "betaling"] },
  { id: "w-verloning", naam: "Verloning", uitleg: "Je loonstroken als uitzendkracht.", href: "/dashboard/verloning", icoon: "geld", categorie: "geld", rollen: WERKER, zoek: ["loonstrook", "salaris"] },
  { id: "w-bank", naam: "ZekerFlex Bank", uitleg: "Je saldo, pasjes en overboekingen.", href: "/dashboard/bank", icoon: "bank", categorie: "geld", rollen: WERKER },
  { id: "w-fiscaal", naam: "Belasting", uitleg: "Btw, aftrekposten en je jaaroverzicht.", href: "/dashboard/fiscaal", icoon: "geld", categorie: "geld", rollen: WERKER, zoek: ["btw", "belastingdienst"] },
  { id: "w-administratie", naam: "Administratie", uitleg: "Urencriterium, KOR en je verplichtingen op een rij.", href: "/dashboard/administratie", icoon: "doos", categorie: "geld", rollen: WERKER },
  { id: "w-ritten", naam: "Kilometers", uitleg: "Ritten bijhouden voor je aangifte.", href: "/dashboard/ritten", icoon: "kaart", categorie: "geld", rollen: WERKER, zoek: ["km", "reiskosten"] },
  { id: "w-berichten", naam: "Berichten", uitleg: "Chatten en bellen met opdrachtgevers.", href: "/dashboard/berichten", icoon: "chat", categorie: "communicatie", rollen: WERKER, zoek: ["chat", "inbox"] },
  { id: "w-telefonie", naam: "Telefonie", uitleg: "Je zakelijke nummer en gesprekken.", href: "/dashboard/telefonie", icoon: "telefoon", categorie: "communicatie", rollen: WERKER },
  { id: "w-profiel", naam: "Mijn profiel", uitleg: "Wat opdrachtgevers van je zien.", href: "/dashboard/profiel", icoon: "mensen", categorie: "account", rollen: WERKER },
  { id: "w-paspoort", naam: "Werkpaspoort", uitleg: "Je bewezen werkverleden, met QR-code.", href: "/dashboard/paspoort", icoon: "schild", categorie: "account", rollen: WERKER },
  { id: "w-certificaten", naam: "Certificaten", uitleg: "VCA, BHV, heftruck — bewijs van wat je kunt.", href: "/dashboard/certificaten", icoon: "schild", categorie: "account", rollen: WERKER, zoek: ["vca", "bhv", "diploma"] },
  { id: "w-verificatie", naam: "Verificatie", uitleg: "Je identiteit en KVK controleren.", href: "/dashboard/verificatie", icoon: "schild", categorie: "account", rollen: WERKER, zoek: ["kyc", "id"] },
  { id: "w-verzekering", naam: "Verzekering", uitleg: "Je dekking tijdens een klus.", href: "/dashboard/verzekering", icoon: "schild", categorie: "account", rollen: WERKER },
  { id: "w-beoordelingen", naam: "Beoordelingen", uitleg: "Wat opdrachtgevers over je werk zeggen.", href: "/dashboard/beoordelingen", icoon: "ster", categorie: "account", rollen: WERKER, zoek: ["reviews", "sterren"] },
  { id: "w-vooruitblik", naam: "Vooruitblik", uitleg: "Wat je deze maand ongeveer gaat verdienen.", href: "/dashboard/vooruitblik", icoon: "groei", categorie: "geld", rollen: WERKER },
  { id: "w-assistent", naam: "Assistent", uitleg: "Vraag het de AI-assistent, in je eigen taal.", href: "/dashboard/assistent", icoon: "ai", categorie: "ai", rollen: WERKER },
  { id: "w-wifi", naam: "Wifi op het werk", uitleg: "Verbinden met het netwerk van de locatie.", href: "/dashboard/wifi", icoon: "instellingen", categorie: "werk", rollen: WERKER, zoek: ["netwerk", "internet"] },
  { id: "w-portofoon", naam: "Portofoon", uitleg: "Praten met je ploeg op locatie.", href: "/dashboard/portofoon", icoon: "telefoon", categorie: "communicatie", rollen: WERKER, zoek: ["walkie", "ploeg"] },
  { id: "w-toegangscodes", naam: "Toegangscodes", uitleg: "Codes en sleutels voor de locatie waar je werkt.", href: "/dashboard/toegangscodes", icoon: "schild", categorie: "werk", rollen: WERKER, zoek: ["sleutel", "deur", "kluis"] },
  { id: "w-voertuig", naam: "Voertuig", uitleg: "De auto of bus die bij je dienst hoort.", href: "/dashboard/voertuig", icoon: "kaart", categorie: "werk", rollen: WERKER, zoek: ["auto", "bus", "kenteken"] },
  { id: "w-account", naam: "Accountinstellingen", uitleg: "Inloggen, taal, meldingen en privacy.", href: "/dashboard/account", icoon: "instellingen", categorie: "account", rollen: WERKER },
];

/** De apps van het werkgever-portaal (/werkgever). */
const WERKGEVER_APPS: OsApp[] = [
  { id: "b-start", naam: "Startscherm", uitleg: "Je dag in één oogopslag.", href: "/werkgever", icoon: "bedrijf", categorie: "bedrijf", rollen: WERKGEVER, zoek: ["dashboard", "overzicht"] },
  { id: "b-diensten", naam: "Klussen plaatsen", uitleg: "Een dienst uitzetten en reacties bekijken.", href: "/werkgever/diensten", icoon: "werk", categorie: "werk", rollen: WERKGEVER, zoek: ["vacature", "dienst", "inhuren"] },
  { id: "b-kalender", naam: "Kalender", uitleg: "Wie wanneer werkt, per vestiging.", href: "/werkgever/kalender", icoon: "agenda", categorie: "planning", rollen: WERKGEVER, zoek: ["rooster"] },
  { id: "b-planner", naam: "Planner", uitleg: "Diensten slim inplannen en verdelen.", href: "/werkgever/planner", icoon: "agenda", categorie: "planning", rollen: WERKGEVER, zoek: ["rooster", "planning"] },
  { id: "b-agenda", naam: "Agenda", uitleg: "Afspraken en koppeling met je eigen agenda.", href: "/werkgever/agenda", icoon: "agenda", categorie: "planning", rollen: WERKGEVER },
  { id: "b-uren", naam: "Uren goedkeuren", uitleg: "Ingediende uren nakijken en akkoord geven.", href: "/werkgever/uren", icoon: "uren", categorie: "werk", rollen: WERKGEVER },
  { id: "b-team", naam: "Team", uitleg: "Collega's en managers met hun rechten.", href: "/werkgever/team", icoon: "mensen", categorie: "bedrijf", rollen: WERKGEVER, zoek: ["collega", "gebruikers"] },
  { id: "b-locaties", naam: "Vestigingen", uitleg: "Je locaties met adres en geofence.", href: "/werkgever/locaties", icoon: "kaart", categorie: "bedrijf", rollen: WERKGEVER, zoek: ["vestiging", "adres"] },
  { id: "b-favorieten", naam: "Favorieten", uitleg: "Je vaste krachten, als eerste gevraagd.", href: "/werkgever/favorieten", icoon: "ster", categorie: "werk", rollen: WERKGEVER, zoek: ["vaste ploeg"] },
  { id: "b-geblokkeerd", naam: "Geblokkeerd", uitleg: "Wie je liever niet meer inplant.", href: "/werkgever/geblokkeerd", icoon: "schild", categorie: "werk", rollen: WERKGEVER },
  { id: "b-facturen", naam: "Facturen", uitleg: "Alle facturen en wat er nog openstaat.", href: "/werkgever/facturen", icoon: "geld", categorie: "geld", rollen: WERKGEVER, zoek: ["rekening", "betalen"] },
  { id: "b-bank", naam: "ZekerFlex Bank", uitleg: "Saldo, opwaarderen en betalen.", href: "/werkgever/bank", icoon: "bank", categorie: "geld", rollen: WERKGEVER },
  { id: "b-berichten", naam: "Berichten", uitleg: "Chatten en bellen met je krachten.", href: "/werkgever/berichten", icoon: "chat", categorie: "communicatie", rollen: WERKGEVER, zoek: ["chat", "inbox"] },
  { id: "b-mail", naam: "Zakelijke e-mail", uitleg: "Je postbus op je eigen domein.", href: "/werkgever/mail", icoon: "mail", categorie: "communicatie", rollen: WERKGEVER },
  { id: "b-whatsapp", naam: "WhatsApp", uitleg: "WhatsApp-gesprekken bij je bedrijf.", href: "/werkgever/whatsapp", icoon: "chat", categorie: "communicatie", rollen: WERKGEVER },
  { id: "b-telefonie", naam: "Telefonie", uitleg: "Zakelijke nummers, bundels en gesprekken.", href: "/werkgever/telefonie", icoon: "telefoon", categorie: "communicatie", rollen: WERKGEVER },
  { id: "b-website", naam: "Website", uitleg: "Je eigen site bouwen en beheren.", href: "/werkgever/website", icoon: "website", categorie: "online", rollen: WERKGEVER, zoek: ["site", "domein"] },
  { id: "b-reviews", naam: "Google-reviews", uitleg: "Meer echte reviews verzamelen.", href: "/werkgever/google-reviews", icoon: "ster", categorie: "groei", rollen: WERKGEVER, zoek: ["beoordelingen", "google"] },
  { id: "b-horeca", naam: "Horecasoftware", uitleg: "Reserveren, menukaart, kassa en keukenscherm.", href: "/werkgever/horeca", icoon: "doos", categorie: "branche", rollen: WERKGEVER, zoek: ["restaurant", "kassa", "menu"] },
  { id: "b-rijschool", naam: "Rijschoolsoftware", uitleg: "Lessen, leerlingen en instructeurs.", href: "/werkgever/rijschool", icoon: "doos", categorie: "branche", rollen: WERKGEVER, zoek: ["rijles", "leerling"] },
  { id: "b-compliance", naam: "Wet DBA", uitleg: "Risicosignalen per samenwerking.", href: "/werkgever/compliance", icoon: "schild", categorie: "bedrijf", rollen: WERKGEVER, zoek: ["dba", "schijnzelfstandigheid"] },
  { id: "b-overeenkomsten", naam: "Overeenkomsten", uitleg: "Afspraken per kracht, vastgelegd.", href: "/werkgever/overeenkomsten", icoon: "doos", categorie: "bedrijf", rollen: WERKGEVER, zoek: ["contract", "modelovereenkomst"] },
  { id: "b-templates", naam: "Sjablonen", uitleg: "Diensten die je vaker plaatst, kant-en-klaar.", href: "/werkgever/templates", icoon: "doos", categorie: "werk", rollen: WERKGEVER },
  { id: "b-assistent", naam: "Assistent", uitleg: "De AI die meedenkt met je planning.", href: "/werkgever/assistent", icoon: "ai", categorie: "ai", rollen: WERKGEVER },
  { id: "b-integraties", naam: "Koppelingen", uitleg: "ZekerFlex verbinden met je eigen systemen.", href: "/werkgever/integraties", icoon: "instellingen", categorie: "bedrijf", rollen: WERKGEVER, zoek: ["api", "koppeling"] },
  { id: "b-bedrijf", naam: "Bedrijfsgegevens", uitleg: "KVK, btw, adres en logo.", href: "/werkgever/bedrijf", icoon: "bedrijf", categorie: "bedrijf", rollen: WERKGEVER },
  { id: "b-instellingen", naam: "Instellingen", uitleg: "Hoe je werkruimte werkt.", href: "/werkgever/instellingen", icoon: "instellingen", categorie: "account", rollen: WERKGEVER },
  { id: "b-netwerk", naam: "Verbinding", uitleg: "Wifi op de werkvloer, veilige werkplek en 5G.", href: "/werkgever/netwerk", icoon: "instellingen", categorie: "bedrijf", rollen: WERKGEVER, zoek: ["wifi", "vpn", "internet", "5g"] },
  { id: "b-op-locatie", naam: "Op locatie", uitleg: "Portofoon, toegang, sleutelkluis en badges.", href: "/werkgever/op-locatie", icoon: "schild", categorie: "bedrijf", rollen: WERKGEVER, zoek: ["portofoon", "sleutel", "badge", "kenteken"] },
  { id: "b-rapportages", naam: "Rapportages", uitleg: "Cijfers en grafieken over je bedrijf.", href: "/werkgever/rapportages", icoon: "groei", categorie: "bedrijf", rollen: WERKGEVER, zoek: ["bi", "cijfers", "dashboard"] },
  { id: "b-beoordelingen", naam: "Beoordelingen", uitleg: "Wat jij van je krachten vond, en zij van jou.", href: "/werkgever/reviews", icoon: "ster", categorie: "werk", rollen: WERKGEVER },
  { id: "b-account", naam: "Mijn account", uitleg: "Inloggen, meldingen en privacy.", href: "/werkgever/account", icoon: "mensen", categorie: "account", rollen: WERKGEVER },
];

/** De apps van de buitendienst (/sales) — voor wie de rol SALES heeft. */
const VERKOPER_APPS: OsApp[] = [
  { id: "v-sales", naam: "Buitendienst", uitleg: "Bedrijfsbezoeken vastleggen en leads binnenhalen.", href: "/sales", icoon: "groei", categorie: "groei", rollen: VERKOPER, zoek: ["bezoek", "lead", "acquisitie"] },
  { id: "v-websitevoorstellen", naam: "Websitevoorstellen", uitleg: "Een voorstel op maat maken en volgen.", href: "/sales/websitevoorstellen", icoon: "website", categorie: "groei", rollen: VERKOPER, zoek: ["offerte", "voorstel"] },
];

/** Apps die iedereen heeft: de winkel, de kaart en de gereedschappen. */
const GEDEELDE_APPS: OsApp[] = [
  { id: "g-shop", naam: "Winkel", uitleg: "Werkkleding, PBM en cadeaus.", href: "/shop", icoon: "winkel", categorie: "online", rollen: IEDEREEN, zoek: ["webshop", "kleding", "bestellen"] },
  { id: "g-kaart", naam: "Kaart", uitleg: "Nederland in kaart, met open diensten.", href: "/kaart", icoon: "kaart", categorie: "gereedschap", rollen: IEDEREEN, groot: true, zoek: ["gps", "navigatie"] },
  { id: "g-open-diensten", naam: "Open diensten", uitleg: "Alle beschikbare klussen op de kaart.", href: "/open-diensten", icoon: "werk", categorie: "werk", rollen: IEDEREEN },
  { id: "g-rekentools", naam: "Rekentools", uitleg: "Uurtarief, kosten en de Wet DBA-check.", href: "/rekentools", icoon: "rekenen", categorie: "gereedschap", rollen: IEDEREEN, zoek: ["calculator", "tarief"] },
  { id: "g-kennis", naam: "Kennisbank", uitleg: "Uitleg over regels, geld en werken.", href: "/kennis", icoon: "kennis", categorie: "gereedschap", rollen: IEDEREEN, zoek: ["help", "uitleg", "faq"] },
  { id: "g-aanbod", naam: "Het aanbod", uitleg: "Alles wat ZekerFlex voor je kan doen.", href: "/aanbod", icoon: "doos", categorie: "gereedschap", rollen: IEDEREEN },
  { id: "g-studio", naam: "Websitestudio", uitleg: "Je webwinkel en site beheren.", href: "/studio", icoon: "website", categorie: "online", rollen: ZAKELIJK, groot: true, zoek: ["producten", "bestellingen"] },
  { id: "g-site", naam: "De website", uitleg: "Open zekerflex.com zoals bezoekers hem zien.", href: "/", icoon: "website", categorie: "gereedschap", rollen: IEDEREEN, nieuwTabblad: true, zoek: ["homepage", "openbaar"] },
];

/** Beheer-apps: rechtstreeks uit het beheermenu, zodat een nieuwe beheerpagina vanzelf meekomt. */
function adminApps(): OsApp[] {
  // per onderdeel een eigen icoon en kleur, zodat je ze op het bureaublad uit elkaar houdt
  const stijl: Record<string, { icoon: OsIcoon; tint: OsTint }> = {
    overzicht: { icoon: "bedrijf", tint: "leisteen" },
    mensen: { icoon: "mensen", tint: "violet" },
    geld: { icoon: "geld", tint: "goud" },
    groei: { icoon: "groei", tint: "groen" },
    communicatie: { icoon: "chat", tint: "blauw" },
    shop: { icoon: "winkel", tint: "groen" },
    ai: { icoon: "ai", tint: "violet" },
    systeem: { icoon: "schild", tint: "blauw" },
  };
  return ADMIN_HUBS.flatMap((hub) => {
    const s = stijl[hub.id] ?? { icoon: "instellingen" as OsIcoon, tint: "leisteen" as OsTint };
    return hub.pages.map((p) => ({
      id: `a-${p.href.replace(/^\/admin\/?/, "") || "start"}`.replace(/\//g, "-"),
      naam: p.label,
      uitleg: hub.label,
      href: p.href,
      icoon: s.icoon,
      tint: s.tint,
      categorie: "beheer",
      rollen: ["admin"] as OsRol[],
      zoek: [hub.label, hub.blurb],
      groot: p.href === "/admin/ontwerper" || p.href === "/admin/video" || p.href === "/admin/kantoor" || p.href === "/admin/jarvis",
    }));
  });
}

/** De kleur van een app: zijn eigen tint, anders die van de categorie. */
export function tintVanApp(app: OsApp): OsTint {
  return app.tint ?? OS_CATEGORIEEN.find((c) => c.id === app.categorie)?.tint ?? "leisteen";
}

/** Alle apps van het OS, in vaste volgorde. */
export function alleApps(): OsApp[] {
  // ZekerFlex Bank staat uit (lib/app-mode.ts, BANK_AAN): de bank-apps van werker en werkgever niet tonen
  return [...WERKER_APPS, ...WERKGEVER_APPS, ...VERKOPER_APPS, ...GEDEELDE_APPS, ...adminApps()].filter((a) => BANK_AAN || (a.id !== "w-bank" && a.id !== "b-bank"));
}

/** De apps die iemand met deze rol mag zien. Een beheerder ziet ook de werkgever- en werker-apps niet: die horen bij een eigen account. */
export function appsVoor(rol: OsRol): OsApp[] {
  return alleApps().filter((a) => a.rollen.includes(rol));
}

/** Zoeken op naam, uitleg en zoekwoorden; de beste treffer eerst. */
export function zoekApps(apps: OsApp[], term: string): OsApp[] {
  const q = term.trim().toLowerCase();
  if (!q) return [];
  const score = (a: OsApp): number => {
    const naam = a.naam.toLowerCase();
    if (naam === q) return 0;
    if (naam.startsWith(q)) return 1;
    if (naam.includes(q)) return 2;
    if ((a.zoek ?? []).some((z) => z.toLowerCase().includes(q))) return 3;
    if (a.uitleg.toLowerCase().includes(q)) return 4;
    return 99;
  };
  return apps
    .map((a) => ({ a, s: score(a) }))
    .filter((x) => x.s < 99)
    .sort((x, y) => x.s - y.s || x.a.naam.localeCompare(y.a.naam, "nl"))
    .map((x) => x.a);
}

/** De apps per categorie, in de volgorde van OS_CATEGORIEEN; lege categorieën vallen weg. */
export function perCategorie(apps: OsApp[]): { categorie: OsCategorie; apps: OsApp[] }[] {
  return OS_CATEGORIEEN.map((categorie) => ({ categorie, apps: apps.filter((a) => a.categorie === categorie.id) })).filter((g) => g.apps.length > 0);
}

/**
 * Eén cijfer in de strook "Vandaag" op het bureaublad. Het type staat hier,
 * in het pure bestand, zodat het bureaublad (een client-component) het kan
 * gebruiken zonder de databasecode van lib/os/vandaag.ts mee te nemen.
 */
export interface OsKaart {
  label: string;
  waarde: string;
  /** app-id uit deze catalogus; een klik opent dat venster */
  app?: string;
  tint: OsTint;
  /** vraagt om actie van deze persoon */
  actie?: boolean;
}

/** Wat standaard op het bureaublad staat als iemand nog niets heeft vastgezet. */
export const STANDAARD_VASTGEZET: Record<OsRol, string[]> = {
  werker: ["w-klussen", "w-diensten", "w-uren", "w-berichten", "w-uitbetalingen", "g-shop"],
  werkgever: ["b-start", "b-diensten", "b-uren", "b-kalender", "b-berichten", "b-facturen"],
  verkoper: ["v-sales", "v-websitevoorstellen", "g-kaart", "g-kennis", "g-aanbod"],
  admin: ["a-start", "a-te-doen", "a-cockpit", "a-gebruikers", "a-financien", "a-sales"],
};
