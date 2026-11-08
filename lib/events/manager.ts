import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

const eventSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  location: z.string(),
  capacity: z.number().positive().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "LIVE", "ENDED", "CANCELLED"]),
});

export async function createEvent(data: z.infer<typeof eventSchema>, userId: string) {
  const parsed = eventSchema.parse(data);
  return prisma.event.create({
    data: {
      ...parsed,
      organizerId: userId,
      attendeeCount: 0,
      revenue: 0,
    },
  });
}

export async function getEvent(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      tickets: true,
      registrations: { take: 5 },
      speakers: true,
      _count: { select: { registrations: true, checkIns: true } },
    },
  });
  if (!event) throw AppError.notFound("Event not found");
  return event;
}

export async function updateEvent(eventId: string, data: Partial<z.infer<typeof eventSchema>>) {
  return prisma.event.update({
    where: { id: eventId },
    data: eventSchema.partial().parse(data),
  });
}

export async function listEvents(userId: string) {
  return prisma.event.findMany({
    where: { organizerId: userId },
    orderBy: { startDate: "asc" },
    include: { _count: { select: { registrations: true } } },
  });
}

export async function addSpeaker(eventId: string, name: string, bio: string, photo?: string) {
  return prisma.speaker.create({
    data: { eventId, name, bio, photo },
  });
}
