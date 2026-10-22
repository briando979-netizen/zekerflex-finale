import { chat, llmConfigProblem } from "@/lib/ai/client";
import { nearest, embedLocal } from "@/lib/rag/vector-local";
import { brainVectorIndex } from "@/lib/rag/recall";
import { canRead, corpus, type Audience, type Passage } from "@/lib/rag/corpus";

// ---------------------------------------------------------------------------
// Naive RAG — the textbook baseline: dense retrieval (top-k by cosine) →
// stuff the passages into the prompt → generate. No hybrid, no rerank, no
// query rewriting. Kept on purpose as the yardstick in the RAG-lab, so the
// owner can see what the advanced/agentic pipeline adds.
// ---------------------------------------------------------------------------

export interface NaiveResult {
  hits: (Passage & { score: number })[];
  answer: string;
  mode: "model" | "rules";
}

export function denseRetrieve(query: string, role: Audience, k = 4): (Passage & { score: number })[] {
  const docs = corpus();
  const idx = brainVectorIndex();
  return nearest(idx, embedLocal(idx, query), k, (i) => canRead(docs[i]!, role)).map((h) => ({ ...docs[h.i]!, score: h.score }));
}

export async function naiveRag(question: string, role: Audience, k = 4): Promise<NaiveResult> {
  const hits = denseRetrieve(question, role, k);
  if (!hits.length) return { hits, answer: "Niets gevonden.", mode: "rules" };
  if (llmConfigProblem()) return { hits, answer: hits[0]!.text, mode: "rules" };
  try {
    const res = await chat({
      purpose: "rag-naive",
      temperature: 0.1,
      maxTokens: 300,
      retry: false,
      timeoutMs: 20_000,
      messages: [
        { role: "system", content: "Beantwoord de vraag met de context. Antwoord kort in het Nederlands." },
        { role: "user", content: `CONTEXT:\n${hits.map((h, i) => `[${i + 1}] ${h.title}\n${h.text}`).join("\n\n")}\n\nVRAAG: ${question}` },
      ],
    });
    return { hits, answer: res.text.trim() || hits[0]!.text, mode: "model" };
  } catch {
    return { hits, answer: hits[0]!.text, mode: "rules" };
  }
}
