import { kvGet, kvSet } from "@/lib/storage/kv";
import { LEGE_STAND, type AutoStand } from "@/lib/bouwer/auto-uitrol-regels";

// De opslag van de Auto-uitrol in de KV (alleen kv, zodat Te doen en Beheer hem kunnen lezen zonder de uitvoering mee te laden).
export const K_AUTO_STAND = "bouwer:auto-uitrol:stand";
export const K_AUTO_NOODREM = "bouwer:auto-uitrol:noodrem";

export async function leesAutoStand(): Promise<AutoStand> {
  return { ...LEGE_STAND, ...((await kvGet<AutoStand>(K_AUTO_STAND).catch(() => null)) ?? {}) };
}

export async function bewaarAutoStand(stand: AutoStand): Promise<void> {
  await kvSet(K_AUTO_STAND, stand);
}

/** Staat de noodrem aan? Kan de KV niet gelezen worden, dan telt hij als AAN (liever niets doen dan blind uitrollen). */
export async function noodremAan(): Promise<boolean> {
  return Boolean(await kvGet<{ aan?: boolean }>(K_AUTO_NOODREM).then((v) => v?.aan, () => true));
}

/** De noodrem met zijn reden (bij de harde stop: "nacontrole faalde: ..."). */
export async function zetNoodrem(aan: boolean, door: string, reden?: string): Promise<void> {
  await kvSet(K_AUTO_NOODREM, { aan, door, op: new Date().toISOString(), ...(reden ? { reden } : {}) });
}

export async function leesNoodremReden(): Promise<string | null> {
  const v = await kvGet<{ aan?: boolean; reden?: string }>(K_AUTO_NOODREM).catch(() => null);
  return v?.aan && v.reden ? v.reden : null;
}

/**
 * De mens zet de Auto-uitrol weer aan: de harde stop vervalt, en een noodrem die de nacontrole zelf zette gaat mee los
 * (een noodrem die de eigenaar zelf zette blijft staan).
 */
export async function herstelNaStop(door: string): Promise<void> {
  const stand = await leesAutoStand();
  if (stand.stop) await bewaarAutoStand({ ...stand, stop: null });
  const reden = await leesNoodremReden();
  if (reden?.startsWith("nacontrole faalde")) await zetNoodrem(false, door);
}