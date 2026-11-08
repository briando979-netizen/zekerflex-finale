import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { AppError } from "@/lib/errors";

const esgMetricInputSchema = z.object({
  tenantId: z.string(),
  reportingPeriod: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM
  category: z.enum(["ENVIRONMENTAL", "SOCIAL", "GOVERNANCE"]),
  name: z.string().min(1),
  value: z.number(),
  unit: z.string(),
  metricType: z.enum(["RATIO", "PERCENTAGE", "ABSOLUTE", "INDEX"]),
  target: z.number().optional(),
  benchmark: z.string().optional(),
  materiality: z.boolean().optional().default(false),
});

type ESGMetricInput = z.infer<typeof esgMetricInputSchema>;

// Common materiality assessment thresholds
const MATERIALITY_THRESHOLDS = {
  ENVIRONMENTAL: {
    "Carbon Footprint": true,
    "Water Consumption": true,
    "Waste Generation": true,
    "Renewable Energy %": true,
  },
  SOCIAL: {
    "Employee Turnover Rate": true,
    "Gender Pay Gap": true,
    "Diversity %": true,
    "Employee Satisfaction": true,
    "Health & Safety Incidents": true,
  },
  GOVERNANCE: {
    "Board Diversity": true,
    "Anti-Corruption Training %": true,
    "Executive Compensation Ratio": true,
    "Supply Chain Audits": true,
  },
};

export async function recordESGMetric(data: ESGMetricInput) {
  const validated = esgMetricInputSchema.parse(data);

  const tenant = await prisma.tenant.findUnique({
    where: { id: validated.tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const metric = await prisma.esgMetric.create({
    data: {
      tenantId: validated.tenantId,
      reportingPeriod: validated.reportingPeriod,
      category: validated.category,
      name: validated.name,
      value: validated.value,
      unit: validated.unit,
      metricType: validated.metricType,
      target: validated.target,
      benchmark: validated.benchmark,
      materiality: validated.materiality,
    },
  });

  return metric;
}

export async function getESGMetricsByCategory(
  tenantId: string,
  reportingPeriod: string,
  category: "ENVIRONMENTAL" | "SOCIAL" | "GOVERNANCE"
) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const metrics = await prisma.esgMetric.findMany({
    where: {
      tenantId,
      reportingPeriod,
      category,
    },
  });

  const materialityMetrics = metrics.filter((m) => m.materiality);
  const performanceScore = calculatePerformanceScore(metrics);

  return {
    category,
    tenantId,
    reportingPeriod,
    metrics,
    materialityMetrics,
    performanceScore,
    metricsCount: metrics.length,
  };
}

export async function getMaterialityAssessment(
  tenantId: string,
  reportingPeriod: string
) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const metrics = await prisma.esgMetric.findMany({
    where: {
      tenantId,
      reportingPeriod,
      materiality: true,
    },
  });

  const assessmentByCategory: Record<string, typeof metrics> = {
    ENVIRONMENTAL: [],
    SOCIAL: [],
    GOVERNANCE: [],
  };

  for (const metric of metrics) {
    assessmentByCategory[metric.category]?.push(metric);
  }

  return {
    tenantId,
    reportingPeriod,
    totalMaterialMetrics: metrics.length,
    assessmentByCategory,
    lastUpdated: new Date(),
  };
}

export async function calculatePerformanceScore(
  metrics: Awaited<ReturnType<typeof prisma.esgMetric.findMany>>
): Promise<number> {
  if (metrics.length === 0) return 0;

  let weightedScore = 0;
  const weights: Record<string, number> = {
    RATIO: 1,
    PERCENTAGE: 1.2, // percentages are often more material
    ABSOLUTE: 0.8,
    INDEX: 1.1,
  };

  for (const metric of metrics) {
    // Normalize value to 0-100 scale if it's a percentage
    const normalizedValue =
      metric.metricType === "PERCENTAGE" ? metric.value : Math.min(metric.value * 10, 100);
    const weight = weights[metric.metricType] ?? 1;
    weightedScore += normalizedValue * weight;
  }

  const avgScore = weightedScore / metrics.length;
  return Math.round(avgScore * 10) / 10; // Round to 1 decimal place
}

export async function trackESGTrends(
  tenantId: string,
  metricName: string,
  periods: number = 12 // last N months
) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const metrics = await prisma.esgMetric.findMany({
    where: {
      tenantId,
      name: metricName,
    },
    orderBy: {
      reportingPeriod: "desc",
    },
    take: periods,
  });

  if (metrics.length === 0) {
    throw AppError.validation("No metrics found for this name");
  }

  const reversedMetrics = metrics.reverse();
  const trend = reversedMetrics.map((m) => ({
    period: m.reportingPeriod,
    value: m.value,
    target: m.target,
    unit: m.unit,
  }));

  const latest = reversedMetrics[reversedMetrics.length - 1]!;
  const earliest = reversedMetrics[0]!;
  const percentChange = ((latest.value - earliest.value) / earliest.value) * 100;
  const isImproving =
    (metricName.includes("Reduction") || metricName.includes("Decrease") || metricName.includes("Rate") && percentChange < 0) ||
    (!metricName.includes("Reduction") && !metricName.includes("Decrease") && percentChange > 0);

  return {
    tenantId,
    metricName,
    trend,
    percentChange: isImproving
      ? Math.abs(percentChange)
      : -Math.abs(percentChange),
    isImproving,
    targetProgress:
      latest.target ? ((latest.value / latest.target) * 100).toFixed(1) + "%" : "N/A",
  };
}

export async function getESGDashboard(
  tenantId: string,
  reportingPeriod: string
) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const environmental = await getESGMetricsByCategory(
    tenantId,
    reportingPeriod,
    "ENVIRONMENTAL"
  );
  const social = await getESGMetricsByCategory(
    tenantId,
    reportingPeriod,
    "SOCIAL"
  );
  const governance = await getESGMetricsByCategory(
    tenantId,
    reportingPeriod,
    "GOVERNANCE"
  );

  const overallScore =
    (environmental.performanceScore +
      social.performanceScore +
      governance.performanceScore) /
    3;

  return {
    tenantId,
    reportingPeriod,
    overallScore: Math.round(overallScore * 10) / 10,
    categories: {
      environmental,
      social,
      governance,
    },
    scorecardUrl: `/admin/sustainability/scorecard?tenant=${tenantId}&period=${reportingPeriod}`,
  };
}

export async function identifyESGRisks(
  tenantId: string,
  reportingPeriod: string
) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const metrics = await prisma.esgMetric.findMany({
    where: {
      tenantId,
      reportingPeriod,
    },
  });

  const risks: Array<{
    category: string;
    metric: string;
    riskLevel: "HIGH" | "MEDIUM" | "LOW";
    reason: string;
  }> = [];

  for (const metric of metrics) {
    // Check if target is defined and significantly missed
    if (metric.target) {
      const targetAchievement = (metric.value / metric.target) * 100;
      if (targetAchievement < 50) {
        risks.push({
          category: metric.category,
          metric: metric.name,
          riskLevel: "HIGH",
          reason: `Only ${targetAchievement.toFixed(1)}% of target achieved`,
        });
      } else if (targetAchievement < 75) {
        risks.push({
          category: metric.category,
          metric: metric.name,
          riskLevel: "MEDIUM",
          reason: `${targetAchievement.toFixed(1)}% of target achieved`,
        });
      }
    }

    // Flag materiality issues
    if (
      metric.materiality &&
      metric.metricType === "PERCENTAGE" &&
      (metric.value < 10 || metric.value > 90)
    ) {
      risks.push({
        category: metric.category,
        metric: metric.name,
        riskLevel: "MEDIUM",
        reason: "Extreme value may indicate data quality issue",
      });
    }
  }

  return {
    tenantId,
    reportingPeriod,
    totalRisks: risks.length,
    risksByLevel: {
      HIGH: risks.filter((r) => r.riskLevel === "HIGH").length,
      MEDIUM: risks.filter((r) => r.riskLevel === "MEDIUM").length,
      LOW: risks.filter((r) => r.riskLevel === "LOW").length,
    },
    risks: risks.sort((a, b) => (a.riskLevel === "HIGH" ? -1 : 1)),
  };
}
