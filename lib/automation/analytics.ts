import { prisma } from "@/lib/prisma";

// ============================================================================
// 6. ANALYTICS & OPTIMIZATION - Performance metrics, bottleneck ID, ROI
// ============================================================================

export interface WorkflowMetrics {
  workflowId: string;
  period: string; // YYYY-MM-DD
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  p95Duration: number;
  errorRate: number;
  mostCommonError?: string;
}

export interface OptimizationRecommendation {
  id: string;
  workflowId: string;
  type: "PARALLEL_EXECUTION" | "CACHING" | "BATCH_PROCESSING" | "ERROR_HANDLING" | "STEP_REMOVAL";
  description: string;
  estimatedImprovement: number; // percentage
  complexity: "LOW" | "MEDIUM" | "HIGH";
  implementationSteps: string[];
}

export interface PerformanceBaseline {
  workflowId: string;
  metricType: "DURATION" | "SUCCESS_RATE" | "ERROR_RATE";
  baseline: number;
  currentValue: number;
  trend: "IMPROVING" | "DECLINING" | "STABLE";
  changePercentage: number;
}

/**
 * Record workflow metrics for a time period
 */
export async function recordWorkflowMetrics(
  workflowId: string,
  date: Date
) {
  const startOfDay = new Date(date);
  startOfDay.setUTCHours(0, 0, 0, 0);

  const endOfDay = new Date(startOfDay);
  endOfDay.setUTCHours(23, 59, 59, 999);

  // Get runs for this period
  const runs = await prisma.workflowRun.findMany({
    where: {
      workflowId,
      createdAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    include: {
      stepRuns: true,
    },
  });

  if (runs.length === 0) return null;

  const successful = runs.filter((r) => r.status === "COMPLETED").length;
  const failed = runs.filter((r) => r.status === "FAILED").length;

  const durations = runs
    .map((r) => r.duration)
    .filter((d) => d !== null) as number[];

  const averageDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;

  const sortedDurations = durations.sort((a, b) => a - b);
  const p95Index = Math.ceil(sortedDurations.length * 0.95) - 1;
  const p95Duration = sortedDurations[Math.max(0, p95Index)] || 0;

  // Find most common error
  const errors = await prisma.workflowExecutionLog.findMany({
    where: {
      run: {
        workflowId,
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      level: "ERROR",
    },
  });

  const errorMessages = errors.map((e) => e.message);
  const mostCommonError = getMostCommon(errorMessages);

  const dateStr = startOfDay.toISOString().split("T")[0];

  // Upsert metric
  const existing = await prisma.workflowMetric.findFirst({
    where: {
      workflowId,
      date: startOfDay,
    },
  });

  if (existing) {
    return await prisma.workflowMetric.update({
      where: { id: existing.id },
      data: {
        totalRuns: runs.length,
        successfulRuns: successful,
        failedRuns: failed,
        averageDuration: Math.round(averageDuration),
        minDuration: Math.min(...durations),
        maxDuration: Math.max(...durations),
        p95Duration: Math.round(p95Duration),
        errorRate: runs.length > 0 ? failed / runs.length : 0,
        mostCommonError,
      },
    });
  }

  return await prisma.workflowMetric.create({
    data: {
      workflowId,
      date: startOfDay,
      totalRuns: runs.length,
      successfulRuns: successful,
      failedRuns: failed,
      averageDuration: Math.round(averageDuration),
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      p95Duration: Math.round(p95Duration),
      errorRate: runs.length > 0 ? failed / runs.length : 0,
      mostCommonError,
    },
  });
}

/**
 * Get performance metrics for a workflow
 */
export async function getWorkflowMetrics(
  workflowId: string,
  days: number = 30
): Promise<WorkflowMetrics[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setUTCHours(0, 0, 0, 0);

  const metrics = await prisma.workflowMetric.findMany({
    where: {
      workflowId,
      date: { gte: since },
    },
    orderBy: { date: "asc" },
  });

  return metrics.map((m) => ({
    workflowId,
    period: m.date.toISOString().split("T")[0],
    totalRuns: m.totalRuns,
    successfulRuns: m.successfulRuns,
    failedRuns: m.failedRuns,
    averageDuration: m.averageDuration,
    minDuration: m.minDuration ?? 0,
    maxDuration: m.maxDuration ?? 0,
    p95Duration: m.p95Duration ?? 0,
    errorRate: m.errorRate,
    mostCommonError: m.mostCommonError ?? undefined,
  }));
}

/**
 * Calculate aggregated metrics across all workflows
 */
export async function getAggregatedMetrics(
  tenantId: string,
  days: number = 30
) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const workflows = await prisma.workflow.findMany({
    where: { tenantId },
    select: { id: true },
  });

  const allRuns = await prisma.workflowRun.findMany({
    where: {
      workflowId: { in: workflows.map((w) => w.id) },
      createdAt: { gte: since },
    },
  });

  const successful = allRuns.filter((r) => r.status === "COMPLETED").length;
  const failed = allRuns.filter((r) => r.status === "FAILED").length;

  const durations = allRuns
    .map((r) => r.duration)
    .filter((d) => d !== null) as number[];

  const avgDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;

  return {
    tenantId,
    period: `Last ${days} days`,
    totalWorkflows: workflows.length,
    totalRuns: allRuns.length,
    successfulRuns: successful,
    failedRuns: failed,
    successRate: allRuns.length > 0 ? successful / allRuns.length : 0,
    failureRate: allRuns.length > 0 ? failed / allRuns.length : 0,
    averageDuration: Math.round(avgDuration),
    dateRange: {
      from: since.toISOString(),
      to: new Date().toISOString(),
    },
  };
}

/**
 * Identify workflow bottlenecks
 */
export async function identifyBottlenecks(
  workflowId: string,
  topN: number = 5
) {
  const runs = await prisma.workflowRun.findMany({
    where: { workflowId },
    include: {
      stepRuns: {
        orderBy: { createdAt: "asc" },
      },
    },
    take: 100,
    orderBy: { createdAt: "desc" },
  });

  const stepMetrics = new Map<string, { durations: number[]; errors: number }>();

  for (const run of runs) {
    for (const stepRun of run.stepRuns) {
      if (!stepMetrics.has(stepRun.stepId)) {
        stepMetrics.set(stepRun.stepId, { durations: [], errors: 0 });
      }

      const metric = stepMetrics.get(stepRun.stepId)!;
      if (stepRun.duration) {
        metric.durations.push(stepRun.duration);
      }
      if (stepRun.status === "FAILED") {
        metric.errors++;
      }
    }
  }

  // Calculate average duration per step
  const bottlenecks = Array.from(stepMetrics.entries())
    .map(([stepId, metric]) => {
      const avgDuration =
        metric.durations.length > 0
          ? metric.durations.reduce((a, b) => a + b, 0) / metric.durations.length
          : 0;

      return {
        stepId,
        averageDuration: Math.round(avgDuration),
        executionCount: metric.durations.length,
        errorRate: metric.errors / Math.max(metric.durations.length, 1),
        impact: "HIGH" as const, // Impact scoring can be enhanced
      };
    })
    .sort((a, b) => b.averageDuration - a.averageDuration)
    .slice(0, topN);

  return bottlenecks;
}

/**
 * Generate optimization recommendations
 */
export async function generateRecommendations(
  workflowId: string
): Promise<OptimizationRecommendation[]> {
  const bottlenecks = await identifyBottlenecks(workflowId);
  const metrics = await getWorkflowMetrics(workflowId, 7);

  const recommendations: OptimizationRecommendation[] = [];
  const workflowId_counter = `rec_${Date.now()}`;

  // Analyze bottlenecks
  for (const bottleneck of bottlenecks) {
    if (bottleneck.averageDuration > 10000) {
      recommendations.push({
        id: `${workflowId_counter}_1`,
        workflowId,
        type: "PARALLEL_EXECUTION",
        description: `Step ${bottleneck.stepId} is taking ${bottleneck.averageDuration}ms. Consider executing it in parallel with other non-dependent steps.`,
        estimatedImprovement: 20,
        complexity: "MEDIUM",
        implementationSteps: [
          "Review step dependencies",
          "Identify parallelizable steps",
          "Update workflow to use parallel execution",
          "Test and validate",
        ],
      });
    }

    if (bottleneck.errorRate > 0.1) {
      recommendations.push({
        id: `${workflowId_counter}_2`,
        workflowId,
        type: "ERROR_HANDLING",
        description: `Step ${bottleneck.stepId} has a ${(bottleneck.errorRate * 100).toFixed(1)}% error rate. Improve error handling and add retry logic.`,
        estimatedImprovement: 15,
        complexity: "MEDIUM",
        implementationSteps: [
          "Analyze error patterns",
          "Implement exponential backoff retry",
          "Add fallback logic",
          "Monitor improvement",
        ],
      });
    }
  }

  // Analyze error patterns
  const avgErrorRate = metrics.reduce((sum, m) => sum + m.errorRate, 0) / Math.max(metrics.length, 1);
  if (avgErrorRate > 0.05) {
    recommendations.push({
      id: `${workflowId_counter}_3`,
      workflowId,
      type: "ERROR_HANDLING",
      description: `Overall error rate is ${(avgErrorRate * 100).toFixed(1)}%. Implement better error handling across the workflow.`,
      estimatedImprovement: 25,
      complexity: "HIGH",
      implementationSteps: [
        "Review all error handling",
        "Add circuit breaker pattern",
        "Implement comprehensive logging",
        "Create error recovery procedures",
      ],
    });
  }

  // Batch processing recommendation
  const totalRuns = metrics.reduce((sum, m) => sum + m.totalRuns, 0);
  if (totalRuns > 1000) {
    recommendations.push({
      id: `${workflowId_counter}_4`,
      workflowId,
      type: "BATCH_PROCESSING",
      description: `High volume of runs detected (${totalRuns} in 7 days). Consider batch processing to reduce overhead.`,
      estimatedImprovement: 30,
      complexity: "HIGH",
      implementationSteps: [
        "Analyze data volumes",
        "Group related runs",
        "Implement batch processing",
        "Optimize database queries",
      ],
    });
  }

  return recommendations;
}

/**
 * Calculate performance trends
 */
export async function calculateTrends(
  workflowId: string,
  days: number = 30
): Promise<PerformanceBaseline[]> {
  const metrics = await getWorkflowMetrics(workflowId, days);

  if (metrics.length < 2) {
    return [];
  }

  const midpoint = Math.floor(metrics.length / 2);
  const oldMetrics = metrics.slice(0, midpoint);
  const newMetrics = metrics.slice(midpoint);

  const oldAvgDuration =
    oldMetrics.reduce((sum, m) => sum + m.averageDuration, 0) / oldMetrics.length;
  const newAvgDuration =
    newMetrics.reduce((sum, m) => sum + m.averageDuration, 0) / newMetrics.length;

  const oldSuccessRate =
    oldMetrics.reduce((sum, m) => sum + (1 - m.errorRate), 0) / oldMetrics.length;
  const newSuccessRate =
    newMetrics.reduce((sum, m) => sum + (1 - m.errorRate), 0) / newMetrics.length;

  const oldErrorRate =
    oldMetrics.reduce((sum, m) => sum + m.errorRate, 0) / oldMetrics.length;
  const newErrorRate =
    newMetrics.reduce((sum, m) => sum + m.errorRate, 0) / newMetrics.length;

  const trends: PerformanceBaseline[] = [
    {
      workflowId,
      metricType: "DURATION",
      baseline: Math.round(oldAvgDuration),
      currentValue: Math.round(newAvgDuration),
      trend: newAvgDuration < oldAvgDuration ? "IMPROVING" : newAvgDuration > oldAvgDuration ? "DECLINING" : "STABLE",
      changePercentage: ((newAvgDuration - oldAvgDuration) / oldAvgDuration) * 100,
    },
    {
      workflowId,
      metricType: "SUCCESS_RATE",
      baseline: Math.round(oldSuccessRate * 100),
      currentValue: Math.round(newSuccessRate * 100),
      trend: newSuccessRate > oldSuccessRate ? "IMPROVING" : newSuccessRate < oldSuccessRate ? "DECLINING" : "STABLE",
      changePercentage: ((newSuccessRate - oldSuccessRate) / Math.max(oldSuccessRate, 0.01)) * 100,
    },
    {
      workflowId,
      metricType: "ERROR_RATE",
      baseline: Math.round(oldErrorRate * 100),
      currentValue: Math.round(newErrorRate * 100),
      trend: newErrorRate < oldErrorRate ? "IMPROVING" : newErrorRate > oldErrorRate ? "DECLINING" : "STABLE",
      changePercentage: ((newErrorRate - oldErrorRate) / Math.max(oldErrorRate, 0.01)) * 100,
    },
  ];

  return trends;
}

/**
 * Calculate ROI of automation
 */
export async function calculateROI(
  workflowId: string,
  manualProcessHoursPerRun: number = 1,
  hourlyRate: number = 50 // €50/hour
) {
  const metrics = await getWorkflowMetrics(workflowId, 30);
  const totalRuns = metrics.reduce((sum, m) => sum + m.totalRuns, 0);
  const avgDuration = metrics.reduce((sum, m) => sum + m.averageDuration, 0) / Math.max(metrics.length, 1);

  // Time saved (manual process - automated process)
  const manualTimeMs = manualProcessHoursPerRun * 3600 * 1000;
  const timeSavedMs = manualTimeMs - avgDuration;
  const totalTimeSavedHours = (timeSavedMs * totalRuns) / (1000 * 3600);
  const moneySaved = totalTimeSavedHours * hourlyRate;

  // Costs
  const platformCost = 100; // €100/month

  return {
    period: "30 days",
    totalRuns,
    timeSavedHours: Math.round(totalTimeSavedHours),
    moneySaved: Math.round(moneySaved),
    platformCost,
    netSavings: Math.round(moneySaved - platformCost),
    roi: moneySaved > 0 ? Math.round(((moneySaved - platformCost) / platformCost) * 100) : 0,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function getMostCommon(values: string[]): string | undefined {
  if (values.length === 0) return undefined;

  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  let maxCount = 0;
  let mostCommon: string | undefined;

  for (const [value, count] of counts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      mostCommon = value;
    }
  }

  return mostCommon;
}
