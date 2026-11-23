import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { STANDAARD_HEROPENEN, leesHeropenInstelling, type HeropenInstelling } from "@/lib/werkgever/heropenen-kern";

// ---------------------------------------------------------------------------
// "Klussen automatisch heropenen" per bedrijf (regels en uitleg: lib/werkgever/heropenen-kern.ts). Opgeslagen in de KV, per bedrijf:
//   key "klus:heropenen:<tenantId>" → HeropenInstelling
// Alleen een bedrijf dat het UIT zette heeft een rij; terug naar aan wist de rij (de standaard). Geen schemawijziging nodig. Het is een
// instelling van het bedrijf zonder persoonsgegevens: geen regel in lib/privacy.
// ---------------------------------------------------------------------------

const sleutel = (tenantId: string) => `klus:heropenen:${tenantId}`;

export async function getHeropenInstelling(tenantId: string): Promise<HeropenInstelling> {
  return leesHeropenInstelling(await kvGet<unknown>(sleutel(tenantId)));
}

/**
 * Gaat een volle klus van dit bedrijf vanzelf weer open als iemand afzegt? Bij een storing in de opslag: ja, zoals het altijd werkte (een
 * haperende opslag mag nooit stilletjes het zoeken naar een vervanger stoppen; fail-open).
 */
export async function automatischHeropenen(tenantId: string): Promise<boolean> {
  try {
    return (await getHeropenInstelling(tenantId)).automatisch;
  } catch {
    return STANDAARD_HEROPENEN.automatisch;
  }
}

/** Het bedrijf kiest. Geeft de nieuwe stand terug (de server is leidend, niet de knop). */
export async function zetAutomatischHeropenen(tenantId: string, automatisch: boolean, nu: Date = new Date()): Promise<HeropenInstelling> {
  if (automatisch) {
    await kvDelete(sleutel(tenantId));
    return STANDAARD_HEROPENEN;
  }
  const volgende: HeropenInstelling = { automatisch: false, sinds: nu.toISOString() };
  await kvSet(sleutel(tenantId), volgende);
  return volgende;
}
