// ===========================================================================
// Subsystem 4: Analytics — Track video performance, engagement, conversions
// ===========================================================================

import { prisma } from "@/lib/prisma";

export interface EngagementMetrics {
  clicks: number;
  ctas: number;
  shares: number;
  bookmarks: number;
  reports: number;
  total: number;
}

export interface ViewAnalytics {
  videoId: string;
  totalViews: number;
  uniqueViewers: number;
  totalWatchTime: number; // seconds
  averageWatchTime: number; // seconds
  completionRate: number; // 0-100%
  dropOffRate: number; // 0-100%
  engagementMetrics: EngagementMetrics;
  deviceBreakdown: Record<string, number>;
  topReferrers: Array<{ referrer: string; views: number }>;
}

export interface ConversionMetrics {
  videoId: string;
  clickThroughRate: number; // 0-100%
  conversions: number;
  conversionRate: number; // 0-100%
  ctr: number; // 0-100%
}

// Track an engagement event
export async function trackEngagement(
  videoId: string,
  userId: string | undefined,
  engagementType: "click-through" | "cta-click" | "share" | "bookmark" | "report",
  metadata?: any,
): Promise<string> {
  const engagement = await prisma.videoEngagement.create({
    data: {
      videoId,
      userId: userId || undefined,
      engagementType,
      metadata: metadata ?? {},
    },
  });

  return engagement.id;
}

// Get view analytics for a video
export async function getViewAnalytics(videoId: string): Promise<ViewAnalytics> {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { views: true, watchTime: true, durationSeconds: true },
  });

  if (!video) {
    throw new Error("Video not found");
  }

  const views = await prisma.videoView.findMany({
    where: { videoId },
  });

  const engagements = await prisma.videoEngagement.findMany({
    where: { videoId },
  });

  const uniqueViewers = new Set(views.map((v) => v.userId).filter(Boolean)).size;
  const completedViews = views.filter((v) => v.completedPercentage === 100).length;
  const completionRate = views.length > 0 ? (completedViews / views.length) * 100 : 0;

  const engagementMetrics: EngagementMetrics = {
    clicks: engagements.filter((e) => e.engagementType === "click-through").length,
    ctas: engagements.filter((e) => e.engagementType === "cta-click").length,
    shares: engagements.filter((e) => e.engagementType === "share").length,
    bookmarks: engagements.filter((e) => e.engagementType === "bookmark").length,
    reports: engagements.filter((e) => e.engagementType === "report").length,
    total: engagements.length,
  };

  const deviceBreakdown: Record<string, number> = {};
  for (const view of views) {
    deviceBreakdown[view.deviceType] = (deviceBreakdown[view.deviceType] ?? 0) + 1;
  }

  const averageWatchTime = views.length > 0 ? views.reduce((sum, v) => sum + v.duration, 0) / views.length : 0;

  return {
    videoId,
    totalViews: video.views,
    uniqueViewers,
    totalWatchTime: video.watchTime,
    averageWatchTime,
    completionRate,
    dropOffRate: 100 - completionRate,
    engagementMetrics,
    deviceBreakdown,
    topReferrers: [], // Placeholder - would need referrer tracking
  };
}

// Get engagement metrics
export async function getEngagementMetrics(videoId: string): Promise<EngagementMetrics> {
  const engagements = await prisma.videoEngagement.findMany({
    where: { videoId },
  });

  return {
    clicks: engagements.filter((e) => e.engagementType === "click-through").length,
    ctas: engagements.filter((e) => e.engagementType === "cta-click").length,
    shares: engagements.filter((e) => e.engagementType === "share").length,
    bookmarks: engagements.filter((e) => e.engagementType === "bookmark").length,
    reports: engagements.filter((e) => e.engagementType === "report").length,
    total: engagements.length,
  };
}

// Get conversion metrics
export async function getConversionMetrics(videoId: string): Promise<ConversionMetrics> {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { views: true },
  });

  if (!video) {
    throw new Error("Video not found");
  }

  const engagements = await prisma.videoEngagement.findMany({
    where: { videoId },
  });

  const clickThroughs = engagements.filter((e) => e.engagementType === "click-through").length;
  const ctas = engagements.filter((e) => e.engagementType === "cta-click").length;

  const clickThroughRate = video.views > 0 ? (clickThroughs / video.views) * 100 : 0;
  const ctaRate = video.views > 0 ? (ctas / video.views) * 100 : 0;

  return {
    videoId,
    clickThroughRate,
    conversions: ctas,
    conversionRate: ctaRate,
    ctr: clickThroughRate,
  };
}

// Get trending videos
export async function getTrendingVideos(
  limit: number = 10,
  hoursBack: number = 24,
): Promise<Array<{ videoId: string; views: number; engagement: number; trend: number }>> {
  const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  const recentViews = await prisma.videoView.groupBy({
    by: ["videoId"],
    where: { createdAt: { gte: cutoff } },
    _count: true,
    orderBy: { _count: { videoId: "desc" } },
    take: limit,
  });

  const results = await Promise.all(
    recentViews.map(async (rv) => {
      const engagements = await prisma.videoEngagement.count({
        where: {
          videoId: rv.videoId,
          createdAt: { gte: cutoff },
        },
      });

      return {
        videoId: rv.videoId,
        views: rv._count,
        engagement: engagements,
        trend: rv._count + engagements,
      };
    }),
  );

  return results.sort((a, b) => b.trend - a.trend);
}

// Get performance report for multiple videos
export async function getPerformanceReport(
  videoIds: string[],
): Promise<Array<{ videoId: string; views: number; engagement: number; completionRate: number }>> {
  return Promise.all(
    videoIds.map(async (videoId) => {
      const [views, engagements] = await Promise.all([
        prisma.videoView.findMany({ where: { videoId } }),
        prisma.videoEngagement.findMany({ where: { videoId } }),
      ]);

      const completedViews = views.filter((v) => v.completedPercentage === 100).length;
      const completionRate = views.length > 0 ? (completedViews / views.length) * 100 : 0;

      return {
        videoId,
        views: views.length,
        engagement: engagements.length,
        completionRate,
      };
    }),
  );
}

// Get watch time distribution (heatmap data)
export async function getWatchTimeDistribution(videoId: string): Promise<Array<{ time: number; viewers: number }>> {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { durationSeconds: true },
  });

  if (!video) throw new Error("Video not found");

  const views = await prisma.videoView.findMany({
    where: { videoId },
  });

  const distribution: Array<{ time: number; viewers: number }> = [];

  // Create 10 time buckets
  const bucketSize = Math.ceil(video.durationSeconds / 10);

  for (let i = 0; i < 10; i++) {
    const timePoint = i * bucketSize;
    const viewers = views.filter((v) => v.watchedTo >= timePoint).length;
    distribution.push({ time: timePoint, viewers });
  }

  return distribution;
}

// Get subscriber engagement (for videos in user libraries/playlists)
export async function getSubscriberEngagement(videoId: string): Promise<{
  subscriberViews: number;
  nonSubscriberViews: number;
  subscriberEngagement: EngagementMetrics;
  nonSubscriberEngagement: EngagementMetrics;
}> {
  const views = await prisma.videoView.findMany({
    where: { videoId },
  });

  const engagements = await prisma.videoEngagement.findMany({
    where: { videoId },
  });

  const subscriberViews = views.filter((v) => v.userId).length;
  const nonSubscriberViews = views.filter((v) => !v.userId).length;

  const subscriberEngagements = engagements.filter((e) => e.userId);
  const nonSubscriberEngagements = engagements.filter((e) => !e.userId);

  return {
    subscriberViews,
    nonSubscriberViews,
    subscriberEngagement: {
      clicks: subscriberEngagements.filter((e) => e.engagementType === "click-through").length,
      ctas: subscriberEngagements.filter((e) => e.engagementType === "cta-click").length,
      shares: subscriberEngagements.filter((e) => e.engagementType === "share").length,
      bookmarks: subscriberEngagements.filter((e) => e.engagementType === "bookmark").length,
      reports: subscriberEngagements.filter((e) => e.engagementType === "report").length,
      total: subscriberEngagements.length,
    },
    nonSubscriberEngagement: {
      clicks: nonSubscriberEngagements.filter((e) => e.engagementType === "click-through").length,
      ctas: nonSubscriberEngagements.filter((e) => e.engagementType === "cta-click").length,
      shares: nonSubscriberEngagements.filter((e) => e.engagementType === "share").length,
      bookmarks: nonSubscriberEngagements.filter((e) => e.engagementType === "bookmark").length,
      reports: nonSubscriberEngagements.filter((e) => e.engagementType === "report").length,
      total: nonSubscriberEngagements.length,
    },
  };
}
