import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import type { UpsellOffer } from "@prisma/client";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Subsystem 5: Upsell/Cross-sell
//
// Smart recommendations based on usage patterns, customer similarity,
// and behavioral signals. Tracks offer engagement and conversion.
// ---------------------------------------------------------------------------

export const UpsellOfferSchema = z.object({
  customerId: z.string(),
  type: z.enum(["upsell", "cross_sell", "addon", "upgrade"]),
  productName: z.string(),
  productId: z.string().optional(),
  basePrice: z.number().int().min(0),
  recommendationBasis: z.enum(["usage_pattern", "similar_customers", "account_growth", "seasonal"]),
  relevanceScore: z.number().min(0).max(1),
  discountPercentage: z.number().int().min(0).max(100).optional(),
});

export type UpsellOfferInput = z.infer<typeof UpsellOfferSchema>;

/**
 * Create an upsell offer.
 */
export async function createUpsellOffer(input: UpsellOfferInput): Promise<UpsellOffer> {
  try {
    const validated = UpsellOfferSchema.parse(input);

    const discountedPrice = validated.discountPercentage
      ? Math.round(validated.basePrice * (1 - validated.discountPercentage / 100))
      : null;

    const offer = await prisma.upsellOffer.create({
      data: {
        customerId: validated.customerId,
        type: validated.type,
        productName: validated.productName,
        productId: validated.productId ?? null,
        basePrice: validated.basePrice,
        discountedPrice,
        discountPercentage: validated.discountPercentage ?? null,
        recommendationBasis: validated.recommendationBasis,
        relevanceScore: validated.relevanceScore,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });

    logger.info("Upsell offer created", {
      offerId: offer.id,
      customerId: validated.customerId,
      type: validated.type,
      relevanceScore: validated.relevanceScore,
    });

    return offer;
  } catch (err) {
    logger.error("Failed to create upsell offer", {
      error: (err as Error).message,
    });
    throw AppError.validation("Aanbodcreatie mislukt.");
  }
}

/**
 * Record offer presentation to customer.
 */
export async function recordOfferPresented(offerId: string): Promise<UpsellOffer> {
  return prisma.upsellOffer.update({
    where: { id: offerId },
    data: {
      presented: true,
      presentedAt: new Date(),
      impressions: { increment: 1 },
    },
  });
}

/**
 * Record offer click/engagement.
 */
export async function recordOfferClicked(offerId: string): Promise<UpsellOffer> {
  const offer = await prisma.upsellOffer.findUnique({ where: { id: offerId } });

  if (!offer) {
    throw AppError.notFound("Aanbod niet gevonden.");
  }

  const ctr = offer.impressions > 0 ? (offer.clicks + 1) / offer.impressions : 0;

  return prisma.upsellOffer.update({
    where: { id: offerId },
    data: {
      clicked: true,
      clickedAt: new Date(),
      ctr,
    },
  });
}

/**
 * Record offer conversion/purchase.
 */
export async function recordOfferPurchased(offerId: string, actualPrice: number): Promise<UpsellOffer> {
  return prisma.upsellOffer.update({
    where: { id: offerId },
    data: {
      purchased: true,
      purchasedAt: new Date(),
      conversion: true,
    },
  });
}

/**
 * Record offer rejection.
 */
export async function recordOfferRejected(offerId: string): Promise<UpsellOffer> {
  return prisma.upsellOffer.update({
    where: { id: offerId },
    data: {
      rejectedAt: new Date(),
    },
  });
}

/**
 * Get active offers for a customer.
 */
export async function getCustomerOffers(customerId: string, limit = 10): Promise<UpsellOffer[]> {
  const now = new Date();

  return prisma.upsellOffer.findMany({
    where: {
      customerId,
      validUntil: { gte: now },
      purchased: false,
      rejectedAt: null,
    },
    orderBy: { relevanceScore: "desc" },
    take: limit,
  });
}

/**
 * Get high-relevance offers for presentation.
 */
export async function getHighRelevanceOffers(limit = 50): Promise<UpsellOffer[]> {
  const now = new Date();

  return prisma.upsellOffer.findMany({
    where: {
      validUntil: { gte: now },
      presented: false,
      relevanceScore: { gte: 0.7 },
    },
    orderBy: { relevanceScore: "desc" },
    take: limit,
  });
}

/**
 * Generate product recommendations based on customer usage.
 */
export async function generateRecommendations(
  customerId: string,
): Promise<
  Array<{
    productName: string;
    productId?: string;
    type: string;
    basis: string;
    relevanceScore: number;
    estimatedValue: number;
  }>
> {
  // In a real system, this would use ML and customer data
  // For now, return placeholder recommendations based on customer engagement

  const recommendations: Array<{
    productName: string;
    productId?: string;
    type: string;
    basis: string;
    relevanceScore: number;
    estimatedValue: number;
  }> = [];

  // Example recommendations
  recommendations.push(
    {
      productName: "Premium Support",
      type: "upgrade",
      basis: "account_growth",
      relevanceScore: 0.85,
      estimatedValue: 9900,
    },
    {
      productName: "Advanced Analytics",
      type: "addon",
      basis: "usage_pattern",
      relevanceScore: 0.72,
      estimatedValue: 4900,
    },
    {
      productName: "Team Collaboration",
      type: "cross_sell",
      basis: "similar_customers",
      relevanceScore: 0.68,
      estimatedValue: 7900,
    },
  );

  return recommendations;
}

/**
 * Get upsell metrics for a customer.
 */
export async function getUpsellMetrics(customerId: string): Promise<{
  total_offers: number;
  presented: number;
  clicked: number;
  purchased: number;
  ctr: number;
  conversion_rate: number;
  avg_relevance_score: number;
  total_value_offered: number;
  total_value_purchased: number;
}> {
  const offers = await prisma.upsellOffer.findMany({
    where: { customerId },
  });

  const presented = offers.filter((o) => o.presented).length;
  const clicked = offers.filter((o) => o.clicked).length;
  const purchased = offers.filter((o) => o.purchased).length;

  const ctr = presented > 0 ? Math.round((clicked / presented) * 100) : 0;
  const conversionRate = presented > 0 ? Math.round((purchased / presented) * 100) : 0;

  const avgRelevance = offers.length > 0 ? Math.round((offers.reduce((sum, o) => sum + o.relevanceScore, 0) / offers.length) * 100) / 100 : 0;

  const valueOffered = offers.reduce((sum, o) => sum + o.basePrice, 0);
  const valuePurchased = offers
    .filter((o) => o.purchased)
    .reduce((sum, o) => sum + (o.discountedPrice ?? o.basePrice), 0);

  return {
    total_offers: offers.length,
    presented,
    clicked,
    purchased,
    ctr,
    conversion_rate: conversionRate,
    avg_relevance_score: avgRelevance,
    total_value_offered: valueOffered,
    total_value_purchased: valuePurchased,
  };
}

/**
 * Generate upsell report.
 */
export async function generateUpsellReport(): Promise<{
  total_offers: number;
  total_presented: number;
  total_clicked: number;
  total_purchased: number;
  overall_ctr: number;
  overall_conversion_rate: number;
  by_type: Record<string, { offered: number; purchased: number; conversion_rate: number }>;
  by_basis: Record<string, { offered: number; purchased: number; avg_relevance: number }>;
  total_revenue: number;
}> {
  const offers = await prisma.upsellOffer.findMany();

  const presented = offers.filter((o) => o.presented).length;
  const clicked = offers.filter((o) => o.clicked).length;
  const purchased = offers.filter((o) => o.purchased).length;

  const byType: Record<string, any> = {};
  const byBasis: Record<string, any> = {};

  for (const offer of offers) {
    if (!byType[offer.type]) {
      byType[offer.type] = { offered: 0, purchased: 0, relevance_sum: 0 };
    }
    if (!byBasis[offer.recommendationBasis]) {
      byBasis[offer.recommendationBasis] = { offered: 0, purchased: 0, relevance_sum: 0 };
    }

    byType[offer.type].offered += 1;
    byBasis[offer.recommendationBasis].offered += 1;

    if (offer.purchased) {
      byType[offer.type].purchased += 1;
      byBasis[offer.recommendationBasis].purchased += 1;
    }

    byType[offer.type].relevance_sum += offer.relevanceScore;
    byBasis[offer.recommendationBasis].relevance_sum += offer.relevanceScore;
  }

  // Calculate rates
  const typeReport: Record<string, any> = {};
  for (const [type, data] of Object.entries(byType)) {
    typeReport[type] = {
      offered: data.offered,
      purchased: data.purchased,
      conversion_rate: data.offered > 0 ? Math.round((data.purchased / data.offered) * 100) : 0,
    };
  }

  const basisReport: Record<string, any> = {};
  for (const [basis, data] of Object.entries(byBasis)) {
    basisReport[basis] = {
      offered: data.offered,
      purchased: data.purchased,
      avg_relevance: Math.round((data.relevance_sum / data.offered) * 100) / 100,
    };
  }

  const totalRevenue = offers
    .filter((o) => o.purchased)
    .reduce((sum, o) => sum + (o.discountedPrice ?? o.basePrice), 0);

  const overallCtr = presented > 0 ? Math.round((clicked / presented) * 100) : 0;
  const overallConversion = presented > 0 ? Math.round((purchased / presented) * 100) : 0;

  logger.info("Upsell report generated", {
    total: offers.length,
    purchased,
    revenue: totalRevenue,
  });

  return {
    total_offers: offers.length,
    total_presented: presented,
    total_clicked: clicked,
    total_purchased: purchased,
    overall_ctr: overallCtr,
    overall_conversion_rate: overallConversion,
    by_type: typeReport,
    by_basis: basisReport,
    total_revenue: totalRevenue,
  };
}
