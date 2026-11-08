import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get("authorization");
    const expectedToken = process.env.CRON_SECRET;

    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    // Find workers who were active 60 days ago but inactive last 30 days
    const inactiveWorkers = await prisma.freelancerProfile.findMany({
      where: {
        assignments: {
          some: { createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
        },
      },
      select: {
        id: true,
        userId: true,
        assignments: {
          where: { createdAt: { gte: thirtyDaysAgo } },
          select: { id: true },
        },
      },
    });

    const atRisk = inactiveWorkers.filter((w) => w.assignments.length === 0).length;

    // Track retention metrics
    const activeWorkers = await prisma.freelancerProfile.count({
      where: {
        assignments: {
          some: { createdAt: { gte: thirtyDaysAgo } },
        },
      },
    });

    const totalWorkers = await prisma.freelancerProfile.count();
    const retentionRate = totalWorkers > 0 ? Math.round((activeWorkers / totalWorkers) * 100) : 0;

    // Flag at-risk workers for re-engagement
    for (const worker of inactiveWorkers.slice(0, 50)) {
      if (worker.assignments.length === 0) {
        logger.info("worker-at-risk", {
          workerId: worker.id,
          daysInactive: 30,
          action: "queue-reengagement",
        });
      }
    }

    return NextResponse.json({
      atRiskWorkers: atRisk,
      activeWorkers,
      totalWorkers,
      retentionRate,
      message: "Retention tracking complete",
    });
  } catch (err) {
    logger.error("retention-tracking-error", { error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
