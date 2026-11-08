// ===========================================================================
// Subsystem 2: Video Player — Embedded player with analytics tracking
// ===========================================================================

import { prisma } from "@/lib/prisma";

export interface PlayerConfig {
  videoId: string;
  autoplay?: boolean;
  controls?: boolean;
  loop?: boolean;
  muted?: boolean;
  quality?: "360p" | "720p" | "1080p" | "4K";
  playbackRate?: number;
  preload?: "none" | "metadata" | "auto";
  playsInline?: boolean;
}

export interface PlayerEvent {
  videoId: string;
  userId?: string;
  eventType: "play" | "pause" | "seek" | "qualityChange" | "complete" | "error";
  timestamp: number;
  currentTime?: number;
  newQuality?: string;
  errorMessage?: string;
}

export interface PlayerMetrics {
  videoId: string;
  totalViews: number;
  completionRate: number; // 0-100%
  averageWatchTime: number; // seconds
  averageCompletion: number; // seconds
  dropOffPoints: Array<{ timeSeconds: number; viewers: number }>;
}

// Track a player event (analytics)
export async function trackPlayerEvent(event: PlayerEvent): Promise<void> {
  const { videoId, userId, eventType, currentTime = 0 } = event;

  // Update video view count on play
  if (eventType === "play") {
    await prisma.video.update({
      where: { id: videoId },
      data: { views: { increment: 1 } },
    });
  }

  // Track completion
  if (eventType === "complete" && currentTime) {
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: { durationSeconds: true },
    });

    if (video) {
      await prisma.video.update({
        where: { id: videoId },
        data: { watchTime: { increment: video.durationSeconds } },
      });
    }
  }
}

// Record a view (when user watches part of the video)
export async function recordVideoView(data: {
  videoId: string;
  userId?: string;
  watchedFrom: number;
  watchedTo: number;
  duration: number;
  deviceType: "mobile" | "tablet" | "desktop";
  browser?: string;
}): Promise<string> {
  const video = await prisma.video.findUnique({
    where: { id: data.videoId },
    select: { durationSeconds: true },
  });

  if (!video) throw new Error("Video not found");

  const completedPercentage = Math.round((data.watchedTo / video.durationSeconds) * 100);

  const view = await prisma.videoView.create({
    data: {
      videoId: data.videoId,
      userId: data.userId,
      watchedFrom: data.watchedFrom,
      watchedTo: data.watchedTo,
      completedPercentage,
      duration: data.duration,
      deviceType: data.deviceType,
      browser: data.browser,
    },
  });

  // Update video watch time
  await prisma.video.update({
    where: { id: data.videoId },
    data: { watchTime: { increment: data.duration } },
  });

  return view.id;
}

// Get player metrics for a video
export async function getPlayerMetrics(videoId: string): Promise<PlayerMetrics> {
  const views = await prisma.videoView.findMany({
    where: { videoId },
  });

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { durationSeconds: true, views: true, watchTime: true },
  });

  if (!video || views.length === 0) {
    return {
      videoId,
      totalViews: video?.views ?? 0,
      completionRate: 0,
      averageWatchTime: 0,
      averageCompletion: 0,
      dropOffPoints: [],
    };
  }

  const completedViews = views.filter((v) => v.completedPercentage === 100).length;
  const completionRate = (completedViews / views.length) * 100;
  const averageWatchTime = views.reduce((sum, v) => sum + v.duration, 0) / views.length;
  const averageCompletion = views.reduce((sum, v) => sum + v.watchedTo, 0) / views.length;

  // Calculate drop-off points
  const dropOffPoints: Array<{ timeSeconds: number; viewers: number }> = [];
  for (let i = 0; i <= video.durationSeconds; i += Math.ceil(video.durationSeconds / 10)) {
    const viewersAt = views.filter((v) => v.watchedTo >= i).length;
    if (viewersAt > 0) {
      dropOffPoints.push({ timeSeconds: i, viewers: viewersAt });
    }
  }

  return {
    videoId,
    totalViews: video.views,
    completionRate,
    averageWatchTime,
    averageCompletion,
    dropOffPoints,
  };
}

// Generate embed code
export function generateEmbedCode(videoId: string, config: Partial<PlayerConfig> = {}): string {
  const width = config.width ?? "100%";
  const height = config.height ?? "600";
  const quality = config.quality ?? "1080p";

  return `<iframe
    src="/player/${videoId}?quality=${quality}&autoplay=${config.autoplay ?? false}"
    width="${width}"
    height="${height}"
    frameborder="0"
    allow="autoplay; fullscreen"
    allowfullscreen
    title="Video Player"
  ></iframe>`;
}

// Get video quality variants
export async function getQualityVariants(videoId: string): Promise<string[]> {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { qualities: true },
  });
  return video?.qualities ?? [];
}

// Check if video is watchable (GDPR compliant, not deleted, etc.)
export async function isVideoWatchable(videoId: string): Promise<boolean> {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { gdprCompliant: true },
  });
  return video?.gdprCompliant ?? false;
}

// Recommend next video based on current watch pattern
export async function recommendNextVideo(
  currentVideoId: string,
  userRole: "general" | "employer" | "worker" | "admin",
): Promise<string | null> {
  const currentVideo = await prisma.video.findUnique({
    where: { id: currentVideoId },
    select: { category: true, sector: true, tags: true },
  });

  if (!currentVideo) return null;

  // Find similar video
  const nextVideo = await prisma.video.findFirst({
    where: {
      id: { not: currentVideoId },
      role: userRole,
      OR: [{ category: currentVideo.category }, { sector: currentVideo.sector }],
    },
    orderBy: { views: "desc" },
  });

  return nextVideo?.id ?? null;
}
