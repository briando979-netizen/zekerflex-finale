import { prisma } from "@/lib/prisma";
import { z } from "zod";

const availabilitySchema = z.object({
  freelancerId: z.string(),
  dayOfWeek: z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]),
  startTime: z.string(), // HH:mm
  endTime: z.string(),
  isRecurring: z.boolean(),
});

export async function setAvailability(data: z.infer<typeof availabilitySchema>) {
  const validated = availabilitySchema.parse(data);
  return prisma.freelancerAvailability.create({
    data: { ...validated },
  });
}

export async function getAvailability(freelancerId: string) {
  return prisma.freelancerAvailability.findMany({
    where: { freelancerId },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
}

export async function syncCalendar(
  freelancerId: string,
  calendarEvents: { date: string; startTime: string; endTime: string }[]
) {
  const marked = calendarEvents.map((e) => ({
    freelancerId,
    date: new Date(e.date),
    startTime: e.startTime,
    endTime: e.endTime,
    type: "BLOCKED",
  }));
  return prisma.calendarBlock.createMany({ data: marked });
}
