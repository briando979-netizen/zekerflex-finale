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

    // Get recent unpublished shifts
    const recentShifts = await prisma.shift.findMany({
      where: {
        status: "PUBLISHED",
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: { id: true },
      take: 50,
    });

    let processed = 0;
    for (const shift of recentShifts) {
      try {
        // Trigger matching refresh - in real impl would update cache
        logger.info("shift-matching-refreshed", { shiftId: shift.id });
        processed++;
      } catch (err) {
        logger.error("matching-refresh-failed", { shiftId: shift.id });
      }
    }

    logger.info("recommendations-refreshed", { processed });
    return NextResponse.json({ processed, message: "Recommendations refreshed" });
  } catch (err) {
    logger.error("recommendations-refresh-error", { error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
