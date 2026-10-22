import type { RagSourceType } from "@prisma/client";
import { logger } from "@/lib/logger";
import { chat, llmConfigProblem } from "@/lib/ai/client";
import { isRagEnabled } from "@/lib/rag/embed";
import type { SearchHit } from "@/lib/rag/store";
import { advancedRecall } from "@/lib/rag/advanced";

// ---------------------------------------------------------------------------
// Retrieval-augmented answers over the local total-memory index. Used by the
// orchestrator, the /api/admin/rag/ask endpoint, and available to any agent.
// ---------------------------------------------------------------------------

export { isRagEnabled };

export interface RetrieveOptions {
  limit?: number;
  sourceTypes?: RagSourceType[];
  minScore?: number;
}

export interface RetrievedContext {
  context: string;
  hits: SearchHit[];
}

/**
 * Hybrid retrieval for every internal consumer (Jarvis, orchestrator, Hermes,
 * admin RAG search/ask): BM25 + brain vector over the knowledge corpus and the
 * embedding-model vectors over the RagChunk index, fused with Reciprocal Rank
 * Fusion (lib/rag/recall.ts). Works without an embedding model — the corpus
 * lists still answer; code/audit/sales memory needs the model.
 */
export async function retrieveContext(
  query: string,
  opts: RetrieveOptions = {},
): Promise<RetrievedContext> {
  try {
    const wantsCorpus = !opts.sourceTypes || opts.sourceTypes.length === 0 || opts.sourceTypes.includes("LEGAL");
    const rec = await advancedRecall(query, {
      useModel: false,
      role: "admin",
      k: opts.limit ?? 6,
      corpus: wantsCorpus,
      ...(opts.sourceTypes && opts.sourceTypes.length > 0 ? { sourceTypes: opts.sourceTypes } : {}),
      ...(opts.minScore !== undefined ? { minScore: opts.minScore } : {}),
    });
    const hits: SearchHit[] = rec.hits.map((h) => ({
      id: h.id,
      sourceType: h.sourceType ?? "LEGAL",
      sourceRef: h.sourceRef ?? `corpus:${h.id}`,
      title: h.title,
      content: h.text,
      score: h.score,
    }));
    const context = hits
      .map((h, i) => `[${i + 1}] (${h.sourceType} · ${h.sourceRef} · via ${rec.hits[i]!.via.join("+")})\n${h.content}`)
      .join("\n\n---\n\n");
    return { context, hits };
  } catch (err) {
    logger.warn("rag retrieve failed", { error: (err as Error).message });
    return { context: "", hits: [] };
  }
}

export interface MemoryAnswer {
  answer: string;
  sources: Array<{
    sourceType: RagSourceType;
    sourceRef: string;
    title: string;
    score: number;
  }>;
}

const ASK_SYSTEM = `Je bent het geheugen van het ZekerFlex-platform. Beantwoord de vraag UITSLUITEND
op basis van de gegeven context-fragmenten. Citeer de bronnen met [nummer].
Als het antwoord niet in de context staat, zeg dat expliciet. Antwoord in het Nederlands.`;

export async function askWithMemory(
  question: string,
  opts: RetrieveOptions = {},
): Promise<MemoryAnswer> {
  const { context, hits } = await retrieveContext(question, {
    limit: opts.limit ?? 8,
    ...opts,
  });

  if (hits.length === 0) {
    return {
      answer: "Ik vond hierover niets in het geheugen.",
      sources: [],
    };
  }

  if (llmConfigProblem()) {
    // no model: the fused passages themselves are the answer
    return {
      answer: hits.slice(0, 3).map((h, i) => `[${i + 1}] ${h.title}\n${h.content.slice(0, 600)}`).join("\n\n"),
      sources: hits.map((h) => ({ sourceType: h.sourceType, sourceRef: h.sourceRef, title: h.title, score: h.score })),
    };
  }

  const { text } = await chat({
    purpose: "rag-ask",
    messages: [
      { role: "system", content: ASK_SYSTEM },
      { role: "user", content: `VRAAG: ${question}\n\nCONTEXT:\n${context}` },
    ],
    temperature: 0.1,
    maxTokens: 700,
  });

  return {
    answer: text.trim(),
    sources: hits.map((h) => ({
      sourceType: h.sourceType,
      sourceRef: h.sourceRef,
      title: h.title,
      score: h.score,
    })),
  };
}
