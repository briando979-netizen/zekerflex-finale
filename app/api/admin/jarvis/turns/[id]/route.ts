import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { getTurn } from "@/lib/jarvis/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.string().min(1).max(128) });

// GET /api/admin/jarvis/turns/:id?since=<seq> - turn status + events after seq.
export async function GET(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");
    const { id } = paramsSchema.parse(params);
    const since = Number(new URL(request.url).searchParams.get("since") ?? "0") || 0;

    const turn = await getTurn(id, since);
    if (!turn) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Turn niet gevonden" } },
        { status: 404 },
      );
    }
    return NextResponse.json({
      id: turn.id,
      status: turn.status,
      prompt: turn.prompt,
      answer: turn.answer,
      error: turn.error,
      startedAt: turn.startedAt.toISOString(),
      endedAt: turn.endedAt?.toISOString() ?? null,
      uploads: turn.uploads,
      events: turn.events.map((e) => ({
        seq: e.seq,
        kind: e.kind,
        agent: e.agent,
        title: e.title,
        detail: e.detail,
        payload: e.payload,
        durationMs: e.durationMs,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
