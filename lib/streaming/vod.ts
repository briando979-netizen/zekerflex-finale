import { prisma } from "@/lib/prisma";

export interface RecordingMetadata {
  title: string;
  description?: string;
  thumbnail?: string;
  duration: number;
  isPublic: boolean;
}

export async function createRecording(streamId: string, metadata: RecordingMetadata) {
  return await prisma.streamRecording.create({
    data: {
      streamId,
      title: metadata.title,
      description: metadata.description,
      thumbnailUrl: metadata.thumbnail,
      duration: metadata.duration,
      status: "processing",
      recordedAt: new Date(),
      hlsUrl: "",
      dashUrl: "",
    },
  });
}

export async function updateRecordingStatus(recordingId: string, status: "processing" | "completed" | "failed") {
  return await prisma.streamRecording.update({
    where: { id: recordingId },
    data: {
      status,
      completedAt: status === "completed" ? new Date() : null,
      hlsUrl: status === "completed" ? `https://vod.example.com/hls/${recordingId}/master.m3u8` : "",
      dashUrl: status === "completed" ? `https://vod.example.com/dash/${recordingId}/manifest.mpd` : "",
    },
  });
}

export async function generateThumbnail(recordingId: string, timestamp: number) {
  const recording = await prisma.streamRecording.findUnique({ where: { id: recordingId } });
  if (!recording) throw new Error("Recording not found");

  return await prisma.streamRecording.update({
    where: { id: recordingId },
    data: {
      thumbnailUrl: `https://vod.example.com/thumbnails/${recordingId}_${timestamp}.jpg`,
    },
  });
}

export async function createClip(recordingId: string, startTime: number, endTime: number, title: string) {
  const recording = await prisma.streamRecording.findUnique({ where: { id: recordingId } });
  if (!recording) throw new Error("Recording not found");

  return await prisma.streamClip.create({
    data: {
      recordingId,
      title,
      description: "",
      startTime,
      endTime,
      duration: endTime - startTime,
      hlsUrl: `https://vod.example.com/clips/${recordingId}_${startTime}_${endTime}.m3u8`,
      dashUrl: `https://vod.example.com/clips/${recordingId}_${startTime}_${endTime}.mpd`,
      status: "completed",
    },
  });
}

export async function searchRecordings(query: string) {
  return await prisma.streamRecording.findMany({
    where: {
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: { recordedAt: "desc" },
    take: 20,
  });
}

export async function getRecordingAnalytics(recordingId: string) {
  const recording = await prisma.streamRecording.findUnique({ where: { id: recordingId } });
  if (!recording) throw new Error("Recording not found");

  const views = await prisma.streamRecordingView.count({ where: { recordingId } });
  const avgWatchTime = await getAverageWatchTime(recordingId);
  const clips = await prisma.streamClip.count({ where: { recordingId } });

  return {
    recording,
    views,
    avgWatchTime,
    clips,
    completionRate: 0,
  };
}

export async function trackRecordingView(recordingId: string, userId: string, watchTime: number) {
  return await prisma.streamRecordingView.create({
    data: {
      recordingId,
      userId,
      viewedAt: new Date(),
      watchTime,
    },
  });
}

async function getAverageWatchTime(recordingId: string): Promise<number> {
  const views = await prisma.streamRecordingView.findMany({ where: { recordingId } });
  if (!views.length) return 0;

  return Math.round(views.reduce((sum, v) => sum + v.watchTime, 0) / views.length);
}

export async function deleteRecording(recordingId: string) {
  return await prisma.streamRecording.update({
    where: { id: recordingId },
    data: { deletedAt: new Date() },
  });
}
