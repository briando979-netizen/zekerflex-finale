// ---------------------------------------------------------------------------
// De keuzes in het wensenformulier op /website-maken (19 nov 2026, eigenaar:
// "laat ze alles kiezen en aanvullen en dat krijg ik te zien in de aanvraag;
// ik stuur binnen een dag een voorbeeld in drie versies"). Eén lijst voor het
// formulier (browser) en de controle op de server. Puur bestand: geen prisma,
// geen zod. De twee voorbeelden zijn de sites die we echt hebben gemaakt.
// ---------------------------------------------------------------------------

export const VOORBEELDEN = [
  {
    id: "smileyapp",
    naam: "SmileyApp",
    soort: "Website en app",
    tekst: "Strak en speels, met pakketten, video, een AI-chat die antwoordt en een eigen beheer.",
    foto: "/marketing/voorbeelden/smileyapp.webp",
    href: "https://smileyapp.zekerflex.com",
  },
  {
    id: "schwarzwald",
    naam: "Het Schwarzwald",
    soort: "Website met reserveren",
    tekst: "Vol beleving, met een agenda, online reserveren, accounts en een eigen beheer.",
    foto: "/marketing/voorbeelden/schwarzwald.webp",
    href: "https://schwarzwald.zekerflex.com",
  },
] as const;

export const SOORTEN = ["Website", "Webshop", "Website en app", "Weet ik nog niet"] as const;

export const KLEUREN = [
  { naam: "Groen", hex: "#1E6B4A" },
  { naam: "Blauw", hex: "#1D4ED8" },
  { naam: "Rood", hex: "#C1272D" },
  { naam: "Oranje", hex: "#EA580C" },
  { naam: "Geel", hex: "#FACC15" },
  { naam: "Paars", hex: "#6D28D9" },
  { naam: "Roze", hex: "#DB2777" },
  { naam: "Zwart", hex: "#111827" },
  { naam: "Wit en licht", hex: "#F5F5F4" },
  { naam: "De kleuren van mijn logo", hex: "" },
] as const;

export const STIJLEN = ["Strak en zakelijk", "Speels en kleurrijk", "Warm en persoonlijk", "Luxe en rustig", "Stoer en donker", "Verras me"] as const;

export const VIDEO = ["Ja, met video's", "Nee, zonder video's", "Weet ik nog niet"] as const;

export const LOGO = ["Ik heb een logo", "Ik heb nog geen logo, maak er een", "Alleen mijn bedrijfsnaam als tekst"] as const;

export const PAGINAS = ["Home", "Over ons", "Diensten of producten", "Prijzen", "Contact", "Blog of nieuws", "Veelgestelde vragen", "Vacatures", "Foto's of portfolio", "Klantverhalen"] as const;

export const FUNCTIES = [
  "Contactformulier",
  "Online reserveren of afspraken",
  "AI-chat die vragen beantwoordt",
  "Dashboard met inloggen (eigen beheer)",
  "Inloggen voor klanten",
  "Webshop met betalen",
  "Offerte of demo aanvragen",
  "Meerdere talen",
  "Nieuwsbrief",
  "Reviews van klanten",
  "Installeerbaar als app op de telefoon",
] as const;

export const BUDGET = ["Tot € 500", "€ 500 tot € 1.000", "€ 1.000 tot € 2.500", "€ 2.500 tot € 5.000", "Meer dan € 5.000", "Per maand betalen", "Weet ik nog niet"] as const;

export const WANNEER = ["Zo snel mogelijk", "Binnen een maand", "Binnen drie maanden", "Geen haast"] as const;

export interface WebsiteAanvraag {
  bedrijf: string;
  naam: string;
  email: string;
  telefoon?: string | undefined;
  huidigeSite?: string | undefined;
  branche?: string | undefined;
  soort: string;
  kleuren: string[];
  eigenKleur?: string | undefined;
  stijl?: string | undefined;
  video?: string | undefined;
  logo?: string | undefined;
  paginas: string[];
  functies: string[];
  budget?: string | undefined;
  wanneer?: string | undefined;
  voorbeeld?: string | undefined;
  wensen?: string | undefined;
}

/** De aanvraag als leesbare tekst, voor de notitie bij de lead en de mail aan de eigenaar. */
export function aanvraagTekst(a: WebsiteAanvraag): string {
  const regel = (label: string, waarde: string | undefined) => (waarde && waarde.trim() ? `${label}: ${waarde.trim()}` : null);
  const lijst = (label: string, waarden: string[]) => (waarden.length ? `${label}: ${waarden.join(", ")}` : null);
  return [
    regel("Soort", a.soort),
    regel("Branche", a.branche),
    regel("Huidige website", a.huidigeSite),
    lijst("Kleuren", a.kleuren),
    regel("Eigen kleur", a.eigenKleur),
    regel("Stijl", a.stijl),
    regel("Video", a.video),
    regel("Logo", a.logo),
    lijst("Pagina's", a.paginas),
    lijst("Functies", a.functies),
    regel("Budget", a.budget),
    regel("Wanneer", a.wanneer),
    regel("Lijkt het meest op", a.voorbeeld),
    regel("Eigen wensen", a.wensen),
  ]
    .filter((r): r is string => r !== null)
    .join("\n");
}
