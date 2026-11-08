import { prisma } from "@/lib/prisma";
import { z } from "zod";

const TimesheetSchema = z.object({
  userId: z.string(),
  date: z.string().datetime(),
  hours: z.number().positive(),
  description: z.string(),
  taskId: z.string().optional(),
  gpsLocation: z.object({ lat: z.number(), lng: z.number() }).optional(),
  billable: z.boolean().default(true),
});

export async function recordTime(data: z.infer<typeof TimesheetSchema>) {
  const validated = TimesheetSchema.parse(data);
  return prisma.timeEntry.create({
    data: {
      userId: validated.userId,
      date: new Date(validated.date),
      hours: validated.hours,
      description: validated.description,
      taskId: validated.taskId,
      location: validated.gpsLocation ? JSON.stringify(validated.gpsLocation) : null,
      billable: validated.billable,
    },
  });
}

export async function getUserTimesheet(userId: string, startDate: Date, endDate: Date) {
  return prisma.timeEntry.findMany({
    where: {
      userId,
      date: { gte: startDate, lte: endDate },
    },
    orderBy: { date: "desc" },
  });
}

export async function getProjectTimeAllocation(projectId: string) {
  const entries = await prisma.timeEntry.findMany({
    where: { task: { projectId } },
    include: { task: true },
  });

  const grouped = entries.reduce(
    (acc, e) => {
      const key = e.taskId || "unallocated";
      acc[key] = (acc[key] || 0) + e.hours;
      return acc;
    },
    {} as Record<string, number>
  );

  return grouped;
}

export async function getBillableHours(userId: string, startDate: Date, endDate: Date) {
  const result = await prisma.timeEntry.aggregate({
    where: {
      userId,
      billable: true,
      date: { gte: startDate, lte: endDate },
    },
    _sum: { hours: true },
  });
  return result._sum.hours || 0;
}
