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
