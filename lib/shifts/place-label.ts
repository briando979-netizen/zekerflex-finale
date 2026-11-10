/**
 * Tidy a location label for display: the geocoder returns e.g. "Utrecht,
 * Utrecht, Utrecht" (place, municipality, province) for a city-only search.
 * Drops repeated parts, keeping the order.
 */
export function dedupePlaceParts(label: string): string {
  const seen = new Set<string>();
  return label
    .split(",")
    .map((p) => p.trim())
    .filter((p) => {
      const k = p.toLowerCase();
      if (!p || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .join(", ");
}

/** "Eenmalige locatie — Utrecht, Utrecht, Utrecht" → "Eenmalige locatie — Utrecht". */
export function cleanBranchLabel(name: string): string {
  const m = /^(.*?—\s*)(.+)$/.exec(name);
  return m ? `${m[1]}${dedupePlaceParts(m[2]!)}` : dedupePlaceParts(name);
}

/** Een klus op een los adres heet "Eenmalige locatie — <adres>" (lib/shifts/create.ts). */
export const isEenmaligeLocatie = (branchName: string): boolean => /^Eenmalige locatie\b/.test(branchName.trim());

/**
 * Hoe een werker de plek van een klus ziet in een melding ("… bij X"): bij een los adres de naam
 * van het bedrijf in plaats van "Eenmalige locatie — adres" (10 nov, eigenaar), anders de vestiging
 * zoals altijd (een keten met filialen houdt "Albert Heijn Centrum").
 */
export function plekVoorWerker(branchName: string, bedrijf: string | null | undefined): string {
  const naam = bedrijf?.trim();
  return isEenmaligeLocatie(branchName) && naam ? naam : cleanBranchLabel(branchName);
}
