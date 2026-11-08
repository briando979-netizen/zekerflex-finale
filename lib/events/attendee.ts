import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

export async function getEventSchedule(eventId: string) {
  const sessions = await prisma.session.findMany({
    where: { eventId },
    include: { speakers: true },
    orderBy: { startTime: "asc" },
  });
  return sessions;
}

export async function addSession(eventId: string, data: {
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  location?: string;
  speakerIds: string[];
}) {
  return prisma.session.create({
    data: {
      eventId,
      title: data.title,
      description: data.description,
      startTime: new Date(data.startTime),
      endTime: new Date(data.endTime),
      location: data.location,
      speakers: {
        connect: data.speakerIds.map(id => ({ id })),
      },
    },
  });
}

export async function getSpeakers(eventId: string) {
  return prisma.speaker.findMany({
    where: { eventId },
  });
}

export async function getEventVenue(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { location: true },
  });

  if (!event) throw AppError.notFound("Event not found");
  return event.location;
}

export async function submitFeedback(eventId: string, registrationId: string, feedback: {
  overallRating: number;
  comments?: string;
  bestPart?: string;
  improvementAreas?: string;
}) {
  const feedbackSchema = z.object({
    overallRating: z.number().min(1).max(5),
    comments: z.string().optional(),
    bestPart: z.string().optional(),
    improvementAreas: z.string().optional(),
  });

  const parsed = feedbackSchema.parse(feedback);

  return prisma.eventFeedback.create({
    data: {
      eventId,
      registrationId,
      ...parsed,
    },
  });
}

export async function getFeedback(eventId: string) {
  return prisma.eventFeedback.findMany({
    where: { eventId },
  });
}

export async function sendFollowUpEmail(eventId: string) {
  const registrations = await prisma.registration.findMany({
    where: { eventId, status: "CHECKED_IN" },
  });

  for (const reg of registrations) {
    // Send follow-up email
    console.log(`Follow-up email sent to ${reg.email}`);
  }

  return registrations.length;
}

export async function getNetworkingOpportunities(eventId: string, registrationId: string) {
  const currentReg = await prisma.registration.findUnique({
    where: { id: registrationId },
  });

  if (!currentReg) throw AppError.notFound("Registration not found");

  // Return other attendees at the same event
  const otherAttendees = await prisma.registration.findMany({
    where: {
      eventId,
      id: { not: registrationId },
      status: "CHECKED_IN",
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
    take: 10,
  });

  return otherAttendees;
}
