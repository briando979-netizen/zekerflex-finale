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

export async function zetNoodrem(aan: boolean, door: string): Promise<void> {
  await kvSet(K_AUTO_NOODREM, { aan, door, op: new Date().toISOString() });
}