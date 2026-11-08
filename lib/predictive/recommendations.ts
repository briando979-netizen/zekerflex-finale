/**
 * Recommendation Engine
 *
 * Collaborative filtering, content-based, and hybrid recommendations for shifts,
 * products, teams, and connections.
 */

import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Recommendation Types
// ---------------------------------------------------------------------------

export enum RecommendationAlgorithm {
  COLLABORATIVE_FILTERING = "collaborative_filtering",
  CONTENT_BASED = "content_based",
  HYBRID = "hybrid",
  POPULARITY = "popularity",
  CONTEXT_AWARE = "context_aware",
}

export interface Item {
  id: string;
  type: "shift" | "product" | "worker" | "employer" | "team";
  name: string;
  attributes: Record<string, unknown>;
  categories?: string[];
  tags?: string[];
  score?: number;
}

export interface UserProfile {
  userId: string;
  interactions: UserInteraction[];
  preferences: Record<string, unknown>;
  history: string[]; // IDs of previous items
}

export interface UserInteraction {
  itemId: string;
  type: "view" | "click" | "like" | "purchase" | "apply";
  timestamp: Date;
  weight: number; // 0-1
}

export interface Recommendation {
  itemId: string;
  score: number; // 0-1
  reason: string;
  algorithm: RecommendationAlgorithm;
  confidence: number;
  explanationFactors: Record<string, number>;
}

export interface SimilarityMatrix {
  items: string[];
  matrix: number[][]; // Pairwise similarities
}

// ---------------------------------------------------------------------------
// Collaborative Filtering
// ---------------------------------------------------------------------------

/**
 * Calculate similarity between users based on their interactions
 */
export function calculateUserSimilarity(
  user1: UserProfile,
  user2: UserProfile
): number {
  try {
    const user1Items = new Set(user1.interactions.map((i) => i.itemId));
    const user2Items = new Set(user2.interactions.map((i) => i.itemId));

    // Jaccard similarity
    const intersection = [...user1Items].filter((item) =>
      user2Items.has(item)
    );
    const union = new Set([...user1Items, ...user2Items]);

    if (union.size === 0) return 0;

    return intersection.length / union.size;
  } catch (err) {
    logger.error("User similarity calculation failed", { error: err });
    return 0;
  }
}

/**
 * Calculate similarity between items based on attributes
 */
export function calculateItemSimilarity(
  item1: Item,
  item2: Item
): number {
  try {
    if (item1.type !== item2.type) return 0;

    // Category similarity
    let catSimilarity = 0;
    if (item1.categories && item2.categories) {
      const common = item1.categories.filter((c) =>
        item2.categories?.includes(c)
      );
      catSimilarity =
        common.length /
        Math.max(
          item1.categories.length,
          item2.categories.length
        );
    }

    // Tag similarity
    let tagSimilarity = 0;
    if (item1.tags && item2.tags) {
      const common = item1.tags.filter((t) =>
        item2.tags?.includes(t)
      );
      tagSimilarity =
        common.length /
        Math.max(item1.tags.length, item2.tags.length);
    }

    // Attribute similarity
    let attrSimilarity = 0;
    const keys = Object.keys(item1.attributes);
    let matchCount = 0;

    keys.forEach((key) => {
      if (item1.attributes[key] === item2.attributes[key]) {
        matchCount++;
      }
    });

    if (keys.length > 0) {
      attrSimilarity = matchCount / keys.length;
    }

    return (catSimilarity + tagSimilarity + attrSimilarity) / 3;
  } catch (err) {
    logger.error("Item similarity calculation failed", { error: err });
    return 0;
  }
}

/**
 * Collaborative filtering recommendations
 */
export function collaborativeFilteringRecommendations(
  targetUser: UserProfile,
  allUsers: UserProfile[],
  allItems: Item[],
  k: number = 5,
  limit: number = 10
): Recommendation[] {
  try {
    // Find similar users
    const similarities = allUsers
      .filter((u) => u.userId !== targetUser.userId)
      .map((u) => ({
        user: u,
        similarity: calculateUserSimilarity(targetUser, u),
      }))
      .filter((s) => s.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k);

    if (similarities.length === 0) {
      return [];
    }

    // Get items rated by similar users but not by target user
    const targetUserItems = new Set(
      targetUser.interactions.map((i) => i.itemId)
    );

    const recommendedItems: Record<string, number> = {};

    similarities.forEach(({ user, similarity }) => {
      user.interactions.forEach((interaction) => {
        if (!targetUserItems.has(interaction.itemId)) {
          if (!recommendedItems[interaction.itemId]) {
            recommendedItems[interaction.itemId] = 0;
          }
          recommendedItems[interaction.itemId] +=
            similarity * interaction.weight;
        }
      });
    });

    // Convert to recommendations
    return Object.entries(recommendedItems)
      .map(([itemId, score]) => {
        const item = allItems.find((i) => i.id === itemId);
        return {
          itemId,
          score: Math.min(score, 1),
          reason: `Similar users like this ${item?.type || "item"}`,
          algorithm: RecommendationAlgorithm.COLLABORATIVE_FILTERING,
          confidence: score * 0.8,
          explanationFactors: {
            similarUserCount: similarities.length,
            similarityScore: similarities[0]?.similarity || 0,
          },
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } catch (err) {
    logger.error("Collaborative filtering failed", { error: err });
    throw AppError.internal("Collaborative filtering failed");
  }
}

// ---------------------------------------------------------------------------
// Content-Based Filtering
// ---------------------------------------------------------------------------

/**
 * Content-based filtering recommendations
 */
export function contentBasedRecommendations(
  targetUser: UserProfile,
  allItems: Item[],
  limit: number = 10
): Recommendation[] {
  try {
    if (targetUser.interactions.length === 0) {
      return [];
    }

    // Get items user has interacted with
    const interactedItems = allItems.filter((item) =>
      targetUser.interactions.some((i) => i.itemId === item.id)
    );

    if (interactedItems.length === 0) {
      return [];
    }

    // Calculate similarity to non-interacted items
    const candidateItems = allItems.filter(
      (item) => !targetUser.interactions.some((i) => i.itemId === item.id)
    );

    const recommendations: Recommendation[] = [];

    candidateItems.forEach((candidate) => {
      let totalSimilarity = 0;

      interactedItems.forEach((interacted) => {
        totalSimilarity += calculateItemSimilarity(candidate, interacted);
      });

      const avgSimilarity = totalSimilarity / interactedItems.length;

      if (avgSimilarity > 0.3) {
        recommendations.push({
          itemId: candidate.id,
          score: avgSimilarity,
          reason: `Similar to items you've interacted with`,
          algorithm: RecommendationAlgorithm.CONTENT_BASED,
          confidence: avgSimilarity * 0.85,
          explanationFactors: {
            avgSimilarity,
            similarItemsCount: interactedItems.length,
          },
        });
      }
    });

    return recommendations
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } catch (err) {
    logger.error("Content-based filtering failed", { error: err });
    throw AppError.internal("Content-based filtering failed");
  }
}

// ---------------------------------------------------------------------------
// Hybrid Recommendations
// ---------------------------------------------------------------------------

/**
 * Hybrid recommendation combining collaborative and content-based
 */
export function hybridRecommendations(
  targetUser: UserProfile,
  allUsers: UserProfile[],
  allItems: Item[],
  collaborativeWeight: number = 0.6,
  contentWeight: number = 0.4,
  limit: number = 10
): Recommendation[] {
  try {
    const collab = collaborativeFilteringRecommendations(
      targetUser,
      allUsers,
      allItems,
      5,
      limit * 2
    );

    const content = contentBasedRecommendations(
      targetUser,
      allItems,
      limit * 2
    );

    // Merge and score
    const mergedMap: Record<string, Recommendation> = {};

    collab.forEach((rec) => {
      mergedMap[rec.itemId] = {
        ...rec,
        score: rec.score * collaborativeWeight,
        algorithm: RecommendationAlgorithm.HYBRID,
      };
    });

    content.forEach((rec) => {
      if (mergedMap[rec.itemId]) {
        mergedMap[rec.itemId].score +=
          rec.score * contentWeight;
        mergedMap[rec.itemId].reason +=
          " and similar to your interests";
      } else {
        mergedMap[rec.itemId] = {
          ...rec,
          score: rec.score * contentWeight,
          algorithm: RecommendationAlgorithm.HYBRID,
        };
      }
    });

    return Object.values(mergedMap)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } catch (err) {
    logger.error("Hybrid recommendations failed", { error: err });
    throw AppError.internal("Hybrid recommendations failed");
  }
}

// ---------------------------------------------------------------------------
// Context-Aware Recommendations
// ---------------------------------------------------------------------------

/**
 * Context-aware recommendations based on time, location, etc.
 */
export function contextAwareRecommendations(
  targetUser: UserProfile,
  allItems: Item[],
  context: {
    time?: Date;
    location?: { lat: number; lon: number };
    dayOfWeek?: number;
    season?: string;
  },
  limit: number = 10
): Recommendation[] {
  try {
    const recommendations: Recommendation[] = [];

    allItems.forEach((item) => {
      let contextScore = 0;

      // Time-based scoring
      if (context.time && item.attributes.bestTime) {
        const hour = context.time.getHours();
        const bestHour = item.attributes.bestTime as number;
        contextScore += 1 - Math.abs(hour - bestHour) / 24;
      }

      // Location-based scoring
      if (
        context.location &&
        item.attributes.location
      ) {
        const itemLoc = item.attributes.location as {
          lat: number;
          lon: number;
        };
        const distance = Math.sqrt(
          Math.pow(context.location.lat - itemLoc.lat, 2) +
            Math.pow(context.location.lon - itemLoc.lon, 2)
        );
        contextScore += Math.max(0, 1 - distance / 10);
      }

      // Day of week scoring
      if (context.dayOfWeek && item.attributes.bestDays) {
        const bestDays = item.attributes.bestDays as number[];
        if (bestDays.includes(context.dayOfWeek)) {
          contextScore += 1;
        }
      }

      // Seasonal scoring
      if (context.season && item.tags) {
        if (item.tags.includes(context.season)) {
          contextScore += 1;
        }
      }

      if (contextScore > 0.3) {
        recommendations.push({
          itemId: item.id,
          score: Math.min(contextScore / 4, 1),
          reason: `Relevant for your current context`,
          algorithm: RecommendationAlgorithm.CONTEXT_AWARE,
          confidence: contextScore / 4,
          explanationFactors: {
            contextScore,
          },
        });
      }
    });

    return recommendations
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } catch (err) {
    logger.error("Context-aware recommendations failed", { error: err });
    throw AppError.internal("Context-aware recommendations failed");
  }
}

// ---------------------------------------------------------------------------
// Popularity-Based Recommendations
// ---------------------------------------------------------------------------

/**
 * Popularity-based recommendations
 */
export function popularityRecommendations(
  allUsers: UserProfile[],
  allItems: Item[],
  timeWindowDays: number = 30,
  limit: number = 10
): Recommendation[] {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - timeWindowDays);

    const itemScores: Record<string, { count: number; weight: number }> = {};

    allUsers.forEach((user) => {
      user.interactions
        .filter((i) => i.timestamp >= cutoff)
        .forEach((interaction) => {
          if (!itemScores[interaction.itemId]) {
            itemScores[interaction.itemId] = {
              count: 0,
              weight: 0,
            };
          }
          itemScores[interaction.itemId].count++;
          itemScores[interaction.itemId].weight +=
            interaction.weight;
        });
    });

    return Object.entries(itemScores)
      .map(([itemId, { count, weight }]) => ({
        itemId,
        score: Math.min(weight / count, 1),
        reason: `Popular among ${count} users`,
        algorithm: RecommendationAlgorithm.POPULARITY,
        confidence: Math.min(count / 100, 1),
        explanationFactors: {
          interactionCount: count,
          totalWeight: weight,
        },
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } catch (err) {
    logger.error("Popularity recommendations failed", { error: err });
    throw AppError.internal("Popularity recommendations failed");
  }
}

/**
 * Build similarity matrix for items
 */
export function buildSimilarityMatrix(
  items: Item[]
): SimilarityMatrix {
  try {
    const matrix: number[][] = Array(items.length)
      .fill(null)
      .map(() => Array(items.length).fill(0));

    for (let i = 0; i < items.length; i++) {
      for (let j = i; j < items.length; j++) {
        const similarity = calculateItemSimilarity(items[i], items[j]);
        matrix[i][j] = similarity;
        matrix[j][i] = similarity;
      }
    }

    return {
      items: items.map((i) => i.id),
      matrix,
    };
  } catch (err) {
    logger.error("Similarity matrix building failed", { error: err });
    throw AppError.internal("Similarity matrix building failed");
  }
}
