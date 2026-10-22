import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { chat, llmConfigProblem, ensureAiNode } from "@/lib/ai/client";
import { draftShiftText } from "@/lib/ai/writer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/ai/test — a real (tiny) generation, not just "is the port open":
// proves the model answers, how fast, and what a writer feature produces right now.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  await ensureAiNode();
  const problem = llmConfigProblem();
  const sample = await draftShiftText({ title: "Magazijnmedewerker avonddienst", startsAt: "2026-11-02T17:00", endsAt: "2026-11-02T23:00", breakMinutes: 30 });
  if (problem) return NextResponse.json({ ok: false, error: problem, sample });
  const t = Date.now();
  try {
    const res = await chat({
      purpose: "admin-test",
      retry: false,
      timeoutMs: 30_000,
      maxTokens: 20,
      messages: [{ role: "user", content: "Antwoord met precies één woord: werkt" }],
    });
    return NextResponse.json({ ok: true, ms: Date.now() - t, model: res.model, reply: res.text.trim().slice(0, 80), sample });
  } catch (err) {
    return NextResponse.json({ ok: false, ms: Date.now() - t, error: (err as Error).message, sample });
  }
});
