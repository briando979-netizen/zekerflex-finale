// ---------------------------------------------------------------------------
// Opslag van de live reeks (reeks.ts) per werker: KV `gezicht-live:<userId>`, alleen getallen, hoogstens
// 60 metingen. De KV kent geen verlooptijd: een reeks die 2 uur niet bijgewerkt is, wist de opruimtaak
// (POST /api/internal/kyc/chip-opruimen, elke 15 minuten), en na elke ingestuurde controle wist verify.ts hem.
// Het voorvoegsel staat in ERASABLE_KV_PREFIXES (lib/privacy/user-kv.ts). Alles hier is best effort: een
// storing mag het live meten of de verificatie nooit tegenhouden.
// ---------------------------------------------------------------------------

import { kvDelete, kvDeleteStale, kvGet, kvSet } from "@/lib/storage/kv";
import type { LiveMeting } from "@/lib/kyc/gezicht/beweging";
import { leesReeks, REEKS, vatReeksSamen, voegToe, type ReeksSamenvatting } from "@/lib/kyc/gezicht/reeks";

export const REEKS_PREFIX = "gezicht-live:";
const sleutel = (userId: string) => `${REEKS_PREFIX}${userId}`;

/** Eén live meting erbij (vanuit de route). */
export async function bewaarLiveMeting(userId: string, m: LiveMeting, nu: number = Date.now()): Promise<void> {
  const oud = leesReeks(await kvGet<unknown>(sleutel(userId)));
  await kvSet(sleutel(userId), voegToe(oud, m, nu));
}

/** De samenvatting voor de controle die nu wordt ingestuurd. */
export async function reeksSamenvatting(userId: string, nu: number = Date.now()): Promise<ReeksSamenvatting> {
  return vatReeksSamen(leesReeks(await kvGet<unknown>(sleutel(userId))), nu);
}

/** Na het insturen: de reeks is samengevat, de metingen zelf gaan weg. */
export async function wisReeks(userId: string): Promise<void> {
  await kvDelete(sleutel(userId));
}

/** Voor de opruimtaak: reeksen die 2 uur niet zijn bijgewerkt (een afgebroken poging). */
export async function ruimLiveReeksOp(nu: Date = new Date()): Promise<number> {
  return kvDeleteStale(REEKS_PREFIX, new Date(nu.getTime() - REEKS.geldigMs));
}
