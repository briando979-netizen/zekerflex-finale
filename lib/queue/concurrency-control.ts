export interface ConcurrencyConfig {
  maxWorkers: number;
  queueName: string;
  timeoutMs: number;
}

export class ConcurrencyController {
  private activeJobs = new Map<string, Date>();
  private maxWorkers: number;
  private timeoutMs: number;

  constructor(config: ConcurrencyConfig) {
    this.maxWorkers = config.maxWorkers;
    this.timeoutMs = config.timeoutMs;
  }

  isAvailable(): boolean {
    this.cleanupExpiredJobs();
    return this.activeJobs.size < this.maxWorkers;
  }

  acquireSlot(jobId: string): boolean {
    if (!this.isAvailable()) return false;
    this.activeJobs.set(jobId, new Date());
    return true;
  }

  releaseSlot(jobId: string): void {
    this.activeJobs.delete(jobId);
  }

  getActiveCount(): number {
    return this.activeJobs.size;
  }

  getAvailableSlots(): number {
    return Math.max(0, this.maxWorkers - this.activeJobs.size);
  }

  private cleanupExpiredJobs(): void {
    const now = new Date();
    for (const [jobId, startTime] of this.activeJobs) {
      if (now.getTime() - startTime.getTime() > this.timeoutMs) {
        this.activeJobs.delete(jobId);
      }
    }
  }
}

export const defaultConcurrencyControl = new ConcurrencyController({
  maxWorkers: parseInt(process.env.QUEUE_MAX_WORKERS || '5'),
  queueName: 'zekerflex-tasks',
  timeoutMs: 300000, // 5 minutes
});
