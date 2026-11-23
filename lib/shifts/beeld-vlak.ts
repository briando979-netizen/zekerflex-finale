// Het beeld bovenaan een klus in een voorbeeld (klus-wizard van de werkgever en /klus-plaatsen) is geen foto meer maar een rustig
// vlak in de kleur van de branche (23 nov 2026, eigenaar: geen foto's van mensen). Puur bestand: de kleur met een doorzichtigheid.

/** Een kleur uit lib/shifts/category.ts ("#0E5C4A") met een doorzichtigheid van 0 tot 1 erbij ("#0E5C4A29"). Geen zeskleurige hex: ongewijzigd terug. */
export function accentMetAlpha(accent: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(accent)) return accent;
  const a = Math.min(1, Math.max(0, alpha));
  return `${accent}${Math.round(a * 255).toString(16).padStart(2, "0").toUpperCase()}`;
}

/** De achtergrond van het vlak: een zachte tint van de brancheskleur, links boven iets sterker dan rechts onder. */
export function vlakAchtergrond(accent: string): string {
  return `linear-gradient(135deg, ${accentMetAlpha(accent, 0.16)}, ${accentMetAlpha(accent, 0.06)})`;
}
