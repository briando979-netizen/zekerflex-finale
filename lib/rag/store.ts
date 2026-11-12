import { createHash } from "node:crypto";
import type { RagSourceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { estimateTokens } from "@/lib/rag/chunk";

// ---------------------------------------------------------------------------
// Vector store on plain Postgres: embeddings live in a Float[] column and
// similarity is cosine, computed in JS over the candidate set. No pgvector, no
// external vector service. Fine to a few thousand chunks; pgvector + an IVFFlat
// index is the drop-in scale path.
// ---------------------------------------------------------------------------

export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i += 1) {
    const x = a[i] as number;
    const y = b[i] as number;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Postgres text columns reject NUL (0x00); also strip other C0 controls except
// tab and newline so file contents / JSON blobs index cleanly.
const CONTROL_CHARS = new RegExp("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]", "g");
export function sanitizeText(text: string): string {
  return text.replace(CONTROL_CHARS, "");
}

export interface UpsertChunkInput {
  sourceType: RagSourceType;
  sourceRef: string;
  title: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
}

function hashOf(input: UpsertChunkInput): string {
  const key = [
    input.sourceRef,
    String(input.chunkIndex),
    sanitizeText(input.content),
  ].join(" | ");
  return createHash("sha256").update(key).digest("hex");
}

/** Insert or refresh a chunk. Idempotent via contentHash. */
export async function upsertChunk(input: UpsertChunkInput): Promise<void> {
  const content = sanitizeText(input.content);
  const title = sanitizeText(input.title).slice(0, 300);
  const sourceRef = sanitizeText(input.sourceRef).slice(0, 500);
  const contentHash = hashOf(input);

  await prisma.ragChunk.upsert({
    where: { contentHash },
    create: {
      sourceType: input.sourceType,
      sourceRef,
      title,
      chunkIndex: input.chunkIndex,
      content,
      contentHash,
      embedding: input.embedding,
      embedDim: input.embedding.length,
      tokens: estimateTokens(content),
    },
    update: {
      title,
      embedding: input.embedding,
      embedDim: input.embedding.length,
      indexedAt: new Date(),
    },
  });
  leegRagCache();
}

/** Replace every chunk for a source type (or a sourceRef prefix within it). */
export async function replaceSource(
  sourceType: RagSourceType,
  chunks: UpsertChunkInput[],
  opts: { sourceRefPrefix?: string } = {},
): Promise<number> {
  const keepHashes = new Set(chunks.map((c) => hashOf(c)));

  const stale = await prisma.ragChunk.findMany({
    where: {
      sourceType,
      ...(opts.sourceRefPrefix
        ? { sourceRef: { startsWith: opts.sourceRefPrefix } }
        : {}),
    },
    select: { id: true, contentHash: true },
  });
  const drop = stale.filter((s) => !keepHashes.has(s.contentHash)).map((s) => s.id);
  if (drop.length > 0) {
    await prisma.ragChunk.deleteMany({ where: { id: { in: drop } } });
    leegRagCache();
  }

  for (const c of chunks) {
    await upsertChunk(c);
  }
  return chunks.length;
}

export interface SearchHit {
  id: string;
  sourceType: RagSourceType;
  sourceRef: string;
  title: string;
  content: string;
  score: number;
}

export interface SearchOptions {
  limit?: number;
  sourceTypes?: RagSourceType[];
  minScore?: number;
}

// ---------------------------------------------------------------------------
// Kandidaten in het geheugen (12 nov 2026). Gemeten: elke zoekvraag laadde alle ±2.000 stukken mét vector (19 MB) uit
// Postgres, 1,5–2 s per keer, en dat was de "trage databasequery" in het foutenlogboek. Nu één kopie per vectordimensie
// in globalThis (Next bundelt routes apart, AGENTS.md), hooguit 10 minuten oud en meteen leeg na elke schrijfactie in
// dit proces (upsertChunk/replaceSource; de reindex-cron draait in de app zelf). Filter op soort, volgorde (indexedAt
// aflopend) en het maximum (RAG_MAX_CHUNKS) gebeuren daarna in JS, dus de uitkomst is dezelfde als met de query per
// zoekvraag. Boven CACHE_MAX_RIJEN geen cache (geheugen): dan de oude query, en is pgvector de weg.
// ---------------------------------------------------------------------------

const CACHE_MS = 10 * 60 * 1000;
const CACHE_MAX_RIJEN = 20_000;

type Kandidaat = { id: string; sourceType: RagSourceType; sourceRef: string; title: string; content: string; embedding: number[] };
type CacheRegel = { at: number; rijen: Kandidaat[] | null; laden: Promise<Kandidaat[] | null> | null };
const cacheGlobaal = globalThis as typeof globalThis & { __zfRagKandidaten?: Map<number, CacheRegel> };
const cacheMap = (): Map<number, CacheRegel> => (cacheGlobaal.__zfRagKandidaten ??= new Map());

const KANDIDAAT_VELDEN = { id: true, sourceType: true, sourceRef: true, title: true, content: true, embedding: true } as const;

/** Leeg de kandidaten in het geheugen (na een schrijfactie; tests). */
export function leegRagCache(): void {
  cacheMap().clear();
}

/** Alle kandidaten van deze dimensie, nieuwste eerst, uit het geheugen of één keer uit Postgres; null = te veel voor de cache. */
async function kandidatenVoor(dim: number, nu: number): Promise<Kandidaat[] | null> {
  const map = cacheMap();
  const bestaand = map.get(dim);
  if (bestaand?.rijen && nu - bestaand.at < CACHE_MS) return bestaand.rijen;
  if (bestaand?.laden) return bestaand.laden;
  const laden = prisma.ragChunk
    .findMany({ where: { embedDim: dim }, orderBy: { indexedAt: "desc" }, select: KANDIDAAT_VELDEN })
    .then((rijen) => (rijen.length > CACHE_MAX_RIJEN ? null : rijen));
  const regel: CacheRegel = { at: nu, rijen: null, laden };
  map.set(dim, regel);
  try {
    const rijen = await laden;
    // tussendoor geleegd (schrijfactie tijdens het laden)? Dan deze, mogelijk oude, rijen niet bewaren
    if (map.get(dim) === regel) {
      if (rijen) map.set(dim, { at: nu, rijen, laden: null });
      else map.delete(dim);
    }
    return rijen;
  } catch (err) {
    if (map.get(dim) === regel) map.delete(dim);
    throw err;
  }
}

export async function search(
  queryVector: number[],
  opts: SearchOptions = {},
): Promise<SearchHit[]> {
  const limit = Math.max(1, Math.min(opts.limit ?? 6, 25));
  const soorten = opts.sourceTypes && opts.sourceTypes.length > 0 ? new Set(opts.sourceTypes) : null;
  const alle = await kandidatenVoor(queryVector.length, Date.now());
  const rows =
    alle !== null
      ? (soorten ? alle.filter((r) => soorten.has(r.sourceType)) : alle).slice(0, env.RAG_MAX_CHUNKS)
      : await prisma.ragChunk.findMany({
          where: {
            embedDim: queryVector.length,
            ...(soorten ? { sourceType: { in: [...soorten] } } : {}),
          },
          orderBy: { indexedAt: "desc" },
          take: env.RAG_MAX_CHUNKS,
          select: KANDIDAAT_VELDEN,
        });

  const scored = rows
    .map((r) => ({
      id: r.id,
      sourceType: r.sourceType,
      sourceRef: r.sourceRef,
      title: r.title,
      content: r.content,
      score: cosine(queryVector, r.embedding),
    }))
    .filter((h) => h.score >= (opts.minScore ?? 0.15))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  logger.debug("rag search", { candidates: rows.length, returned: scored.length });
  return scored;
}

export async function chunkStats(): Promise<Record<string, number>> {
  const grouped = await prisma.ragChunk.groupBy({
    by: ["sourceType"],
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const g of grouped) out[g.sourceType] = g._count._all;
  return out;
}
