// Map a shift's title / required skill to a visual category (photo + colour).
// Purely presentational; the category is derived, never stored.

export type ShiftCategoryKey =
  | "retail"
  | "horeca"
  | "logistiek"
  | "productie"
  | "schoonmaak"
  | "evenement"
  | "promotie"
  | "beveiliging"
  | "zorg"
  | "kinderopvang"
  | "kantoor"
  | "bouw"
  | "auto"
  | "agrarisch"
  | "algemeen";

export interface ShiftCategory {
  key: ShiftCategoryKey;
  label: string;
  photo: string; // /public path
  accent: string; // hex, for chips / overlays
}

// Photo sources: public/shifts/CREDITS.md. Accents carry white chip text (dark enough for it) and
// avoid red, which means "problem" in the colour system.
const CAT: Record<ShiftCategoryKey, Omit<ShiftCategory, "key">> = {
  retail: { label: "Retail", photo: "/shifts/retail.jpg", accent: "#0E5C4A" },
  horeca: { label: "Horeca", photo: "/shifts/horeca.jpg", accent: "#B45309" },
  logistiek: { label: "Logistiek", photo: "/shifts/logistiek.jpg", accent: "#1D4ED8" },
  productie: { label: "Productie & industrie", photo: "/shifts/productie.jpg", accent: "#334155" },
  schoonmaak: { label: "Schoonmaak", photo: "/shifts/schoonmaak.jpg", accent: "#0891B2" },
  evenement: { label: "Evenement", photo: "/shifts/evenement.jpg", accent: "#7C3AED" },
  promotie: { label: "Promotie & sales", photo: "/shifts/promotie.jpg", accent: "#A21CAF" },
  beveiliging: { label: "Beveiliging", photo: "/shifts/beveiliging.jpg", accent: "#1E293B" },
  zorg: { label: "Zorg", photo: "/shifts/zorg.jpg", accent: "#DB2777" },
  kinderopvang: { label: "Kinderopvang & onderwijs", photo: "/shifts/kinderopvang.jpg", accent: "#0F766E" },
  kantoor: { label: "Kantoor", photo: "/shifts/kantoor.jpg", accent: "#4A525E" },
  bouw: { label: "Bouw & techniek", photo: "/shifts/bouw.jpg", accent: "#C2410C" },
  auto: { label: "Auto & fiets", photo: "/shifts/auto.jpg", accent: "#3730A3" },
  agrarisch: { label: "Land- & tuinbouw", photo: "/shifts/agrarisch.jpg", accent: "#3F6212" },
  algemeen: { label: "Algemeen", photo: "/shifts/algemeen.jpg", accent: "#0E5C4A" },
};

// First match wins, so the more specific branches come before the broad ones
// ("Evenementenbeveiliger" is beveiliging, not evenement; "Automonteur" is auto, not bouw).
const RULES: [RegExp, ShiftCategoryKey][] = [
  [/promot|sampling|flyer|straatwerv|fondsenwerv|ambassad|demonstrat|proeverij|mystery ?shop/i, "promotie"],
  [/beveilig|security|portier|toegangscontrol|verkeersregel|bewak/i, "beveiliging"],
  [/vakkenvul|kassa|kassière|winkel|verkoop|filiaal|supermarkt|retail|schap|inventaris/i, "retail"],
  [/bedien|horeca|barista|barman|kok|keuken|afwas|serveer|restaurant|café|catering|runner/i, "horeca"],
  [/productie|machine.?operator|procesoperator|lopende band|fabriek|assemblage|lijnwerk|levensmiddel|voedingsmiddel|kwaliteitscontrol|metaalbewerk|lasser|drukkerij/i, "productie"],
  [/order pick|orderpick|magazijn|heftruck|logistiek|distributie|inpak|sorteer|expeditie|chauffeur|bezorg|verhuiz/i, "logistiek"],
  [/schoonmaak|schoonmaker|glazenwasser|housekeeping|reinig|opruim/i, "schoonmaak"],
  [/event|evenement|festival|beurs|hostess|host|steward|garderobe|ticket|crew/i, "evenement"],
  [/kinderopvang|kinderdagverblijf|pedagog|overblijf|\btso\b|\bbso\b|naschool|onderwijs|leerkracht|klassenassist|gastouder|peuter/i, "kinderopvang"],
  [/zorg|verpleeg|verzorg|thuiszorg|welzijn|begeleider|assistent.*zorg/i, "zorg"],
  [/administr|receptie|kantoor|data.?entry|callcenter|klantenservice|secretari/i, "kantoor"],
  [/\bauto|wasstraat|car ?wash|banden|fiets|poetser|\bapk\b/i, "auto"],
  [/bouw|timmer|schilder|installatie|monteur|elektr|loodgiet|grond|sloop|techniek/i, "bouw"],
  [/oogst|pluk|tuinbouw|tuinder|\bkas(sen)?(werk|medewerker)|kwekerij|bollen|bloemen ?(sorte|bind|kwek)|hovenier|groenvoorz|boerderij|veehoud|agrar|teelt/i, "agrarisch"],
];

export function shiftCategory(title: string, skill: string | null): ShiftCategory {
  const hay = `${title} ${skill ?? ""}`;
  for (const [re, key] of RULES) {
    if (re.test(hay)) return { key, ...CAT[key] };
  }
  return { key: "algemeen", ...CAT.algemeen };
}

/** Every category, in display order — for filters that list all branches. */
export const SHIFT_CATEGORIES: ShiftCategory[] = (Object.keys(CAT) as ShiftCategoryKey[]).map((key) => ({ key, ...CAT[key], ...(key === "algemeen" ? { label: "Overig" } : {}) }));
