import { kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// AI-node registry — for an AI node WITHOUT a fixed address (the owner's own
// laptop behind a Cloudflare quick tunnel, whose URL changes on every start).
// The node registers its current URL every minute (deploy/ai-node/windows/
// start-ai-node.ps1 → POST /api/internal/ai-node/register, authenticated with
// LLM_API_KEY). lib/ai/client.ts uses it whenever LLM_BASE_URL still points at
// localhost on a serverless deploy. When the heartbeat stops (laptop off),
// the node counts as offline and every AI feature falls back to its rules.
// A real server later: just set LLM_BASE_URL — this registry is then ignored.
// ---------------------------------------------------------------------------

export interface RegisteredNode {
  url: string;
  at: string;
  models: string[];
  name?: string;
}

const KEY = "ai-node:registered";
/** heartbeat every 60 s; three missed beats = offline */
export const NODE_FRESH_MS = 3 * 60_000;
const REFRESH_MS = 20_000;

let cache: { node: RegisteredNode | null; fetchedAt: number } = { node: null, fetchedAt: 0 };

function fresh(n: RegisteredNode | null): n is RegisteredNode {
  return Boolean(n && Date.now() - new Date(n.at).getTime() <= NODE_FRESH_MS);
}

/** The node's URL (without /v1) when it checked in recently — sync, from the instance cache. */
export function registeredNodeUrl(): string | null {
  return fresh(cache.node) ? cache.node.url : null;
}

export function registeredNode(): RegisteredNode | null {
  return cache.node;
}

/** Refresh the instance cache from the database (at most every 20 s unless forced). */
export async function primeNode(force = false): Promise<void> {
  if (!force && Date.now() - cache.fetchedAt < REFRESH_MS) return;
  cache.fetchedAt = Date.now();
  try {
    cache.node = await kvGet<RegisteredNode>(KEY);
  } catch {
    /* keep the last known value */
  }
}

/** Only tunnel hosts we expect — never let a registration point the server at an arbitrary/internal URL. */
export function allowedNodeUrl(raw: string, extraSuffixes: string[] = []): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
    const host = u.hostname.toLowerCase();
    const ok = [".trycloudflare.com", ...extraSuffixes.map((s) => (s.startsWith(".") ? s : `.${s}`))].some((s) => host.endsWith(s));
    return ok ? `https://${host}` : null;
  } catch {
    return null;
  }
}

export async function saveNode(node: RegisteredNode): Promise<void> {
  await kvSet(KEY, node);
  cache = { node, fetchedAt: Date.now() };
}

export function _setNodeCacheForTest(node: RegisteredNode | null): void {
  cache = { node, fetchedAt: node ? Date.now() : 0 };
}
