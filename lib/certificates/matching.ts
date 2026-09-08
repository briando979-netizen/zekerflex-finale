import { shiftCategory } from "@/lib/shifts/category";
import type { CertType } from "@/lib/certificates/store";

// ---------------------------------------------------------------------------
// Welke certificaten een klus vraagt. Afgeleid van titel + skill (er is geen
// certificaatveld op Shift). Voedt de matching-filter en de sectie "Dit heb je
// nodig voor deze klus".
// ---------------------------------------------------------------------------

export interface CertRequirement {
  type: CertType;
  /** true = verplicht om te mogen reageren; false = sterk aanbevolen */
  required: boolean;
  reason: string;
}

const RULES: { re: RegExp; req: CertRequirement }[] = [
  { re: /reachtruck/i, req: { type: "REACHTRUCK", required: true, reason: "Je bedient een reachtruck." } },
  { re: /heftruck|vorkheftruck/i, req: { type: "HEFTRUCK", required: true, reason: "Je bedient een heftruck." } },
  { re: /bezorg|koerier|chauffeur|rijden|distributie/i, req: { type: "RIJBEWIJS_B", required: true, reason: "Je rijdt tijdens de klus." } },
  { re: /vrachtwagen|bakwagen|\bcode 95\b/i, req: { type: "RIJBEWIJS_C", required: true, reason: "Rijden met een vrachtwagen." } },
  { re: /\bbus\b|touringcar|personenvervoer/i, req: { type: "RIJBEWIJS_D", required: true, reason: "Rijden met een bus." } },
  { re: /barman|barvrouw|bartender|tap|alcohol|slijterij/i, req: { type: "SVH", required: true, reason: "Alcohol schenken vereist Sociale Hygiëne." } },
];

export function certsRequiredForShift(title: string, skill: string | null): CertRequirement[] {
  const hay = `${title} ${skill ?? ""}`;
  const out: CertRequirement[] = [];
  const seen = new Set<CertType>();

  for (const { re, req } of RULES) {
    if (re.test(hay) && !seen.has(req.type)) {
      out.push(req);
      seen.add(req.type);
    }
  }

  // Op basis van het werktype: bouw → VCA verplicht; logistiek/productie → VCA aanbevolen.
  const cat = shiftCategory(title, skill).key;
  if ((cat === "bouw") && !seen.has("VCA_BASIS")) {
    out.push({ type: "VCA_BASIS", required: true, reason: "VCA is vereist op de meeste bouwplaatsen." });
    seen.add("VCA_BASIS");
  } else if (cat === "logistiek" && !seen.has("VCA_BASIS")) {
    out.push({ type: "VCA_BASIS", required: false, reason: "Veel magazijnen vragen een VCA-diploma." });
    seen.add("VCA_BASIS");
  }
  if (cat === "evenement" && !seen.has("BHV")) {
    out.push({ type: "BHV", required: false, reason: "Handig als crewlid bij evenementen." });
  }

  return out;
}
