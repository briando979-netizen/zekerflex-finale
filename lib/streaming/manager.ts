import { prisma } from "@/lib/prisma";
import { z } from "zod";

const streamMetadataSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  category: z.string(),
  tags: z.array(z.string()).optional(),
  thumbnail: z.string().url().optional(),
  isPublic: z.boolean().default(true),
});

export type StreamMetadata = z.infer<typeof streamMetadataSchema>;

export async function updateStreamMetadata(streamId: string, metadata: Partial<StreamMetadata>) {
  const validated = streamMetadataSchema.partial().parse(metadata);

  return await prisma.liveStream.update({
    where: { id: streamId },
    data: {
      title: validated.title,
      description: validated.description,
      category: validated.category,
      tags: validated.tags,
      thumbnailUrl: validated.thumbnail,
      isPublic: validated.isPublic,
    },
  });
}

export async function scheduleStream(
  userId: string,
  title: string,
  scheduledFor: Date,
  metadata: StreamMetadata
) {
  return await prisma.liveStream.create({
    data: {
      userId,
      title,
      description: metadata.description,
      category: metadata.category,
      tags: metadata.tags,
      thumbnailUrl: metadata.thumbnail,
      isPublic: metadata.isPublic,
      status: "scheduled",
      scheduledFor,
      streamKey: generateStreamKey(),
      ingestUrl: generateIngestUrl(),
    },
  });
}

export async function getStreamInfo(streamId: string) {
  return await prisma.liveStream.findUnique({
    where: { id: streamId },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
      recordings: { take: 10, orderBy: { recordedAt: "desc" } },
      _count: { select: { chatMessages: true, viewers: true } },
    },
  });
}

export async function listActiveStreams() {
  return await prisma.liveStream.findMany({
    where: { status: "live" },
    orderBy: { viewerCount: "desc" },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
      _count: { select: { chatMessages: true } },
    },
  });
}

export async function archiveStream(streamId: string) {
  return await prisma.liveStream.update({
    where: { id: streamId },
    data: { status: "archived", archivedAt: new Date() },
  });
}

export async function getStreamRecordings(streamId: string) {
  return await prisma.streamRecording.findMany({
    where: { streamId },
    orderBy: { recordedAt: "desc" },
  });
}

function generateStreamKey(): string {
  return Math.random().toString(36).substring(2, 34);
}

function generateIngestUrl(): string {
  return `rtmp://ingest.example.com/live/${generateStreamKey()}`;
}
