export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 2000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
};

export function calculateBackoffDelay(
  attemptsMade: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attemptsMade);
  return Math.min(exponentialDelay, config.maxDelayMs);
}

export interface DeadLetterQueue {
  jobId: string;
  type: string;
  payload: unknown;
  error: string;
  failedAt: Date;
  attemptsMade: number;
  maxRetries: number;
}

export class DeadLetterQueueManager {
  private dlq: DeadLetterQueue[] = [];

  async addToDeadLetter(job: {
    id: string;
    type: string;
    payload: unknown;
    error: Error;
    attemptsMade: number;
    maxRetries: number;
  }): Promise<void> {
    this.dlq.push({
      jobId: job.id,
      type: job.type,
      payload: job.payload,
      error: job.error.message,
      failedAt: new Date(),
      attemptsMade: job.attemptsMade,
      maxRetries: job.maxRetries,
    });
  }

  async getDeadLetters(limit = 100): Promise<DeadLetterQueue[]> {
    return this.dlq.slice(0, limit);
  }

  async clearDeadLetter(jobId: string): Promise<void> {
    this.dlq = this.dlq.filter((item) => item.jobId !== jobId);
  }
}

export const deadLetterQueue = new DeadLetterQueueManager();
