// Welk model noemt de gezondheidscontrole (llmHealth in lib/ai/client.ts) als "ai=" in de status van de beheer-AI en op het
// beheerscherm? Het verwachte model als de AI-server het heeft; anders het eerste dat kan praten, nooit een embedding-model
// (15 nov 2026: met "alles gratis" stond LLM_MODEL (Gemini) niet in de lijst van de eigen server en zei de status
// "ai=granite-embedding:278m"). Puur: los te testen.

/** Gemini's OpenAI-compatibele lijst zegt "models/gemini-…" voor het model dat je als "gemini-…" instelt. */
export const kaalModel = (m: string): string => m.replace(/^models\//, "");

const isEmbedding = (m: string): boolean => /embed/i.test(m);

export function gezondModelUit(served: readonly string[] | undefined, verwacht: string): string {
  const lijst = served ?? [];
  const gekozen = lijst.find((m) => kaalModel(m) === verwacht) ?? lijst.find((m) => !isEmbedding(m)) ?? lijst[0] ?? verwacht;
  return kaalModel(gekozen);
}
