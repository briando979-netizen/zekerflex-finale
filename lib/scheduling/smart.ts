import { prisma } from "@/lib/prisma";

interface SmartSchedulingRequest {
  attendees: string[];
  duration: number;
  startDate: Date;
  endDate: Date;
  timezone?: string;
  location?: string;
}

export async function smartScheduleMeeting(
  request: SmartSchedulingRequest
) {
  const { attendees, duration, startDate, endDate, timezone, location } =
    request;

  const availabilityPerUser = await Promise.all(
    attendees.map((uid) => getUserAvailabilityWindow(uid, startDate, endDate))
  );

  const commonSlots = findCommonSlots(availabilityPerUser, duration);

  if (commonSlots.length === 0) {
    throw new Error("No common availability found");
  }

  const scored = await scoreSlots(
    commonSlots,
    attendees,
    location,
    timezone
  );

  return scored[0];
}

async function getUserAvailabilityWindow(
  userId: string,
  startDate: Date,
  endDate: Date
) {
  const calendars = await prisma.calendar.findMany({ where: { userId } });
  const events = await prisma.calendarEvent.findMany({
    where: {
      calendarId: { in: calendars.map((c) => c.id) },
      startTime: { gte: startDate },
      endTime: { lte: endDate },
    },
    orderBy: { startTime: "asc" },
  });

  const availability = await prisma.userAvailability.findUnique({
    where: { userId },
  });

  return { userId, events, availability };
}

function findCommonSlots(
  userAvailability: any[],
  duration: number
): Array<{ start: Date; end: Date }> {
  const slots: Array<{ start: Date; end: Date }> = [];
  let current = new Date();
  const maxDate = new Date(current.getTime() + 30 * 24 * 60 * 60 * 1000);

  while (current < maxDate) {
    const slotEnd = new Date(current.getTime() + duration * 60000);
    let isFree = true;

    for (const user of userAvailability) {
      const conflict = user.events.some(
        (e: any) => e.startTime < slotEnd && e.endTime > current
      );
      if (conflict) {
        isFree = false;
        break;
      }
    }

    if (isFree) {
      slots.push({ start: new Date(current), end: slotEnd });
    }

    current = new Date(current.getTime() + 30 * 60000);
  }

  return slots;
}

async function scoreSlots(
  slots: Array<{ start: Date; end: Date }>,
  attendees: string[],
  location?: string,
  timezone?: string
) {
  const scored = await Promise.all(
    slots.map(async (slot) => {
      let score = 100;

      const hour = slot.start.getHours();
      if (hour >= 9 && hour <= 17) score += 20;
      if (hour >= 10 && hour <= 16) score += 10;

      if (location) {
        const travelTime = await estimateTravelTime(location, slot.start);
        if (travelTime && travelTime < 15) score += 15;
        if (travelTime && travelTime > 45) score -= 20;
      }

      const dayOfWeek = slot.start.getDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 4) score += 10;

      return { ...slot, score };
    })
  );

  return scored.sort((a, b) => b.score - a.score);
}

async function estimateTravelTime(
  location: string,
  meetingTime: Date
): Promise<number | null> {
  try {
    const directionsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=current&destination=${encodeURIComponent(location)}&key=${process.env.GOOGLE_MAPS_API_KEY}`;

    const response = await fetch(directionsUrl);
    const data = await response.json();

    if (data.routes && data.routes[0]) {
      const durationSeconds =
        data.routes[0].legs[0].duration.value;
      return Math.ceil(durationSeconds / 60);
    }
  } catch (err) {
    console.error("Travel time estimation failed:", err);
  }

  return null;
}

export async function bookRoom(
  roomId: string,
  startTime: Date,
  endTime: Date,
  meetingId: string
) {
  return prisma.roomReservation.create({
    data: {
      roomId,
      startTime,
      endTime,
      meetingId,
    },
  });
}

export async function checkRoomAvailability(
  roomId: string,
  startTime: Date,
  endTime: Date
): Promise<boolean> {
  const conflict = await prisma.roomReservation.findFirst({
    where: {
      roomId,
      OR: [
        { startTime: { lt: endTime }, endTime: { gt: startTime } },
      ],
    },
  });

  return !conflict;
}
