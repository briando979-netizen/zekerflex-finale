import { kvAppend, kvGet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Autorisatielogboek: elke goedkeuring/weigering wordt bewaard voor het
// overzicht in de admin. Durable KV (laatste 2000).
// ---------------------------------------------------------------------------

export interface AuthLogEntry {
  id: string;
  cardId: string;
  amountCents: number;
  merchant: string | null;
  mcc: string | null;
  country: string | null;
  approved: boolean;
  reason: string;
  at: string;
}

const KEY = "issuing:authlog";

export async function logAuthorization(e: Omit<AuthLogEntry, "at">): Promise<void> {
  await kvAppend(KEY, { ...e, at: new Date().toISOString() } satisfies AuthLogEntry, 2000);
}

export async function listAuthorizations(limit = 100): Promise<AuthLogEntry[]> {
  const rows = (await kvGet<AuthLogEntry[]>(KEY).catch(() => null)) ?? [];
  return [...rows].reverse().slice(0, limit);
}
