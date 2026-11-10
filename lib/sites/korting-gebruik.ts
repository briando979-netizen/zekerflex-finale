import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { kvFindByField, kvListEntries, kvListKeys } from "@/lib/storage/kv";
import type { Kortingscode } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// Hoe vaak een kortingscode van een klantsite gebruikt is, op de server geteld.
//   KV "site-korting:<siteId>:<kortingId>:<n>" — gebruik nummer n, { bestelling, at }
// Elk nummer bestaat maar één keer (unieke sleutel), dus twee bestellingen die
// tegelijk de laatste keer van een code pakken, kunnen niet allebei winnen. Een
// bestelling telt één keer, hoe vaak het vastleggen ook wordt geprobeerd. Een
// voorbeeld of voorstel legt niets vast. Geen persoonsgegevens: alleen het
// nummer van de bestelling.
// ---------------------------------------------------------------------------

const prefix = (siteId: string, kortingId: string) => `site-korting:${siteId}:${kortingId}:`;

const isDubbel = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

interface Gebruik {
  bestelling: string;
  at: string;
}

/** Hoe vaak deze code al gebruikt is. */
export async function kortingGebruik(siteId: string, kortingId: string): Promise<number> {
  return prisma.keyValueStore.count({ where: { key: { startsWith: prefix(siteId, kortingId) } } });
}

/** Per code (id) hoe vaak hij gebruikt is, voor Webshop → Kortingen. */
export async function kortingGebruikPerCode(siteId: string): Promise<Record<string, number>> {
  const sleutels = await kvListKeys(`site-korting:${siteId}:`, 100_000);
  const uit: Record<string, number> = {};
  for (const key of sleutels) {
    const id = key.split(":")[2];
    if (id) uit[id] = (uit[id] ?? 0) + 1;
  }
  return uit;
}

/**
 * Een gebruik vastleggen voor deze bestelling, vlak voordat hij bewaard wordt. False als de code
 * intussen op is. Heeft deze bestelling de code al, dan telt hij niet nog een keer.
 */
export async function claimKorting(siteId: string, k: Pick<Kortingscode, "id" | "maxGebruik">, bestellingId: string, nu = new Date()): Promise<boolean> {
  const p = prefix(siteId, k.id);
  if ((await kvFindByField<Gebruik>(p, "bestelling", bestellingId, 1)).length) return true;
  let n = (await kortingGebruik(siteId, k.id)) + 1;
  for (let poging = 0; poging < 25; poging++, n++) {
    if (k.maxGebruik !== null && n > k.maxGebruik) return false;
    try {
      await prisma.keyValueStore.create({ data: { key: `${p}${n}`, value: { bestelling: bestellingId, at: nu.toISOString() } } });
      return true;
    } catch (err) {
      if (!isDubbel(err)) throw err;
    }
  }
  return false;
}

/** Het gebruik van een bestelling weer weghalen (als het bewaren van de bestelling daarna misging). */
export async function geefKortingVrij(siteId: string, kortingId: string, bestellingId: string): Promise<void> {
  const rijen = await kvListEntries<Gebruik>(prefix(siteId, kortingId), 100_000);
  const eigen = rijen.filter((r) => r.value?.bestelling === bestellingId).map((r) => r.key);
  if (eigen.length) await prisma.keyValueStore.deleteMany({ where: { key: { in: eigen } } });
}
