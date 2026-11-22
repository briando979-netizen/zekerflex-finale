import { kvDelete, kvGet, kvListEntries, kvSet } from "@/lib/storage/kv";
import { STANDAARD_INCHECK, leesIncheckInstelling, type IncheckInstelling } from "@/lib/checkin/vereist-kern";

// ---------------------------------------------------------------------------
// Inchecken is optioneel per bedrijf (regels en uitleg: lib/checkin/vereist-kern.ts). Opgeslagen in de KV, per bedrijf:
//   key "incheck:instelling:<tenantId>" → IncheckInstelling
// Alleen een bedrijf dat inchecken UIT zette heeft een rij; terug naar aan wist de rij (de standaard), zodat de lijst met
// bedrijven zonder inchecken kort blijft. Geen schemawijziging nodig.
// ---------------------------------------------------------------------------

const VOORVOEGSEL = "incheck:instelling:";
const sleutel = (tenantId: string) => `${VOORVOEGSEL}${tenantId}`;

export async function getIncheckInstelling(tenantId: string): Promise<IncheckInstelling> {
  return leesIncheckInstelling(await kvGet<unknown>(sleutel(tenantId)));
}

/**
 * Moet de werker bij een klus van dit bedrijf inchecken? Bij een storing in de opslag: ja, zoals het altijd werkte (nooit
 * stilletjes minder bewijs eisen door een haperende opslag).
 */
export async function incheckenVereist(tenantId: string): Promise<boolean> {
  try {
    return (await getIncheckInstelling(tenantId)).vereist;
  } catch {
    return STANDAARD_INCHECK.vereist;
  }
}

/** Hetzelfde voor meerdere bedrijven tegelijk (een lijst met klussen of urenbriefjes). */
export async function incheckenVereistVoor(tenantIds: readonly string[]): Promise<Map<string, boolean>> {
  const ids = [...new Set(tenantIds)];
  const waarden = await Promise.all(ids.map((id) => incheckenVereist(id)));
  return new Map(ids.map((id, i) => [id, waarden[i] ?? true] as const));
}

/** Het bedrijf kiest. Geeft de nieuwe stand terug (de server is leidend, niet de knop). */
export async function zetIncheckenVereist(tenantId: string, vereist: boolean, nu: Date = new Date()): Promise<IncheckInstelling> {
  if (vereist) {
    await kvDelete(sleutel(tenantId));
    return STANDAARD_INCHECK;
  }
  const volgende: IncheckInstelling = { vereist: false, sinds: nu.toISOString() };
  await kvSet(sleutel(tenantId), volgende);
  return volgende;
}

/**
 * De bedrijven die inchecken uit hebben, voor een sweep die op een ontbrekende check-in let (lib/claims/no-show-sweep.ts):
 * zonder check-in is bij hen niemand "niet opgekomen". Bij een storing: geen (zoals de standaard).
 */
export async function tenantsZonderInchecken(): Promise<string[]> {
  try {
    const rijen = await kvListEntries<unknown>(VOORVOEGSEL, 1000);
    return rijen.filter((r) => !leesIncheckInstelling(r.value).vereist).map((r) => r.key.slice(VOORVOEGSEL.length));
  } catch {
    return [];
  }
}
