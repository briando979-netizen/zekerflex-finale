import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { naiveRag } from "@/lib/rag/naive";
import { recall } from "@/lib/rag/recall";
import { advancedRecall } from "@/lib/rag/advanced";
import { agenticRecall } from "@/lib/rag/agentic";
import { cacheClear, cacheLookup, cacheStats, knowledgePack } from "@/lib/rag/cag";
import { corpusStats } from "@/lib/rag/corpus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  question: z.string().trim().min(2).max(500),
  role: z.enum(["public", "werknemer", "opdrachtgever", "admin"]).default("werknemer"),
});

const ms = async <T,>(fn: () => Promise<T>) => {
  const t = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - t };
};

// GET /api/admin/rag/lab — corpus, CAG packs and answer-cache stats.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const roles = ["public", "werknemer", "opdrachtgever", "admin"] as const;
  return NextResponse.json({
    corpus: corpusStats(),
    packs: roles.map((r) => {
      const p = knowledgePack(r);
      return { role: r, version: p.version, passages: p.passages, chars: p.text.length };
    }),
    cache: await cacheStats(),
  });
});

// POST /api/admin/rag/lab — one question through every pipeline, side by side.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const { question, role } = schema.parse(await request.json().catch(() => ({})));
  const [naive, hybrid, advanced, agentic, cag] = await Promise.all([
    ms(() => naiveRag(question, role)),
    ms(() => recall(question, { role, k: 5 })),
    ms(() => advancedRecall(question, { role, k: 5 })),
    ms(() => agenticRecall(question, { role, k: 5 })),
    ms(() => cacheLookup(role, question)),
  ]);
  const top = (hits: { title: string; source: string }[]) => hits.slice(0, 5).map((h) => `${h.title} (${h.source})`);
  return NextResponse.json({
    naive: { ms: naive.ms, mode: naive.value.mode, answer: naive.value.answer.slice(0, 600), top: top(naive.value.hits) },
    hybrid: { ms: hybrid.ms, confident: hybrid.value.confident, retrievers: hybrid.value.retrievers, top: hybrid.value.hits.map((h) => `${h.title} [${h.via.join("+")}]`) },
    advanced: { ms: advanced.ms, confident: advanced.value.confident, trace: advanced.value.trace, top: top(advanced.value.hits), excerpt: advanced.value.hits[0]?.excerpt ?? null },
    agentic: { ms: agentic.ms, confident: agentic.value.confident, subQuestions: agentic.value.subQuestions, steps: agentic.value.steps, top: top(agentic.value.hits) },
    cag: { ms: cag.ms, cacheHit: cag.value ? { q: cag.value.q, similarity: Number(cag.value.similarity.toFixed(3)), answer: cag.value.a.slice(0, 400) } : null, pack: { version: knowledgePack(role).version, passages: knowledgePack(role).passages } },
  });
});

// DELETE /api/admin/rag/lab — empty the CAG answer cache (e.g. after changing the knowledge base).
export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  await cacheClear();
  return NextResponse.json({ ok: true });
});
