import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { embed as llmEmbed } from "@/lib/ai/client";

// Embedding helpers for the local RAG index. Wraps the self-hosted embedding
// model (LLM_EMBED_MODEL) exposed by lib/ai/client.ts - no external service.

export function isRagEnabled(): boolean {
  return env.RAG_ENABLED && Boolean(env.LLM_EMBED_MODEL);
}

export function assertRagEnabled(): void {
  if (!env.RAG_ENABLED) throw AppError.upstream("RAG is uitgeschakeld (RAG_ENABLED)");
  if (!env.LLM_EMBED_MODEL) {
    throw AppError.upstream("Geen embedding-model geconfigureerd (LLM_EMBED_MODEL)");
  }
}

export async function embedOne(text: string): Promise<number[]> {
  assertRagEnabled();
  const [vec] = await llmEmbed(text.slice(0, 8000));
  if (!vec || vec.length === 0) {
    throw AppError.upstream("Embedding-model gaf een lege vector terug");
  }
  return vec;
}

export async function embedMany(texts: string[]): Promise<number[][]> {
  assertRagEnabled();
  if (texts.length === 0) return [];
  return llmEmbed(texts.map((t) => t.slice(0, 8000)));
}
