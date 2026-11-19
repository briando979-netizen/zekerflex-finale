import { randomBytes } from "node:crypto";
import { kvDelete, kvGet, kvListEntries, kvSet } from "@/lib/storage/kv";
import { isAdvertentieId, verlopen } from "@/lib/advertentie/regels";

// ---------------------------------------------------------------------------
// Opslag voor "eerst het voorbeeld, dan pas betalen" (advertentie op maat en de
// logo maker): één rij per ontwerp-aanvraag in KV onder een eigen voorvoegsel,
// met een niet te raden id (128 bit) als sleutel. De KV-laag kent geen
// houdbaarheid; daarom vervalt een rij 60 dagen na de laatste wijziging en ruimt
// het lezen (los en als lijst) hem dan op. De lijst voor Beheer is het
// voorvoegsel zelf (kvListEntries), net als bij lib/voorstel/smileyapp-aanvragen.ts.
// ---------------------------------------------------------------------------

export interface Rij {
  id: string;
  aangemaakt: string;
  gewijzigd: string;
}

/** Een nieuw id: 128 bit uit crypto, 32 hex-tekens. */
export const nieuwId = (): string => randomBytes(16).toString("hex");

export function maakOpslag<T extends Rij>(voorvoegsel: string) {
  const sleutel = (id: string) => `${voorvoegsel}${id}`;
  return {
    async bewaar(rij: T): Promise<T> {
      await kvSet(sleutel(rij.id), rij);
      return rij;
    },
    /** Null bij een id dat niet klopt, niet bestaat of verlopen is (die wordt meteen gewist). */
    async haal(id: string, nu = new Date()): Promise<T | null> {
      if (!isAdvertentieId(id)) return null;
      const rij = await kvGet<T>(sleutel(id));
      if (!rij) return null;
      if (verlopen(rij.gewijzigd, nu)) {
        await kvDelete(sleutel(id)).catch(() => undefined);
        return null;
      }
      return rij;
    },
    /** Alles, nieuwste eerst; verlopen rijen worden gewist. */
    async alle(nu = new Date()): Promise<T[]> {
      const rijen = await kvListEntries<T>(voorvoegsel, 5000);
      const oud = rijen.filter((r) => verlopen(r.value.gewijzigd, nu));
      await Promise.all(oud.map((r) => kvDelete(r.key).catch(() => undefined)));
      return rijen
        .filter((r) => !verlopen(r.value.gewijzigd, nu))
        .map((r) => r.value)
        .sort((a, b) => (a.aangemaakt < b.aangemaakt ? 1 : -1));
    },
    async verwijder(id: string): Promise<void> {
      if (isAdvertentieId(id)) await kvDelete(sleutel(id));
    },
  };
}
