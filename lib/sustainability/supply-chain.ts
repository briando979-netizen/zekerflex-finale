import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { AppError } from "@/lib/errors";

const supplierESGScoreInputSchema = z.object({
  tenantId: z.string(),
  supplierId: z.string(),
  supplierName: z.string().min(1),
  assessmentDate: z.date(),
  overallRating: z.enum(["A", "B", "C", "D", "F"]),
  environmentScore: z.number().min(0).max(100),
  socialScore: z.number().min(0).max(100),
  governanceScore: z.number().min(0).max(100),
  certifications: z.array(z.string()).default([]),
  riskFlags: z.array(z.string()).default([]),
  improvementAreas: z.array(z.string()).default([]),
  auditedBy: z.string().optional(),
  nextReviewDate: z.date().optional(),
});

type SupplierESGScoreInput = z.infer<typeof supplierESGScoreInputSchema>;

// ESG rating thresholds
const RATING_THRESHOLDS = {
  A: 85,
  B: 70,
  C: 55,
  D: 40,
  F: 0,
};

export async function assessSupplierESG(data: SupplierESGScoreInput) {
  const validated = supplierESGScoreInputSchema.parse(data);

  const tenant = await prisma.tenant.findUnique({
    where: { id: validated.tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const score = await prisma.supplierESGScore.create({
    data: {
      tenantId: validated.tenantId,
      supplierId: validated.supplierId,
      supplierName: validated.supplierName,
      assessmentDate: validated.assessmentDate,
      overallRating: validated.overallRating,
      environmentScore: validated.environmentScore,
      socialScore: validated.socialScore,
      governanceScore: validated.governanceScore,
      certifications: validated.certifications,
      riskFlags: validated.riskFlags,
      improvementAreas: validated.improvementAreas,
      auditedBy: validated.auditedBy,
      nextReviewDate: validated.nextReviewDate,
    },
  });

  return score;
}

export async function getSupplierESGProfile(
  tenantId: string,
  supplierId: string
) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const scores = await prisma.supplierESGScore.findMany({
    where: {
      tenantId,
      supplierId,
    },
    orderBy: {
      assessmentDate: "desc",
    },
  });

  if (scores.length === 0) {
    throw AppError.validation("No ESG scores found for this supplier");
  }

  const latest = scores[0]!;
  const trend = scores.reverse().map((s) => ({
    date: s.assessmentDate,
    rating: s.overallRating,
    envScore: s.environmentScore,
    socScore: s.socialScore,
    govScore: s.governanceScore,
  }));

  return {
    supplierId,
    supplierName: latest.supplierName,
    latestAssessment: latest,
    trend,
    assessmentCount: scores.length,
    nextReviewDue: latest.nextReviewDate,
  };
}

export async function getRiskSuppliers(
  tenantId: string,
  minRating: string = "C"
) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const allScores = await prisma.supplierESGScore.findMany({
    where: {
      tenantId,
    },
    orderBy: {
      assessmentDate: "desc",
    },
    distinct: ["supplierId"],
  });

  const ratingOrder = ["A", "B", "C", "D", "F"];
  const minIndex = ratingOrder.indexOf(minRating);
  const riskSuppliers = allScores.filter((s) =>
    ratingOrder.slice(minIndex).includes(s.overallRating)
  );

  return {
    tenantId,
    threshold: minRating,
    riskCount: riskSuppliers.length,
    suppliers: riskSuppliers.map((s) => ({
      id: s.supplierId,
      name: s.supplierName,
      rating: s.overallRating,
      scores: {
        env: s.environmentScore,
        social: s.socialScore,
        governance: s.governanceScore,
      },
      riskFlags: s.riskFlags,
      improvements: s.improvementAreas,
      nextReview: s.nextReviewDate,
    })),
  };
}

export async function calculateSupplyChainRiskScore(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const latestScores = await prisma.supplierESGScore.findMany({
    where: {
      tenantId,
    },
    orderBy: {
      assessmentDate: "desc",
    },
    distinct: ["supplierId"],
  });

  if (latestScores.length === 0) {
    return {
      tenantId,
      supplierCount: 0,
      riskScore: 0,
      message: "No supplier assessments found",
    };
  }

  const ratingWeights: Record<string, number> = {
    A: 5,
    B: 10,
    C: 25,
    D: 60,
    F: 100,
  };

  let totalRiskScore = 0;
  const ratingDistribution: Record<string, number> = {
    A: 0,
    B: 0,
    C: 0,
    D: 0,
    F: 0,
  };

  for (const score of latestScores) {
    const weight = ratingWeights[score.overallRating] ?? 0;
    const esgAvg = (score.environmentScore + score.socialScore + score.governanceScore) / 3;
    totalRiskScore += weight * (1 - esgAvg / 100);
    ratingDistribution[score.overallRating]!++;
  }

  const overallRiskScore = (totalRiskScore / latestScores.length) * 100;

  return {
    tenantId,
    supplierCount: latestScores.length,
    overallRiskScore: Math.round(overallRiskScore),
    riskLevel:
      overallRiskScore > 60
        ? "HIGH"
        : overallRiskScore > 30
          ? "MEDIUM"
          : "LOW",
    ratingDistribution,
    lastUpdated: new Date(),
  };
}

export async function getSupplierImprovementPlan(
  tenantId: string,
  supplierId: string
) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const latestScore = await prisma.supplierESGScore.findFirst({
    where: {
      tenantId,
      supplierId,
    },
    orderBy: {
      assessmentDate: "desc",
    },
  });

  if (!latestScore) {
    throw AppError.validation("No ESG scores found for this supplier");
  }

  const weakAreas = [
    {
      area: "Environmental",
      score: latestScore.environmentScore,
      priority: latestScore.environmentScore < 50 ? "HIGH" : "MEDIUM",
    },
    {
      area: "Social",
      score: latestScore.socialScore,
      priority: latestScore.socialScore < 50 ? "HIGH" : "MEDIUM",
    },
    {
      area: "Governance",
      score: latestScore.governanceScore,
      priority: latestScore.governanceScore < 50 ? "HIGH" : "MEDIUM",
    },
  ].sort((a, b) => a.score - b.score);

  return {
    supplierId,
    supplierName: latestScore.supplierName,
    currentRating: latestScore.overallRating,
    lastAssessment: latestScore.assessmentDate,
    nextReviewDate: latestScore.nextReviewDate,
    weakAreas,
    improvementAreas: latestScore.improvementAreas,
    riskFlags: latestScore.riskFlags,
    recommendedActions: [
      "Schedule improvement review meeting",
      "Develop corrective action plan (CAP)",
      "Monitor quarterly compliance",
      "Conduct follow-up assessment",
    ],
  };
}

export async function generateSupplyChainTransparencyReport(
  tenantId: string
) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const latestScores = await prisma.supplierESGScore.findMany({
    where: {
      tenantId,
    },
    orderBy: {
      assessmentDate: "desc",
    },
    distinct: ["supplierId"],
  });

  const allCertifications = new Set<string>();
  const allRiskFlags = new Set<string>();

  for (const score of latestScores) {
    score.certifications.forEach((cert) => allCertifications.add(cert));
    score.riskFlags.forEach((flag) => allRiskFlags.add(flag));
  }

  const avgScores = {
    environment:
      latestScores.reduce((sum, s) => sum + s.environmentScore, 0) /
      latestScores.length,
    social:
      latestScores.reduce((sum, s) => sum + s.socialScore, 0) /
      latestScores.length,
    governance:
      latestScores.reduce((sum, s) => sum + s.governanceScore, 0) /
      latestScores.length,
  };

  return {
    tenantId,
    reportDate: new Date(),
    supplierCount: latestScores.length,
    averageESGScores: {
      environment: Math.round(avgScores.environment),
      social: Math.round(avgScores.social),
      governance: Math.round(avgScores.governance),
    },
    commonCertifications: Array.from(allCertifications),
    commonRiskFlags: Array.from(allRiskFlags),
    bestPerformer: latestScores.reduce((prev, current) =>
      prev.overallRating > current.overallRating ? prev : current
    )?.supplierName,
    improvementNeeded: latestScores.filter(
      (s) => s.overallRating === "D" || s.overallRating === "F"
    ).length,
  };
}

export async function scheduleSupplierReviews(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const scores = await prisma.supplierESGScore.findMany({
    where: {
      tenantId,
    },
    orderBy: {
      nextReviewDate: "asc",
    },
  });

  const dueForReview = scores.filter(
    (s) => s.nextReviewDate && s.nextReviewDate <= new Date()
  );
  const upcomingReviews = scores.filter(
    (s) =>
      s.nextReviewDate &&
      s.nextReviewDate > new Date() &&
      s.nextReviewDate <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  );

  return {
    tenantId,
    dueForReviewCount: dueForReview.length,
    upcomingReviewsCount: upcomingReviews.length,
    dueForReview: dueForReview.map((s) => ({
      supplierId: s.supplierId,
      supplierName: s.supplierName,
      lastAssessment: s.assessmentDate,
      dueDate: s.nextReviewDate,
    })),
    upcomingReviews: upcomingReviews.map((s) => ({
      supplierId: s.supplierId,
      supplierName: s.supplierName,
      lastAssessment: s.assessmentDate,
      reviewDate: s.nextReviewDate,
    })),
  };
}
