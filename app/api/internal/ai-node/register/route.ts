import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { allowedNodeUrl, registeredNode, primeNode, saveNode } from "@/lib/ai/node-registry";
import { getLlmApiKey } from "@/lib/ai/llm-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/internal/ai-node/register — heartbeat of an AI node without a
// fixed address (deploy/ai-node/windows/start-ai-node.ps1, every 60 s).
//   Authorization: Bearer <LLM_API_KEY>   body: { url, models?, name? }
// The URL must be an https Cloudflare tunnel host, and before it is accepted
// we call it back with the same key — so only a node that really serves our
// model behind our key can become the live AI.
// GET (same auth) — what is registered right now.
// ---------------------------------------------------------------------------

function authorized(request: Request, key: string | null): boolean {
  if (!key) return false;
  const h = request.headers.get("authorization") ?? "";
  const given = h.startsWith("Bearer ") ? h.slice(7) : "";
  const a = Buffer.from(given);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

const schema = z.object({
  url: z.string().max(300),
  models: z.array(z.string().max(100)).max(40).optional(),
  name: z.string().max(60).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const key = await getLlmApiKey();
  if (!authorized(request, key)) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: key ? "Verkeerde sleutel" : "AI-sleutel is nog niet ingesteld (Admin → Jarvis, of env LLM_API_KEY)" } }, { status: 401 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION", message: "url ontbreekt" } }, { status: 400 });
  const url = allowedNodeUrl(parsed.data.url, (process.env.LLM_NODE_HOST_SUFFIXES ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  if (!url) return NextResponse.json({ error: { code: "VALIDATION", message: "Alleen https-tunneladressen (*.trycloudflare.com) zijn toegestaan" } }, { status: 400 });

  // skip the call-back when the same URL checked in moments ago (cheap heartbeat)
  await primeNode(true);
  const prev = registeredNode();
  const sameAsBefore = prev?.url === url && Date.now() - new Date(prev.at).getTime() < 10 * 60_000;
  if (!sameAsBefore) {
    try {
      const res = await fetch(`${url}/v1/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) return NextResponse.json({ error: { code: "UPSTREAM", message: `Node antwoordt met HTTP ${res.status}` } }, { status: 502 });
    } catch (err) {
      return NextResponse.json({ error: { code: "UPSTREAM", message: `Node niet bereikbaar: ${(err as Error).message}` } }, { status: 502 });
    }
    logger.info("ai node registered", { host: new URL(url).hostname, name: parsed.data.name });
  }

  await saveNode({ url, at: new Date().toISOString(), models: parsed.data.models ?? [], ...(parsed.data.name ? { name: parsed.data.name } : {}) });
  return NextResponse.json({ ok: true, url, new: !sameAsBefore });
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!authorized(request, await getLlmApiKey())) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Verkeerde sleutel" } }, { status: 401 });
  await primeNode(true);
  return NextResponse.json({ node: registeredNode() });
}
