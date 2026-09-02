import type { RagSourceType } from "@prisma/client";
import { logger } from "@/lib/logger";
import { chat } from "@/lib/ai/client";
import { embedOne, isRagEnabled } from "@/lib/rag/embed";
import { search, type SearchHit } from "@/lib/rag/store";

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

export async function retrieveContext(
  query: string,
  opts: RetrieveOptions = {},
): Promise<RetrievedContext> {
  if (!isRagEnabled()) return { context: "", hits: [] };
  try {
    const vec = await embedOne(query);
    const hits = await search(vec, {
      limit: opts.limit ?? 6,
      ...(opts.sourceTypes ? { sourceTypes: opts.sourceTypes } : {}),
      ...(opts.minScore !== undefined ? { minScore: opts.minScore } : {}),
    });
    const context = hits
      .map(
        (h, i) =>
          `[${i + 1}] (${h.sourceType} · ${h.sourceRef} · score ${h.score.toFixed(2)})\n${h.content}`,
      )
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
      answer: isRagEnabled()
        ? "Ik vond hierover niets in het geheugen."
        : "Het geheugen (RAG) is niet geconfigureerd — stel LLM_EMBED_MODEL in en herbouw de index.",
      sources: [],
    };
  }

  const { text } = await chat({
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
