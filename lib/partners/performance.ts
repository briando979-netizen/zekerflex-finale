// ---------------------------------------------------------------------------
// Performance Analytics — Partner KPIs, leaderboards, trends
// Subsystem 5/6 for production Partner & Affiliate Management
// ---------------------------------------------------------------------------

import { prisma } from '@/lib/prisma';

export interface PartnerKPI {
  affiliateId: string;
  conversions: number;
  conversionRate: number;
  totalRevenue: number;
  totalCommissions: number;
  roi: number;
  avgOrderValue: number;
  clickCount: number;
  impressions: number;
  ctr: number; // click-through rate
}

export interface LeaderboardEntry {
  rank: number;
  affiliateId: string;
  name: string;
  email: string;
  totalRevenue: number;
  totalCommissions: number;
  conversions: number;
  score: number; // composite score for ranking
}

/**
 * Calculate KPIs for an affiliate
 */
export async function calculateAffiliateKPI(affiliateId: string): Promise<PartnerKPI> {
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
    include: {
      trackings: true,
      commissions: true,
    },
  });

  if (!affiliate) throw new Error('Affiliate not found');

  const conversions = affiliate.totalConversions;
  const clickCount = affiliate.trackings.length;
  const impressions = 0; // Would be tracked separately in a real system
  const totalRevenue = affiliate.trackings.reduce((sum, t) => sum + t.conversionValue, 0);
  const totalCommissions = affiliate.totalEarnings;

  return {
    affiliateId,
    conversions,
    conversionRate: clickCount > 0 ? (conversions / clickCount) * 100 : 0,
    totalRevenue,
    totalCommissions,
    roi: totalRevenue > 0 ? ((totalCommissions / totalRevenue) * 100) : 0,
    avgOrderValue: conversions > 0 ? totalRevenue / conversions : 0,
    clickCount,
    impressions,
    ctr: impressions > 0 ? (clickCount / impressions) * 100 : 0,
  };
}

/**
 * Get performance metrics for the month
 */
export async function getMonthlyMetrics(
  affiliateId: string,
  year: number,
  month: number
): Promise<{
  conversions: number;
  revenue: number;
  commissions: number;
  conversionRate: number;
  trend: number; // percentage change from previous month
}> {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 1);

  const prevMonthStart = new Date(year, month - 2, 1);
  const prevMonthEnd = new Date(year, month - 1, 1);

  // Current month
  const currentTrackings = await prisma.tracking.findMany({
    where: {
      affiliateId,
      lastClick: {
        gte: startDate,
        lt: endDate,
      },
    },
  });

  // Previous month
  const prevTrackings = await prisma.tracking.findMany({
    where: {
      affiliateId,
      lastClick: {
        gte: prevMonthStart,
        lt: prevMonthEnd,
      },
    },
  });

  const currentConversions = currentTrackings.filter((t) => t.converted).length;
  const prevConversions = prevTrackings.filter((t) => t.converted).length;
  const currentRevenue = currentTrackings.reduce((sum, t) => sum + t.conversionValue, 0);

  return {
    conversions: currentConversions,
    revenue: currentRevenue,
    commissions: Math.floor(currentRevenue * 0.1), // Simplified
    conversionRate: currentTrackings.length > 0 ? (currentConversions / currentTrackings.length) * 100 : 0,
    trend: prevConversions > 0 ? ((currentConversions - prevConversions) / prevConversions) * 100 : 0,
  };
}

/**
 * Get performance analytics for all affiliates
 */
export async function getAllAffiliateAnalytics(): Promise<PartnerKPI[]> {
  const affiliates = await prisma.affiliate.findMany({
    include: {
      trackings: true,
      commissions: true,
    },
  });

  return Promise.all(affiliates.map((a) => calculateAffiliateKPI(a.id)));
}

/**
 * Get top performers leaderboard
 */
export async function getLeaderboard(opts?: {
  metric?: 'revenue' | 'commissions' | 'conversions';
  limit?: number;
  period?: 'weekly' | 'monthly' | 'all_time';
}): Promise<LeaderboardEntry[]> {
  const affiliates = await prisma.affiliate.findMany({
    include: {
      trackings: true,
      commissions: true,
      user: true,
    },
    orderBy: {
      totalEarnings: 'desc',
    },
    take: opts?.limit || 10,
  });

  const entries = affiliates.map((a, idx) => ({
    rank: idx + 1,
    affiliateId: a.id,
    name: a.name,
    email: a.email,
    totalRevenue: a.trackings.reduce((sum, t) => sum + t.conversionValue, 0),
    totalCommissions: a.totalEarnings,
    conversions: a.totalConversions,
    score: a.totalEarnings, // Composite score based on earnings
  }));

  // Sort by selected metric
  if (opts?.metric === 'revenue') {
    entries.sort((a, b) => b.totalRevenue - a.totalRevenue);
  } else if (opts?.metric === 'conversions') {
    entries.sort((a, b) => b.conversions - a.conversions);
  }

  return entries.map((e, idx) => ({ ...e, rank: idx + 1 }));
}

/**
 * Identify top-performing affiliates
 */
export async function getTopPerformers(threshold: number = 0.2): Promise<LeaderboardEntry[]> {
  const allAffiliates = await prisma.affiliate.findMany({
    include: {
      trackings: true,
      commissions: true,
    },
  });

  const totalEarnings = allAffiliates.reduce((sum, a) => sum + a.totalEarnings, 0);
  const averageEarnings = totalEarnings / allAffiliates.length;

  const topPerformers = allAffiliates
    .filter((a) => a.totalEarnings > averageEarnings * threshold)
    .sort((a, b) => b.totalEarnings - a.totalEarnings)
    .map((a, idx) => ({
      rank: idx + 1,
      affiliateId: a.id,
      name: a.name,
      email: a.email,
      totalRevenue: a.trackings.reduce((sum, t) => sum + t.conversionValue, 0),
      totalCommissions: a.totalEarnings,
      conversions: a.totalConversions,
      score: a.totalEarnings,
    }));

  return topPerformers;
}

/**
 * Identify underperformers for support
 */
export async function getUnderperformers(limit: number = 10): Promise<LeaderboardEntry[]> {
  const affiliates = await prisma.affiliate.findMany({
    include: {
      trackings: true,
      commissions: true,
    },
    orderBy: {
      totalEarnings: 'asc',
    },
    take: limit,
  });

  return affiliates.map((a, idx) => ({
    rank: idx + 1,
    affiliateId: a.id,
    name: a.name,
    email: a.email,
    totalRevenue: a.trackings.reduce((sum, t) => sum + t.conversionValue, 0),
    totalCommissions: a.totalEarnings,
    conversions: a.totalConversions,
    score: a.totalEarnings,
  }));
}

/**
 * Generate performance report
 */
export async function generatePerformanceReport(affiliateId: string) {
  const kpi = await calculateAffiliateKPI(affiliateId);
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
    include: { trackings: true },
  });

  if (!affiliate) throw new Error('Affiliate not found');

  // Identify trends
  const monthlyMetrics = await Promise.all(
    Array.from({ length: 12 }, (_, i) => getMonthlyMetrics(affiliateId, new Date().getFullYear(), i + 1))
  );

  const trend = monthlyMetrics.length > 1
    ? monthlyMetrics[monthlyMetrics.length - 1].trend
    : 0;

  return {
    affiliateId,
    name: affiliate.name,
    email: affiliate.email,
    period: `${new Date().getFullYear()}`,
    kpi,
    monthlyMetrics,
    overallTrend: trend > 0 ? 'GROWING' : trend < 0 ? 'DECLINING' : 'STABLE',
    recommendations: generateRecommendations(kpi, trend),
  };
}

/**
 * Generate recommendations based on performance
 */
function generateRecommendations(kpi: PartnerKPI, trend: number): string[] {
  const recommendations: string[] = [];

  if (kpi.conversionRate < 2) {
    recommendations.push('Overweeg het optimaliseren van je landingspagina voor betere conversies');
  }

  if (kpi.roi < 10) {
    recommendations.push('Je ROI is laag; overweeg het gericht bereiken van meer kwalificeerde prospects');
  }

  if (trend < -10) {
    recommendations.push('Je prestaties gaan achteruit; controleer je marketingkanalen');
  }

  if (kpi.conversions === 0) {
    recommendations.push('Je hebt nog geen conversies; probeer je referrallink op meer plekken te delen');
  }

  if (recommendations.length === 0) {
    recommendations.push('Je presteert goed! Ga zo door met deze strategie');
  }

  return recommendations;
}

/**
 * Get engagement metrics
 */
export async function getEngagementMetrics(affiliateId: string) {
  const trackings = await prisma.tracking.findMany({
    where: { affiliateId },
  });

  const uniqueDevices = new Set(trackings.map((t) => t.deviceId)).size;
  const avgDaysActive = trackings.length > 0 ? 30 : 0; // Placeholder

  return {
    totalTouchpoints: trackings.length,
    uniqueDevices,
    conversionRate: trackings.length > 0
      ? (trackings.filter((t) => t.converted).length / trackings.length) * 100
      : 0,
    avgEngagementScore: trackings.length > 0
      ? trackings.reduce((sum, t) => sum + (t.converted ? 100 : 10), 0) / trackings.length
      : 0,
    avgDaysActive,
  };
}

/**
 * Get channel attribution
 */
export async function getChannelAttribution(affiliateId: string) {
  const trackings = await prisma.tracking.findMany({
    where: { affiliateId },
  });

  const channels: Record<string, { clicks: number; conversions: number }> = {};

  trackings.forEach((t) => {
    const channel = (t.utm as any)?.source || 'direct';
    if (!channels[channel]) channels[channel] = { clicks: 0, conversions: 0 };
    channels[channel].clicks += 1;
    if (t.converted) channels[channel].conversions += 1;
  });

  return Object.entries(channels).map(([channel, data]) => ({
    channel,
    clicks: data.clicks,
    conversions: data.conversions,
    conversionRate: data.clicks > 0 ? (data.conversions / data.clicks) * 100 : 0,
  }));
}
