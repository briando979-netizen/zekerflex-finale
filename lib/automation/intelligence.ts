import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

// ============================================================================
// 4. AUTOMATION INTELLIGENCE - AI-powered discovery, RPA recommendations, bot mgmt
// ============================================================================

export interface ProcessPattern {
  id: string;
  name: string;
  frequency: number;
  stepNames: string[];
  averageDuration: number;
  variance: number;
  automationScore: number; // 0-1
  recommendation?: string;
}

export interface RpaCandidate {
  processName: string;
  automationPotential: number; // 0-1
  complexity: "LOW" | "MEDIUM" | "HIGH";
  estimatedTimeSavings: number; // hours/month
  confidenceLevel: number; // 0-1
  reasoning: string;
}

export interface BotConfig {
  id: string;
  name: string;
  type: "RPA_BOT" | "CHATBOT" | "ASSISTANT";
  workflows: string[]; // Workflow IDs
  status: "ACTIVE" | "PAUSED" | "DISABLED";
  performance: BotPerformance;
}

export interface BotPerformance {
  successRate: number;
  averageExecutionTime: number;
  errorsLastHour: number;
  processedCount: number;
}

/**
 * Discover process patterns from workflow execution logs
 */
export async function discoverProcessPatterns(
  tenantId: string,
  lookbackDays: number = 30
): Promise<ProcessPattern[]> {
  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);

  // Get all workflow runs and their steps
  const runs = await prisma.workflowRun.findMany({
    where: {
      workflow: {
        tenantId,
      },
      createdAt: { gte: since },
    },
    include: {
      stepRuns: true,
      workflow: true,
    },
  });

  // Group by workflow and analyze patterns
  const patterns = new Map<string, { steps: string[]; durations: number[] }>();

  for (const run of runs) {
    const workflowName = run.workflow?.name || "Unknown";
    const stepNames = run.stepRuns.map((s) => s.id);
    const duration = run.duration || 0;

    if (!patterns.has(workflowName)) {
      patterns.set(workflowName, { steps: [], durations: [] });
    }

    const pattern = patterns.get(workflowName)!;
    pattern.steps.push(...stepNames);
    pattern.durations.push(duration);
  }

  // Convert to pattern objects with automation scores
  const results: ProcessPattern[] = [];
  for (const [name, data] of patterns.entries()) {
    const avgDuration = data.durations.reduce((a, b) => a + b, 0) / data.durations.length;
    const variance = calculateVariance(data.durations, avgDuration);
    const automationScore = calculateAutomationScore(data.steps.length, variance);

    results.push({
      id: `pattern_${name}`,
      name,
      frequency: data.durations.length,
      stepNames: [...new Set(data.steps)],
      averageDuration: Math.round(avgDuration),
      variance: Math.round(variance),
      automationScore,
      recommendation: getAutomationRecommendation(automationScore, data.steps.length),
    });
  }

  return results.sort((a, b) => b.automationScore - a.automationScore);
}

/**
 * Identify RPA candidates using ML scoring
 */
export async function identifyRpaCandidates(
  tenantId: string
): Promise<RpaCandidate[]> {
  const patterns = await discoverProcessPatterns(tenantId, 60);
  const candidates: RpaCandidate[] = [];

  for (const pattern of patterns) {
    // Skip if already automated
    const existingWorkflow = await prisma.workflow.findFirst({
      where: {
        tenantId,
        name: pattern.name,
      },
    });

    if (existingWorkflow) {
      continue;
    }

    const complexity = classifyComplexity(pattern.stepNames.length);
    const estimatedTimeSavings = calculateTimeSavings(pattern.frequency, pattern.averageDuration);
    const confidenceLevel = pattern.automationScore;

    candidates.push({
      processName: pattern.name,
      automationPotential: pattern.automationScore,
      complexity,
      estimatedTimeSavings,
      confidenceLevel,
      reasoning: `Process runs ${pattern.frequency} times with average duration of ${pattern.averageDuration}ms. Contains ${pattern.stepNames.length} distinct steps.`,
    });
  }

  return candidates.sort((a, b) => b.automationPotential - a.automationPotential);
}

/**
 * Create and manage automation bots
 */
export async function createBot(
  tenantId: string,
  name: string,
  type: "RPA_BOT" | "CHATBOT" | "ASSISTANT",
  workflowIds: string[]
) {
  // Validate workflows exist and belong to tenant
  for (const workflowId of workflowIds) {
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow || workflow.tenantId !== tenantId) {
      throw new AppError.notFound(`Workflow ${workflowId} niet gevonden`);
    }
  }

  // In a real implementation, this would create a bot instance
  const bot: BotConfig = {
    id: `bot_${Date.now()}`,
    name,
    type,
    workflows: workflowIds,
    status: "PAUSED",
    performance: {
      successRate: 0,
      averageExecutionTime: 0,
      errorsLastHour: 0,
      processedCount: 0,
    },
  };

  return bot;
}

/**
 * Get bot performance metrics
 */
export async function getBotPerformance(
  tenantId: string,
  botId: string,
  timeframe: "1h" | "24h" | "7d" = "24h"
): Promise<BotPerformance> {
  const since = new Date();
  switch (timeframe) {
    case "1h":
      since.setHours(since.getHours() - 1);
      break;
    case "24h":
      since.setDate(since.getDate() - 1);
      break;
    case "7d":
      since.setDate(since.getDate() - 7);
      break;
  }

  // Get bot workflows and their runs
  const metrics = await prisma.workflowExecutionLog.findMany({
    where: {
      timestamp: { gte: since },
    },
    orderBy: { timestamp: "desc" },
  });

  const totalRuns = metrics.length;
  const errorRuns = metrics.filter((m) => m.level === "ERROR").length;
  const successRate = totalRuns > 0 ? (totalRuns - errorRuns) / totalRuns : 0;

  return {
    successRate,
    averageExecutionTime: 0,
    errorsLastHour: timeframe === "1h" ? errorRuns : 0,
    processedCount: totalRuns,
  };
}

/**
 * Recommend process optimizations based on bottleneck analysis
 */
export async function analyzeBottlenecks(tenantId: string) {
  const workflows = await prisma.workflow.findMany({
    where: { tenantId, enabled: true },
    include: {
      runs: {
        take: 100,
        orderBy: { createdAt: "desc" },
        include: {
          stepRuns: {
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  const bottlenecks = [];

  for (const workflow of workflows) {
    if (workflow.runs.length === 0) continue;

    for (const run of workflow.runs) {
      // Find slowest step
      let slowestStep = null;
      let maxDuration = 0;

      for (const stepRun of run.stepRuns) {
        const duration = (stepRun.duration as number) || 0;
        if (duration > maxDuration) {
          maxDuration = duration;
          slowestStep = stepRun;
        }
      }

      if (slowestStep && maxDuration > 5000) {
        // More than 5 seconds
        bottlenecks.push({
          workflowId: workflow.id,
          workflowName: workflow.name,
          stepId: slowestStep.stepId,
          duration: maxDuration,
          recommendation: generateOptimizationRecommendation(slowestStep, maxDuration),
        });
      }
    }
  }

  return bottlenecks;
}

/**
 * Store and retrieve process metrics
 */
export async function recordProcessMetric(
  tenantId: string,
  processName: string,
  metric: {
    executionTime: number;
    success: boolean;
    error?: string;
  }
) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const existing = await prisma.processMetric.findFirst({
    where: {
      tenantId,
      processName,
      date: today,
    },
  });

  if (existing) {
    const totalRuns = existing.processFrequency;
    const totalDuration = (existing.variance || 0) * totalRuns + (existing.anomalyScore || 0);
    const newDuration = totalDuration + metric.executionTime;
    const newVariance = newDuration / (totalRuns + 1);

    await prisma.processMetric.update({
      where: { id: existing.id },
      data: {
        processFrequency: totalRuns + 1,
        variance: newVariance,
        updatedAt: new Date(),
      },
    });
  } else {
    await prisma.processMetric.create({
      data: {
        tenantId,
        processName,
        date: today,
        processFrequency: 1,
        variance: metric.executionTime,
        candidateForRPA: metric.success,
        rpaPotential: metric.success ? 0.8 : 0.2,
      },
    });
  }
}

/**
 * Get ROI analysis for automation
 */
export async function calculateAutomationROI(
  tenantId: string,
  workflowId: string,
  periodDays: number = 30
) {
  const since = new Date();
  since.setDate(since.getDate() - periodDays);

  const runs = await prisma.workflowRun.findMany({
    where: {
      workflowId,
      createdAt: { gte: since },
    },
  });

  const totalRuns = runs.length;
  const totalDuration = runs.reduce((sum, r) => sum + (r.duration || 0), 0);
  const averageDuration = totalRuns > 0 ? totalDuration / totalRuns : 0;

  // Assume manual process would take 3x longer
  const manualDuration = averageDuration * 3;
  const timeSavedPerRun = manualDuration - averageDuration;
  const totalTimeSaved = (timeSavedPerRun * totalRuns) / 3600000; // Convert to hours
  const hourlyRate = 50; // €50/hour
  const monthlySavings = (totalTimeSaved * hourlyRate) / periodDays * 30;

  return {
    totalRuns,
    averageDuration: Math.round(averageDuration),
    timeSavedHours: Math.round(totalTimeSaved),
    estimatedMonthlySavings: Math.round(monthlySavings),
    roi: monthlySavings / 100, // Assuming €100/month platform cost
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function calculateVariance(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
}

function calculateAutomationScore(stepCount: number, variance: number): number {
  // Higher score = better candidate for automation
  const stepScore = Math.min(stepCount / 10, 1); // Max 1.0 at 10 steps
  const consistencyScore = 1 - Math.min(variance / 10000, 1); // Higher consistency = better

  return (stepScore * 0.6 + consistencyScore * 0.4);
}

function classifyComplexity(stepCount: number): "LOW" | "MEDIUM" | "HIGH" {
  if (stepCount <= 3) return "LOW";
  if (stepCount <= 7) return "MEDIUM";
  return "HIGH";
}

function calculateTimeSavings(frequency: number, averageDuration: number): number {
  // Assume 30-minute average manual process
  const manualDuration = 30 * 60 * 1000; // 30 minutes in ms
  const timeSavedPerRun = manualDuration - averageDuration;
  const hoursPerMonth = (timeSavedPerRun * frequency * 30) / (1000 * 60 * 60); // 30 days

  return Math.round(hoursPerMonth);
}

function getAutomationRecommendation(score: number, stepCount: number): string {
  if (score > 0.8) {
    return "Excellent automation candidate - highly recommended";
  }
  if (score > 0.6) {
    return "Good automation candidate - consider automating";
  }
  if (score > 0.4) {
    return "Moderate automation potential - review complexity first";
  }
  return "Low automation priority - focus on high-score processes first";
}

function generateOptimizationRecommendation(
  stepRun: { stepId: string; duration: number | null },
  duration: number
): string {
  if (duration > 30000) {
    return `Step ${stepRun.stepId} is extremely slow (${duration}ms). Consider breaking into parallel sub-steps or optimizing the step logic.`;
  }
  if (duration > 10000) {
    return `Step ${stepRun.stepId} is slow (${duration}ms). Review for optimization opportunities.`;
  }
  return `Step ${stepRun.stepId} exceeds 5 second threshold. Monitor and optimize as needed.`;
}
