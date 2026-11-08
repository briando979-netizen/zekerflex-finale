export enum JobPriority {
  HIGH = 1,
  MEDIUM = 5,
  LOW = 10,
}

export interface PriorityQueueJob {
  id: string;
  priority: JobPriority;
  type: string;
  payload: unknown;
  scheduledFor?: Date;
}

export class PriorityQueue {
  private jobs: PriorityQueueJob[] = [];

  enqueue(job: PriorityQueueJob): void {
    this.jobs.push(job);
    this.jobs.sort((a, b) => a.priority - b.priority);
  }

  dequeue(): PriorityQueueJob | undefined {
    return this.jobs.shift();
  }

  peek(): PriorityQueueJob | undefined {
    return this.jobs[0];
  }

  size(): number {
    return this.jobs.length;
  }

  getByPriority(priority: JobPriority): PriorityQueueJob[] {
    return this.jobs.filter((j) => j.priority === priority);
  }

  clear(): void {
    this.jobs = [];
  }
}

export function getPriorityValue(priority: 'high' | 'medium' | 'low'): JobPriority {
  switch (priority) {
    case 'high':
      return JobPriority.HIGH;
    case 'medium':
      return JobPriority.MEDIUM;
    case 'low':
      return JobPriority.LOW;
  }
}
