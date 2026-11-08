import { prisma } from "@/lib/prisma";
import { z } from "zod";

const CalendarSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
  description: z.string().optional(),
  isShared: z.boolean().default(false),
});

export async function createCalendar(
  userId: string,
  data: z.infer<typeof CalendarSchema>
) {
  const parsed = CalendarSchema.parse(data);
  return prisma.calendar.create({
    data: {
      ...parsed,
      userId,
    },
  });
}

export async function getCalendars(userId: string) {
  return prisma.calendar.findMany({
    where: { userId },
    include: { events: { take: 5, orderBy: { startTime: "desc" } } },
  });
}

export async function shareCalendar(
  calendarId: string,
  targetUserId: string,
  permission: "view" | "edit"
) {
  return prisma.calendarShare.create({
    data: { calendarId, targetUserId, permission },
  });
}

export async function getSharedCalendars(userId: string) {
  return prisma.calendarShare.findMany({
    where: { targetUserId: userId },
    include: { calendar: true },
  });
}

export async function createEvent(
  calendarId: string,
  data: {
    title: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    isRecurring?: boolean;
    recurrenceRule?: string;
    reminders?: number[];
  }
) {
  return prisma.calendarEvent.create({
    data: {
      calendarId,
      ...data,
      reminders: data.reminders || [15],
    },
  });
}

export async function getEvents(
  calendarId: string,
  startDate: Date,
  endDate: Date
) {
  return prisma.calendarEvent.findMany({
    where: {
      calendarId,
      startTime: { gte: startDate },
      endTime: { lte: endDate },
    },
    orderBy: { startTime: "asc" },
  });
}

export async function checkDoubleBooking(
  calendarId: string,
  startTime: Date,
  endTime: Date,
  excludeEventId?: string
) {
  const conflicts = await prisma.calendarEvent.findMany({
    where: {
      calendarId,
      id: excludeEventId ? { not: excludeEventId } : undefined,
      OR: [
        { startTime: { lt: endTime }, endTime: { gt: startTime } },
      ],
    },
  });
  return conflicts.length > 0;
}
