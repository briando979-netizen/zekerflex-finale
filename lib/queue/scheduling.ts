import cron from 'node-cron';

export interface ScheduledJob {
  id: string;
  cronExpression: string;
  taskType: string;
  payload: unknown;
  active: boolean;
  lastRun?: Date;
  nextRun?: Date;
}

export class JobScheduler {
  private scheduledJobs = new Map<string, cron.ScheduledTask>();
  private jobRegistry = new Map<string, ScheduledJob>();

  scheduleRecurring(
    jobId: string,
    cronExpression: string,
    handler: () => Promise<void>
  ): boolean {
    try {
      const task = cron.schedule(cronExpression, async () => {
        const job = this.jobRegistry.get(jobId);
        if (job) {
          job.lastRun = new Date();
          job.nextRun = this.getNextRun(cronExpression);
          await handler();
        }
      });

      this.scheduledJobs.set(jobId, task);
      return true;
    } catch {
      return false;
    }
  }

  scheduleDelayed(jobId: string, delayMs: number, handler: () => Promise<void>): void {
    setTimeout(handler, delayMs);
  }

  stop(jobId: string): void {
    const task = this.scheduledJobs.get(jobId);
    if (task) {
      task.stop();
      this.scheduledJobs.delete(jobId);
    }
  }

  stopAll(): void {
    for (const task of this.scheduledJobs.values()) {
      task.stop();
    }
    this.scheduledJobs.clear();
  }

  getScheduledJobs(): ScheduledJob[] {
    return Array.from(this.jobRegistry.values());
  }

  private getNextRun(cronExpression: string): Date {
    const task = cron.schedule(cronExpression, () => {});
    const nextDate = task.nextDate().toDate();
    task.stop();
    return nextDate;
  }
}

export const jobScheduler = new JobScheduler();
