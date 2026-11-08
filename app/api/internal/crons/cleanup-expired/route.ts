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

    // Clean up expired data
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Delete old cancelled shifts
    const deletedShifts = await prisma.shift.deleteMany({
      where: {
        status: "CANCELLED",
        createdAt: { lt: ninetyDaysAgo },
      },
    });

    // Mark old inactive workers for cleanup (don't delete, just flag)
    const inactiveWorkers = await prisma.freelancerProfile.updateMany({
      where: {
        assignments: { none: { createdAt: { gte: thirtyDaysAgo } } },
      },
      data: { flaggedForReview: true },
    });

    logger.info("cleanup-complete", {
      shiftsDeleted: deletedShifts.count,
      workersMarked: inactiveWorkers.count,
    });

    return NextResponse.json({
      shiftsDeleted: deletedShifts.count,
      workersMarked: inactiveWorkers.count,
      message: "Cleanup complete",
    });
  } catch (err) {
    logger.error("cleanup-error", { error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
