// ---------------------------------------------------------------------------
// De dashboards van een bedrijf (10 nov 2026, eigenaar: "een aparte aanmelding en een eigen,
// volledig ingericht dashboard voor website, webshop, rijschool en restaurant; haal die opties
// uit de normale werkgever; wie al een account heeft, wisselt van dashboard zonder alles opnieuw
// in te vullen").
//
// Vijf dashboards: personeel (het gewone werkgeversdashboard, alleen personeel inhuren), website
// en webshop (de studio, /studio/<soort>), rijschool (/werkgever/rijschool) en horeca
// (/werkgever/horeca). Een bedrijf heeft er één of meer:
//  - de dashboards die het zelf toevoegde (bij het aanmelden of via "Dashboard toevoegen"),
//    in KV "werkruimte:<tenantId>" (lib/werkgever/werkruimte-server.ts);
//  - plus wat het al gebruikt: een rijschool, een horecazaak, een website, een webshop, klussen.
// Welk dashboard je ziet, kies je per browser (cookie, zie werkruimte-server.ts): wisselen verandert
// niets voor je collega's. De bedrijfsgegevens (naam, KVK, adres) zijn gedeeld; elk dashboard vraagt
// alleen wat het zelf nodig heeft.
// Puur (geen prisma of kv): de layout koppelt de sleutels aan adres, label en icoon.
// ---------------------------------------------------------------------------
import { BANK_AAN } from "@/lib/app-mode";
import { RIJSCHOOL_TABS } from "@/lib/rijschool/tabs";
import { horecaTabs } from "@/lib/horeca/tabs";

export const WERKRUIMTES = ["personeel", "rijschool", "horeca", "website", "webshop"] as const;
export type Werkruimte = (typeof WERKRUIMTES)[number];
export const isWerkruimte = (s: unknown): s is Werkruimte => typeof s === "string" && (WERKRUIMTES as readonly string[]).includes(s);

export const WERKRUIMTE_INFO: Record<Werkruimte, { naam: string; uitleg: string }> = {
  personeel: { naam: "Personeel inhuren", uitleg: "Klussen plaatsen, flexkrachten inplannen, uren goedkeuren en facturen." },
  rijschool: { naam: "Rijschool", uitleg: "Lesagenda, leerlingen en tegoed, instructeurs, je website en je eigen app." },
  horeca: { naam: "Horeca", uitleg: "Reserveringen, menukaart, bestellen met QR, keukenscherm en takenlijsten." },
  website: { naam: "Website", uitleg: "Je website ontwerpen, teksten en foto's aanpassen en online zetten." },
  webshop: { naam: "Webshop", uitleg: "Producten verkopen, bestellingen, verzending en betalen." },
};

/** Waar een dashboard begint. */
export function thuisVan(soort: Werkruimte): string {
  switch (soort) {
    case "rijschool":
      return "/werkgever/rijschool";
    case "horeca":
      return "/werkgever/horeca";
    case "website":
      return "/studio/website";
    case "webshop":
      return "/studio/webshop";
    default:
      return "/werkgever";
  }
}

/** Wat het bedrijf zelf koos. */
export interface WerkruimteKeuze {
  /** het dashboard waarmee het bedrijf standaard opent */
  soort: Werkruimte;
  /** ook personeel inhuren (oude keuze van vóór 10 nov): telt als het dashboard personeel */
  ookPersoneel: boolean;
  /** de dashboards die het bedrijf zelf toevoegde */
  dashboards: Werkruimte[];
  at: string;
}

/** Een bewaarde keuze terug inlezen; alles wat niet klopt telt als "geen keuze". */
export function leesKeuze(json: unknown): WerkruimteKeuze | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (!isWerkruimte(o.soort)) return null;
  const dashboards = Array.isArray(o.dashboards) ? WERKRUIMTES.filter((w) => (o.dashboards as unknown[]).includes(w)) : [];
  return { soort: o.soort, ookPersoneel: o.ookPersoneel === true, dashboards, at: typeof o.at === "string" ? o.at : "" };
}

/** Een dashboard toevoegen aan een (eventueel nog lege) keuze; het nieuwe wordt het standaarddashboard. */
export function voegToe(keuze: WerkruimteKeuze | null, soort: Werkruimte, at: string): WerkruimteKeuze {
  const lijst = new Set<Werkruimte>([...(keuze?.dashboards ?? []), ...(keuze ? [keuze.soort] : []), soort]);
  if (keuze?.ookPersoneel) lijst.add("personeel");
  return { soort, ookPersoneel: lijst.has("personeel"), dashboards: WERKRUIMTES.filter((w) => lijst.has(w)), at };
}

export interface WerkruimteFeiten {
  keuze: WerkruimteKeuze | null;
  heeftRijschool: boolean;
  heeftHoreca: boolean;
  /** een website (SiteDoc soort website) */
  heeftSite: boolean;
  /** een webshop (SiteDoc soort webshop) */
  heeftWebshop?: boolean;
  /** ooit een klus geplaatst */
  heeftKlussen: boolean;
  /** de horeca-module "Personeel via ZekerFlex" staat aan (lib/horeca/modules.ts) */
  personeelModule?: boolean;
}

export interface WerkruimteStand {
  /** het dashboard dat nu open is */
  soort: Werkruimte;
  /** het bedrijf heeft het dashboard personeel (klussen, of zelf toegevoegd) */
  ookPersoneel: boolean;
  /** door het bedrijf gekozen; anders afgeleid */
  gekozen: boolean;
  /** alle dashboards van dit bedrijf, in vaste volgorde */
  dashboards: Werkruimte[];
}

/** De dashboards die een bedrijf heeft: zelf toegevoegd plus wat het al gebruikt. Nooit leeg. */
export function dashboardsVan(f: WerkruimteFeiten): Werkruimte[] {
  const lijst = new Set<Werkruimte>(f.keuze?.dashboards ?? []);
  if (f.keuze) lijst.add(f.keuze.soort);
  // niets wat iemand gebruikt, verdwijnt: wie klussen heeft, houdt het personeelsdashboard
  if (f.keuze?.ookPersoneel || f.heeftKlussen || f.personeelModule) lijst.add("personeel");
  if (f.heeftRijschool) lijst.add("rijschool");
  if (f.heeftHoreca) lijst.add("horeca");
  if (f.heeftSite) lijst.add("website");
  if (f.heeftWebshop) lijst.add("webshop");
  if (lijst.size === 0) lijst.add("personeel");
  return WERKRUIMTES.filter((w) => lijst.has(w));
}

/**
 * Welk dashboard open is. `gewenst` is wat deze browser het laatst koos (cookie); dat telt alleen
 * als het bedrijf dat dashboard heeft. Anders de keuze van het bedrijf, en zonder keuze wat het
 * al gebruikt (een rijschool, een horecazaak, alleen een webshop of website, anders personeel).
 */
export function bepaalWerkruimte(f: WerkruimteFeiten, gewenst?: Werkruimte | null): WerkruimteStand {
  const dashboards = dashboardsVan(f);
  const ookPersoneel = dashboards.includes("personeel");
  if (gewenst && dashboards.includes(gewenst)) return { soort: gewenst, ookPersoneel, gekozen: true, dashboards };
  if (f.keuze) return { soort: f.keuze.soort, ookPersoneel, gekozen: true, dashboards };
  const soort: Werkruimte = f.heeftRijschool
    ? "rijschool"
    : f.heeftHoreca
      ? "horeca"
      : f.heeftWebshop && !f.heeftKlussen
        ? "webshop"
        : f.heeftSite && !f.heeftKlussen
          ? "website"
          : "personeel";
  return { soort, ookPersoneel, gekozen: false, dashboards };
}

// --- het menu ------------------------------------------------------------------

export type MenuSleutel =
  | "start"
  | "rijschool"
  | "horeca"
  | "studio"
  | "winkel"
  | "klussen"
  | "kalender"
  | "planner"
  | "agenda"
  | "bank"
  | "favorieten"
  | "berichten"
  | "mail"
  | "whatsapp"
  | "geblokkeerd"
  | "uren"
  | "inchecken"
  | "facturen"
  | "compliance"
  | "overeenkomsten"
  | "bedrijf"
  | "website"
  | "telefonie"
  | "reviews"
  | "netwerk"
  | "rapportages"
  | "kennisbank"
  | "assistent"
  | "locatie";

export type MenuSectie = "beheer" | "klanten" | "administratie" | "rijschool" | "horeca";

export const SECTIE_NAAM: Record<Exclude<MenuSectie, "beheer">, string> = {
  klanten: "Klanten en contact",
  administratie: "Administratie",
  rijschool: "Je rijschool",
  horeca: "Je zaak",
};

export interface MenuPlek {
  sleutel: MenuSleutel;
  sectie?: MenuSectie;
  /** een tabblad van het rijschool- of horecabeheer: adres <onderdeel>?tab=<id>, met dit label */
  tab?: { id: string; label: string };
}

export interface MenuOpties {
  /** de rijschool is ingericht (anders alleen de ingang om hem in te richten) */
  heeftRijschool: boolean;
  /** de horecazaak is ingericht */
  heeftHoreca: boolean;
  /** de modules die de horecazaak aan heeft (lib/horeca/modules.ts): bepalen de tabbladen */
  horecaModules?: readonly string[];
  /** Android-app: geen ZekerFlex Bank (lib/app-mode.ts) */
  inApp: boolean;
  /** mag de studio openen (HQ_ADMIN of PLATFORM_ADMIN, zoals app/studio/layout.tsx eist) */
  studio: boolean;
}

/** De personeelsfuncties, in de volgorde van het gewone menu. Alleen in het dashboard personeel. */
export const PERSONEEL_SLEUTELS: readonly MenuSleutel[] = ["klussen", "kalender", "planner", "uren", "inchecken", "favorieten", "geblokkeerd", "compliance", "overeenkomsten"];

/** Onderdelen die bij één van de andere dashboards horen en dus niet in het dashboard personeel staan. */
export const PAKKET_SLEUTELS: readonly MenuSleutel[] = ["rijschool", "horeca", "studio", "winkel", "website"];

const plek = (sectie?: MenuSectie) => (sleutel: MenuSleutel): MenuPlek => (sectie ? { sleutel, sectie } : { sleutel });

/** Het menu van het dashboard `soort`. */
export function menuVoor(soort: Werkruimte, o: MenuOpties): MenuPlek[] {
  // ZekerFlex Bank staat uit (lib/app-mode.ts, BANK_AAN)
  const bank: MenuSleutel[] = o.inApp || !BANK_AAN ? [] : ["bank"];
  switch (soort) {
    case "personeel":
      // het gewone werkgeversmenu, zonder de onderdelen van de andere dashboards
      return [
        { sleutel: "start" },
        ...(["klussen", "kalender", "planner", "agenda", ...bank, "favorieten", "berichten", "assistent", "mail", "whatsapp", "geblokkeerd"] as MenuSleutel[]).map(plek()),
        ...(["uren", "inchecken", "facturen", "rapportages", "compliance", "overeenkomsten", "bedrijf", "telefonie", "reviews", "netwerk", "locatie", "kennisbank"] as MenuSleutel[]).map(plek("beheer")),
      ];
    case "rijschool":
      return [
        // nog niet ingericht: één ingang, daar staat de start van de rijschool
        ...(o.heeftRijschool
          ? RIJSCHOOL_TABS.map((tab): MenuPlek => ({ sleutel: "rijschool", tab }))
          : [{ sleutel: "rijschool" as const }]),
        ...(["mail", "whatsapp", "telefonie", "reviews"] as MenuSleutel[]).map(plek("klanten")),
        ...(["facturen", "rapportages", ...bank, "bedrijf", "kennisbank"] as MenuSleutel[]).map(plek("administratie")),
      ];
    case "horeca":
      return [
        ...(o.heeftHoreca
          ? horecaTabs(o.horecaModules ?? []).map((tab): MenuPlek => ({ sleutel: "horeca", tab }))
          : [{ sleutel: "horeca" as const }]),
        ...(["mail", "whatsapp", "telefonie", "reviews", "netwerk", "locatie"] as MenuSleutel[]).map(plek("klanten")),
        ...(["facturen", "rapportages", ...bank, "bedrijf", "kennisbank"] as MenuSleutel[]).map(plek("administratie")),
      ];
    default:
      // website en webshop: de studio is het dashboard; hier wat erbij hoort buiten de studio
      return [
        ...(o.studio ? [{ sleutel: soort === "webshop" ? ("winkel" as const) : ("studio" as const) }] : [{ sleutel: "start" as const }]),
        { sleutel: "website" },
        ...(["mail", "whatsapp", "telefonie", "reviews"] as MenuSleutel[]).map(plek("klanten")),
        ...(["facturen", "rapportages", ...bank, "bedrijf", "kennisbank"] as MenuSleutel[]).map(plek("administratie")),
      ];
  }
}
