export interface QueueMetrics {
  totalProcessed: number;
  totalFailed: number;
  avgProcessingTimeMs: number;
  queueDepth: number;
  activeWorkers: number;
  failureRate: number;
  lastUpdated: Date;
}

export interface JobMetric {
  jobId: string;
  type: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

export class QueueMonitor {
  private metrics: JobMetric[] = [];
  private startTime = new Date();

  recordJobStart(jobId: string, type: string): void {
    this.metrics.push({
      jobId,
      type,
      startTime: new Date(),
      status: 'processing',
    });
  }

  recordJobComplete(jobId: string): void {
    const metric = this.metrics.find((m) => m.jobId === jobId);
    if (metric) {
      metric.endTime = new Date();
      metric.duration = metric.endTime.getTime() - metric.startTime.getTime();
      metric.status = 'completed';
    }
  }

  recordJobFailed(jobId: string, error: string): void {
    const metric = this.metrics.find((m) => m.jobId === jobId);
    if (metric) {
      metric.endTime = new Date();
      metric.duration = metric.endTime.getTime() - metric.startTime.getTime();
      metric.status = 'failed';
      metric.error = error;
    }
  }

  getMetrics(timeWindowMs = 3600000): QueueMetrics {
    const now = new Date();
    const cutoff = new Date(now.getTime() - timeWindowMs);

    const recentMetrics = this.metrics.filter((m) => m.startTime >= cutoff);
    const completed = recentMetrics.filter((m) => m.status === 'completed');
    const failed = recentMetrics.filter((m) => m.status === 'failed');
    const active = recentMetrics.filter((m) => m.status === 'processing');

    const avgDuration =
      completed.length > 0
        ? completed.reduce((sum, m) => sum + (m.duration || 0), 0) / completed.length
        : 0;

    return {
      totalProcessed: completed.length,
      totalFailed: failed.length,
      avgProcessingTimeMs: avgDuration,
      queueDepth: recentMetrics.filter((m) => m.status === 'pending').length,
      activeWorkers: active.length,
      failureRate: completed.length + failed.length > 0 ? failed.length / (completed.length + failed.length) : 0,
      lastUpdated: now,
    };
  }

  clearOldMetrics(olderThanMs = 86400000): void {
    const cutoff = new Date(Date.now() - olderThanMs);
    this.metrics = this.metrics.filter((m) => m.startTime >= cutoff);
  }
}

export const queueMonitor = new QueueMonitor();
