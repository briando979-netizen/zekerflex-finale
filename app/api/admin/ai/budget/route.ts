import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdminAccess } from "@/lib/auth/handlers";
import { budgetSnapshot } from "@/lib/ai/governor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/ai/budget - governor state + today's spend by purpose.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  const [snapshot, byPurpose, recent] = await Promise.all([
    budgetSnapshot(),
    prisma.aiUsageLog.groupBy({
      by: ["purpose"],
      _sum: { totalTokens: true, throttledMs: true },
      _count: { _all: true },
      where: { createdAt: { gte: dayStart } },
    }),
    prisma.aiUsageLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        purpose: true,
        model: true,
        totalTokens: true,
        durationMs: true,
        throttledMs: true,
        ok: true,
        createdAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    snapshot,
    today: byPurpose.map((p) => ({
      purpose: p.purpose,
      calls: p._count._all,
      tokens: p._sum.totalTokens ?? 0,
      throttledMs: p._sum.throttledMs ?? 0,
    })),
    recent: recent.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  });
});
