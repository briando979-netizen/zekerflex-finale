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
/** Dezelfde melding uit het woordenboek (werkgeversapp, Nederlands en Engels); bulkBericht hieronder is de Nederlandse standaard. */
export function bulkBerichtT(
  d: { bulkEen: string; bulkMeer: string; bulkMisluktEen: string; bulkMisluktMeer: string; bulkOvergeslagen: string; bulkNiets: string },
  goedgekeurd: number,
  mislukt: number,
  overgeslagen: number,
): string {
  const delen: string[] = [];
  if (goedgekeurd > 0) delen.push((goedgekeurd === 1 ? d.bulkEen : d.bulkMeer).replace("{n}", String(goedgekeurd)));
  if (mislukt > 0) delen.push((mislukt === 1 ? d.bulkMisluktEen : d.bulkMisluktMeer).replace("{n}", String(mislukt)));
  if (overgeslagen > 0) delen.push(d.bulkOvergeslagen.replace("{n}", String(overgeslagen)));
  return delen.join(" ") || d.bulkNiets;
}

export function bulkBericht(goedgekeurd: number, mislukt: number, overgeslagen: number): string {
  const delen: string[] = [];
  if (goedgekeurd > 0) delen.push(`${goedgekeurd} ${goedgekeurd === 1 ? "urenbriefje" : "urenbriefjes"} goedgekeurd.`);
  if (mislukt > 0) delen.push(`${mislukt} niet gelukt: keur ${mislukt === 1 ? "dat" : "die"} apart goed om de reden te zien.`);
  if (overgeslagen > 0) delen.push(`${overgeslagen} overgeslagen: al verwerkt, of er kwam een signaal bij.`);
  return delen.join(" ") || "Er was niets om goed te keuren.";
}
