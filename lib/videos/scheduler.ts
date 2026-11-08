// ===========================================================================
// Subsystem 3: Scheduler — Publish videos to multiple platforms on schedule
// ===========================================================================

import { prisma } from "@/lib/prisma";

export type Platform = "youtube" | "instagram" | "tiktok" | "facebook" | "linkedin" | "twitter" | "all";

export interface ScheduleConfig {
  videoId: string;
  platform: Platform;
  scheduledAt: Date;
  metadata?: {
    title?: string;
    description?: string;
    hashtags?: string[];
    thumbnail?: string;
    keywords?: string[];
    category?: string;
    visibility?: "public" | "private" | "unlisted";
    tags?: string[];
  };
}

export interface PublishResult {
  id: string;
  videoId: string;
  platform: Platform;
  status: "scheduled" | "published" | "failed" | "cancelled";
  externalVideoId?: string;
  publishedAt?: Date;
  errorMessage?: string;
}

// Schedule a video for publishing on a platform
export async function scheduleVideoPublish(config: ScheduleConfig): Promise<PublishResult> {
  const schedule = await prisma.videoSchedule.create({
    data: {
      videoId: config.videoId,
      platform: config.platform,
      scheduledAt: config.scheduledAt,
      status: "scheduled",
      metadata: config.metadata ?? {},
    },
  });

  return formatScheduleResult(schedule);
}

// Get scheduled videos
export async function getScheduledVideos(
  platform?: Platform,
  filter?: "upcoming" | "past" | "all",
): Promise<PublishResult[]> {
  const now = new Date();
  const where: any = platform ? { platform } : {};

  if (filter === "upcoming") {
    where.scheduledAt = { gt: now };
    where.status = "scheduled";
  } else if (filter === "past") {
    where.scheduledAt = { lt: now };
  }

  const schedules = await prisma.videoSchedule.findMany({
    where,
    orderBy: { scheduledAt: "desc" },
  });

  return schedules.map(formatScheduleResult);
}

// Get schedule by ID
export async function getScheduleById(id: string): Promise<PublishResult | null> {
  const schedule = await prisma.videoSchedule.findUnique({
    where: { id },
  });
  return schedule ? formatScheduleResult(schedule) : null;
}

// Cancel a scheduled publish
export async function cancelScheduledPublish(id: string): Promise<PublishResult> {
  const schedule = await prisma.videoSchedule.update({
    where: { id },
    data: { status: "cancelled" },
  });
  return formatScheduleResult(schedule);
}

// Update a scheduled publish
export async function updateScheduledPublish(
  id: string,
  config: Partial<ScheduleConfig>,
): Promise<PublishResult> {
  const schedule = await prisma.videoSchedule.update({
    where: { id },
    data: {
      platform: config.platform,
      scheduledAt: config.scheduledAt,
      metadata: config.metadata,
    },
  });
  return formatScheduleResult(schedule);
}

// Mark a video as published
export async function markAsPublished(
  id: string,
  externalVideoId: string,
): Promise<PublishResult> {
  const schedule = await prisma.videoSchedule.update({
    where: { id },
    data: {
      status: "published",
      publishedAt: new Date(),
      externalVideoId,
    },
  });
  return formatScheduleResult(schedule);
}

// Record a publish failure
export async function recordPublishFailure(
  id: string,
  errorMessage: string,
): Promise<PublishResult> {
  const schedule = await prisma.videoSchedule.update({
    where: { id },
    data: {
      status: "failed",
      errorMessage,
    },
  });
  return formatScheduleResult(schedule);
}

// Get videos due for publishing (scheduled in the past and not yet published)
export async function getVideosForPublishing(): Promise<PublishResult[]> {
  const now = new Date();
  const schedules = await prisma.videoSchedule.findMany({
    where: {
      scheduledAt: { lte: now },
      status: "scheduled",
    },
    orderBy: { scheduledAt: "asc" },
  });
  return schedules.map(formatScheduleResult);
}

// Get publishing history for a video
export async function getPublishingHistory(videoId: string): Promise<PublishResult[]> {
  const schedules = await prisma.videoSchedule.findMany({
    where: {
      videoId,
      status: { in: ["published", "failed"] },
    },
    orderBy: { publishedAt: "desc" },
  });
  return schedules.map(formatScheduleResult);
}

// Get publishing statistics
export async function getPublishingStats(): Promise<{
  scheduled: number;
  published: number;
  failed: number;
  cancelled: number;
  byPlatform: Record<Platform | "all", number>;
}> {
  const [scheduled, published, failed, cancelled] = await Promise.all([
    prisma.videoSchedule.count({ where: { status: "scheduled" } }),
    prisma.videoSchedule.count({ where: { status: "published" } }),
    prisma.videoSchedule.count({ where: { status: "failed" } }),
    prisma.videoSchedule.count({ where: { status: "cancelled" } }),
  ]);

  const byPlatform: Record<Platform | "all", number> = {
    youtube: await prisma.videoSchedule.count({ where: { platform: "youtube" } }),
    instagram: await prisma.videoSchedule.count({ where: { platform: "instagram" } }),
    tiktok: await prisma.videoSchedule.count({ where: { platform: "tiktok" } }),
    facebook: await prisma.videoSchedule.count({ where: { platform: "facebook" } }),
    linkedin: await prisma.videoSchedule.count({ where: { platform: "linkedin" } }),
    twitter: await prisma.videoSchedule.count({ where: { platform: "twitter" } }),
    all: await prisma.videoSchedule.count({ where: { platform: "all" } }),
  };

  return { scheduled, published, failed, cancelled, byPlatform };
}

// Batch schedule videos to multiple platforms
export async function batchScheduleVideo(
  videoId: string,
  platforms: Platform[],
  scheduledAt: Date,
  metadata?: ScheduleConfig["metadata"],
): Promise<PublishResult[]> {
  const results: PublishResult[] = [];

  for (const platform of platforms) {
    const result = await scheduleVideoPublish({
      videoId,
      platform,
      scheduledAt,
      metadata,
    });
    results.push(result);
  }

  return results;
}

// Format schedule result
function formatScheduleResult(schedule: any): PublishResult {
  return {
    id: schedule.id,
    videoId: schedule.videoId,
    platform: schedule.platform,
    status: schedule.status,
    externalVideoId: schedule.externalVideoId,
    publishedAt: schedule.publishedAt,
    errorMessage: schedule.errorMessage,
  };
}
