import { createHash } from "node:crypto";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { tokenize } from "@/lib/rag/lexical";
import { dot, embedLocal } from "@/lib/rag/vector-local";
import { brainVectorIndex } from "@/lib/rag/recall";
import { canRead, corpus, type Audience } from "@/lib/rag/corpus";

// ---------------------------------------------------------------------------
// CAG brain — Cache-Augmented Generation.
//
// Instead of retrieving for every question, the core knowledge for a role is
// preloaded into the prompt as ONE stable block (the "kennispakket"). Because
// it is byte-identical on every call and sits at the very start of the
// prompt, the model server reuses its KV cache for that prefix (Ollama keeps
// it while the model stays loaded, LLM_KEEP_ALIVE) — the pack costs its
// tokens once, not per question. Retrieval (RAG) still adds the long tail.
//
// Second cache: answers. A knowledge question that means the same as one
// answered before (brain-vector cosine ≥ CACHE_MIN_SIM, same role, same
// knowledge version) gets the stored answer instantly. NEVER used for
// questions that needed the user's own data — those are personal and live.
// ---------------------------------------------------------------------------

/** ~3k tokens: fits next to the conversation in an 8k context. */
export const PACK_MAX_CHARS = 12_000;
export const CACHE_MIN_SIM = 0.9;
const CACHE_MAX = 300;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface KnowledgePack {
  role: Audience;
  version: string;
  text: string;
  passages: number;
}

// what goes into the pack, most important first
const PACK_PRIORITY = ["Hulp in de app", "FAQ", "Helpcentrum werkgevers", "Wet DBA-kenniscentrum"];

const packs = new Map<Audience, KnowledgePack>();

export function knowledgePack(role: Audience): KnowledgePack {
  const cached = packs.get(role);
  if (cached) return cached;
  const all = corpus().filter((p) => canRead(p, role));
  const pri = (src: string) => {
    const i = PACK_PRIORITY.findIndex((s) => src.startsWith(s));
    return i < 0 ? 99 : i;
  };
  // own-role how-tos before public ones; stable order = stable prefix = cache hits
  const ordered = all
    .filter((p) => pri(p.source) < 99)
    .sort((a, b) => pri(a.source) - pri(b.source) || Number(b.audience.includes(role)) - Number(a.audience.includes(role)) || a.id.localeCompare(b.id));
  let text = "";
  let n = 0;
  for (const p of ordered) {
    const line = `• ${p.title} — ${p.text.replace(/\s+/g, " ").trim()}\n`;
    if (text.length + line.length > PACK_MAX_CHARS) continue;
    text += line;
    n++;
  }
  const version = createHash("sha256").update(text).digest("hex").slice(0, 10);
  const pack = { role, version, text: text.trim(), passages: n };
  packs.set(role, pack);
  return pack;
}

/** The pack as the first system message — keep it byte-stable (no dates, no names). */
export function packMessage(role: Audience): { role: "system"; content: string } {
  const p = knowledgePack(role);
  return { role: "system", content: `KENNISPAKKET ZekerFlex (v${p.version}) — vaste kennis, gebruik dit als bron:\n${p.text}` };
}

/* ───────────────────────────── answer cache ───────────────────────────── */

interface CacheEntry {
  q: string;
  a: string;
  at: string;
  version: string;
  sources: { title: string; source: string; href?: string }[];
  hits: number;
}

const cacheKey = (role: Audience) => `cag-cache:${role}`;

function normalise(q: string): string {
  return tokenize(q).join(" ");
}

export async function cacheLookup(role: Audience, question: string): Promise<(CacheEntry & { similarity: number }) | null> {
  const entries = (await kvGet<CacheEntry[]>(cacheKey(role)).catch(() => null)) ?? [];
  if (!entries.length) return null;
  const version = knowledgePack(role).version;
  const idx = brainVectorIndex();
  const qv = embedLocal(idx, normalise(question));
  let best: (CacheEntry & { similarity: number }) | null = null;
  const now = Date.now();
  for (const e of entries) {
    if (e.version !== version || now - new Date(e.at).getTime() > CACHE_TTL_MS) continue;
    const sim = dot(qv, embedLocal(idx, normalise(e.q)));
    if (sim >= CACHE_MIN_SIM && (!best || sim > best.similarity)) best = { ...e, similarity: sim };
  }
  if (best) {
    // count the hit (best effort)
    const updated = entries.map((e) => (e.q === best!.q ? { ...e, hits: e.hits + 1 } : e));
    await kvSet(cacheKey(role), updated).catch(() => undefined);
  }
  return best;
}

export async function cacheStore(role: Audience, question: string, answer: string, sources: CacheEntry["sources"]): Promise<void> {
  const entries = (await kvGet<CacheEntry[]>(cacheKey(role)).catch(() => null)) ?? [];
  const norm = normalise(question);
  const next = entries.filter((e) => normalise(e.q) !== norm);
  next.push({ q: question.slice(0, 500), a: answer.slice(0, 2000), at: new Date().toISOString(), version: knowledgePack(role).version, sources, hits: 0 });
  await kvSet(cacheKey(role), next.slice(-CACHE_MAX)).catch(() => undefined);
}

export async function cacheStats(): Promise<Record<string, { entries: number; hits: number }>> {
  const out: Record<string, { entries: number; hits: number }> = {};
  for (const role of ["public", "werknemer", "opdrachtgever", "admin"] as Audience[]) {
    const e = (await kvGet<CacheEntry[]>(cacheKey(role)).catch(() => null)) ?? [];
    out[role] = { entries: e.length, hits: e.reduce((a, b) => a + b.hits, 0) };
  }
  return out;
}

export async function cacheClear(): Promise<void> {
  for (const role of ["public", "werknemer", "opdrachtgever", "admin"] as Audience[]) await kvSet(cacheKey(role), []).catch(() => undefined);
}
