import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { FreelancerSkill, Skill } from "@prisma/client";

/**
 * Vector embedding for skill similarity scoring.
 * Uses TF-IDF-inspired approach with category and experience weighting.
 */
export interface SkillVector {
  skillId: string;
  category: string;
  proficiency: number; // [0, 1]
  yearsExperience: number;
  verificationScore: number; // [0, 1] - based on reviews
  normalizedVector: number[];
}

export interface SkillMatchResult {
  matchScore: number; // [0, 1]
  requiredSkillId: string;
  freelancerSkillId: string | null;
  breakdown: {
    categoryMatch: number;
    proficiencyScore: number;
    experienceBonus: number;
    verificationScore: number;
  };
}

/**
 * Calculate cosine similarity between two skill vectors.
 * Used for finding workers with adjacent/related skills.
 */
function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length === 0 || vec2.length === 0) return 0;

  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;

  for (let i = 0; i < Math.min(vec1.length, vec2.length); i += 1) {
    dotProduct += (vec1[i] ?? 0) * (vec2[i] ?? 0);
    magnitude1 += (vec1[i] ?? 0) ** 2;
    magnitude2 += (vec2[i] ?? 0) ** 2;
  }

  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);

  if (magnitude1 === 0 || magnitude2 === 0) return 0;
  return dotProduct / (magnitude1 * magnitude2);
}

/**
 * Build skill vector from freelancer profile and verified ratings.
 */
async function buildSkillVector(freelancerId: string, skillId: string): Promise<SkillVector | null> {
  const [freelancerSkill, skill, reviews] = await Promise.all([
    prisma.freelancerSkill.findUnique({
      where: {
        freelancerId_skillId: {
          freelancerId,
          skillId,
        },
      },
    }),
    prisma.skill.findUnique({
      where: { id: skillId },
    }),
    prisma.shiftReview.findMany({
      where: {
        shiftAssignment: {
          freelancerId,
        },
      },
      select: { rating: true },
    }),
  ]);

  if (!freelancerSkill || !skill) {
    return null;
  }

  const verificationScore = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length / 5 : 0;

  const normalizedVector: number[] = [
    freelancerSkill.proficiency / 5,
    Math.min(freelancerSkill.yearsExperience / 20, 1),
    verificationScore,
  ];

  return {
    skillId,
    category: skill.category ?? "general",
    proficiency: freelancerSkill.proficiency / 5,
    yearsExperience: freelancerSkill.yearsExperience,
    verificationScore,
    normalizedVector,
  };
}

/**
 * Score a freelancer's skill match against a required skill.
 * Handles exact matches and similar/adjacent skills via vector similarity.
 */
export async function scoreSkillMatch(
  freelancerId: string,
  requiredSkillId: string,
  similarityThreshold = 0.7,
): Promise<SkillMatchResult> {
  const requiredSkill = await prisma.skill.findUnique({
    where: { id: requiredSkillId },
  });

  if (!requiredSkill) {
    return {
      matchScore: 0,
      requiredSkillId,
      freelancerSkillId: null,
      breakdown: {
        categoryMatch: 0,
        proficiencyScore: 0,
        experienceBonus: 0,
        verificationScore: 0,
      },
    };
  }

  // Check for exact skill match
  const exactMatch = await prisma.freelancerSkill.findUnique({
    where: {
      freelancerId_skillId: {
        freelancerId,
        skillId: requiredSkillId,
      },
    },
  });

  if (exactMatch) {
    const verificationScore = await getVerificationScore(freelancerId);
    const experienceBonus = Math.min(exactMatch.yearsExperience / 10, 0.2);

    return {
      matchScore: Math.min(1, (exactMatch.proficiency / 5) * 0.8 + verificationScore * 0.2 + experienceBonus),
      requiredSkillId,
      freelancerSkillId: exactMatch.skillId,
      breakdown: {
        categoryMatch: 1,
        proficiencyScore: exactMatch.proficiency / 5,
        experienceBonus,
        verificationScore,
      },
    };
  }

  // Find similar skills in same category
  const similarSkills = await prisma.freelancerSkill.findMany({
    where: {
      freelancerId,
      skill: {
        category: requiredSkill.category,
      },
    },
    include: { skill: true },
  });

  let bestSimilarMatch: SkillMatchResult = {
    matchScore: 0,
    requiredSkillId,
    freelancerSkillId: null,
    breakdown: {
      categoryMatch: 0.6, // Partial category match
      proficiencyScore: 0,
      experienceBonus: 0,
      verificationScore: 0,
    },
  };

  if (similarSkills.length > 0) {
    const requiredVector = await buildSkillVector(freelancerId, requiredSkillId);
    if (!requiredVector) {
      return bestSimilarMatch;
    }

    for (const freelancerSkill of similarSkills) {
      const vector = await buildSkillVector(freelancerId, freelancerSkill.skillId);
      if (!vector) {
        // eslint-disable-next-line no-continue
        continue;
      }

      const similarity = cosineSimilarity(requiredVector.normalizedVector, vector.normalizedVector);

      if (similarity >= similarityThreshold) {
        const verificationScore = await getVerificationScore(freelancerId);
        const categoryBonus = 0.1;
        const experienceBonus = Math.min(freelancerSkill.yearsExperience / 10, 0.1);

        const matchScore = similarity * 0.7 + categoryBonus + verificationScore * 0.1 + experienceBonus;

        if (matchScore > bestSimilarMatch.matchScore) {
          bestSimilarMatch = {
            matchScore: Math.min(1, matchScore),
            requiredSkillId,
            freelancerSkillId: freelancerSkill.skillId,
            breakdown: {
              categoryMatch: 0.6,
              proficiencyScore: freelancerSkill.proficiency / 5,
              experienceBonus,
              verificationScore,
            },
          };
        }
      }
    }
  }

  return bestSimilarMatch;
}

/**
 * Get aggregated verification score from shift reviews.
 */
async function getVerificationScore(freelancerId: string): Promise<number> {
  const reviews = await prisma.shiftReview.findMany({
    where: {
      shiftAssignment: {
        freelancerId,
      },
    },
    select: { rating: true },
  });

  if (reviews.length === 0) return 0;
  return reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length / 5;
}

/**
 * Batch score multiple freelancers against a required skill.
 * Returns ranked matches with scores.
 */
export async function batchScoreSkillMatches(
  freelancerIds: string[],
  requiredSkillId: string,
): Promise<SkillMatchResult[]> {
  const results = await Promise.all(freelancerIds.map((fid) => scoreSkillMatch(fid, requiredSkillId)));

  return results.sort((a, b) => b.matchScore - a.matchScore);
}

/**
 * Find alternative freelancers with adjacent but not exact skills.
 */
export async function findAdjacentSkillMatches(
  requiredSkillId: string,
  minScore = 0.65,
  limit = 10,
): Promise<
  Array<{
    freelancerId: string;
    matchScore: number;
    skillId: string;
  }>
> {
  const requiredSkill = await prisma.skill.findUnique({
    where: { id: requiredSkillId },
  });

  if (!requiredSkill?.category) {
    return [];
  }

  const freelancerSkills = await prisma.freelancerSkill.findMany({
    where: {
      skill: {
        category: requiredSkill.category,
        NOT: {
          id: requiredSkillId,
        },
      },
    },
    select: {
      freelancerId: true,
      skillId: true,
      proficiency: true,
      yearsExperience: true,
    },
  });

  const matches = await Promise.all(
    freelancerSkills.map(async (fs) => {
      const result = await scoreSkillMatch(fs.freelancerId, requiredSkillId);
      return {
        freelancerId: fs.freelancerId,
        matchScore: result.matchScore,
        skillId: fs.skillId,
      };
    }),
  );

  return matches
    .filter((m) => m.matchScore >= minScore)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);
}
