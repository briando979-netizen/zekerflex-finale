import { z } from 'zod';

interface OfflineQueue {
  id: string;
  action: string;
  payload: unknown;
  timestamp: number;
  retryCount: number;
}

interface SyncStrategy {
  mode: 'manual' | 'automatic' | 'aggressive';
  interval: number;
  prioritize: boolean;
  compression: boolean;
}

const offlineQueueSchema = z.object({
  id: z.string(),
  action: z.string(),
  payload: z.unknown(),
  timestamp: z.number(),
  retryCount: z.number(),
});

export type OfflineQueueItem = z.infer<typeof offlineQueueSchema>;

export async function initializeOfflineStorage(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const storage = window.localStorage;
    const queueKey = 'zf-offline-queue';
    if (!storage.getItem(queueKey)) {
      storage.setItem(queueKey, JSON.stringify([]));
    }
  } catch (err) {
    console.error('Failed to initialize offline storage:', err);
  }
}

export async function queueAction(action: string, payload: unknown): Promise<OfflineQueueItem> {
  const item: OfflineQueueItem = {
    id: `${action}-${Date.now()}`,
    action,
    payload,
    timestamp: Date.now(),
    retryCount: 0,
  };

  if (typeof window !== 'undefined') {
    try {
      const queue = JSON.parse(window.localStorage.getItem('zf-offline-queue') ?? '[]');
      queue.push(item);
      window.localStorage.setItem('zf-offline-queue', JSON.stringify(queue));
    } catch (err) {
      console.error('Failed to queue action:', err);
    }
  }

  return item;
}

export async function syncPendingActions(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const queue = JSON.parse(window.localStorage.getItem('zf-offline-queue') ?? '[]');

    for (const item of queue) {
      try {
        await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        });
      } catch (err) {
        item.retryCount++;
        if (item.retryCount < 3) {
          continue;
        }
      }
    }

    window.localStorage.setItem('zf-offline-queue', JSON.stringify([]));
  } catch (err) {
    console.error('Failed to sync pending actions:', err);
  }
}

export async function getSyncStrategy(): Promise<SyncStrategy> {
  return {
    mode: 'automatic',
    interval: 30000,
    prioritize: true,
    compression: true,
  };
}

export async function clearOfflineCache(): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem('zf-offline-queue');
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }
    } catch (err) {
      console.error('Failed to clear offline cache:', err);
    }
  }
}
