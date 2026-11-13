import { randomUUID } from "node:crypto";
import { kvGet, kvSet, kvSetIfAbsent, kvVerwijderAlsVeld, kvVervangAlsVeld } from "@/lib/storage/kv";
import { LEGE_STAND, slotVrij, type AutoStand } from "@/lib/bouwer/auto-uitrol-regels";

// De opslag van de Auto-uitrol in de KV (alleen kv, zodat Te doen en Beheer hem kunnen lezen zonder de uitvoering mee te laden).
export const K_AUTO_STAND = "bouwer:auto-uitrol:stand";
export const K_AUTO_NOODREM = "bouwer:auto-uitrol:noodrem";
export const K_RONDE_SLOT = "bouwer:auto-uitrol:slot";

/**
 * Het slot om één ronde (of om een schrijfactie op de stand). Een nx-set met een eigen token in de waarde; een slot ouder dan 10 minuten
 * is van een vastgelopen ronde en wordt atomisch overgenomen (compare-and-swap op het token). Geeft het token, of null als het bezet is.
 */
export async function neemRondeSlot(nu: number): Promise<string | null> {
  try {
    const token = randomUUID();
    const mijn = { op: new Date(nu).toISOString(), token };
    if (await kvSetIfAbsent(K_RONDE_SLOT, mijn)) return token;
    const bestaand = await kvGet<{ op?: string; token?: string }>(K_RONDE_SLOT);
    if (!bestaand || !slotVrij(bestaand, nu)) return null;
    return (await kvVervangAlsVeld(K_RONDE_SLOT, "token", bestaand.token ?? null, mijn)) ? token : null;
  } catch {
    return null;
  }
}

/** Geeft het slot alleen vrij als het nog van JOU is (het token klopt): een overgenomen slot van een ander blijft staan. */
export async function geefRondeSlotVrij(token: string): Promise<void> {
  await kvVerwijderAlsVeld(K_RONDE_SLOT, "token", token).catch(() => false);
}

/** Voert `werk` uit onder het slot; wacht hoogstens `wachtMs` op het slot. Null = het slot was niet te krijgen. */
export async function metRondeSlot<T>(werk: () => Promise<T>, wachtMs = 10_000): Promise<{ uitkomst: T } | null> {
  const eind = Date.now() + wachtMs;
  for (;;) {
    const token = await neemRondeSlot(Date.now());
    if (token) {
      try {
        return { uitkomst: await werk() };
      } finally {
        await geefRondeSlotVrij(token);
      }
    }
    if (Date.now() >= eind) return null;
    await new Promise<void>((klaar) => setTimeout(klaar, 1000));
  }
}

/**
 * De stand uit de KV. Geen sleutel = de eerste keer (lege stand). Lukt het LEZEN niet, dan gooit dit: de aanroeper mag dan niets
 * schrijven (een lege stand terugschrijven zou "geweigerd", de nacontrole en de harde stop wissen).
 */
export async function leesAutoStand(): Promise<AutoStand> {
  return { ...LEGE_STAND, ...((await kvGet<AutoStand>(K_AUTO_STAND)) ?? {}) };
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
/**
 * Zoals herstelNaStop, maar onder hetzelfde slot als een ronde: zonder slot kon een lopende ronde tussen lezen en schrijven een nieuwe
 * stop zetten die dit dan ongezien wiste (de ronde schrijft de hele stand). Geeft false als het slot niet te krijgen was.
 */
export async function herstelNaStopMetSlot(door: string): Promise<boolean> {
  return (await metRondeSlot(() => herstelNaStop(door))) !== null;
}

export async function herstelNaStop(door: string): Promise<void> {
  const stand = await leesAutoStand();
  if (stand.stop) await bewaarAutoStand({ ...stand, stop: null });
  const reden = await leesNoodremReden();
  if (reden?.startsWith("nacontrole")) await zetNoodrem(false, door);
}