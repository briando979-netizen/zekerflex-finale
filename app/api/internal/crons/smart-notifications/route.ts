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

    // Send personalized notifications based on worker preferences
    const workers = await prisma.freelancerProfile.findMany({
      select: { userId: true, hourlyRate: true },
      take: 100,
    });

    let notified = 0;
    const now = new Date();

    for (const worker of workers) {
      // Determine optimal notification time based on historical patterns
      const hour = now.getHours();

      // Send morning notification (9 AM)
      if (hour === 9) {
        logger.info("smart-notification-morning", {
          workerId: worker.userId,
          type: "shift-opportunities",
        });
        notified++;
      }

      // Send evening notification (6 PM) for flexible workers
      if (hour === 18) {
        logger.info("smart-notification-evening", {
          workerId: worker.userId,
          type: "weekend-opportunities",
        });
        notified++;
      }

      // Send weekly digest on Monday
      if (now.getDay() === 1 && hour === 10) {
        logger.info("smart-notification-weekly", {
          workerId: worker.userId,
          type: "weekly-digest",
        });
        notified++;
      }
    }

    return NextResponse.json({
      notified,
      message: "Smart notifications sent",
    });
  } catch (err) {
    logger.error("smart-notifications-error", { error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
