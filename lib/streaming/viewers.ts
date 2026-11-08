import { prisma } from "@/lib/prisma";

export interface ViewerSession {
  userId: string;
  streamId: string;
  startTime: Date;
  endTime?: Date;
  location?: string;
  deviceType: "desktop" | "mobile" | "tablet";
}

export async function trackViewer(userId: string, streamId: string, location?: string, deviceType: "desktop" | "mobile" | "tablet" = "desktop") {
  const existingSession = await prisma.streamViewer.findFirst({
    where: { streamId, userId, endedAt: null },
  });

  if (existingSession) return existingSession;

  return await prisma.streamViewer.create({
    data: {
      streamId,
      userId,
      startedAt: new Date(),
      location,
      deviceType,
    },
  });
}

export async function endViewerSession(userId: string, streamId: string) {
  return await prisma.streamViewer.updateMany({
    where: { streamId, userId, endedAt: null },
    data: { endedAt: new Date() },
  });
}

export async function getActiveViewerCount(streamId: string): Promise<number> {
  return await prisma.streamViewer.count({
    where: { streamId, endedAt: null },
  });
}

export async function getViewerAnalytics(streamId: string) {
  const viewers = await prisma.streamViewer.findMany({
    where: { streamId },
  });

  const totalViewers = new Set(viewers.map((v) => v.userId)).size;
  const avgWatchTime = viewers.reduce((sum, v) => {
    const duration = v.endedAt ? (v.endedAt.getTime() - v.startedAt.getTime()) / 1000 : 0;
    return sum + duration;
  }, 0) / (totalViewers || 1);

  const locationDistribution: Record<string, number> = {};
  viewers.forEach((v) => {
    if (v.location) {
      locationDistribution[v.location] = (locationDistribution[v.location] || 0) + 1;
    }
  });

  const deviceDistribution: Record<string, number> = {
    desktop: viewers.filter((v) => v.deviceType === "desktop").length,
    mobile: viewers.filter((v) => v.deviceType === "mobile").length,
    tablet: viewers.filter((v) => v.deviceType === "tablet").length,
  };

  return {
    totalViewers,
    uniqueViewers: totalViewers,
    avgWatchTime: Math.round(avgWatchTime),
    peakViewerCount: viewers.length,
    locationDistribution,
    deviceDistribution,
    retentionCurve: calculateRetention(viewers),
  };
}

export async function getViewerEngagement(streamId: string) {
  const messages = await prisma.streamChatMessage.count({ where: { streamId } });
  const reactions = await prisma.streamChatReaction.count({
    where: { message: { streamId } },
  });

  const uniqueEngagedUsers = await prisma.streamChatMessage.findMany({
    where: { streamId },
    distinct: ["userId"],
    select: { userId: true },
  });

  return {
    totalMessages: messages,
    totalReactions: reactions,
    engagedUsers: uniqueEngagedUsers.length,
    engagementRate: 0,
  };
}

function calculateRetention(viewers: any[]): number[] {
  if (!viewers.length) return [];

  const segments: number[] = [0, 25, 50, 75, 100];
  const retention: number[] = [];

  viewers.forEach((viewer) => {
    const duration = viewer.endedAt
      ? (viewer.endedAt.getTime() - viewer.startedAt.getTime()) / 1000
      : 0;

    segments.forEach((segment, idx) => {
      if (!retention[idx]) retention[idx] = 0;
      if (duration >= (segment / 100)) {
        retention[idx]++;
      }
    });
  });

  return retention.map((r) => Math.round((r / viewers.length) * 100));
}
