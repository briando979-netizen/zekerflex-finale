import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// "Favorieten automatisch accepteren" per klus (20 nov 2026, naar YoungOnes): zet het bedrijf dit vinkje bij het
// plaatsen, dan staat een favoriete werker die reageert tegen het geplaatste tarief meteen ingepland
// (lib/pools/vaste-schil.ts). Geen migratie: één KV-rij per klus, "klus-autoaccept:<shiftId>" = { aan: true }.
// Geen gegeven van een persoon, dus niet in ERASABLE_KV_PREFIXES.
// ---------------------------------------------------------------------------

export const klusAutoAcceptSleutel = (shiftId: string) => `klus-autoaccept:${shiftId}`;

export async function zetKlusAutoAccept(shiftId: string, aan: boolean): Promise<void> {
  if (aan) await kvSet(klusAutoAcceptSleutel(shiftId), { aan: true, sinds: new Date().toISOString() });
  else await kvDelete(klusAutoAcceptSleutel(shiftId));
}

export async function klusAutoAccept(shiftId: string): Promise<boolean> {
  const rij = await kvGet<{ aan?: unknown }>(klusAutoAcceptSleutel(shiftId)).catch(() => null);
  return Boolean(rij && rij.aan === true);
}
