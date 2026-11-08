import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendLocalizedPush } from "@/lib/notifications/localized-push";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get("authorization");
    const expectedToken = process.env.CRON_SECRET;

    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in1Hour = new Date(now.getTime() + 60 * 60 * 1000);

    // Send 24-hour reminders
    const shifts24h = await prisma.shiftAssignment.findMany({
      where: {
        status: "CONFIRMED",
        reminderSent24h: false,
        shift: {
          startsAt: {
            gte: new Date(now.getTime() + 23.5 * 60 * 60 * 1000),
            lte: in24Hours,
          },
        },
      },
      include: {
        freelancer: { select: { userId: true } },
        shift: { select: { title: true } },
      },
    });

    let sent24h = 0;
    for (const assignment of shifts24h) {
      try {
        await sendLocalizedPush(assignment.freelancer.userId, {
          title: "Morgen werken",
          body: `Je klus ${assignment.shift.title} begint morgen`,
        });
        await prisma.shiftAssignment.update({
          where: { id: assignment.id },
          data: { reminderSent24h: true },
        });
        sent24h++;
      } catch (err) {
        logger.error("reminder-24h-failed", { assignmentId: assignment.id });
      }
    }

    // Send 1-hour reminders
    const shifts1h = await prisma.shiftAssignment.findMany({
      where: {
        status: "CONFIRMED",
        reminderSent1h: false,
        shift: {
          startsAt: {
            gte: new Date(now.getTime() + 50 * 60 * 1000),
            lte: in1Hour,
          },
        },
      },
      include: {
        freelancer: { select: { userId: true } },
        shift: { select: { title: true } },
      },
    });

    let sent1h = 0;
    for (const assignment of shifts1h) {
      try {
        await sendLocalizedPush(assignment.freelancer.userId, {
          title: "Nu werken!",
          body: `Over 1 uur: ${assignment.shift.title}`,
        });
        await prisma.shiftAssignment.update({
          where: { id: assignment.id },
          data: { reminderSent1h: true },
        });
        sent1h++;
      } catch (err) {
        logger.error("reminder-1h-failed", { assignmentId: assignment.id });
      }
    }

    logger.info("shift-reminders-sent", { sent24h, sent1h });
    return NextResponse.json({ sent24h, sent1h });
  } catch (err) {
    logger.error("shift-reminders-error", { error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
