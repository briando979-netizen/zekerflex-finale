import { prisma } from "@/lib/prisma";

export async function trackClick(affiliateId: string, utm: { source: string; medium: string; campaign: string; content?: string }, deviceId: string) {
  const code = `track_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  const tracking = await prisma.tracking.create({
    data: {
      affiliateId,
      trackingCode: code,
      utm,
      deviceId,
      firstClick: new Date(),
      lastClick: new Date(),
      converted: false,
      attributionModel: "LAST_CLICK",
    },
  });

  return { trackingCode: code, trackingId: tracking.id };
}

export async function recordConversion(trackingId: string, conversionValue: number) {
  const tracking = await prisma.tracking.findUnique({
    where: { id: trackingId },
  });

  if (!tracking) return null;

  const affiliate = await prisma.affiliate.findUnique({
    where: { id: tracking.affiliateId },
  });

  if (!affiliate) return null;

  const commission = (conversionValue * affiliate.commissionRate) / 100;

  const updated = await prisma.tracking.update({
    where: { id: trackingId },
    data: {
      converted: true,
      conversionValue,
      commission,
    },
  });

  // Create commission record
  await prisma.commission.create({
    data: {
      affiliateId: affiliate.id,
      trackingId,
      amount: commission,
      status: "PENDING",
    },
  });

  // Update affiliate totals
  await prisma.affiliate.update({
    where: { id: affiliate.id },
    data: {
      totalEarnings: { increment: commission },
      totalConversions: { increment: 1 },
    },
  });

  return updated;
}

export async function getAttributionReport(affiliateId: string, days: number = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const trackings = await prisma.tracking.findMany({
    where: {
      affiliateId,
      firstClick: { gte: since },
    },
  });

  const conversions = trackings.filter((t) => t.converted);

  return {
    totalClicks: trackings.length,
    conversions: conversions.length,
    conversionRate: trackings.length > 0 ? (conversions.length / trackings.length) * 100 : 0,
    totalValue: conversions.reduce((sum, t) => sum + (t.conversionValue || 0), 0),
    totalCommission: conversions.reduce((sum, t) => sum + (t.commission || 0), 0),
    topSources: [...new Set(trackings.map((t) => t.utm.source))],
  };
}

export async function validateTracking(trackingCode: string): Promise<boolean> {
  const tracking = await prisma.tracking.findUnique({
    where: { trackingCode },
  });
  return !!tracking;
}
