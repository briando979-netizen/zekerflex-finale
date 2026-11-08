import Queue from 'bull';
import redis from 'redis';

const redisClient = redis.createClient({ url: process.env.REDIS_URL });

export interface QueuedTask {
  id: string;
  type: string;
  payload: unknown;
  priority: 'high' | 'medium' | 'low';
  retries: number;
  maxRetries: number;
  createdAt: Date;
  processedAt?: Date;
  failedAt?: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'dead';
}

export const taskQueue = new Queue('zekerflex-tasks', {
  redis: { url: process.env.REDIS_URL },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

export async function enqueueTask(
  type: string,
  payload: unknown,
  priority: 'high' | 'medium' | 'low' = 'medium'
): Promise<string> {
  const job = await taskQueue.add(
    { type, payload },
    {
      priority: priority === 'high' ? 1 : priority === 'medium' ? 5 : 10,
      removeOnComplete: true,
    }
  );
  return job.id;
}

export async function processQueue(
  handler: (task: QueuedTask) => Promise<void>,
  maxWorkers = 5
): Promise<void> {
  taskQueue.process(maxWorkers, async (job) => {
    const task: QueuedTask = {
      id: job.id,
      type: job.data.type,
      payload: job.data.payload,
      priority: job.data.priority || 'medium',
      retries: job.attemptsMade,
      maxRetries: job.attempts,
      createdAt: new Date(job.timestamp),
      status: 'processing',
    };

    try {
      await handler(task);
      task.status = 'completed';
      task.processedAt = new Date();
    } catch (err) {
      task.status = 'failed';
      task.failedAt = new Date();
      if (job.attemptsMade >= job.attempts) {
        task.status = 'dead';
      }
      throw err;
    }
  });
}

export async function getQueueStats() {
  const count = await taskQueue.count();
  const failed = await taskQueue.getFailedCount();
  const completed = await taskQueue.getCompletedCount();
  const delayed = await taskQueue.getDelayedCount();
  const active = await taskQueue.getActiveCount();

  return { count, failed, completed, delayed, active };
}
