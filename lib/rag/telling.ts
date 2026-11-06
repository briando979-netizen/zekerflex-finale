import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/redis";

// ---------------------------------------------------------------------------
// Hoeveel stukjes kennis staan er in de kennisbank?
//
// `SELECT COUNT(*)` over de hele RagChunk-tabel duurde 1,3 seconde en stond op
// twee dashboards die vaak open staan (6 nov: "trage databasequery", tien keer,
// en GET /api/admin/overview deed er bijna 4 seconden over). Het is een getal
// op een tegel, geen boekhouding: vijf minuten oud mag best. Valt Redis weg,
// dan telt hij gewoon weer echt (cached() is fail-open).
// ---------------------------------------------------------------------------

const SLEUTEL = "rag:chunks:aantal";
const TTL_SECONDEN = 300;

export async function ragChunkAantal(): Promise<number> {
  return cached(SLEUTEL, TTL_SECONDEN, () => prisma.ragChunk.count());
}
