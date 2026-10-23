import { createHash } from "node:crypto";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Feature flags / remote config.
//
// Flip features on or off, or roll them out to a percentage of users, WITHOUT a
// redeploy — stored in the KeyValueStore, read with a short in-memory cache.
// Evaluation per user is deterministic (a user stays in or out of a rollout),
// supports an allowlist (userIds/roles) for early access, and falls back to a
// code-defined default so a flag that was never configured still behaves.
// ---------------------------------------------------------------------------

export interface FlagDef {
  key: string;
  label: string;
  description: string;
  /** behaviour when nothing is configured in the store */
  default: boolean;
}

// Known flags (for the admin UI + safe defaults). Evaluation also works for any
// ad-hoc key, but listing it here documents it and gives it a default.
export const FLAG_REGISTRY: FlagDef[] = [
  { key: "brein-assistent", label: "ZekerFlex-assistent (brein)", description: "De AI-assistent in de chat en op /dashboard|/werkgever/assistent.", default: true },
  { key: "autopilot", label: "Autopilot", description: "Laat de autopilot-acties draaien (naast de eigen aan/uit in Admin → Autopilot).", default: true },
  { key: "uren-auto-goedkeuren", label: "Uren automatisch goedkeuren aanbieden", description: "Toon opdrachtgevers de optie om uren automatisch te laten goedkeuren.", default: true },
  { key: "qr-betalen", label: "QR-betalen", description: "QR-betaallink op facturen.", default: true },
  { key: "shop", label: "Webshop", description: "De klus-gear webshop.", default: true },
  { key: "ai-vertalen", label: "AI-vertalen in chat", description: "Herschrijven/vertalen-knop in de chat.", default: true },
];

export interface FlagOverride {
  /** master switch; undefined = use the registry default */
  enabled?: boolean | undefined;
  /** 0–100: deterministic percentage rollout (needs a userId) */
  rolloutPct?: number | undefined;
  /** always-on for these roles (early access, even while enabled=false) */
  roles?: string[] | undefined;
  /** always-on for these user ids */
  userIds?: string[] | undefined;
  note?: string | undefined;
  updatedAt: string;
  updatedBy: string;
}

export type FlagStore = Record<string, FlagOverride>;

export interface FlagContext {
  userId?: string | null;
  roles?: string[];
}

const KEY = "feature-flags";
const CACHE_MS = 30_000;
let cache: { store: FlagStore; at: number } = { store: {}, at: 0 };

async function loadStore(force = false): Promise<FlagStore> {
  if (!force && Date.now() - cache.at < CACHE_MS) return cache.store;
  try {
    const store = (await kvGet<FlagStore>(KEY)) ?? {};
    cache = { store, at: Date.now() };
  } catch (err) {
    logger.warn("feature flags load failed — using defaults", { error: (err as Error).message });
  }
  return cache.store;
}

function defaultFor(key: string): boolean {
  return FLAG_REGISTRY.find((f) => f.key === key)?.default ?? false;
}

/** 0–99 bucket, stable per (flag, user). */
function bucket(key: string, userId: string): number {
  const h = createHash("sha256").update(`${key}:${userId}`).digest();
  return h.readUInt32BE(0) % 100;
}

export function evaluate(key: string, override: FlagOverride | undefined, ctx: FlagContext): boolean {
  if (!override) return defaultFor(key);
  if (ctx.userId && override.userIds?.includes(ctx.userId)) return true;
  if (ctx.roles && override.roles?.some((r) => ctx.roles!.includes(r))) return true;
  if (override.enabled === false) return false;
  if (typeof override.rolloutPct === "number") {
    if (!ctx.userId) return override.rolloutPct >= 100 || override.enabled === true;
    return bucket(key, ctx.userId) < override.rolloutPct;
  }
  if (override.enabled === true) return true;
  return defaultFor(key);
}

/** Is a feature on for this caller? Never throws — on any error it uses the default. */
export async function featureEnabled(key: string, ctx: FlagContext = {}): Promise<boolean> {
  try {
    const store = await loadStore();
    return evaluate(key, store[key], ctx);
  } catch {
    return defaultFor(key);
  }
}

/** Every known (and configured) flag resolved for this caller — for /api/me/flags. */
export async function flagsFor(ctx: FlagContext): Promise<Record<string, boolean>> {
  const store = await loadStore();
  const keys = new Set([...FLAG_REGISTRY.map((f) => f.key), ...Object.keys(store)]);
  const out: Record<string, boolean> = {};
  for (const key of keys) out[key] = evaluate(key, store[key], ctx);
  return out;
}

export interface FlagAdminRow extends FlagDef {
  override: FlagOverride | null;
  effectiveDefault: boolean;
}

/** For the admin UI: registry + stored overrides + any ad-hoc stored keys. */
export async function adminFlags(): Promise<FlagAdminRow[]> {
  const store = await loadStore(true);
  const rows: FlagAdminRow[] = FLAG_REGISTRY.map((f) => ({ ...f, override: store[f.key] ?? null, effectiveDefault: f.default }));
  for (const [key, override] of Object.entries(store)) {
    if (!FLAG_REGISTRY.some((f) => f.key === key)) {
      rows.push({ key, label: key, description: "Ad-hoc flag (niet in de registry).", default: false, override, effectiveDefault: false });
    }
  }
  return rows;
}

export async function setFlag(key: string, patch: Omit<FlagOverride, "updatedAt" | "updatedBy">, by: string): Promise<void> {
  const store = await loadStore(true);
  store[key] = { ...patch, updatedAt: new Date().toISOString(), updatedBy: by };
  await kvSet(KEY, store);
  cache = { store, at: Date.now() };
}

export async function deleteFlag(key: string): Promise<void> {
  const store = await loadStore(true);
  delete store[key];
  await kvSet(KEY, store);
  cache = { store, at: Date.now() };
}

export function _resetFlagCacheForTest(): void {
  cache = { store: {}, at: 0 };
}
