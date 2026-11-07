import { prisma } from "@/lib/prisma";
import { sendUserPush } from "@/lib/notifications/push";
import { logger } from "@/lib/logger";

/**
 * Shift reminders: push notifications 24h en 1h voor shift start
 * Cron job: deploy/cron/shift-reminders.sh
 */

export async function sendShiftReminders() {
  const now = new Date();

  // 24h reminder: shifts starting in ~24 hours
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in24hMin = new Date(in24h.getTime() - 30 * 60 * 1000);
  const in24hMax = new Date(in24h.getTime() + 30 * 60 * 1000);

  const shifts24h = await prisma.shiftAssignment.findMany({
    where: {
      status: "ACCEPTED",
      shift: {
        startsAt: { gte: in24hMin, lte: in24hMax },
      },
    },
    include: {
      freelancer: { select: { userId: true, user: { select: { fullName: true } } } },
      shift: { select: { title: true, startsAt: true, branch: { select: { name: true } } } },
    },
  });

  for (const assignment of shifts24h) {
    try {
      const time = assignment.shift.startsAt.toLocaleTimeString("nl-NL", {
        hour: "2-digit",
        minute: "2-digit",
      });
      await sendUserPush([assignment.freelancer.userId], {
        title: "Morgen werken",
        body: `${assignment.shift.title} morgen om ${time} @ ${assignment.shift.branch.name}`,
        data: {
          type: "SHIFT",
          url: `/dashboard/schema`,
        },
        tag: `shift-24h-${assignment.id}`,
      });
      logger.info("shift-reminder-24h-sent", { assignmentId: assignment.id });
    } catch (err) {
      logger.warn("shift-reminder-24h-failed", { error: (err as Error).message });
    }
  }

  // 1h reminder: shifts starting in ~1 hour
  const in1h = new Date(now.getTime() + 60 * 60 * 1000);
  const in1hMin = new Date(in1h.getTime() - 10 * 60 * 1000);
  const in1hMax = new Date(in1h.getTime() + 10 * 60 * 1000);

  const shifts1h = await prisma.shiftAssignment.findMany({
    where: {
      status: "ACCEPTED",
      reminderSent1h: false,
      shift: {
        startsAt: { gte: in1hMin, lte: in1hMax },
      },
    },
    include: {
      freelancer: { select: { userId: true, user: { select: { fullName: true } } } },
      shift: { select: { title: true, startsAt: true, branch: { select: { name: true, adres: true } } } },
    },
  });

  for (const assignment of shifts1h) {
    try {
      await sendUserPush([assignment.freelancer.userId], {
        title: "Nu werken! ⏱️",
        body: `${assignment.shift.title} begint over 1 uur @ ${assignment.shift.branch.name}`,
        data: {
          type: "SHIFT",
          url: `/dashboard/schema`,
        },
        tag: `shift-1h-${assignment.id}`,
        priority: "high",
      });

      // Mark reminder as sent
      await prisma.shiftAssignment.update({
        where: { id: assignment.id },
        data: { reminderSent1h: true },
      });

      logger.info("shift-reminder-1h-sent", { assignmentId: assignment.id });
    } catch (err) {
      logger.warn("shift-reminder-1h-failed", { error: (err as Error).message });
    }
  }

  logger.info("shift-reminders-complete", { count24h: shifts24h.length, count1h: shifts1h.length });
}
