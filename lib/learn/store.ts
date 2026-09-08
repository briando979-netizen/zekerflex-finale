import { randomUUID } from "node:crypto";
import { kvAppend, kvGet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Lightweight "learning" for the local assistants — Postgres-backed
// (KeyValueStore), no separate DB schema. Was local disk, unreliable on
// Vercel's serverless functions.
//
// A local LLM can't be fine-tuned on the fly, so "learning" here means:
//   • remembering every Q&A pair               key "learn-log:<scope>"
//   • letting people rate the answers          key "learn-rated:<scope>"
//   • feeding the best-rated pairs back as few-shot examples on the next call
//   • keeping a per-user conversation memory   (jarvis, without a JarvisTurn row)
// ---------------------------------------------------------------------------

export type Scope = "public" | "jarvis";

interface Exchange {
  id: string;
  at: string;
  userId?: string;
  q: string;
  a: string;
}

const logKey = (s: Scope) => `learn-log:${s}`;
const ratedKey = (s: Scope) => `learn-rated:${s}`;

/** Append a Q&A pair; returns its id (used to rate it later). */
export async function logExchange(scope: Scope, e: { q: string; a: string; userId?: string }): Promise<string> {
  const rec: Exchange = {
    id: randomUUID().slice(0, 10),
    at: new Date().toISOString(),
    q: e.q.slice(0, 1000),
    a: e.a.slice(0, 2000),
    ...(e.userId ? { userId: e.userId } : {}),
  };
  await kvAppend(logKey(scope), rec, 800);
  return rec.id;
}

/** Find a logged exchange by its text (used when the caller has no id, e.g. a rating widget). */
export async function findExchangeIdByText(scope: Scope, q: string, a: string): Promise<string | null> {
  const log = (await kvGet<Exchange[]>(logKey(scope))) ?? [];
  for (let i = log.length - 1; i >= 0; i--) {
    const rec = log[i]!;
    if (rec.q.trim() === q.trim() && rec.a.slice(0, 40) === a.slice(0, 40)) return rec.id;
  }
  return null;
}

export async function rateExchange(scope: Scope, id: string, up: boolean): Promise<void> {
  await kvAppend(ratedKey(scope), { id, up, at: new Date().toISOString() }, 5000);
}

/** Best-rated recent Q&A pairs, as few-shot examples for the next prompt. */
export async function topExamples(scope: Scope, n = 3): Promise<{ q: string; a: string }[]> {
  const [log, rated] = await Promise.all([
    kvGet<Exchange[]>(logKey(scope)),
    kvGet<{ id: string; up: boolean }[]>(ratedKey(scope)),
  ]);
  const score = new Map<string, number>();
  for (const r of rated ?? []) score.set(r.id, (score.get(r.id) ?? 0) + (r.up ? 1 : -2));
  const byId = new Map((log ?? []).map((e) => [e.id, e]));
  return [...score.entries()]
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id]) => byId.get(id))
    .filter((e): e is Exchange => Boolean(e && e.q && e.a))
    .map((e) => ({ q: e.q, a: e.a }));
}

/** Per-user conversation memory (jarvis) built from the log — no separate schema. */
export async function recentHistory(
  scope: Scope,
  userId: string,
  turns = 4,
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const log = (await kvGet<Exchange[]>(logKey(scope))) ?? [];
  return log
    .filter((e) => e.userId === userId)
    .slice(-turns)
    .flatMap((e) => [
      { role: "user" as const, content: e.q.slice(0, 800) },
      { role: "assistant" as const, content: e.a.slice(0, 1200) },
    ]);
}

export async function learnStats(scope: Scope): Promise<{ logged: number; rated: number; examples: number }> {
  const [log, rated, ex] = await Promise.all([
    kvGet<Exchange[]>(logKey(scope)),
    kvGet<unknown[]>(ratedKey(scope)),
    topExamples(scope, 50),
  ]);
  return { logged: (log ?? []).length, rated: (rated ?? []).length, examples: ex.length };
}
