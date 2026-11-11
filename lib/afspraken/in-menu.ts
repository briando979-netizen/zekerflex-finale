import { kvGet } from "@/lib/storage/kv";

// Staat Afspraken in het menu van dit bedrijf? Alleen als het bedrijf afspraken heeft ingericht: zonder instellingen is
// de ingang de tegel in "Jouw branche", zodat de grote groep die geen afspraken doet geen extra regel krijgt.
// Staat bewust los van lib/afspraken/store.ts: de layout laadt dit bij elk bezoek en importeert dan niets van het beheer.

/** Dezelfde sleutel als de instellingen in lib/afspraken/store.ts (een test bewaakt dat ze gelijk blijven). */
export const sleutelAfsprakenInstellingen = (tenantId: string): string => `afspraken:inst:${tenantId}`;

/** Eén kvGet; bij een storing of zonder organisatie `false` (fail-safe: dan staat het item er gewoon niet). */
export async function heeftAfspraken(tenantId: string | undefined): Promise<boolean> {
  if (!tenantId) return false;
  try {
    return (await kvGet<unknown>(sleutelAfsprakenInstellingen(tenantId))) !== null;
  } catch {
    return false;
  }
}
