import { env } from "@/lib/env";
import { kvGet, kvSet } from "@/lib/storage/kv";

// Welke modellen de lokale AI-node PER ROL gebruikt — server-side instelbaar via
// Admin → Jarvis (KV), zonder redeploy en token-vrij. Eén JSON-map rol→model in
// `ai-node:fleet`. Een lege rol = terugval op env/hoofdmodel (zie lib/ai/models.ts),
// zodat "slim schakelen" meteen werkt: ken het snelle model aan `fast` toe en het
// grote model aan `reasoning`/`main`.
//
// lib/ai/models.ts is synchroon; daarom een sync-leesbare cache die vóór elke
// LLM-call wordt geprimed via primeMainModel() (aangeroepen door de client).
const KEY = "ai-node:fleet";
const TTL_MS = 60_000;

type Fleet = Record<string, string>;
let cache: { v: Fleet; at: number } = { v: {}, at: 0 };

/** Sync: de override voor een rol, of null (→ models.ts pakt env/hoofdmodel). */
export function getRoleOverrideCached(role: string): string | null {
  const v = cache.v[role];
  return v && v.trim() ? v : null;
}
export function getMainModelOverrideCached(): string | null {
  return getRoleOverrideCached("main");
}
/** De effectieve hoofdmodel-naam nu (override of env-fallback). */
export function effectiveMainModel(): string {
  return getRoleOverrideCached("main") ?? env.LLM_MODEL;
}

/** Async: ververs de cache uit KV (goedkoop, 60s TTL). Veilig om vaak te doen. */
export async function primeMainModel(): Promise<void> {
  if (cache.at > 0 && Date.now() - cache.at < TTL_MS) return;
  try {
    const v = (await kvGet<Fleet>(KEY)) ?? {};
    cache = { v: v && typeof v === "object" ? v : {}, at: Date.now() };
  } catch {
    cache = { v: cache.v, at: Date.now() }; // KV onbereikbaar → laatste waarde houden
  }
}

/** Async read voor routes/UI (primed eerst). */
export async function getFleet(): Promise<Fleet> {
  await primeMainModel();
  return { ...cache.v };
}
export async function getMainModelOverride(): Promise<string | null> {
  await primeMainModel();
  return getRoleOverrideCached("main");
}

async function writeFleet(next: Fleet): Promise<void> {
  await kvSet(KEY, next);
  cache = { v: next, at: Date.now() };
}

/** Kies (of wis, met lege string) het model voor één rol. */
export async function setFleetRole(role: string, model: string): Promise<void> {
  await primeMainModel();
  const next: Fleet = { ...cache.v };
  const m = model && model.trim() ? model.trim() : "";
  if (m) next[role] = m;
  else delete next[role];
  await writeFleet(next);
}

/** Back-compat: zet alleen het hoofdmodel. */
export async function setMainModelOverride(model: string | null): Promise<void> {
  await setFleetRole("main", model ?? "");
}
