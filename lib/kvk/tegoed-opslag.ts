import { kvDelete, kvGet, kvListEntries, kvSet } from "@/lib/storage/kv";
import { volgendePoging, type KvkLimiet, type KvkTegoed } from "@/lib/kvk/tegoed";

// ---------------------------------------------------------------------------
// Bewaren rond het KVK-tegoed (13 nov 2026): de laatste meting van het tegoed (één sleutel, geen persoonsgegeven) en de
// controles die wachten omdat het tegoed op was of de minuutlimiet bereikt ("kvk-wacht"). Een cron
// (/api/internal/kvk/herkansing, lib/kvk/herkansing.ts) probeert die later opnieuw.
//   meting:kvkbase-tegoed            → KvkTegoed
//   kvk-wacht:werker:<userId>        → KvkWacht   (per gebruiker: in ERASABLE_KV_PREFIXES)
//   kvk-wacht:bedrijf:<tenantId>     → KvkWacht   (per bedrijf; alleen het openbare KVK-nummer, geen persoon)
//   kvk-opgegeven:werker:<userId>    → KvkOpgegeven (de herkansing gaf het op: niet gevonden of ongeldig; in ERASABLE_KV_PREFIXES)
//   kvk-opgegeven:bedrijf:<tenantId> → KvkOpgegeven
// Een storing hier mag een controle of aanmelding nooit tegenhouden: alles vangt zijn fouten zelf af.
// ---------------------------------------------------------------------------

export const KVK_TEGOED_SLEUTEL = "meting:kvkbase-tegoed";
export const KVK_WACHT_PREFIX = "kvk-wacht:";
export const KVK_OPGEGEVEN_PREFIX = "kvk-opgegeven:";

/** De herkansing gaf dit nummer op (niet gevonden of ongeldig): het komt niet opnieuw in de wacht, een ander nummer wel. */
export interface KvkOpgegeven {
  kvkNumber: string;
  op: string;
}

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

/**
 * Zet een controle in de wacht die meteen aan de beurt is (het inhalen, lib/kvk/inhalen.ts): geen limiet gezien, geen
 * poging geteld. Een bestaande wacht blijft staan (de aanroeper filtert die er al uit).
 */
export async function zetKvkWachtNu(soort: "werker" | "bedrijf", id: string, kvkNumber: string, nu = new Date()): Promise<void> {
  try {
    await kvSet(wachtSleutel(soort, id), { kvkNumber, sinds: nu.toISOString(), volgende: nu.toISOString(), pogingen: 0, limiet: "tegoed" } satisfies KvkWacht);
  } catch {
    // de herkansing is een extra
  }
}

export async function wisKvkWacht(soort: "werker" | "bedrijf", id: string): Promise<void> {
  await kvDelete(wachtSleutel(soort, id)).catch(() => undefined);
}

/** De wachtende controle van één werker of bedrijf, of null (ook bij een storing). */
export async function kvkWachtVan(soort: "werker" | "bedrijf", id: string): Promise<KvkWacht | null> {
  return kvGet<KvkWacht>(wachtSleutel(soort, id)).catch(() => null);
}

const opgegevenSleutel = (soort: "werker" | "bedrijf", id: string) => `${KVK_OPGEGEVEN_PREFIX}${soort}:${id}`;

export async function zetKvkOpgegeven(soort: "werker" | "bedrijf", id: string, kvkNumber: string, nu = new Date()): Promise<void> {
  await kvSet(opgegevenSleutel(soort, id), { kvkNumber, op: nu.toISOString() } satisfies KvkOpgegeven).catch(() => undefined);
}

export async function wisKvkOpgegeven(soort: "werker" | "bedrijf", id: string): Promise<void> {
  await kvDelete(opgegevenSleutel(soort, id)).catch(() => undefined);
}

/** Alle opgegeven nummers: soort, id en het merk. */
export async function opgegevenKvkControles(limiet = 500): Promise<{ soort: "werker" | "bedrijf"; id: string; opgegeven: KvkOpgegeven }[]> {
  const rijen = await kvListEntries<KvkOpgegeven>(KVK_OPGEGEVEN_PREFIX, limiet).catch(() => []);
  return rijen.flatMap((r) => {
    const rest = r.key.slice(KVK_OPGEGEVEN_PREFIX.length);
    const i = rest.indexOf(":");
    const soort = rest.slice(0, i);
    const id = rest.slice(i + 1);
    return (soort === "werker" || soort === "bedrijf") && id && r.value?.kvkNumber ? [{ soort: soort as "werker" | "bedrijf", id, opgegeven: r.value }] : [];
  });
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
