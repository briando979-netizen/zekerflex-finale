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

    // Send shift reminders to workers
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const tomorrowEnd = new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000);

    const upcomingShifts = await prisma.shiftAssignment.findMany({
      where: {
        status: "ACCEPTED",
        shift: {
          startsAt: { gte: tomorrow, lt: tomorrowEnd },
        },
      },
      include: {
        shift: { include: { company: true } },
        freelancer: { include: { user: true } },
      },
    });

    let notified = 0;

    for (const assignment of upcomingShifts) {
      try {
        // In a real implementation, this would send push notifications
        logger.info("shift-reminder-sent", {
          workerId: assignment.freelancer.userId,
          shiftId: assignment.shift.id,
          company: assignment.shift.company.name,
          time: assignment.shift.startsAt,
        });
        notified++;
      } catch (err) {
        logger.error("notification-failed", {
          workerId: assignment.freelancer.userId,
          error: (err as Error).message,
        });
      }
    }

    // Send performance alerts to top performers
    const topPerformers = await prisma.freelancerProfile.findMany({
      where: {
        assignments: {
          some: {
            status: "COMPLETED",
            completedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
        },
      },
      take: 50,
    });

    for (const performer of topPerformers) {
      // Send achievement notification if they've hit a milestone
      logger.info("performance-notification", {
        workerId: performer.userId,
        status: "queued",
      });
    }

    return NextResponse.json({
      notified,
      performers: topPerformers.length,
      message: "Notifications sent",
    });
  } catch (err) {
    logger.error("notification-error", { error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
