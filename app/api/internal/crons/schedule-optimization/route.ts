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

    // Find workers with availability patterns
    const workers = await prisma.freelancerProfile.findMany({
      include: {
        assignments: {
          where: {
            createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
          include: { shift: true },
        },
      },
      take: 100,
    });

    let optimized = 0;

    for (const worker of workers) {
      if (worker.assignments.length === 0) continue;

      // Analyze availability patterns
      const dayOfWeekMap: Record<number, number> = {};
      for (const assignment of worker.assignments) {
        const day = new Date(assignment.shift.startsAt).getDay();
        dayOfWeekMap[day] = (dayOfWeekMap[day] || 0) + 1;
      }

      // Find worker's preferred days
      const preferredDays = Object.entries(dayOfWeekMap)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([day]) => Number(day));

      if (preferredDays.length > 0) {
        logger.info("schedule-optimized", {
          workerId: worker.id,
          preferredDays,
          shiftsAnalyzed: worker.assignments.length,
        });
        optimized++;
      }
    }

    return NextResponse.json({
      optimized,
      message: "Schedule optimization complete",
      patterns: {
        workersAnalyzed: workers.length,
        patternsFound: optimized,
      },
    });
  } catch (err) {
    logger.error("schedule-optimization-error", { error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
