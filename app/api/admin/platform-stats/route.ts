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
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalCompanies,
      activeCompanies,
      totalWorkers,
      activeWorkers,
      totalShifts,
      shiftsThisMonth,
      completedShifts,
      totalEarnings,
    ] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({
        where: {
          memberships: { some: { createdAt: { gte: thirtyDaysAgo } } },
        },
      }),
      prisma.freelancerProfile.count(),
      prisma.freelancerProfile.count({
        where: {
          shiftAssignments: { some: { createdAt: { gte: thirtyDaysAgo } } },
        },
      }),
      prisma.shift.count(),
      prisma.shift.count({
        where: { createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.shiftAssignment.count({
        where: { status: "COMPLETED" },
      }),
      prisma.shiftAssignment.aggregate({
        where: { status: "COMPLETED" },
        _sum: { earningsCents: true },
      }),
    ]);

    return NextResponse.json({
      timestamp: now,
      companies: {
        total: totalCompanies,
        active: activeCompanies,
      },
      workers: {
        total: totalWorkers,
        active: activeWorkers,
      },
      shifts: {
        total: totalShifts,
        thisMonth: shiftsThisMonth,
        completed: completedShifts,
      },
      earnings: {
        totalCents: totalEarnings._sum.earningsCents || 0,
      },
      health: {
        activeRatio: totalCompanies > 0 ? (activeCompanies / totalCompanies) * 100 : 0,
        workerEngagement: totalWorkers > 0 ? (activeWorkers / totalWorkers) * 100 : 0,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
