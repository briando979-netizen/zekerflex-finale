import { chatJson } from "@/lib/ai/client";
import { retrieveContext } from "@/lib/rag/query";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Hermes Agent
//
// Hermes is a fast reasoning agent that:
//   1. Receives a natural language task or question
//   2. Retrieves relevant context from the RAG index (vault + platform docs)
//   3. Reasons over it using a chain-of-thought step
//   4. Returns a structured response: answer + proposed actions + confidence
//
// Named after the Greek messenger god — fast, precise, carries information
// between systems. Used for internal orchestration queries, admin console
// reasoning, and any task that needs "think first, then act."
// ---------------------------------------------------------------------------

export interface HermesInput {
  task: string;
  context?: string | undefined;
  userId?: string | undefined;
  maxActions?: number | undefined;
}

export interface HermesAction {
  type: "query" | "mutation" | "notify" | "research" | "none";
  description: string;
  payload?: Record<string, unknown>;
  confidence: number; // 0-1
}

export interface HermesResponse {
  reasoning: string;
  answer: string;
  actions: HermesAction[];
  confidence: number;
  ragChunksUsed: number;
  durationMs: number;
}

const SYSTEM_MSG = `Je bent Hermes, een snelle redeneer-agent voor ZekerFlex.
Je krijgt een taak en relevante context. Redeneer stap voor stap, geef een antwoord, en stel concrete acties voor.

Antwoord uitsluitend als JSON:
{
  "reasoning": string (redeneer stap voor stap, max 200 woorden, NL),
  "answer": string (het directe antwoord, max 100 woorden, NL),
  "actions": [{"type":"query"|"mutation"|"notify"|"research"|"none","description":string,"confidence":number}],
  "confidence": number (0-1, jouw zekerheid over het antwoord)
}

Regels:
- Geen em-dashes
- Acties moeten concreet en uitvoerbaar zijn
- Als je het niet zeker weet, zeg het en geef confidence < 0.5
- Max ${3} acties`;

export async function runHermes(input: HermesInput): Promise<HermesResponse> {
  const start = Date.now();
  let ragChunksUsed = 0;

  // Retrieve relevant context from RAG
  let ragContext = input.context ?? "";
  try {
    const retrieved = await retrieveContext(input.task, { limit: 5, minScore: 0.3 });
    if (retrieved.hits.length > 0) {
      ragContext = [ragContext, "--- Relevante context ---", retrieved.context].filter(Boolean).join("\n\n");
      ragChunksUsed = retrieved.hits.length;
    }
  } catch {
    // RAG not available — proceed without it
  }

  const userMsg = ragContext
    ? `Taak: ${input.task}\n\nContext:\n${ragContext.slice(0, 6000)}`
    : `Taak: ${input.task}`;

  try {
    const result = await chatJson<{
      reasoning: string;
      answer: string;
      actions: HermesAction[];
      confidence: number;
    }>({
      messages: [
        { role: "system", content: SYSTEM_MSG },
        { role: "user", content: userMsg },
      ],
      maxTokens: 800,
      purpose: "hermes",
    });

    logger.debug("hermes: klaar", { confidence: result.confidence, actions: result.actions.length, ragChunksUsed, durationMs: Date.now() - start });

    return {
      reasoning: result.reasoning ?? "",
      answer: result.answer ?? "",
      actions: (result.actions ?? []).slice(0, input.maxActions ?? 3),
      confidence: result.confidence ?? 0,
      ragChunksUsed,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    logger.error("hermes: fout", { err: String(err) });
    return {
      reasoning: "Redenering mislukt.",
      answer: "Kan deze taak nu niet verwerken.",
      actions: [],
      confidence: 0,
      ragChunksUsed,
      durationMs: Date.now() - start,
    };
  }
}
