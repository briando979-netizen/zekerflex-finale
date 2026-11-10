// ---------------------------------------------------------------------------
// Bedragen in de winkel van een klantsite op zijn Nederlands. Een los, puur
// bestand zodat de rekenregels (lib/sites/winkel-*.ts) het kunnen gebruiken
// zonder lib/sites/winkel.ts in een kring te importeren. winkel.ts geeft het door.
// ---------------------------------------------------------------------------

/** 1250 → "€ 12,50", 125000 → "€ 1.250,00" (vast formaat, op server en in de browser gelijk). */
export function euro(cents: number): string {
  const [heel, rest] = (Math.max(0, Math.round(cents)) / 100).toFixed(2).split(".");
  return `€ ${(heel ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${rest ?? "00"}`;
}
