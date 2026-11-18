import { kvGetMany } from "@/lib/storage/kv";
import { leesCjInstellingen, type CjKoppeling } from "@/lib/shop/cj/importeer";
import { levertijdVoorLeverancier } from "@/lib/shop/levertijd";

// De levertijd per leveranciersproduct voor de pagina's (18 nov 2026): uit de koppeling in KV (de termijn die CJ bij
// het overnemen of bij Bijwerken gaf) of anders de ruime standaard van het ingestelde magazijn. Eén KV-aanvraag voor
// alle producten van een pagina. Producten die niet van CJ zijn staan er niet in.

export async function levertijdenVoor(productIds: readonly string[]): Promise<Map<string, string>> {
  const uit = new Map<string, string>();
  if (!productIds.length) return uit;
  const [koppelingen, instel] = await Promise.all([
    kvGetMany<CjKoppeling>(productIds.map((id) => `shop:cj:product:${id}`)).catch(() => new Map<string, CjKoppeling>()),
    leesCjInstellingen().catch(() => null),
  ]);
  const magazijn = instel?.land || "CN";
  for (const id of productIds) {
    const k = koppelingen.get(`shop:cj:product:${id}`);
    if (k) uit.set(id, levertijdVoorLeverancier(k.verzendDagen ?? null, magazijn));
  }
  return uit;
}
