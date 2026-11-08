import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

// ============================================================================
// 5. EXECUTION & MONITORING - Real-time logs, error handling, retries, circuit breakers
// ============================================================================

export interface CircuitBreakerState {
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  failureCount: number;
  successCount: number;
  lastFailureTime?: Date;
  nextRetryTime?: Date;
}

export interface ExecutionConfig {
  maxRetries: number;
  retryDelayMs: number;
  circuitBreakerThreshold: number; // Failure rate threshold (0-1)
  circuitBreakerTimeout: number; // ms before half-open
  executionTimeout: number; // ms
}

// Circuit breaker states per workflow
const circuitBreakers = new Map<string, CircuitBreakerState>();

/**
 * Execute a workflow with full monitoring and error handling
 */
export async function executeWithMonitoring(
  workflowId: string,
  executionFn: () => Promise<unknown>,
  config: ExecutionConfig
) {
  const runId = `run_${Date.now()}`;
  const startTime = Date.now();

  try {
    // Check circuit breaker
    const breaker = getCircuitBreaker(workflowId);
    if (breaker.state === "OPEN") {
      if (Date.now() < (breaker.nextRetryTime?.getTime() || 0)) {
        throw new Error("Circuit breaker is OPEN");
      }
      breaker.state = "HALF_OPEN";
    }

    // Execute with timeout
    let result: unknown;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        result = await executeWithTimeout(executionFn, config.executionTimeout);

        // Success - record and reset breaker
        await logExecution(runId, "COMPLETED", {
          duration: Date.now() - startTime,
          attempt,
        });

        recordSuccess(workflowId);
        if (breaker.state === "HALF_OPEN") {
          breaker.state = "CLOSED";
          breaker.failureCount = 0;
        }

        return { success: true, result, duration: Date.now() - startTime };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        await logExecution(runId, "ERROR", {
          attempt,
          error: lastError.message,
          duration: Date.now() - startTime,
        });

        if (attempt < config.maxRetries) {
          const delay = config.retryDelayMs * Math.pow(2, attempt); // Exponential backoff
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    recordFailure(workflowId, config.circuitBreakerThreshold);
    throw lastError || new Error("Execution failed after all retries");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await logExecution(runId, "FAILED", {
      duration: Date.now() - startTime,
      error: message,
    });

    throw error;
  }
}

/**
 * Execute function with timeout
 */
function executeWithTimeout(
  fn: () => Promise<unknown>,
  timeoutMs: number
): Promise<unknown> {
  return Promise.race([
    fn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Execution timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

/**
 * Get or create circuit breaker for workflow
 */
function getCircuitBreaker(workflowId: string): CircuitBreakerState {
  if (!circuitBreakers.has(workflowId)) {
    circuitBreakers.set(workflowId, {
      state: "CLOSED",
      failureCount: 0,
      successCount: 0,
    });
  }
  return circuitBreakers.get(workflowId)!;
}

/**
 * Record successful execution
 */
function recordSuccess(workflowId: string) {
  const breaker = getCircuitBreaker(workflowId);
  breaker.successCount++;
  if (breaker.state === "HALF_OPEN") {
    breaker.state = "CLOSED";
    breaker.failureCount = 0;
    breaker.successCount = 0;
  }
}

/**
 * Record failed execution and check circuit breaker threshold
 */
function recordFailure(workflowId: string, threshold: number) {
  const breaker = getCircuitBreaker(workflowId);
  breaker.failureCount++;
  breaker.lastFailureTime = new Date();

  const totalAttempts = breaker.failureCount + breaker.successCount;
  const failureRate = breaker.failureCount / Math.max(totalAttempts, 1);

  if (failureRate > threshold && breaker.state === "CLOSED") {
    breaker.state = "OPEN";
    breaker.nextRetryTime = new Date(Date.now() + 60000); // 1 minute
  }
}

/**
 * Log workflow execution
 */
export async function logExecution(
  runId: string,
  status: "COMPLETED" | "ERROR" | "FAILED" | "RUNNING",
  metadata: Record<string, unknown>
) {
  try {
    // Extract a valid run ID if needed
    let actualRunId = runId;
    if (runId.startsWith("run_")) {
      // This is a synthetic run for monitoring, use a placeholder
      actualRunId = "monitoring-" + runId;
    }

    // Find actual run in database
    const run = await prisma.workflowRun.findFirst({
      where: { id: { contains: runId } },
    });

    if (!run) {
      // If no run found, just log without associating
      return;
    }

    await prisma.workflowExecutionLog.create({
      data: {
        runId: run.id,
        level: status === "FAILED" || status === "ERROR" ? "ERROR" : "INFO",
        message: `Execution ${status}`,
        metadata: metadata as unknown,
      },
    });
  } catch {
    // Silently fail if we can't log - don't break execution
  }
}

/**
 * Get execution logs for a run
 */
export async function getExecutionLogs(
  runId: string,
  options?: { level?: string; limit?: number }
) {
  return await prisma.workflowExecutionLog.findMany({
    where: {
      runId,
      ...(options?.level && { level: options.level }),
    },
    orderBy: { timestamp: "desc" },
    take: options?.limit || 100,
  });
}

/**
 * Retry a failed execution
 */
export async function retryExecution(
  tenantId: string,
  runId: string
) {
  const run = await prisma.workflowRun.findUnique({
    where: { id: runId },
    include: { workflow: true },
  });

  if (!run || run.workflow?.tenantId !== tenantId) {
    throw new AppError.notFound("Run nicht gevonden");
  }

  if (run.status !== "FAILED") {
    throw new AppError.validation("Kan alleen mislukte runs opnieuw proberen");
  }

  if ((run.retryCount || 0) >= (run.workflow?.maxRetries || 3)) {
    throw new AppError.validation("Maximale retry-pogingen bereikt");
  }

  // Create new run from original input
  const newRun = await prisma.workflowRun.create({
    data: {
      workflowId: run.workflowId,
      status: "RUNNING",
      triggeredBy: run.triggeredBy,
      inputData: run.inputData,
    },
  });

  return { newRunId: newRun.id, retryCount: (run.retryCount || 0) + 1 };
}

/**
 * Cancel an execution
 */
export async function cancelExecution(
  tenantId: string,
  runId: string
) {
  const run = await prisma.workflowRun.findUnique({
    where: { id: runId },
    include: { workflow: true },
  });

  if (!run || run.workflow?.tenantId !== tenantId) {
    throw new AppError.notFound("Run nicht gevonden");
  }

  if (run.status === "COMPLETED" || run.status === "FAILED" || run.status === "CANCELLED") {
    throw new AppError.validation("Kan afgeronde run niet annuleren");
  }

  await prisma.workflowRun.update({
    where: { id: runId },
    data: {
      status: "CANCELLED",
      completedAt: new Date(),
    },
  });

  await logExecution(runId, "FAILED", {
    error: "Cancelled by user",
  });

  return { cancelled: true };
}

/**
 * Monitor workflow execution in real-time
 */
export async function monitorExecution(runId: string) {
  return new ReadableStream({
    async start(controller) {
      try {
        let lastLogCount = 0;

        while (true) {
          const run = await prisma.workflowRun.findUnique({
            where: { id: runId },
          });

          if (!run) {
            controller.close();
            break;
          }

          const logs = await getExecutionLogs(runId, { limit: 50 });

          // Send new logs
          if (logs.length > lastLogCount) {
            const newLogs = logs.slice(0, logs.length - lastLogCount);
            controller.enqueue(
              JSON.stringify({
                event: "logs",
                data: newLogs,
              }) + "\n"
            );
            lastLogCount = logs.length;
          }

          // Send status update
          controller.enqueue(
            JSON.stringify({
              event: "status",
              data: {
                status: run.status,
                duration: run.duration,
              },
            }) + "\n"
          );

          // Stop if execution complete
          if (run.status === "COMPLETED" || run.status === "FAILED" || run.status === "CANCELLED") {
            controller.close();
            break;
          }

          // Wait before next poll
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

/**
 * Get execution statistics
 */
export async function getExecutionStats(
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

  const completed = runs.filter((r) => r.status === "COMPLETED").length;
  const failed = runs.filter((r) => r.status === "FAILED").length;
  const cancelled = runs.filter((r) => r.status === "CANCELLED").length;

  const durations = runs
    .filter((r) => r.duration)
    .map((r) => r.duration as number);

  const avgDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;

  const minDuration = durations.length > 0 ? Math.min(...durations) : 0;
  const maxDuration = durations.length > 0 ? Math.max(...durations) : 0;

  return {
    totalRuns: runs.length,
    completed,
    failed,
    cancelled,
    successRate: runs.length > 0 ? completed / runs.length : 0,
    failureRate: runs.length > 0 ? failed / runs.length : 0,
    averageDuration: Math.round(avgDuration),
    minDuration: Math.round(minDuration),
    maxDuration: Math.round(maxDuration),
    p95Duration: calculatePercentile(durations, 0.95),
  };
}

/**
 * Calculate percentile of sorted array
 */
function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;

  const sorted = values.sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * percentile) - 1;

  return Math.round(sorted[Math.max(0, index)]);
}

/**
 * Check health of execution system
 */
export async function healthCheck() {
  try {
    // Check database connectivity
    const recentRuns = await prisma.workflowRun.findMany({
      take: 1,
      orderBy: { createdAt: "desc" },
    });

    // Check logs
    const recentLogs = await prisma.workflowExecutionLog.findMany({
      take: 1,
      orderBy: { timestamp: "desc" },
    });

    // Check circuit breaker states
    let openBreakers = 0;
    for (const [, breaker] of circuitBreakers.entries()) {
      if (breaker.state === "OPEN") {
        openBreakers++;
      }
    }

    return {
      healthy: true,
      database: "OK",
      circuitBreakers: {
        total: circuitBreakers.size,
        open: openBreakers,
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    };
  }
}
