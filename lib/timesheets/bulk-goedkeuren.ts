// ---------------------------------------------------------------------------
// Uren in één keer goedkeuren (Werkgever → Uren). Alleen de urenbriefjes waar
// niets bij staat: ingediend (geen dispuut), geen enkel signaal (GPS, tijden,
// pauze, dubbele uren) en geen extra kosten. Alles met een signaal of extra
// kosten keurt de werkgever apart goed, met de uitleg erbij. Elk gekozen
// briefje gaat daarna door exact dezelfde approveTimesheet() als de knop per
// rij, zonder GPS-uitzondering. Puur (geen prisma): pagina en actie delen dit.
// ---------------------------------------------------------------------------

/** Zoveel per klik: elke goedkeuring maakt facturen en start een uitbetaling. */
export const BULK_MAX = 25;

export interface BulkRij {
  id: string;
  status: string;
  extraCostsCents: number | null;
}

/** De ids die zonder vragen mee mogen, in de volgorde van de lijst, hoogstens `max`. */
export function schoneUren(rijen: readonly BulkRij[], signalen: ReadonlyMap<string, readonly { severity: string }[]>, max = BULK_MAX): string[] {
  return rijen
    .filter((r) => r.status === "SUBMITTED" && !r.extraCostsCents && !(signalen.get(r.id) ?? []).some((f) => f.severity !== "info"))
    .slice(0, Math.max(0, max))
    .map((r) => r.id);
}

/** Wat de werkgever na afloop ziet. */
export function bulkBericht(goedgekeurd: number, mislukt: number, overgeslagen: number): string {
  const delen: string[] = [];
  if (goedgekeurd > 0) delen.push(`${goedgekeurd} ${goedgekeurd === 1 ? "urenbriefje" : "urenbriefjes"} goedgekeurd.`);
  if (mislukt > 0) delen.push(`${mislukt} niet gelukt: keur ${mislukt === 1 ? "dat" : "die"} apart goed om de reden te zien.`);
  if (overgeslagen > 0) delen.push(`${overgeslagen} overgeslagen: al verwerkt, of er kwam een signaal bij.`);
  return delen.join(" ") || "Er was niets om goed te keuren.";
}
