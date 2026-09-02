// Map a shift's title / required skill to a visual category (photo + colour).
// Purely presentational; the category is derived, never stored.

export type ShiftCategoryKey =
  | "retail"
  | "horeca"
  | "logistiek"
  | "schoonmaak"
  | "evenement"
  | "zorg"
  | "kantoor"
  | "bouw"
  | "algemeen";

export interface ShiftCategory {
  key: ShiftCategoryKey;
  label: string;
  photo: string; // /public path
  accent: string; // hex, for chips / overlays
}

const CAT: Record<ShiftCategoryKey, Omit<ShiftCategory, "key">> = {
  retail: { label: "Retail", photo: "/shifts/retail.jpg", accent: "#0E5C4A" },
  horeca: { label: "Horeca", photo: "/shifts/horeca.jpg", accent: "#B45309" },
  logistiek: { label: "Logistiek", photo: "/shifts/logistiek.jpg", accent: "#1D4ED8" },
  schoonmaak: { label: "Schoonmaak", photo: "/shifts/schoonmaak.jpg", accent: "#0891B2" },
  evenement: { label: "Evenement", photo: "/shifts/evenement.jpg", accent: "#7C3AED" },
  zorg: { label: "Zorg", photo: "/shifts/zorg.jpg", accent: "#DB2777" },
  kantoor: { label: "Kantoor", photo: "/shifts/kantoor.jpg", accent: "#4A525E" },
  bouw: { label: "Bouw & techniek", photo: "/shifts/bouw.jpg", accent: "#C2410C" },
  algemeen: { label: "Algemeen", photo: "/shifts/algemeen.jpg", accent: "#0E5C4A" },
};

const RULES: [RegExp, ShiftCategoryKey][] = [
  [/vakkenvul|kassa|kassière|winkel|verkoop|filiaal|supermarkt|retail|schap/i, "retail"],
  [/bedien|horeca|barista|barman|kok|keuken|afwas|serveer|restaurant|café|catering|runner/i, "horeca"],
  [/order pick|orderpick|magazijn|heftruck|logistiek|distributie|inpak|sorteer|expeditie|chauffeur|bezorg/i, "logistiek"],
  [/schoonmaak|schoonmaker|glazenwasser|housekeeping|reinig|opruim/i, "schoonmaak"],
  [/event|evenement|festival|beurs|hostess|host|steward|garderobe|ticket|crew/i, "evenement"],
  [/zorg|verpleeg|verzorg|thuiszorg|welzijn|begeleider|assistent.*zorg/i, "zorg"],
  [/administr|receptie|kantoor|data.?entry|callcenter|klantenservice|secretari/i, "kantoor"],
  [/bouw|timmer|schilder|installatie|monteur|elektr|loodgiet|grond|sloop|techniek/i, "bouw"],
];

export function shiftCategory(title: string, skill: string | null): ShiftCategory {
  const hay = `${title} ${skill ?? ""}`;
  for (const [re, key] of RULES) {
    if (re.test(hay)) return { key, ...CAT[key] };
  }
  return { key: "algemeen", ...CAT.algemeen };
}
