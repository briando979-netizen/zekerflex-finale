import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { askWithMemory } from "@/lib/rag/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  question: z.string().trim().min(3).max(500),
});

// POST /api/admin/rag/ask - answer a question from the local total memory.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");

    const json = await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    });
    const { question } = bodySchema.parse(json);

    const result = await askWithMemory(question);
    await recordAudit({
      category: "ORCHESTRATION",
      action: "rag.ask",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `Geheugen bevraagd: "${question.slice(0, 140)}"`,
      metadata: { sources: result.sources.length },
    });
    return NextResponse.json(result);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
