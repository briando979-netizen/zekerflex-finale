/**
 * Monitoring & Logs — Execution tracking, performance metrics, and analytics
 * Provides detailed insights into workflow executions and system health.
 */

import { prisma } from "@/lib/prisma";
import { IntegrationLog, WorkflowExecution } from "@prisma/client";

export interface ExecutionMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  successRate: number;
  errorRate: number;
}

export interface ConnectorMetrics {
  connectorName: string;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  averageDurationMs: number;
  totalBytesTransferred: number;
}

export interface WorkflowHealth {
  workflowId: string;
  name: string;
  status: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
  successRate: number;
  averageExecutionTime: number;
  lastExecutionTime?: Date;
  errorRate: number;
  topErrors: Array<{ code: string; count: number }>;
}

/**
 * Log workflow step execution
 */
export async function logStepExecution(
  workflowId: string,
  executionId: string,
  stepIndex: number,
  connectorName: string,
  actionName: string,
  requestPayload: unknown,
  responsePayload: unknown | null,
  statusCode: number | null,
  durationMs: number,
  status: "SUCCESS" | "FAILED" | "SKIPPED" | "RETRYING",
  errorMessage?: string,
  errorCode?: string
): Promise<IntegrationLog> {
  return prisma.integrationLog.create({
    data: {
      workflowId,
      executionId,
      stepIndex,
      connectorName,
      actionName,
      requestPayload,
      responsePayload,
      statusCode,
      durationMs,
      status,
      errorMessage,
      errorCode,
      attemptNumber: 1,
    },
  });
}

/**
 * Get execution metrics for a workflow
 */
export async function getWorkflowMetrics(
  workflowId: string,
  timeWindowDays: number = 30
): Promise<ExecutionMetrics> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - timeWindowDays);

  const executions = await prisma.workflowExecution.findMany({
    where: {
      workflowId,
      createdAt: {
        gte: cutoffDate,
      },
    },
  });

  const successful = executions.filter((e) => e.status === "SUCCESS");
  const failed = executions.filter((e) => e.status === "FAILED");

  const durations = executions
    .filter((e) => e.durationMs ?? 0 > 0)
    .map((e) => e.durationMs ?? 0)
    .sort((a, b) => a - b);

  return {
    totalExecutions: executions.length,
    successfulExecutions: successful.length,
    failedExecutions: failed.length,
    averageDurationMs:
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0,
    p50DurationMs: durations[Math.floor(durations.length * 0.5)] ?? 0,
    p95DurationMs: durations[Math.floor(durations.length * 0.95)] ?? 0,
    p99DurationMs: durations[Math.floor(durations.length * 0.99)] ?? 0,
    successRate:
      executions.length > 0 ? successful.length / executions.length : 0,
    errorRate: executions.length > 0 ? failed.length / executions.length : 0,
  };
}

/**
 * Get connector performance metrics
 */
export async function getConnectorMetrics(
  connectorName: string,
  timeWindowDays: number = 30
): Promise<ConnectorMetrics> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - timeWindowDays);

  const logs = await prisma.integrationLog.findMany({
    where: {
      connectorName,
      createdAt: {
        gte: cutoffDate,
      },
    },
  });

  const successful = logs.filter((l) => l.status === "SUCCESS");
  const failed = logs.filter((l) => l.status === "FAILED");

  const totalBytes = logs.reduce((sum, log) => {
    let size = 0;
    if (log.requestPayload) {
      size += JSON.stringify(log.requestPayload).length;
    }
    if (log.responsePayload) {
      size += JSON.stringify(log.responsePayload).length;
    }
    return sum + size;
  }, 0);

  const durations = logs
    .filter((l) => l.durationMs ?? 0 > 0)
    .map((l) => l.durationMs ?? 0);

  return {
    connectorName,
    totalCalls: logs.length,
    successfulCalls: successful.length,
    failedCalls: failed.length,
    averageDurationMs:
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0,
    totalBytesTransferred: totalBytes,
  };
}

/**
 * Get workflow health status
 */
export async function getWorkflowHealth(
  workflowId: string,
  timeWindowDays: number = 7
): Promise<WorkflowHealth> {
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
  });

  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  const metrics = await getWorkflowMetrics(workflowId, timeWindowDays);

  // Get top errors
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - timeWindowDays);

  const logs = await prisma.integrationLog.findMany({
    where: {
      workflowId,
      status: "FAILED",
      createdAt: {
        gte: cutoffDate,
      },
    },
  });

  const errorCounts: Record<string, number> = {};
  for (const log of logs) {
    const code = log.errorCode ?? "UNKNOWN";
    errorCounts[code] = (errorCounts[code] ?? 0) + 1;
  }

  const topErrors = Object.entries(errorCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([code, count]) => ({ code, count }));

  // Determine health status
  let status: "HEALTHY" | "DEGRADED" | "UNHEALTHY" = "HEALTHY";
  if (metrics.errorRate > 0.5) {
    status = "UNHEALTHY";
  } else if (metrics.errorRate > 0.1) {
    status = "DEGRADED";
  }

  const executions = await prisma.workflowExecution.findMany({
    where: { workflowId },
    orderBy: { createdAt: "desc" },
    take: 1,
  });

  return {
    workflowId,
    name: workflow.name,
    status,
    successRate: metrics.successRate,
    averageExecutionTime: metrics.averageDurationMs,
    lastExecutionTime: executions[0]?.createdAt,
    errorRate: metrics.errorRate,
    topErrors,
  };
}

/**
 * Get health status for all workflows in a tenant
 */
export async function getTenantWorkflowsHealth(
  tenantId: string,
  timeWindowDays: number = 7
): Promise<WorkflowHealth[]> {
  const workflows = await prisma.workflow.findMany({
    where: { tenantId, enabled: true },
  });

  const health: WorkflowHealth[] = [];

  for (const workflow of workflows) {
    const workflowHealth = await getWorkflowHealth(workflow.id, timeWindowDays);
    health.push(workflowHealth);
  }

  return health;
}

/**
 * Get execution timeline
 */
export async function getExecutionTimeline(
  executionId: string
): Promise<
  Array<{
    stepIndex: number;
    connectorName: string;
    actionName: string;
    startTime: Date;
    duration: number;
    status: string;
    error?: string;
  }>
> {
  const logs = await prisma.integrationLog.findMany({
    where: { executionId },
    orderBy: { createdAt: "asc" },
  });

  return logs.map((log) => ({
    stepIndex: log.stepIndex,
    connectorName: log.connectorName,
    actionName: log.actionName,
    startTime: log.createdAt,
    duration: log.durationMs ?? 0,
    status: log.status,
    error: log.errorMessage,
  }));
}

/**
 * Get real-time dashboard data
 */
export async function getDashboardData(
  tenantId: string
): Promise<{
  activeExecutions: number;
  totalWorkflows: number;
  successRate: number;
  averageExecutionTime: number;
  failedExecutions: number;
  topFailingWorkflows: Array<{
    workflowId: string;
    name: string;
    failureCount: number;
  }>;
  recentErrors: Array<{
    workflowId: string;
    workflowName: string;
    error: string;
    timestamp: Date;
  }>;
}> {
  // Active executions (running in last 30 minutes)
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  const activeExecutions = await prisma.workflowExecution.count({
    where: {
      workflow: { tenantId },
      status: "RUNNING",
      startedAt: {
        gte: thirtyMinutesAgo,
      },
    },
  });

  // Total workflows
  const totalWorkflows = await prisma.workflow.count({
    where: { tenantId },
  });

  // Failed executions (last 24 hours)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const failedExecutions = await prisma.workflowExecution.count({
    where: {
      workflow: { tenantId },
      status: "FAILED",
      createdAt: {
        gte: oneDayAgo,
      },
    },
  });

  // Overall success rate (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentExecutions = await prisma.workflowExecution.findMany({
    where: {
      workflow: { tenantId },
      createdAt: {
        gte: sevenDaysAgo,
      },
    },
  });

  const successful = recentExecutions.filter((e) => e.status === "SUCCESS").length;
  const successRate =
    recentExecutions.length > 0 ? successful / recentExecutions.length : 0;

  const averageDurationMs =
    recentExecutions.length > 0
      ? Math.round(
          recentExecutions
            .filter((e) => e.durationMs)
            .reduce((sum, e) => sum + (e.durationMs ?? 0), 0) /
            recentExecutions.filter((e) => e.durationMs).length
        )
      : 0;

  // Top failing workflows
  const failingWorkflows = await prisma.workflowExecution.groupBy({
    by: ["workflowId"],
    where: {
      workflow: { tenantId },
      status: "FAILED",
      createdAt: {
        gte: oneDayAgo,
      },
    },
    _count: true,
    orderBy: {
      _count: {
        id: "desc",
      },
    },
    take: 5,
  });

  const topFailingWorkflows = await Promise.all(
    failingWorkflows.map(async (fw) => {
      const workflow = await prisma.workflow.findUnique({
        where: { id: fw.workflowId },
      });
      return {
        workflowId: fw.workflowId,
        name: workflow?.name ?? "Unknown",
        failureCount: fw._count,
      };
    })
  );

  // Recent errors
  const recentErrors = await prisma.integrationLog.findMany({
    where: {
      workflow: { tenantId },
      status: "FAILED",
      createdAt: {
        gte: oneDayAgo,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      workflow: true,
    },
  });

  return {
    activeExecutions,
    totalWorkflows,
    successRate,
    averageExecutionTime: averageDurationMs,
    failedExecutions,
    topFailingWorkflows,
    recentErrors: recentErrors.map((log) => ({
      workflowId: log.workflowId,
      workflowName: log.workflow.name,
      error: log.errorMessage ?? "Unknown error",
      timestamp: log.createdAt,
    })),
  };
}
