import { env } from "@/lib/env";
import { kvGet, kvSet } from "@/lib/storage/kv";

// Welk HOOFDmodel de lokale AI-node gebruikt — server-side instelbaar via
// Admin → Jarvis (KV), zodat je het grootste/slimste model dat je node draait
// kunt kiezen ZONDER redeploy en ZONDER tokenkosten. Valt terug op env.LLM_MODEL
// als er niets in KV staat.
//
// lib/ai/models.ts is synchroon; daarom houden we een sync-leesbare cache aan
// die vóór elke LLM-call wordt ververst via primeMainModel() (aangeroepen door
// de client), i.p.v. elke aanroeper async te maken.
const KEY = "ai-node:model";
const TTL_MS = 60_000;

let cache: { v: string | null; at: number } = { v: null, at: 0 };

/** Sync: de override als die geprimed is, anders null (→ models.ts pakt env.LLM_MODEL). */
export function getMainModelOverrideCached(): string | null {
  return cache.v;
}

/** De effectieve hoofdmodel-naam nu (override of env-fallback). */
export function effectiveMainModel(): string {
  return cache.v ?? env.LLM_MODEL;
}

/** Async: ververs de cache uit KV (goedkoop, 60s TTL). Veilig om vaak te doen. */
export async function primeMainModel(): Promise<void> {
  if (cache.at > 0 && Date.now() - cache.at < TTL_MS) return;
  try {
    const v = (await kvGet<string>(KEY)) ?? null;
    cache = { v: v && v.trim() ? v.trim() : null, at: Date.now() };
  } catch {
    cache = { v: cache.v, at: Date.now() }; // KV onbereikbaar → laatste waarde houden
  }
}

/** Async read voor routes/UI (primed eerst). */
export async function getMainModelOverride(): Promise<string | null> {
  await primeMainModel();
  return cache.v;
}

/** Kies het hoofdmodel (lege string = terug naar env-default). */
export async function setMainModelOverride(model: string | null): Promise<void> {
  const m = model && model.trim() ? model.trim() : null;
  await kvSet(KEY, m);
  cache = { v: m, at: Date.now() };
}
