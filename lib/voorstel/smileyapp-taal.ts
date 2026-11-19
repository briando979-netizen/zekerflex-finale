import { BASE, euro } from "@/lib/voorstel/smileyapp";
import { BRANCHES } from "@/lib/voorstel/smileyapp-branches";
import { kortPad } from "@/lib/voorstel/subdomein";

// ---------------------------------------------------------------------------
// De talen van het SmileyApp-voorstel (19 nov 2026): Nederlands (de site zoals
// hij was), Engels op /en en Duits op /de. Dit bestand is klein en puur: welke
// taal bij een pad hoort, waar de taalkiezer naartoe linkt, het bedrag in de
// schrijfwijze van een taal, en de teksten van de omlijsting (band, kop, menu,
// footer en chatknop) per vertaling. De omlijsting staat in de layout en kent
// het pad alleen in de browser; daarom laden ook client-onderdelen dit bestand.
// De teksten van de pagina's zelf staan in lib/voorstel/smileyapp-talen.ts, dat
// alleen de pagina's op de server laden.
// ---------------------------------------------------------------------------

export type Taal = "nl" | "en" | "de";
export const TALEN: readonly Taal[] = ["nl", "en", "de"];
/** De talen naast het Nederlands: elk heeft een eigen map onder het voorstel. */
export type Vertaling = Exclude<Taal, "nl">;
export const VERTALINGEN: readonly Vertaling[] = ["en", "de"];

export const isTaal = (t: unknown): t is Taal => typeof t === "string" && (TALEN as readonly string[]).includes(t);

/** De naam van een taal in het Nederlands (voor het beheer: "Taal: Engels"). */
export const TAAL_NAAM: Record<Taal, string> = { nl: "Nederlands", en: "Engels", de: "Duits" };
/** De naam van een taal in die taal zelf (voor de taalkiezer). */
export const TAAL_EIGEN: Record<Taal, string> = { nl: "Nederlands", en: "English", de: "Deutsch" };
/** Het woord "taal" in elke taal: de naam van de taalkiezer voor schermlezers. */
export const TAAL_WOORD: Record<Taal, string> = { nl: "Taal", en: "Language", de: "Sprache" };

/** De taal van een pad: /voorstel/smileyapp/en/demo en (op het subdomein) /en/demo zijn Engels; al het andere is Nederlands. */
export function taalVanPad(pad: string | null | undefined): Taal {
  const kort = kortPad(pad ?? "", BASE);
  for (const t of VERTALINGEN) if (kort === `/${t}` || kort.startsWith(`/${t}/`)) return t;
  return "nl";
}

/** Het basispad van een taal: de Nederlandse voorpagina, of /en en /de daaronder. */
export const taalBasis = (taal: Taal) => (taal === "nl" ? BASE : `${BASE}/${taal}`);

export interface TaalLink {
  taal: Taal;
  href: string;
  actief: boolean;
}

/** De pagina's die in alle drie de talen bestaan (deel 6b), als pad achter het basispad van de taal. */
export const VERTAALDE_PADEN: readonly string[] = ["/demo", "/branches", "/klanten", "/contact", "/partner-worden", "/samenstellen", "/vergelijken"];

/** Bestaat dit pad (zonder de taal ervoor) in alle talen? Dan het pad zelf, anders leeg: de voorpagina. */
function vertaaldPad(rest: string): string {
  if (VERTAALDE_PADEN.includes(rest)) return rest;
  // een branchepagina bestaat in elke taal, maar alleen voor een branche uit de vaste lijst
  const slug = /^\/branches\/([a-z]{1,40})$/.exec(rest)?.[1];
  return slug && Object.hasOwn(BRANCHES, slug) ? rest : "";
}

/**
 * Waar de taalkiezer op dit pad naartoe linkt. Een pagina die in alle drie de talen bestaat (de demo-aanvraag, de
 * branches, de klantverhalen, contact, partner worden, samenstellen en vergelijken) houdt je op dezelfde pagina. Elke
 * andere pagina (de blog) bestaat alleen in het Nederlands: daar leiden EN en DE naar de voorpagina in die taal.
 */
export function taalLinks(pad: string | null | undefined): TaalLink[] {
  const nu = taalVanPad(pad);
  const kort = kortPad(pad ?? "", BASE).replace(/\/+$/, "") || "/";
  const rest = nu === "nl" ? kort : kort.slice(nu.length + 1) || "/";
  const sub = vertaaldPad(rest);
  return TALEN.map((taal) => ({ taal, href: `${taalBasis(taal)}${sub}`, actief: taal === nu }));
}

/** Een bedrag uit de gegevens in de schrijfwijze van de taal. Het getal komt altijd uit het pakket, nooit uit een tekst. */
export function euroTaal(n: number, taal: Taal): string {
  if (taal === "nl") return euro(n);
  const [hele = "0", cent = "00"] = n.toFixed(2).split(".");
  const groepen = (teken: string) => hele.replace(/\B(?=(\d{3})+(?!\d))/g, teken);
  return taal === "en" ? `€${groepen(",")}.${cent}` : `${groepen(".")},${cent} €`;
}

// ---- de omlijsting op /en en /de ---------------------------------------------

export interface KaderTeksten {
  naarInhoud: string;
  /** de vertaalde regel onder de Nederlandse voorstelband; "smileyapp.nl" wordt de link */
  band: string;
  logo: string;
  hoofdmenu: string;
  /** de secties van de vertaalde voorpagina (hoe … vragen) en de vertaalde pagina's (branches … contact) */
  menu: { hoe: string; probeer: string; pakketten: string; klanten: string; vragen: string; branches: string; verhalen: string; samenstellen: string; vergelijken: string; partner: string; contact: string };
  klantlogin: string;
  demoKort: string;
  demo: string;
  menuOpenen: string;
  menuSluiten: string;
  menuNaam: string;
  footer: {
    kvk: string;
    postadres: string;
    kantooradres: string;
    onderdeelVan: string;
    meer: string;
    privacy: string;
    voorwaarden: string;
    officieel: string;
    /** de blog bestaat alleen in het Nederlands, en zo heet de link ook */
    blog: string;
    ontwerp: string;
  };
  chat: { titel: string; begroeting: string; knop: string };
}

export const KADER: Record<Vertaling, KaderTeksten> = {
  en: {
    naarInhoud: "Skip to content",
    band: "Design proposal by ZekerFlex for SmileyApp. The official website is smileyapp.nl.",
    logo: "Smileyapp, to the home page",
    hoofdmenu: "Main menu",
    menu: {
      hoe: "How it works",
      probeer: "Try it yourself",
      pakketten: "Packages",
      klanten: "Customers",
      vragen: "FAQ",
      branches: "Sectors",
      verhalen: "Customer stories",
      samenstellen: "Build your questionnaire",
      vergelijken: "Smileyapp or paper?",
      partner: "Become a partner",
      contact: "Contact",
    },
    klantlogin: "Customer login",
    demoKort: "Demo",
    demo: "Request a demo",
    menuOpenen: "Open menu",
    menuSluiten: "Close menu",
    menuNaam: "Menu",
    footer: {
      kvk: "Chamber of Commerce (KvK) number",
      postadres: "Postal address",
      kantooradres: "Office address",
      onderdeelVan: "Smileyapp is part of",
      meer: "More",
      privacy: "Privacy statement (in Dutch)",
      voorwaarden: "Disclaimer & general terms and conditions (in Dutch)",
      officieel: "The official website: smileyapp.nl",
      blog: "Blog (in Dutch)",
      ontwerp: "Design and technology: ZekerFlex. Texts, images, logo and video from smileyapp.nl, for this proposal only.",
    },
    chat: {
      titel: "Smileyapp AI assistant",
      begroeting:
        "Hi! I am the AI assistant of Smileyapp. I answer your questions with the information on this site: how it works, the packages and the prices. The assistant answers in Dutch for now.",
      knop: "Ask the AI assistant",
    },
  },
  de: {
    naarInhoud: "Zum Inhalt springen",
    band: "Designvorschlag von ZekerFlex für SmileyApp. Die offizielle Website ist smileyapp.nl.",
    logo: "Smileyapp, zur Startseite",
    hoofdmenu: "Hauptmenü",
    menu: {
      hoe: "So funktioniert es",
      probeer: "Selbst ausprobieren",
      pakketten: "Pakete",
      klanten: "Kunden",
      vragen: "Fragen",
      branches: "Branchen",
      verhalen: "Kundenstimmen",
      samenstellen: "Fragebogen zusammenstellen",
      vergelijken: "Smileyapp oder Papier?",
      partner: "Partner werden",
      contact: "Kontakt",
    },
    klantlogin: "Kundenlogin",
    demoKort: "Demo",
    demo: "Demo anfragen",
    menuOpenen: "Menü öffnen",
    menuSluiten: "Menü schließen",
    menuNaam: "Menü",
    footer: {
      kvk: "Handelsregisternummer (KvK)",
      postadres: "Postanschrift",
      kantooradres: "Büroanschrift",
      onderdeelVan: "Smileyapp ist Teil von",
      meer: "Mehr",
      privacy: "Datenschutzerklärung (auf Niederländisch)",
      voorwaarden: "Disclaimer & Allgemeine Geschäftsbedingungen (auf Niederländisch)",
      officieel: "Die offizielle Website: smileyapp.nl",
      blog: "Blog (auf Niederländisch)",
      ontwerp: "Design und Technik: ZekerFlex. Texte, Bilder, Logo und Video von smileyapp.nl, nur für diesen Vorschlag.",
    },
    chat: {
      titel: "KI-Assistent von Smileyapp",
      begroeting:
        "Hallo! Ich bin der KI-Assistent von Smileyapp. Ich beantworte Ihre Fragen mit den Informationen dieser Website: wie es funktioniert, die Pakete und die Preise. Der Assistent antwortet vorerst auf Niederländisch.",
      knop: "KI-Assistenten fragen",
    },
  },
};
