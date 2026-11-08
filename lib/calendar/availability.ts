import { prisma } from "@/lib/prisma";

export async function setWorkingHours(
  userId: string,
  workingHours: {
    monday?: { start: string; end: string };
    tuesday?: { start: string; end: string };
    wednesday?: { start: string; end: string };
    thursday?: { start: string; end: string };
    friday?: { start: string; end: string };
    saturday?: { start: string; end: string };
    sunday?: { start: string; end: string };
  }
) {
  return prisma.userAvailability.upsert({
    where: { userId },
    update: { workingHours },
    create: { userId, workingHours },
  });
}

export async function addVacationBlock(
  userId: string,
  startDate: Date,
  endDate: Date,
  title: string = "Vacation"
) {
  return prisma.availabilityBlock.create({
    data: {
      userId,
      type: "vacation",
      startDate,
      endDate,
      title,
    },
  });
}

export async function addFocusTimeBlock(
  userId: string,
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  title: string = "Focus Time"
) {
  return prisma.availabilityBlock.create({
    data: {
      userId,
      type: "focus",
      title,
      dayOfWeek,
      startTime,
      endTime,
    },
  });
}

export async function addBufferTime(
  userId: string,
  bufferMinutes: number,
  position: "before" | "after" = "after"
) {
  return prisma.userAvailability.update({
    where: { userId },
    data: {
      bufferMinutes,
      bufferPosition: position,
    },
  });
}

export async function setMeetingFreeHours(
  userId: string,
  startHour: number,
  endHour: number
) {
  return prisma.userAvailability.update({
    where: { userId },
    data: {
      meetingFreeStart: startHour,
      meetingFreeEnd: endHour,
    },
  });
}

export async function getAvailability(userId: string) {
  return prisma.userAvailability.findUnique({
    where: { userId },
    include: { blocks: true },
  });
}

export async function isUserAvailable(
  userId: string,
  startTime: Date,
  endTime: Date
): Promise<boolean> {
  const availability = await getAvailability(userId);
  if (!availability) return true;

  const dayOfWeek = startTime.getDay();
  const hours = startTime.getHours();

  const blocks = await prisma.availabilityBlock.findMany({
    where: {
      userId,
      OR: [
        {
          type: "vacation",
          startDate: { lte: startTime },
          endDate: { gte: endTime },
        },
        {
          type: "focus",
          dayOfWeek,
        },
      ],
    },
  });

  if (blocks.some((b) => b.type === "vacation")) return false;

  if (availability.meetingFreeStart && availability.meetingFreeEnd) {
    if (hours >= availability.meetingFreeStart && hours < availability.meetingFreeEnd) {
      return false;
    }
  }

  return true;
}

export async function getTimezoneOffset(
  userId: string
): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  return user?.timezone || "Europe/Amsterdam";
}
