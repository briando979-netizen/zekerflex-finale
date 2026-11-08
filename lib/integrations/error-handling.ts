/**
 * Error Handling — Retry logic, dead-letter queues, and fallback strategies
 * Manages error recovery, resilience patterns, and graceful degradation.
 */

import { prisma } from "@/lib/prisma";
import { WorkflowExecution } from "@prisma/client";

export interface ErrorContext {
  executionId: string;
  stepIndex: number;
  error: Error;
  attempt: number;
  context?: Record<string, unknown>;
}

export interface RetryConfig {
  maxRetries: number;
  backoffType: "linear" | "exponential";
  initialDelayMs: number;
  maxDelayMs?: number;
}

export interface ErrorStrategy {
  type: "STOP" | "RETRY" | "SKIP" | "FALLBACK";
  retryConfig?: RetryConfig;
  fallbackValue?: unknown;
  fallbackAction?: string;
  alertOnError?: boolean;
  deadLetterQueue?: boolean;
}

/**
 * Calculate next retry delay
 */
export function calculateRetryDelay(
  attempt: number,
  config: RetryConfig
): number {
  let delay = config.initialDelayMs;

  if (config.backoffType === "exponential") {
    delay = config.initialDelayMs * Math.pow(2, attempt - 1);
  } else {
    // Linear backoff
    delay = config.initialDelayMs * attempt;
  }

  // Apply max delay cap
  if (config.maxDelayMs) {
    delay = Math.min(delay, config.maxDelayMs);
  }

  // Add jitter to prevent thundering herd
  const jitter = delay * 0.1 * Math.random();
  return Math.floor(delay + jitter);
}

/**
 * Handle workflow execution error
 */
export async function handleExecutionError(
  context: ErrorContext,
  strategy: ErrorStrategy
): Promise<{
  action: "RETRY" | "SKIP" | "FALLBACK" | "STOP";
  nextRetryAt?: Date;
  fallbackValue?: unknown;
}> {
  // Log error for debugging
  await logExecutionError(context);

  if (strategy.deadLetterQueue && context.attempt > (strategy.retryConfig?.maxRetries ?? 3)) {
    // Send to dead-letter queue for manual inspection
    await sendToDeadLetterQueue(context);
  }

  switch (strategy.type) {
    case "RETRY": {
      if (!strategy.retryConfig) {
        return { action: "STOP" };
      }

      if (context.attempt >= strategy.retryConfig.maxRetries) {
        return { action: "STOP" };
      }

      const delayMs = calculateRetryDelay(context.attempt, strategy.retryConfig);
      const nextRetryAt = new Date(Date.now() + delayMs);

      // Update execution with retry info
      await prisma.workflowExecution.update({
        where: { id: context.executionId },
        data: {
          retryCount: context.attempt,
          nextRetryAt,
        },
      });

      return { action: "RETRY", nextRetryAt };
    }

    case "FALLBACK":
      return {
        action: "FALLBACK",
        fallbackValue: strategy.fallbackValue,
      };

    case "SKIP":
      return { action: "SKIP" };

    case "STOP":
    default:
      return { action: "STOP" };
  }
}

/**
 * Log execution error to database
 */
export async function logExecutionError(context: ErrorContext): Promise<void> {
  const execution = await prisma.workflowExecution.findUnique({
    where: { id: context.executionId },
  });

  if (!execution) {
    return;
  }

  const logs = execution.logs ?? [];

  const errorLog = {
    stepIndex: context.stepIndex,
    status: "FAILED",
    error: context.error.message,
    code: (context.error as unknown as Record<string, unknown>)?.code,
    attempt: context.attempt,
    timestamp: new Date().toISOString(),
  };

  logs.push(errorLog);

  await prisma.workflowExecution.update({
    where: { id: context.executionId },
    data: {
      logs,
      errorMessage: context.error.message,
      errorCode: (context.error as unknown as Record<string, unknown>)?.code as string | undefined,
    },
  });
}

/**
 * Send failed execution to dead-letter queue
 */
export async function sendToDeadLetterQueue(context: ErrorContext): Promise<void> {
  const execution = await prisma.workflowExecution.findUnique({
    where: { id: context.executionId },
  });

  if (!execution) {
    return;
  }

  // In production, this would send to a message queue (e.g., SQS, RabbitMQ)
  // For now, we'll log it for manual inspection
  const dlqMessage = {
    executionId: context.executionId,
    workflowId: execution.workflowId,
    error: context.error.message,
    attempt: context.attempt,
    timestamp: new Date().toISOString(),
  };

  // Store in a special execution status for manual review
  await prisma.workflowExecution.update({
    where: { id: context.executionId },
    data: {
      status: "FAILED",
      errorMessage: `Sent to DLQ: ${context.error.message}`,
    },
  });

  // In production:
  // await sqs.sendMessage({
  //   QueueUrl: process.env.ERROR_DLQ_URL,
  //   MessageBody: JSON.stringify(dlqMessage),
  // }).promise();
}

/**
 * Retry workflow execution
 */
export async function retryWorkflowExecution(
  executionId: string
): Promise<WorkflowExecution | null> {
  const execution = await prisma.workflowExecution.findUnique({
    where: { id: executionId },
  });

  if (!execution) {
    return null;
  }

  if (execution.nextRetryAt && execution.nextRetryAt > new Date()) {
    throw new Error("Execution is not ready for retry yet");
  }

  // Reset execution state for retry
  return prisma.workflowExecution.update({
    where: { id: executionId },
    data: {
      status: "PENDING",
      stepsCompleted: 0,
      currentStep: 0,
      outputData: null,
      errorMessage: null,
      errorCode: null,
      retryCount: (execution.retryCount ?? 0) + 1,
      nextRetryAt: null,
      startedAt: new Date(),
      completedAt: null,
    },
  });
}

/**
 * Get execution error history
 */
export async function getExecutionErrorHistory(
  executionId: string
): Promise<Array<{
  stepIndex: number;
  status: string;
  error: string;
  code?: string;
  attempt: number;
  timestamp: string;
}>> {
  const execution = await prisma.workflowExecution.findUnique({
    where: { id: executionId },
  });

  if (!execution || !execution.logs) {
    return [];
  }

  return execution.logs as Array<{
    stepIndex: number;
    status: string;
    error: string;
    code?: string;
    attempt: number;
    timestamp: string;
  }>;
}

/**
 * Get recently failed executions for a workflow
 */
export async function getFailedExecutions(
  workflowId: string,
  limit: number = 10
) {
  return prisma.workflowExecution.findMany({
    where: {
      workflowId,
      status: "FAILED",
    },
    take: limit,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Analyze error patterns
 */
export async function analyzeErrorPatterns(
  workflowId: string,
  timeWindowDays: number = 7
): Promise<{
  totalErrors: number;
  errorsByType: Record<string, number>;
  errorsByStep: Record<number, number>;
  mostCommonError: string | null;
  errorRate: number;
}> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - timeWindowDays);

  const failedExecutions = await prisma.workflowExecution.findMany({
    where: {
      workflowId,
      status: "FAILED",
      createdAt: {
        gte: cutoffDate,
      },
    },
  });

  const totalExecutions = await prisma.workflowExecution.count({
    where: {
      workflowId,
      createdAt: {
        gte: cutoffDate,
      },
    },
  });

  const errorsByType: Record<string, number> = {};
  const errorsByStep: Record<number, number> = {};
  let mostCommonError: string | null = null;
  let maxErrorCount = 0;

  for (const execution of failedExecutions) {
    const errorCode = execution.errorCode ?? "UNKNOWN";
    errorsByType[errorCode] = (errorsByType[errorCode] ?? 0) + 1;

    if (errorsByType[errorCode] > maxErrorCount) {
      maxErrorCount = errorsByType[errorCode];
      mostCommonError = errorCode;
    }

    const stepIndex = execution.currentStep ?? 0;
    errorsByStep[stepIndex] = (errorsByStep[stepIndex] ?? 0) + 1;
  }

  return {
    totalErrors: failedExecutions.length,
    errorsByType,
    errorsByStep,
    mostCommonError,
    errorRate: totalExecutions > 0 ? failedExecutions.length / totalExecutions : 0,
  };
}

/**
 * Create circuit breaker for failing connector
 */
export class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime: Date | null = null;
  private state: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";

  constructor(
    private failureThreshold: number = 5,
    private resetTimeoutMs: number = 60000 // 1 minute
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (
        this.lastFailureTime &&
        Date.now() - this.lastFailureTime.getTime() > this.resetTimeoutMs
      ) {
        this.state = "HALF_OPEN";
      } else {
        throw new Error("Circuit breaker is OPEN");
      }
    }

    try {
      const result = await fn();
      if (this.state === "HALF_OPEN") {
        this.state = "CLOSED";
        this.failureCount = 0;
      }
      return result;
    } catch (error) {
      this.failureCount += 1;
      this.lastFailureTime = new Date();

      if (this.failureCount >= this.failureThreshold) {
        this.state = "OPEN";
      }

      throw error;
    }
  }

  getState(): "CLOSED" | "OPEN" | "HALF_OPEN" {
    return this.state;
  }

  reset(): void {
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = "CLOSED";
  }
}
