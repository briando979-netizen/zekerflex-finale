import { prisma } from "@/lib/prisma";

export interface WorkflowMetrics {
  workflowId: string;
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  errorCount: number;
  averageExecutionTime: number;
  lastExecution?: Date;
  successRate: number;
}

export interface ExecutionStats {
  period: "day" | "week" | "month";
  total: number;
  successful: number;
  failed: number;
  errors: number;
}

export async function getWorkflowMetrics(workflowId: string): Promise<WorkflowMetrics> {
  const executions = await prisma.workflowExecution.findMany({
    where: { workflowId },
  });

  const successCount = executions.filter((e) => e.status === "success").length;
  const failureCount = executions.filter((e) => e.status === "failed").length;
  const errorCount = executions.filter((e) => e.status === "error").length;

  const executionTimes = executions
    .map((e) => (e.completedAt ? e.completedAt.getTime() - e.startedAt.getTime() : 0))
    .filter((t) => t > 0);

  const averageExecutionTime = executionTimes.length > 0 ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length : 0;

  const successRate = executions.length > 0 ? (successCount / executions.length) * 100 : 0;

  return {
    workflowId,
    totalExecutions: executions.length,
    successCount,
    failureCount,
    errorCount,
    averageExecutionTime,
    lastExecution: executions.length > 0 ? executions[executions.length - 1].startedAt : undefined,
    successRate,
  };
}

export async function getExecutionStats(workflowId: string, period: "day" | "week" | "month"): Promise<ExecutionStats> {
  const now = new Date();
  let startDate: Date;

  switch (period) {
    case "day":
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case "week":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "month":
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
  }

  const executions = await prisma.workflowExecution.findMany({
    where: {
      workflowId,
      startedAt: { gte: startDate },
    },
  });

  return {
    period,
    total: executions.length,
    successful: executions.filter((e) => e.status === "success").length,
    failed: executions.filter((e) => e.status === "failed").length,
    errors: executions.filter((e) => e.status === "error").length,
  };
}

export async function getErrorReport(workflowId: string, limit: number = 10): Promise<Array<{ error: string; count: number; lastOccurred: Date }>> {
  const executions = await prisma.workflowExecution.findMany({
    where: { workflowId, error: { not: null } },
    orderBy: { startedAt: "desc" },
    take: limit * 2,
  });

  const errorMap = new Map<string, { count: number; lastOccurred: Date }>();

  for (const exec of executions) {
    if (exec.error) {
      const existing = errorMap.get(exec.error) || { count: 0, lastOccurred: exec.startedAt };
      errorMap.set(exec.error, {
        count: existing.count + 1,
        lastOccurred: exec.startedAt,
      });
    }
  }

  return Array.from(errorMap.entries())
    .map(([error, data]) => ({ error, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
