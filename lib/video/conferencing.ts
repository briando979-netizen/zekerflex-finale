import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

const conferenceSchema = z.object({
  title: z.string().min(1).max(200),
  channelId: z.string(),
  participantIds: z.array(z.string()),
  maxParticipants: z.number().min(2).max(500).default(100),
  recordingEnabled: z.boolean().default(false),
  transcriptionEnabled: z.boolean().default(false),
});

export type ConferenceInput = z.infer<typeof conferenceSchema>;

export async function createConference(userId: string, data: ConferenceInput) {
  const validated = conferenceSchema.parse(data);
  const conference = await prisma.videoConference.create({
    data: {
      title: validated.title,
      channelId: validated.channelId,
      creatorId: userId,
      participants: validated.participantIds,
      maxParticipants: validated.maxParticipants,
      recordingEnabled: validated.recordingEnabled,
      transcriptionEnabled: validated.transcriptionEnabled,
      roomToken: `room_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    },
  });
  return conference;
}

export async function getConference(conferenceId: string) {
  const conf = await prisma.videoConference.findUnique({
    where: { id: conferenceId },
    include: { creator: { select: { id: true, email: true } } },
  });
  if (!conf) throw AppError.notFound("Conference not found");
  return conf;
}

export async function addParticipant(conferenceId: string, userId: string) {
  const conf = await getConference(conferenceId);
  if (conf.participants.length >= conf.maxParticipants) {
    throw AppError.validation("Conference is full");
  }
  return prisma.videoConference.update({
    where: { id: conferenceId },
    data: { participants: { push: userId } },
  });
}

export async function removeParticipant(conferenceId: string, userId: string) {
  const conf = await getConference(conferenceId);
  const updated = conf.participants.filter((p: string) => p !== userId);
  return prisma.videoConference.update({
    where: { id: conferenceId },
    data: { participants: updated },
  });
}

export async function startRecording(conferenceId: string) {
  return prisma.videoConference.update({
    where: { id: conferenceId },
    data: { recordingStartedAt: new Date(), isRecording: true },
  });
}

export async function stopRecording(conferenceId: string) {
  return prisma.videoConference.update({
    where: { id: conferenceId },
    data: { recordingEndedAt: new Date(), isRecording: false },
  });
}

export async function endConference(conferenceId: string) {
  return prisma.videoConference.update({
    where: { id: conferenceId },
    data: { endedAt: new Date(), isActive: false },
  });
}

export async function getConferenceTranscript(conferenceId: string) {
  return prisma.conferenceTranscript.findFirst({
    where: { conferenceId },
    orderBy: { createdAt: "desc" },
  });
}

export async function listChannelConferences(channelId: string) {
  return prisma.videoConference.findMany({
    where: { channelId, isActive: true },
    orderBy: { createdAt: "desc" },
  });
}
