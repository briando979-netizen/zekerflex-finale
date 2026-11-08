import { prisma } from "@/lib/prisma";

interface AvailabilitySlot {
  startTime: Date;
  endTime: Date;
}

export async function findAvailability(
  userId: string,
  startDate: Date,
  endDate: Date,
  duration: number,
  bufferMinutes = 15
): Promise<AvailabilitySlot[]> {
  const calendars = await prisma.calendar.findMany({
    where: { userId },
  });

  const allEvents = await prisma.calendarEvent.findMany({
    where: {
      calendarId: { in: calendars.map((c) => c.id) },
      startTime: { gte: startDate },
      endTime: { lte: endDate },
    },
    orderBy: { startTime: "asc" },
  });

  const slots: AvailabilitySlot[] = [];
  let current = new Date(startDate);

  while (current < endDate) {
    const slotEnd = new Date(current.getTime() + duration * 60000);
    const bufferEnd = new Date(slotEnd.getTime() + bufferMinutes * 60000);

    const conflict = allEvents.some(
      (e) => e.startTime < bufferEnd && e.endTime > current
    );

    if (!conflict) {
      slots.push({ startTime: new Date(current), endTime: slotEnd });
    }

    current = new Date(current.getTime() + 30 * 60000);
  }

  return slots;
}

export async function findCommonAvailability(
  userIds: string[],
  startDate: Date,
  endDate: Date,
  duration: number
): Promise<AvailabilitySlot[]> {
  const availabilityPerUser = await Promise.all(
    userIds.map((uid) => findAvailability(uid, startDate, endDate, duration))
  );

  return availabilityPerUser[0]?.filter((slot) =>
    availabilityPerUser.every((av) =>
      av.some((s) => s.startTime.getTime() === slot.startTime.getTime())
    )
  ) ?? [];
}

export async function suggestBestTime(
  userIds: string[],
  startDate: Date,
  endDate: Date,
  duration: number,
  timezone: string
): Promise<AvailabilitySlot | null> {
  const slots = await findCommonAvailability(
    userIds,
    startDate,
    endDate,
    duration
  );

  if (slots.length === 0) return null;

  const hour = parseInt(timezone.split(":")[0]);
  const businessHourStart = 9 + hour;
  const businessHourEnd = 17 + hour;

  const preferred = slots.find(
    (s) => s.startTime.getHours() >= businessHourStart &&
      s.endTime.getHours() <= businessHourEnd
  );

  return preferred || slots[0];
}

export async function checkConflict(
  calendarId: string,
  startTime: Date,
  endTime: Date
): Promise<boolean> {
  const conflict = await prisma.calendarEvent.findFirst({
    where: {
      calendarId,
      OR: [{ startTime: { lt: endTime }, endTime: { gt: startTime } }],
    },
  });
  return !!conflict;
}
