import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/orchestration/runs - recent cycles with finding counts.
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");
    const limit = Math.min(
      50,
      Math.max(1, Number(new URL(request.url).searchParams.get("limit") ?? "20") || 20),
    );
    const runs = await prisma.orchestrationRun.findMany({
      orderBy: { startedAt: "desc" },
      take: limit,
      include: { _count: { select: { findings: true } } },
    });
    return NextResponse.json({
      runs: runs.map((r) => ({
        id: r.id,
        trigger: r.trigger,
        status: r.status,
        model: r.model,
        summary: r.summary,
        error: r.error,
        findings: r._count.findings,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
