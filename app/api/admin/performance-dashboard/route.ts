import { NextRequest, NextResponse } from "next/server";
import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const p = await getPrincipal();
    if (!p || !hasRole(p, "PLATFORM_ADMIN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const now = new Date();
    const pastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      shiftsCreatedWeek,
      shiftsCompletedWeek,
      newCompanies,
      newWorkers,
      avgCompletionRate,
      platformHealth,
    ] = await Promise.all([
      prisma.shift.count({
        where: { createdAt: { gte: pastWeek } },
      }),
      prisma.shiftAssignment.count({
        where: {
          status: "COMPLETED",
          createdAt: { gte: pastWeek },
        },
      }),
      prisma.tenant.count({
        where: { createdAt: { gte: pastWeek } },
      }),
      prisma.freelancerProfile.count({
        where: { createdAt: { gte: pastWeek } },
      }),
      prisma.shiftAssignment.aggregate({
        where: { status: "COMPLETED" },
        _avg: { earningsCents: true },
      }),
      prisma.shift.aggregate({
        where: { status: "PUBLISHED" },
        _count: true,
      }),
    ]);

    return NextResponse.json({
      period: "Last 7 days",
      metrics: {
        shiftsCreated: shiftsCreatedWeek,
        shiftsCompleted: shiftsCompletedWeek,
        newCompanies,
        newWorkers,
        avgEarningPerShift: avgCompletionRate._avg.earningsCents || 0,
      },
      health: {
        activeShifts: platformHealth._count,
        timestamp: now,
      },
      trends: {
        shiftsGrowth: shiftsCreatedWeek > 100 ? "up" : "stable",
        workerEngagement: newWorkers > 50 ? "healthy" : "monitor",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
