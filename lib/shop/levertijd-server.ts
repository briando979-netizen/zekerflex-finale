import { prisma } from "@/lib/prisma";
import { kvGetMany } from "@/lib/storage/kv";
import { leesCjInstellingen, type CjKoppeling } from "@/lib/shop/cj/importeer";
import { langsteLevertijd, levertijdVoorLeverancier } from "@/lib/shop/levertijd";

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

/**
 * De verwachte levertijd van een bestelling, voor de betaalbevestiging: via de varianten naar de producten van de
 * leverancier (sku cj-…), de ruimste termijn telt. Null als er geen leveranciersproduct in zit (eigen voorraad: "we gaan
 * 'm inpakken" klopt dan gewoon). Gooit nooit: een mail mag hier niet op stuklopen.
 */
export async function levertijdVoorBestelling(regels: readonly { variantId?: string | null | undefined }[]): Promise<string | null> {
  try {
    const ids = [...new Set(regels.map((r) => r.variantId).filter((v): v is string => typeof v === "string" && v.length > 0))];
    if (!ids.length) return null;
    const varianten = await prisma.shopProductVariant.findMany({ where: { id: { in: ids } }, select: { productId: true, sku: true } });
    const cj = [...new Set(varianten.filter((v) => v.sku.startsWith("cj-")).map((v) => v.productId))];
    if (!cj.length) return null;
    const per = await levertijdenVoor(cj);
    return langsteLevertijd([...per.values()]);
  } catch {
    return null;
  }
}
