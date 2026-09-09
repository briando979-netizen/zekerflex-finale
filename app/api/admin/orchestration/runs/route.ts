import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/orchestration/runs - recent cycles with finding counts.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
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
});
