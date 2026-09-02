import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Lightweight "learning" for the local assistants — filesystem, no DB.
//
// A local LLM can't be fine-tuned on the fly, so "learning" here means:
//   • remembering every Q&A pair               storage/learn/<scope>.jsonl
//   • letting people rate the answers          storage/learn/<scope>.rated.jsonl
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

function dir(): string {
  return join(process.cwd(), "storage", "learn");
}
const logPath = (s: Scope) => join(dir(), `${s}.jsonl`);
const ratedPath = (s: Scope) => join(dir(), `${s}.rated.jsonl`);

async function readLines<T>(path: string, max = 800): Promise<T[]> {
  if (!existsSync(path)) return [];
  try {
    const txt = await readFile(path, "utf8");
    const lines = txt.split("\n").filter(Boolean).slice(-max);
    return lines.map((l) => JSON.parse(l) as T).filter(Boolean);
  } catch {
    return [];
  }
}

/** Append a Q&A pair; returns its id (used to rate it later). */
export async function logExchange(scope: Scope, e: { q: string; a: string; userId?: string }): Promise<string> {
  await mkdir(dir(), { recursive: true });
  const rec: Exchange = {
    id: randomUUID().slice(0, 10),
    at: new Date().toISOString(),
    q: e.q.slice(0, 1000),
    a: e.a.slice(0, 2000),
    ...(e.userId ? { userId: e.userId } : {}),
  };
  await appendFile(logPath(scope), JSON.stringify(rec) + "\n", "utf8");
  // trim occasionally
  const all = await readLines<Exchange>(logPath(scope), 5000);
  if (all.length > 1000) {
    await writeFile(logPath(scope), all.slice(-800).map((x) => JSON.stringify(x)).join("\n") + "\n", "utf8");
  }
  return rec.id;
}

export async function rateExchange(scope: Scope, id: string, up: boolean): Promise<void> {
  await mkdir(dir(), { recursive: true });
  await appendFile(ratedPath(scope), JSON.stringify({ id, up, at: new Date().toISOString() }) + "\n", "utf8");
}

/** Best-rated recent Q&A pairs, as few-shot examples for the next prompt. */
export async function topExamples(scope: Scope, n = 3): Promise<{ q: string; a: string }[]> {
  const [log, rated] = await Promise.all([
    readLines<Exchange>(logPath(scope)),
    readLines<{ id: string; up: boolean }>(ratedPath(scope)),
  ]);
  const score = new Map<string, number>();
  for (const r of rated) score.set(r.id, (score.get(r.id) ?? 0) + (r.up ? 1 : -2));
  const byId = new Map(log.map((e) => [e.id, e]));
  return [...score.entries()]
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id]) => byId.get(id))
    .filter((e): e is Exchange => Boolean(e && e.q && e.a))
    .map((e) => ({ q: e.q, a: e.a }));
}

/** Per-user conversation memory (jarvis) built from the fs log — no DB. */
export async function recentHistory(
  scope: Scope,
  userId: string,
  turns = 4,
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const log = await readLines<Exchange>(logPath(scope));
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
    readLines<Exchange>(logPath(scope)),
    readLines<unknown>(ratedPath(scope)),
    topExamples(scope, 50),
  ]);
  return { logged: log.length, rated: rated.length, examples: ex.length };
}
