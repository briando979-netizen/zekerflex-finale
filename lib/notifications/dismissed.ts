import { createHash } from "node:crypto";
import { kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Server-side "gelezen" voor meldingen. Postgres-backed (KeyValueStore, key
// "notif-dismissed:<userId>"), zodat een melding die je weggeklikt hebt óók
// op je andere apparaten weg blijft.
//
// De handtekening is op INHOUD (id + body), niet puur op id. Zo verdwijnt een
// weggeklikte melding, maar komt dezelfde melding tóch terug zodra de situatie
// verandert — bv. "3 urenbriefjes te keuren" → later "5 te keuren", of een
// nieuw ongelezen bericht in hetzelfde gesprek.
// ---------------------------------------------------------------------------

const key = (userId: string) => `notif-dismissed:${userId}`;
const CAP = 400;

export function notifSignature(id: string, body: string): string {
  return createHash("sha1").update(`${id}::${body}`).digest("hex").slice(0, 16);
}

export async function getDismissed(userId: string): Promise<Set<string>> {
  const raw = await kvGet<{ sigs: string[] }>(key(userId));
  return new Set(raw?.sigs ?? []);
}

export async function addDismissed(userId: string, sigs: string[]): Promise<void> {
  const clean = sigs.filter(Boolean);
  if (clean.length === 0) return;
  const current = await getDismissed(userId);
  for (const s of clean) current.add(s);
  await kvSet(key(userId), { sigs: [...current].slice(-CAP) });
}
