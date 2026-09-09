import { z } from "zod";
import { AppError } from "@/lib/errors";
import { NextResponse } from "next/server";
import { chatStream, fastModel } from "@/lib/ai/client";
import { heuristicRoute } from "@/lib/jarvis/core";
import { JARVIS_PERSONA } from "@/lib/jarvis/persona";
import { jarvisStateLine } from "@/lib/admin/overview";
import { logExchange, recentHistory, topExamples } from "@/lib/learn/store";
import { inspectPrompt } from "@/lib/security/prompt-guard";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({ prompt: z.string().trim().min(1).max(4000) });

// POST /api/admin/jarvis/quick
//   → streams a spoken-fast conversational reply for chat/greeting prompts
//   → { needsFullTurn: true, capability } for anything that needs a tool
// Keeps a per-user memory + learns from rated answers, all on the filesystem.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const { prompt } = bodySchema.parse(
    await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    }),
  );
  const guard = inspectPrompt(prompt);
  if (!guard.allowed) {
    return NextResponse.json(
      { error: { message: "Deze instructie valt buiten de veiligheidsgrenzen van Jarvis." } },
      { status: 400 },
    );
  }

  const route = heuristicRoute(prompt);
  // Anything that isn't plain conversation goes to the full (audited) turn engine.
  if (route && route.capability !== "chat") {
    return NextResponse.json({ needsFullTurn: true, capability: route.capability });
  }
  // Ambiguous / medium prompts also go to the full engine so the LLM router decides.
  if (!route && prompt.split(/\s+/).length > 6) {
    return NextResponse.json({ needsFullTurn: true, capability: null });
  }

  const [stateLine, history, examples] = await Promise.all([
    jarvisStateLine().catch(() => ""),
    recentHistory("jarvis", principal.userId, 4),
    topExamples("jarvis", 3),
  ]);

  const exampleBlock = examples.length
    ? "Voorbeelden van goede eerdere antwoorden:\n" +
      examples.map((e, i) => `${i + 1}. V: ${e.q}\n   A: ${e.a}`).join("\n")
    : "";

  const messages = [
    { role: "system" as const, content: JARVIS_PERSONA },
    ...(stateLine ? [{ role: "system" as const, content: `LIVE PLATFORMSTATUS: ${stateLine}` }] : []),
    ...(exampleBlock ? [{ role: "system" as const, content: exampleBlock }] : []),
    ...history,
    { role: "user" as const, content: prompt },
  ];

  const gen = chatStream({
    purpose: "jarvis-quick",
    model: fastModel(),
    temperature: 0.5,
    maxTokens: 400,
    messages,
  });

  let full = "";
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      try {
        for await (const delta of gen) {
          full += delta;
          controller.enqueue(enc.encode(delta));
        }
      } catch (err) {
        controller.enqueue(enc.encode(`\n\n(${(err as Error).message})`));
      } finally {
        controller.close();
        if (full.trim()) void logExchange("jarvis", { q: prompt, a: full.trim(), userId: principal.userId }).catch(() => undefined);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
      "X-Jarvis-Mode": "quick",
    },
  });
});
