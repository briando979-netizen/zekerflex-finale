// ---------------------------------------------------------------------------
// "Apps & spelletjes": de eigen apps van ZekerFlex waar je direct naartoe kunt
// (19 nov 2026, eigenaar: een aparte categorie, los van de voorbeelden op
// /website-maken, met knoppen "Ga naar spelletjes / Talkaro / webshop", vooral
// voor werknemers). Eén lijst voor het hoofdmenu (lib/marketing/site-nav.ts),
// de pagina /apps en de sitemap. Puur bestand, browser-veilig.
// ---------------------------------------------------------------------------

export interface EigenApp {
  sleutel: "spelletjes" | "talkaro" | "flikflak" | "webshop";
  /** de knop: "Ga naar …" */
  knop: string;
  naam: string;
  tekst: string;
  href: string;
  icoon: string;
  /** buiten zekerflex.com (eigen subdomein): opent in een nieuw tabblad */
  extern: boolean;
}

export const APPS: readonly EigenApp[] = [
  {
    sleutel: "spelletjes",
    knop: "Ga naar spelletjes",
    naam: "Spelletjes",
    tekst: "Speel samen een spel met iemand anders — in Talkaro, via de knop 🎮. Gratis, zonder account.",
    href: "https://talkaro.zekerflex.com",
    icoon: "🎮",
    extern: true,
  },
  {
    sleutel: "talkaro",
    knop: "Ga naar Talkaro",
    naam: "Talkaro",
    tekst: "Praat met een willekeurige ander via tekst of video. Met filters, een noodknop en privégesprekken.",
    href: "https://talkaro.zekerflex.com",
    icoon: "💬",
    extern: true,
  },
  {
    sleutel: "flikflak",
    knop: "Ga naar FlikFlak",
    naam: "FlikFlak",
    tekst: "Korte video's: swipen, liken, reageren, chatten, stories en LIVE gaan. Maak een account en plaats je eerste video.",
    href: "https://flikflak.zekerflex.com",
    icoon: "🎬",
    extern: true,
  },
  {
    sleutel: "webshop",
    knop: "Ga naar de webshop",
    naam: "ZekerFlex Shop",
    tekst: "Werkkleding, essentials voor onderweg en cadeaus — in één winkel.",
    href: "/shop",
    icoon: "🛍️",
    extern: false,
  },
] as const;
