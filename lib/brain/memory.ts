import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Per-user conversation memory for the assistant: the last turns, so "en
// morgen?" or "en die andere klus?" make sense. Private to the user (keyed by
// their id), capped, and wipeable from the chat ("Vergeet dit gesprek").
// ---------------------------------------------------------------------------

export interface Turn {
  role: "user" | "assistant";
  content: string;
  at: string;
}

const KEY = (userId: string) => `brain-mem:${userId}`;
const MAX_TURNS = 16;
/** after this long a new question starts a fresh conversation */
const STALE_MS = 6 * 60 * 60 * 1000;

export async function loadMemory(userId: string): Promise<Turn[]> {
  const turns = (await kvGet<Turn[]>(KEY(userId)).catch(() => null)) ?? [];
  const last = turns[turns.length - 1];
  if (last && Date.now() - new Date(last.at).getTime() > STALE_MS) return [];
  return turns;
}

export async function remember(userId: string, q: string, a: string): Promise<void> {
  const now = new Date().toISOString();
  const turns = [...(await loadMemory(userId)), { role: "user" as const, content: q.slice(0, 800), at: now }, { role: "assistant" as const, content: a.slice(0, 1500), at: now }];
  await kvSet(KEY(userId), turns.slice(-MAX_TURNS)).catch(() => undefined);
}

export async function forget(userId: string): Promise<void> {
  await kvDelete(KEY(userId)).catch(() => undefined);
}
