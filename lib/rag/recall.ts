import type { RagSourceType } from "@prisma/client";
import { logger } from "@/lib/logger";
import { embedOne, isRagEnabled } from "@/lib/rag/embed";
import { search } from "@/lib/rag/store";
import { bm25, buildIndex, type LexIndex } from "@/lib/rag/lexical";
import { buildVectorIndex, embedLocal, nearest, type VectorIndex } from "@/lib/rag/vector-local";
import { reciprocalRankFusion, type RankedList } from "@/lib/rag/fusion";
import { canRead, corpus, type Audience, type Passage } from "@/lib/rag/corpus";

// ---------------------------------------------------------------------------
// RAG brain — hybrid recall, three retrievers fused with Reciprocal Rank Fusion:
//   1. "lexical" — BM25 keyword search over the corpus          (always)
//   2. "brein"   — brain vector: hashed n-gram vectors, in-process (always)
//   3. "model"   — embedding-model vectors from the RagChunk index (when
//                  LLM_EMBED_MODEL is set; admin also gets code/audit/sales)
// Every hit is filtered on audience BEFORE it can reach a prompt: a worker
// or visitor only ever sees public + own-role passages; only admin gets the
// internal docs and the code/audit/sales memory.
// ---------------------------------------------------------------------------

export type Retriever = "lexical" | "brein" | "model";

export interface RecallHit extends Passage {
  score: number;
  via: Retriever[];
  /** set for hits from the RagChunk index (model vectors) */
  sourceType?: RagSourceType;
  sourceRef?: string;
}

export interface RecallOptions {
  role: Audience;
  k?: number;
  /** model-vector list: restrict to these RagChunk source types (admin) */
  sourceTypes?: RagSourceType[];
  /** include the knowledge corpus lists (BM25 + brain vector); default true */
  corpus?: boolean;
  /** model-vector minimum cosine */
  minScore?: number;
}

export interface Recall {
  hits: RecallHit[];
  retrievers: Retriever[];
  /** best raw BM25 score */
  lexicalTop: number;
  /** true when the top answer is trustworthy on its own (no model needed to judge it) */
  confident: boolean;
}

/** BM25 score + share of question words above which the top passage is trusted on its own. */
export const MIN_CONFIDENT_LEXICAL = 5;
export const MIN_COVERAGE = 0.6;
/** brain-vector cosine above which a hit is trusted even when BM25 misses it (typos) */
export const MIN_CONFIDENT_VECTOR = 0.42;

let lexIndex: LexIndex<Passage> | null = null;
let vecIndex: VectorIndex | null = null;
let byId: Map<string, Passage> | null = null;

function lex(): LexIndex<Passage> {
  if (!lexIndex) lexIndex = buildIndex(corpus());
  return lexIndex;
}
function vec(): VectorIndex {
  if (!vecIndex) vecIndex = buildVectorIndex(corpus().map((p) => `${p.title}\n${p.title}\n${p.text}`));
  return vecIndex;
}
function passage(id: string): Passage | undefined {
  if (!byId) byId = new Map(corpus().map((p) => [p.id, p]));
  return byId.get(id);
}

const MODEL_TIMEOUT_MS = 4_000;

type ModelPassage = Passage & { sourceType?: RagSourceType; sourceRef?: string };

async function modelHits(query: string, role: Audience, limit: number, only?: RagSourceType[], minScore = 0.3): Promise<ModelPassage[]> {
  if (!isRagEnabled()) return [];
  const run = async () => {
    const v = await embedOne(query);
    const sourceTypes: RagSourceType[] | undefined = role === "admin" ? only : ["LEGAL"];
    return search(v, { limit, minScore, ...(sourceTypes ? { sourceTypes } : {}) });
  };
  try {
    const hits = await Promise.race([run(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("embed timeout")), MODEL_TIMEOUT_MS))]);
    const out: ModelPassage[] = [];
    for (const h of hits) {
      if (h.sourceRef.startsWith("corpus:")) {
        const p = passage(h.sourceRef.slice("corpus:".length));
        if (p && canRead(p, role)) out.push({ ...p, sourceType: h.sourceType, sourceRef: h.sourceRef });
      } else if (role === "admin") {
        // code / audit / sales / platform memory — admin only
        out.push({ id: `chunk:${h.id}`, title: h.title, text: h.content, source: `Geheugen · ${h.sourceType} · ${h.sourceRef}`, audience: ["admin"], sourceType: h.sourceType, sourceRef: h.sourceRef });
      }
    }
    return out;
  } catch (err) {
    logger.warn("rag model-vector recall failed — lexical + brain vector only", { error: (err as Error).message });
    return [];
  }
}

export async function recall(query: string, opts: RecallOptions): Promise<Recall> {
  const k = opts.k ?? 5;
  const docs = corpus();
  const allowed = (p: Passage) => canRead(p, opts.role);
  const useCorpus = opts.corpus ?? true;

  const lexHits = useCorpus ? bm25(lex(), query, k * 3, allowed) : [];
  const vIdx = vec();
  const vecHits = useCorpus ? nearest(vIdx, embedLocal(vIdx, query), k * 3, (i) => allowed(docs[i]!)) : [];
  const model = await modelHits(query, opts.role, k * 3, opts.sourceTypes, opts.minScore);

  const lists: RankedList<ModelPassage>[] = [];
  if (useCorpus) {
    lists.push({ name: "lexical", items: lexHits.map((h) => h.doc) }, { name: "brein", items: vecHits.map((h) => docs[h.i]!) });
  }
  if (model.length) lists.push({ name: "model", items: model, weight: 1.2 });

  const fused = reciprocalRankFusion(lists, (p) => p.id);
  const hits: RecallHit[] = fused.slice(0, k).map((f) => ({ ...f.item, score: f.score, via: f.via as Retriever[] }));

  const topLex = lexHits[0];
  const topVec = vecHits[0];
  const lexConfident = Boolean(topLex && topLex.score >= MIN_CONFIDENT_LEXICAL && topLex.coverage >= MIN_COVERAGE);
  const vecConfident = Boolean(topVec && topVec.score >= MIN_CONFIDENT_VECTOR);
  // trust the fused #1 when a strong retriever agrees with it
  const top = hits[0];
  const confident = Boolean(
    top && ((lexConfident && top.id === topLex!.doc.id) || (vecConfident && top.id === docs[topVec!.i]!.id) || (lexConfident && vecConfident)),
  );

  return {
    hits,
    retrievers: lists.map((l) => l.name as Retriever),
    lexicalTop: topLex?.score ?? 0,
    confident,
  };
}

/** Numbered context block for a prompt, with the sources the answer may cite. */
export function contextBlock(hits: RecallHit[], maxChars = 4500): string {
  let out = "";
  hits.forEach((h, i) => {
    const part = `[${i + 1}] ${h.title} (${h.source})\n${h.text}\n\n`;
    if (out.length + part.length <= maxChars) out += part;
  });
  return out.trim();
}
