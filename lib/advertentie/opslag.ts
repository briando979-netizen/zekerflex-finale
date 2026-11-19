import { randomBytes } from "node:crypto";
import { kvDelete, kvDeleteStale, kvGet, kvListEntries, kvSet } from "@/lib/storage/kv";
import { isAdvertentieId, verloopGrens, verlopen } from "@/lib/advertentie/regels";

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

export const ADVERTENTIE_VOORVOEGSEL = "advertentie:item:";
export const LOGO_VOORVOEGSEL = "logo-maker:item:";

/**
 * De dagelijkse opruiming (lib/privacy/sweep.ts, cron 03:40 UTC): wist ELKE rij van beide soorten die langer dan 60 dagen
 * niet is gewijzigd, ook rijen die niemand meer opvraagt en die buiten de lijst van Beheer vallen. Elke bewaring werkt de
 * rij bij, dus het tijdstip van de rij in KV is het tijdstip van de laatste wijziging. Geeft het aantal gewiste rijen.
 */
export async function ruimVerlopenOp(nu = new Date()): Promise<number> {
  const grens = verloopGrens(nu);
  const aantallen = await Promise.all([ADVERTENTIE_VOORVOEGSEL, LOGO_VOORVOEGSEL].map((v) => kvDeleteStale(v, grens)));
  return aantallen.reduce((a, b) => a + b, 0);
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
    /** De nieuwste rijen (hooguit `max`), nieuwste eerst; verlopen rijen worden gewist. De rest ruimt de dagelijkse opruiming op. */
    async alle(nu = new Date(), max = 2000): Promise<T[]> {
      const rijen = await kvListEntries<T>(voorvoegsel, max);
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
