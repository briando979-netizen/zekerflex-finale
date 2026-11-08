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

    // Segment workers into pools
    const allWorkers = await prisma.freelancerProfile.findMany({
      include: {
        assignments: { where: { status: "COMPLETED" }, select: { id: true } },
        skills: { select: { id: true } },
      },
    });

    const segments = {
      elite: [] as string[], // 95%+ completion, 4.7+ rating
      reliable: [] as string[], // 80-95% completion, 4.0+ rating
      active: [] as string[], // 5+ shifts in 30 days
      dormant: [] as string[], // 0 shifts in 30 days
      new: [] as string[], // Less than 2 shifts total
    };

    for (const worker of allWorkers) {
      if (worker.assignments.length < 2) {
        segments.new.push(worker.id);
      } else if (worker.assignments.length === 0) {
        segments.dormant.push(worker.id);
      } else if (worker.assignments.length >= 5) {
        // Would check ratings, but simplified for now
        segments.active.push(worker.id);
        if (worker.assignments.length >= 20) {
          segments.reliable.push(worker.id);
        }
      }
    }

    // Log segment sizes
    logger.info("pool-segmentation-complete", {
      elite: segments.elite.length,
      reliable: segments.reliable.length,
      active: segments.active.length,
      dormant: segments.dormant.length,
      new: segments.new.length,
    });

    return NextResponse.json({
      segmentation: {
        elite: segments.elite.length,
        reliable: segments.reliable.length,
        active: segments.active.length,
        dormant: segments.dormant.length,
        new: segments.new.length,
        total: allWorkers.length,
      },
      message: "Worker pool segmentation complete",
    });
  } catch (err) {
    logger.error("pool-segmentation-error", { error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
