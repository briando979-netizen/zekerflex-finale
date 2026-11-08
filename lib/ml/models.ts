import { prisma } from "@/lib/prisma";

export interface ChurnPrediction {
  userId: string;
  churnProbability: number;
  riskFactors: string[];
  recommendedAction: string;
}

export interface LtvPrediction {
  userId: string;
  estimatedLtv: number;
  confidence: number;
  segments: string[];
}

export async function predictChurn(userId: string): Promise<ChurnPrediction> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastActivityAt: true, createdAt: true, subscriptionStatus: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const daysSinceActivity = Math.floor(
    (Date.now() - (user.lastActivityAt?.getTime() ?? 0)) / (1000 * 60 * 60 * 24)
  );
  const accountAge = Math.floor(
    (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  let churnScore = 0;
  const riskFactors: string[] = [];

  if (daysSinceActivity > 30) {
    churnScore += 0.3;
    riskFactors.push("inactive_30days");
  }
  if (daysSinceActivity > 60) {
    churnScore += 0.2;
    riskFactors.push("inactive_60days");
  }
  if (accountAge < 30 && churnScore > 0) {
    churnScore += 0.15;
    riskFactors.push("new_account_churn");
  }
  if (user.subscriptionStatus === "CANCELLED") {
    churnScore += 0.25;
    riskFactors.push("subscription_cancelled");
  }

  let recommendedAction = "none";
  if (churnScore > 0.6) {
    recommendedAction = "send_win_back_campaign";
  } else if (churnScore > 0.4) {
    recommendedAction = "send_reengagement_email";
  } else if (churnScore > 0.2) {
    recommendedAction = "monitor";
  }

  return {
    userId,
    churnProbability: Math.min(1, churnScore),
    riskFactors,
    recommendedAction,
  };
}

export async function predictLtv(userId: string): Promise<LtvPrediction> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const purchases = await prisma.order.findMany({
    where: { userId },
    select: { total: true, createdAt: true },
  });

  const totalSpent = purchases.reduce((sum, p) => sum + (p.total || 0), 0);
  const avgOrderValue = purchases.length ? totalSpent / purchases.length : 0;
  const monthsSinceFirst =
    purchases.length > 0
      ? (Date.now() - purchases[0]!.createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30)
      : 0;
  const avgMonthlyValue = monthsSinceFirst ? totalSpent / monthsSinceFirst : 0;

  const baseLtv = avgMonthlyValue * 24;
  const segments: string[] = [];

  if (baseLtv > 1000) {
    segments.push("high_value");
  } else if (baseLtv > 100) {
    segments.push("medium_value");
  } else {
    segments.push("low_value");
  }

  if (user.role === "PLATFORM_ADMIN") {
    segments.push("admin");
  }

  return {
    userId,
    estimatedLtv: Math.max(0, baseLtv),
    confidence: Math.min(1, purchases.length / 10),
    segments,
  };
}

export async function predictNextBestAction(userId: string): Promise<{
  action: string;
  probability: number;
}> {
  const recentOrders = await prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  if (recentOrders.length === 0) {
    return { action: "onboarding_email", probability: 0.8 };
  }

  const daysSinceLastOrder = Math.floor(
    (Date.now() - recentOrders[0]!.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSinceLastOrder > 30) {
    return { action: "abandoned_browser_email", probability: 0.7 };
  }
  if (daysSinceLastOrder > 7) {
    return { action: "personalized_recommendation", probability: 0.6 };
  }

  return { action: "upsell_offer", probability: 0.5 };
}

export async function predictDemand(
  productId: string,
  days: number = 30
): Promise<{ forecast: number; confidence: number }> {
  const orders = await prisma.orderItem.findMany({
    where: { productId },
    select: { quantity: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 365,
  });

  if (orders.length === 0) {
    return { forecast: 0, confidence: 0 };
  }

  const avgDaily = orders.reduce((sum, o) => sum + (o.quantity || 0), 0) / Math.min(365, orders.length);
  const forecast = avgDaily * days;

  return {
    forecast: Math.ceil(forecast),
    confidence: Math.min(1, orders.length / 30),
  };
}

export async function optimizePrice(
  productId: string
): Promise<{ suggestedPrice: number; rationale: string }> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { price: true },
  });

  if (!product) {
    throw new Error("Product not found");
  }

  const orders = await prisma.orderItem.findMany({
    where: { productId },
    select: { quantity: true },
    take: 100,
  });

  const totalSold = orders.reduce((sum, o) => sum + (o.quantity || 0), 0);

  let suggestedPrice = product.price;
  let rationale = "maintain current price";

  if (totalSold > 100) {
    suggestedPrice = product.price * 1.1;
    rationale = "high demand detected - increase price";
  } else if (totalSold < 10) {
    suggestedPrice = product.price * 0.9;
    rationale = "low demand detected - decrease price";
  }

  return {
    suggestedPrice: Math.round(suggestedPrice * 100) / 100,
    rationale,
  };
}
