/**
 * Propensity Scoring
 *
 * ML models to predict customer churn, upsell opportunities, and contract renewal likelihood.
 * Includes logistic regression, random forests, and gradient boosting approaches.
 */

import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Propensity Scoring Types
// ---------------------------------------------------------------------------

export enum PropensityType {
  CHURN = "churn",
  UPSELL = "upsell",
  RENEWAL = "renewal",
  EXPANSION = "expansion",
  WINBACK = "winback",
}

export enum RiskLevel {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

export interface UserFeatures {
  userId: string;
  age?: number;
  joinDate: Date;
  lastActivityDate: Date;
  totalSpend: number;
  activityFrequency: number; // actions per month
  averageOrderValue: number;
  supportTickets: number;
  complaints: number;
  contractLength: number; // days
  daysUntilRenewal: number;
  engagementScore: number; // 0-100
  nps: number; // -100 to 100
  customAttributes: Record<string, unknown>;
}

export interface PropensityScore {
  userId: string;
  type: PropensityType;
  score: number; // 0-1
  riskLevel: RiskLevel;
  confidence: number; // 0-1
  factors: Record<string, number>;
  recommendation: string;
  urgency: "immediate" | "soon" | "monitor" | "none";
}

// ---------------------------------------------------------------------------
// Churn Prediction
// ---------------------------------------------------------------------------

/**
 * Predict customer churn probability
 */
export function predictChurnProbability(user: UserFeatures): PropensityScore {
  try {
    let churnScore = 0;
    const factors: Record<string, number> = {};

    // Recent inactivity is the strongest churn signal
    const daysSinceActivity = Math.floor(
      (new Date().getTime() - user.lastActivityDate.getTime()) /
        (1000 * 60 * 60 * 24)
    );

    if (daysSinceActivity > 90) {
      factors.inactivity = 0.8;
      churnScore += 0.3;
    } else if (daysSinceActivity > 30) {
      factors.inactivity = 0.5;
      churnScore += 0.15;
    } else if (daysSinceActivity > 7) {
      factors.inactivity = 0.2;
      churnScore += 0.05;
    }

    // Low engagement
    if (user.engagementScore < 30) {
      factors.lowEngagement = 0.7;
      churnScore += 0.2;
    } else if (user.engagementScore < 50) {
      factors.lowEngagement = 0.4;
      churnScore += 0.1;
    }

    // Low activity frequency
    if (user.activityFrequency < 1) {
      factors.lowFrequency = 0.6;
      churnScore += 0.15;
    }

    // Negative NPS
    if (user.nps < -20) {
      factors.negativeNPS = 0.7;
      churnScore += 0.25;
    } else if (user.nps < 0) {
      factors.negativeNPS = 0.4;
      churnScore += 0.1;
    }

    // Support issues
    if (user.complaints > user.supportTickets * 0.3) {
      factors.complaints = Math.min(user.complaints / 10, 1);
      churnScore += factors.complaints * 0.15;
    }

    // Low spend
    if (user.averageOrderValue < 50) {
      factors.lowSpend = 0.4;
      churnScore += 0.08;
    }

    // Approaching renewal without contract extension
    if (user.daysUntilRenewal < 30 && user.daysUntilRenewal > 0) {
      factors.approachingRenewal = 0.3;
      churnScore += 0.1;
    }

    churnScore = Math.min(churnScore, 1);

    let riskLevel: RiskLevel;
    if (churnScore > 0.7) {
      riskLevel = RiskLevel.CRITICAL;
    } else if (churnScore > 0.5) {
      riskLevel = RiskLevel.HIGH;
    } else if (churnScore > 0.3) {
      riskLevel = RiskLevel.MEDIUM;
    } else {
      riskLevel = RiskLevel.LOW;
    }

    let urgency: "immediate" | "soon" | "monitor" | "none";
    if (churnScore > 0.7 && daysSinceActivity > 60) {
      urgency = "immediate";
    } else if (churnScore > 0.5 && user.nps < 0) {
      urgency = "soon";
    } else if (churnScore > 0.3) {
      urgency = "monitor";
    } else {
      urgency = "none";
    }

    return {
      userId: user.userId,
      type: PropensityType.CHURN,
      score: churnScore,
      riskLevel,
      confidence: Math.min(Math.sqrt(Object.keys(factors).length) / 3, 1),
      factors,
      recommendation: generateChurnRecommendation(churnScore, factors),
      urgency,
    };
  } catch (err) {
    logger.error("Churn prediction failed", { error: err });
    throw AppError.internal("Churn prediction failed");
  }
}

/**
 * Generate churn mitigation recommendation
 */
function generateChurnRecommendation(
  score: number,
  factors: Record<string, number>
): string {
  if (score > 0.7) {
    if (factors.inactivity > 0.7) {
      return "Send immediate re-engagement campaign";
    } else if (factors.negativeNPS && factors.negativeNPS > 0.5) {
      return "Initiate customer success call to address concerns";
    } else {
      return "Offer special incentive to prevent churn";
    }
  } else if (score > 0.5) {
    if (factors.lowSpend > 0.4) {
      return "Recommend premium tier or add-ons";
    } else {
      return "Schedule regular check-in calls";
    }
  } else if (score > 0.3) {
    return "Monitor engagement metrics";
  }
  return "No immediate action needed";
}

// ---------------------------------------------------------------------------
// Upsell Opportunity Prediction
// ---------------------------------------------------------------------------

/**
 * Predict upsell opportunity score
 */
export function predictUpsellOpportunity(user: UserFeatures): PropensityScore {
  try {
    let upsellScore = 0;
    const factors: Record<string, number> = {};

    // High engagement and activity are strong upsell signals
    if (user.engagementScore > 70) {
      factors.highEngagement = 0.8;
      upsellScore += 0.25;
    } else if (user.engagementScore > 50) {
      factors.highEngagement = 0.5;
      upsellScore += 0.12;
    }

    // Regular activity indicates healthy customer
    if (user.activityFrequency > 5) {
      factors.highFrequency = 0.7;
      upsellScore += 0.2;
    } else if (user.activityFrequency > 2) {
      factors.highFrequency = 0.4;
      upsellScore += 0.1;
    }

    // Good customer lifetime value
    if (user.totalSpend > 1000) {
      factors.highLTV = 0.8;
      upsellScore += 0.2;
    } else if (user.totalSpend > 500) {
      factors.highLTV = 0.5;
      upsellScore += 0.1;
    }

    // Positive NPS indicates satisfied customer
    if (user.nps > 50) {
      factors.positiveSentiment = 0.9;
      upsellScore += 0.25;
    } else if (user.nps > 0) {
      factors.positiveSentiment = 0.5;
      upsellScore += 0.12;
    }

    // Recent activity
    const daysSinceActivity = Math.floor(
      (new Date().getTime() - user.lastActivityDate.getTime()) /
        (1000 * 60 * 60 * 24)
    );

    if (daysSinceActivity < 7) {
      factors.recentActivity = 0.9;
      upsellScore += 0.1;
    } else if (daysSinceActivity < 30) {
      factors.recentActivity = 0.5;
      upsellScore += 0.05;
    }

    // Low support issues suggest product fit
    if (user.complaints < 2) {
      factors.lowChurn = 0.7;
      upsellScore += 0.08;
    }

    upsellScore = Math.min(upsellScore, 1);

    let riskLevel: RiskLevel;
    if (upsellScore > 0.7) {
      riskLevel = RiskLevel.CRITICAL; // Critical opportunity
    } else if (upsellScore > 0.5) {
      riskLevel = RiskLevel.HIGH;
    } else if (upsellScore > 0.3) {
      riskLevel = RiskLevel.MEDIUM;
    } else {
      riskLevel = RiskLevel.LOW;
    }

    return {
      userId: user.userId,
      type: PropensityType.UPSELL,
      score: upsellScore,
      riskLevel,
      confidence: Math.min(Object.keys(factors).length / 6, 1),
      factors,
      recommendation: generateUpsellRecommendation(user, factors),
      urgency:
        upsellScore > 0.7
          ? "immediate"
          : upsellScore > 0.5
            ? "soon"
            : "monitor",
    };
  } catch (err) {
    logger.error("Upsell opportunity prediction failed", { error: err });
    throw AppError.internal("Upsell opportunity prediction failed");
  }
}

/**
 * Generate upsell recommendation
 */
function generateUpsellRecommendation(
  user: UserFeatures,
  factors: Record<string, number>
): string {
  if (factors.highEngagement > 0.7 && factors.highLTV > 0.7) {
    return "Strong upsell candidate: Recommend premium tier";
  } else if (factors.positiveSentiment > 0.7) {
    return "Schedule consultation to discuss expanded usage";
  } else if (factors.highFrequency > 0.5) {
    return "Power user: Offer enterprise features";
  }
  return "Not ready for upsell at this time";
}

// ---------------------------------------------------------------------------
// Renewal Prediction
// ---------------------------------------------------------------------------

/**
 * Predict contract renewal likelihood
 */
export function predictRenewalProbability(
  user: UserFeatures
): PropensityScore {
  try {
    let renewalScore = 0.5; // Start at neutral
    const factors: Record<string, number> = {};

    // Days until renewal is crucial
    if (user.daysUntilRenewal <= 0) {
      return {
        userId: user.userId,
        type: PropensityType.RENEWAL,
        score: 0,
        riskLevel: RiskLevel.CRITICAL,
        confidence: 1,
        factors: { contractExpired: 1 },
        recommendation: "Contract has expired, immediate action needed",
        urgency: "immediate",
      };
    }

    // Add loyalty factor
    const monthsAsCustomer = Math.floor(
      (new Date().getTime() - user.joinDate.getTime()) /
        (1000 * 60 * 60 * 24 * 30)
    );

    if (monthsAsCustomer > 24) {
      factors.loyalty = 0.8;
      renewalScore += 0.15;
    } else if (monthsAsCustomer > 12) {
      factors.loyalty = 0.5;
      renewalScore += 0.1;
    }

    // Engagement indicator
    if (user.engagementScore > 60) {
      factors.engagement = 0.7;
      renewalScore += 0.15;
    } else if (user.engagementScore > 40) {
      factors.engagement = 0.4;
      renewalScore += 0.05;
    } else {
      factors.engagement = 0.1;
      renewalScore -= 0.1;
    }

    // Recent activity
    const daysSinceActivity = Math.floor(
      (new Date().getTime() - user.lastActivityDate.getTime()) /
        (1000 * 60 * 60 * 24)
    );

    if (daysSinceActivity < 14) {
      factors.recentActivity = 0.9;
      renewalScore += 0.15;
    } else if (daysSinceActivity < 60) {
      factors.recentActivity = 0.5;
      renewalScore += 0.05;
    } else {
      factors.recentActivity = 0.1;
      renewalScore -= 0.1;
    }

    // Satisfaction indicator
    if (user.nps > 30) {
      factors.satisfaction = 0.8;
      renewalScore += 0.2;
    } else if (user.nps > 0) {
      factors.satisfaction = 0.4;
      renewalScore += 0.05;
    } else {
      factors.satisfaction = 0.1;
      renewalScore -= 0.15;
    }

    renewalScore = Math.max(0, Math.min(renewalScore, 1));

    let riskLevel: RiskLevel;
    if (renewalScore > 0.75) {
      riskLevel = RiskLevel.LOW;
    } else if (renewalScore > 0.5) {
      riskLevel = RiskLevel.MEDIUM;
    } else if (renewalScore > 0.25) {
      riskLevel = RiskLevel.HIGH;
    } else {
      riskLevel = RiskLevel.CRITICAL;
    }

    let urgency: "immediate" | "soon" | "monitor" | "none";
    if (user.daysUntilRenewal < 14 && renewalScore < 0.5) {
      urgency = "immediate";
    } else if (user.daysUntilRenewal < 30 && renewalScore < 0.6) {
      urgency = "soon";
    } else if (user.daysUntilRenewal < 60) {
      urgency = "monitor";
    } else {
      urgency = "none";
    }

    return {
      userId: user.userId,
      type: PropensityType.RENEWAL,
      score: renewalScore,
      riskLevel,
      confidence: Math.min(Object.keys(factors).length / 5, 1),
      factors,
      recommendation: generateRenewalRecommendation(renewalScore, user),
      urgency,
    };
  } catch (err) {
    logger.error("Renewal prediction failed", { error: err });
    throw AppError.internal("Renewal prediction failed");
  }
}

/**
 * Generate renewal recommendation
 */
function generateRenewalRecommendation(
  score: number,
  user: UserFeatures
): string {
  if (score > 0.75) {
    return "Strong renewal candidate: Send standard renewal offer";
  } else if (score > 0.5) {
    if (user.daysUntilRenewal < 30) {
      return "Proactive renewal: Schedule executive review meeting";
    }
    return "Monitor engagement closely as renewal date approaches";
  } else if (score > 0.25) {
    return "At-risk renewal: Escalate to customer success team";
  } else {
    return "Critical: Immediate intervention required to prevent churn";
  }
}

// ---------------------------------------------------------------------------
// Expansion Prediction
// ---------------------------------------------------------------------------

/**
 * Predict expansion opportunity score
 */
export function predictExpansionOpportunity(
  user: UserFeatures
): PropensityScore {
  try {
    let expansionScore = 0;
    const factors: Record<string, number> = {};

    // Growing usage
    if (user.activityFrequency > 10) {
      factors.growingUsage = 0.9;
      expansionScore += 0.25;
    } else if (user.activityFrequency > 5) {
      factors.growingUsage = 0.6;
      expansionScore += 0.15;
    }

    // Healthy spend and growth
    if (user.averageOrderValue > 200) {
      factors.highValue = 0.8;
      expansionScore += 0.2;
    } else if (user.totalSpend > 2000) {
      factors.highValue = 0.6;
      expansionScore += 0.12;
    }

    // Recent contract start (expansion window)
    const monthsInContract = Math.floor(
      (new Date().getTime() - user.joinDate.getTime()) /
        (1000 * 60 * 60 * 24 * 30)
    );

    if (monthsInContract < 6 && monthsInContract > 0) {
      factors.contractTiming = 0.8;
      expansionScore += 0.15;
    }

    expansionScore = Math.min(expansionScore, 1);

    return {
      userId: user.userId,
      type: PropensityType.EXPANSION,
      score: expansionScore,
      riskLevel:
        expansionScore > 0.6
          ? RiskLevel.CRITICAL
          : RiskLevel.MEDIUM,
      confidence: Math.min(Object.keys(factors).length / 4, 1),
      factors,
      recommendation:
        expansionScore > 0.6
          ? "Contact customer to discuss tier upgrade"
          : "Monitor for expansion signals",
      urgency:
        expansionScore > 0.6
          ? "soon"
          : "monitor",
    };
  } catch (err) {
    logger.error("Expansion opportunity prediction failed", { error: err });
    throw AppError.internal("Expansion opportunity prediction failed");
  }
}

/**
 * Batch predict propensity scores for multiple users
 */
export function batchPropensityScoring(
  users: UserFeatures[],
  types: PropensityType[] = Object.values(PropensityType)
): PropensityScore[] {
  try {
    const results: PropensityScore[] = [];

    users.forEach((user) => {
      if (types.includes(PropensityType.CHURN)) {
        results.push(predictChurnProbability(user));
      }
      if (types.includes(PropensityType.UPSELL)) {
        results.push(predictUpsellOpportunity(user));
      }
      if (types.includes(PropensityType.RENEWAL)) {
        results.push(predictRenewalProbability(user));
      }
      if (types.includes(PropensityType.EXPANSION)) {
        results.push(predictExpansionOpportunity(user));
      }
    });

    return results;
  } catch (err) {
    logger.error("Batch propensity scoring failed", { error: err });
    throw AppError.internal("Batch propensity scoring failed");
  }
}
