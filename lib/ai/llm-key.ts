import { env } from "@/lib/env";
import { kvGet, kvSet } from "@/lib/storage/kv";

// De sleutel die ZekerFlex deelt met de laptop-AI-node. Server-side instelbaar
// (Admin → Jarvis) via KV, zodat je 'm NIET meer in Vercel hoeft te plakken +
// redeployen. Valt terug op de env LLM_API_KEY als er niets in KV staat.
const KEY = "ai-node:key";
let cache: { v: string | null; at: number } | null = null;

export async function getLlmApiKey(): Promise<string | null> {
  if (cache && Date.now() - cache.at < 60_000) return cache.v;
  let v: string | null = null;
  try {
    v = (await kvGet<string>(KEY)) ?? null;
  } catch {
    /* KV onbereikbaar → env-fallback */
  }
  const resolved = v ?? env.LLM_API_KEY ?? null;
  cache = { v: resolved, at: Date.now() };
  return resolved;
}

export async function setLlmApiKey(key: string): Promise<void> {
  const k = key.trim() || null;
  await kvSet(KEY, k);
  cache = { v: k ?? env.LLM_API_KEY ?? null, at: Date.now() };
}

/** Of de sleutel in KV is gezet (los van de env-fallback) — voor de admin-UI. */
export async function llmKeyIsCustom(): Promise<boolean> {
  try {
    return Boolean(await kvGet<string>(KEY));
  } catch {
    return false;
  }
}
