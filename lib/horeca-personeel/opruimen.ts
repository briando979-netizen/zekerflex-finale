import { kvGet } from "@/lib/storage/kv";

// Opruimen en exporteren van het eigen personeel (ronde 5): de pdf-bestanden van loonstroken en documenten staan in de gewone
// uploadopslag en worden dus niet vanzelf gewist als een bedrijf of medewerker verdwijnt. Hier staat het wissen van die
// bestanden (voor lib/privacy/org-wissen.ts) en de export van de eigen gegevens van één medewerker (AVG art. 15).
// De uren, het rooster en de loonstroken van een lopende of afgesloten medewerker wist dit NIET vanzelf: voor een
// loonadministratie geldt een wettelijke bewaartermijn, en dat besluit de werkgever.

/** Alle upload-ids die dit bedrijf in loonstroken en documenten bewaart (rommel in de opslag telt niet mee). */
export async function bestandIdsVan(tenantId: string): Promise<string[]> {
  const ids: string[] = [];
  for (const sleutel of [`horeca:loonstroken:${tenantId}`, `horeca:documenten:${tenantId}`]) {
    const ruw = await kvGet<unknown>(sleutel);
    if (!Array.isArray(ruw)) continue;
    for (const r of ruw) {
      const id = (r as { uploadId?: unknown } | null)?.uploadId;
      if (typeof id === "string" && id) ids.push(id);
    }
  }
  return ids;
}

/** Wis de bestanden van loonstroken en documenten van dit bedrijf; geeft het aantal terug. Een bestand dat al weg is, is geen fout. */
export async function wisPersoneelBestanden(tenantId: string): Promise<number> {
  const ids = await bestandIdsVan(tenantId);
  if (ids.length === 0) return 0;
  const { deleteUpload } = await import("@/lib/storage/local");
  let n = 0;
  for (const id of ids) {
    await deleteUpload(id).catch(() => undefined);
    n += 1;
  }
  return n;
}
