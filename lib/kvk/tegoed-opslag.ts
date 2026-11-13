import { kvDelete, kvGet, kvListEntries, kvSet } from "@/lib/storage/kv";
import { volgendePoging, type KvkLimiet, type KvkTegoed } from "@/lib/kvk/tegoed";

// ---------------------------------------------------------------------------
// Bewaren rond het KVK-tegoed (13 nov 2026): de laatste meting van het tegoed (één sleutel, geen persoonsgegeven) en de
// controles die wachten omdat het tegoed op was of de minuutlimiet bereikt ("kvk-wacht"). Een cron
// (/api/internal/kvk/herkansing, lib/kvk/herkansing.ts) probeert die later opnieuw.
//   meting:kvkbase-tegoed            → KvkTegoed
//   kvk-wacht:werker:<userId>        → KvkWacht   (per gebruiker: in ERASABLE_KV_PREFIXES)
//   kvk-wacht:bedrijf:<tenantId>     → KvkWacht   (per bedrijf; alleen het openbare KVK-nummer, geen persoon)
// Een storing hier mag een controle of aanmelding nooit tegenhouden: alles vangt zijn fouten zelf af.
// ---------------------------------------------------------------------------

export const KVK_TEGOED_SLEUTEL = "meting:kvkbase-tegoed";
export const KVK_WACHT_PREFIX = "kvk-wacht:";

export interface KvkWacht {
  kvkNumber: string;
  sinds: string;
  /** wanneer de herkansing het weer probeert (ISO) */
  volgende: string;
  pogingen: number;
  /** waarom hij wacht: tegoed op of minuutlimiet */
  limiet: KvkLimiet["soort"];
}

export async function bewaarKvkTegoed(t: KvkTegoed): Promise<void> {
  await kvSet(KVK_TEGOED_SLEUTEL, t).catch(() => undefined);
}

export async function leesKvkTegoed(): Promise<KvkTegoed | null> {
  return kvGet<KvkTegoed>(KVK_TEGOED_SLEUTEL).catch(() => null);
}

const wachtSleutel = (soort: "werker" | "bedrijf", id: string) => `${KVK_WACHT_PREFIX}${soort}:${id}`;

/** Zet een controle in de wacht (of schuift hem door); pogingen telt mee. */
export async function zetKvkWacht(soort: "werker" | "bedrijf", id: string, kvkNumber: string, limiet: KvkLimiet, nu = new Date()): Promise<void> {
  try {
    const sleutel = wachtSleutel(soort, id);
    const oud = await kvGet<KvkWacht>(sleutel);
    await kvSet(sleutel, {
      kvkNumber,
      sinds: oud?.kvkNumber === kvkNumber ? oud.sinds : nu.toISOString(),
      volgende: volgendePoging(limiet, nu).toISOString(),
      pogingen: (oud?.kvkNumber === kvkNumber ? oud.pogingen : 0) + 1,
      limiet: limiet.soort,
    } satisfies KvkWacht);
  } catch {
    // de herkansing is een extra; de controle zelf is al afgehandeld
  }
}

export async function wisKvkWacht(soort: "werker" | "bedrijf", id: string): Promise<void> {
  await kvDelete(wachtSleutel(soort, id)).catch(() => undefined);
}

/** De wachtende controle van één werker of bedrijf, of null (ook bij een storing). */
export async function kvkWachtVan(soort: "werker" | "bedrijf", id: string): Promise<KvkWacht | null> {
  return kvGet<KvkWacht>(wachtSleutel(soort, id)).catch(() => null);
}

/** Alle wachtende controles: soort, id en de markering. */
export async function wachtendeKvkControles(limiet = 500): Promise<{ soort: "werker" | "bedrijf"; id: string; wacht: KvkWacht }[]> {
  const rijen = await kvListEntries<KvkWacht>(KVK_WACHT_PREFIX, limiet).catch(() => []);
  return rijen.flatMap((r) => {
    const rest = r.key.slice(KVK_WACHT_PREFIX.length);
    const i = rest.indexOf(":");
    const soort = rest.slice(0, i);
    const id = rest.slice(i + 1);
    return (soort === "werker" || soort === "bedrijf") && id && r.value ? [{ soort: soort as "werker" | "bedrijf", id, wacht: r.value }] : [];
  });
}
