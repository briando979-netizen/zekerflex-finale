import { prisma } from "@/lib/prisma";
import { z } from "zod";

const spaceSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["OFFICE", "CONFERENCE", "LOUNGE", "STORAGE", "OTHER"]),
  capacity: z.number().positive(),
  floor: z.number().nonnegative(),
  area: z.number().positive(),
  equipment: z.array(z.string()).optional(),
});

export async function createSpace(data: z.infer<typeof spaceSchema>) {
  const validated = spaceSchema.parse(data);
  return prisma.facilitySpace.create({
    data: { ...validated, utilization: 0 },
  });
}

export async function bookSpace(spaceId: string, startTime: Date, endTime: Date, bookedBy: string) {
  const space = await prisma.facilitySpace.findUniqueOrThrow({ where: { id: spaceId } });

  const conflicting = await prisma.spaceBooking.findFirst({
    where: {
      spaceId,
      OR: [
        { startTime: { lt: endTime }, endTime: { gt: startTime } },
      ],
    },
  });

  if (conflicting) throw new Error("Space not available for requested time");

  return prisma.spaceBooking.create({
    data: { spaceId, startTime, endTime, bookedBy, status: "CONFIRMED" },
  });
}

export async function getSpaceUtilization(spaceId: string, days: number = 30) {
  const bookings = await prisma.spaceBooking.findMany({
    where: {
      spaceId,
      startTime: { gte: new Date(Date.now() - days * 86400000) },
    },
  });

  const totalHours = days * 24;
  const bookedHours = bookings.reduce((sum, b) => {
    const hours = (b.endTime.getTime() - b.startTime.getTime()) / 3600000;
    return sum + hours;
  }, 0);

  return { utilization: (bookedHours / totalHours) * 100, bookingCount: bookings.length };
}

export async function optimizeSpaceAllocation() {
  const spaces = await prisma.facilitySpace.findMany();
  const recommendations = [];

  for (const space of spaces) {
    const util = await getSpaceUtilization(space.id, 30);
    if (util.utilization < 20) {
      recommendations.push({ spaceId: space.id, type: "UNDERUTILIZED", action: "Consider consolidating or repurposing" });
    } else if (util.utilization > 90) {
      recommendations.push({ spaceId: space.id, type: "OVERUTILIZED", action: "Schedule expansion or optimize booking" });
    }
  }

  return recommendations;
}
