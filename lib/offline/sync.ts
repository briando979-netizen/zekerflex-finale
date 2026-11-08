// Offline-first sync architecture with conflict resolution
import { generateId } from '@/lib/id';

export interface SyncItem {
  id: string;
  entityId: string;
  entityType: string;
  operation: 'create' | 'update' | 'delete';
  data: unknown;
  version: number;
  timestamp: number;
  resolved: boolean;
  error?: string;
}

export interface ConflictResolution {
  strategy: 'server-wins' | 'client-wins' | 'merge';
  clientVersion: number;
  serverVersion: number;
  mergedData?: unknown;
}

export class OfflineSync {
  private static readonly DB_NAME = 'zekerflex-offline';
  private static readonly STORE_NAME = 'sync-queue';
  private static readonly METADATA_STORE = 'metadata';
  private db: IDBDatabase | null = null;

  async initialize() {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(OfflineSync.DB_NAME, 1);

      req.onerror = () => reject(req.error);

      req.onsuccess = () => {
        this.db = req.result;
        resolve();
      };

      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(OfflineSync.STORE_NAME)) {
          const store = db.createObjectStore(OfflineSync.STORE_NAME, { keyPath: 'id' });
          store.createIndex('entityId', 'entityId');
          store.createIndex('timestamp', 'timestamp');
          store.createIndex('resolved', 'resolved');
        }

        if (!db.objectStoreNames.contains(OfflineSync.METADATA_STORE)) {
          db.createObjectStore(OfflineSync.METADATA_STORE);
        }
      };
    });
  }

  async enqueue(item: Omit<SyncItem, 'id' | 'resolved'>) {
    if (!this.db) await this.initialize();

    const syncItem: SyncItem = {
      ...item,
      id: generateId(),
      resolved: false,
    };

    return new Promise<string>((resolve, reject) => {
      const tx = this.db!.transaction([OfflineSync.STORE_NAME], 'readwrite');
      const store = tx.objectStore(OfflineSync.STORE_NAME);
      const req = store.add(syncItem);

      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(syncItem.id);
    });
  }

  async getQueue(limit = 100): Promise<SyncItem[]> {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([OfflineSync.STORE_NAME], 'readonly');
      const store = tx.objectStore(OfflineSync.STORE_NAME);
      const index = store.index('resolved');
      const req = index.getAll(false);

      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result.slice(0, limit));
    });
  }

  async getQueueSize(): Promise<number> {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([OfflineSync.STORE_NAME], 'readonly');
      const store = tx.objectStore(OfflineSync.STORE_NAME);
      const index = store.index('resolved');
      const req = index.count(false);

      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
  }

  async markResolved(id: string, resolved = true) {
    if (!this.db) await this.initialize();

    return new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction([OfflineSync.STORE_NAME], 'readwrite');
      const store = tx.objectStore(OfflineSync.STORE_NAME);
      const req = store.get(id);

      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const item = req.result as SyncItem | undefined;
        if (item) {
          const updateReq = store.put({ ...item, resolved });
          updateReq.onerror = () => reject(updateReq.error);
          updateReq.onsuccess = () => resolve();
        }
      };
    });
  }

  async markError(id: string, error: string) {
    if (!this.db) await this.initialize();

    return new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction([OfflineSync.STORE_NAME], 'readwrite');
      const store = tx.objectStore(OfflineSync.STORE_NAME);
      const req = store.get(id);

      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const item = req.result as SyncItem | undefined;
        if (item) {
          const updateReq = store.put({ ...item, error });
          updateReq.onerror = () => reject(updateReq.error);
          updateReq.onsuccess = () => resolve();
        }
      };
    });
  }

  // Conflict resolution strategies
  static resolveConflict(resolution: ConflictResolution): unknown {
    switch (resolution.strategy) {
      case 'server-wins':
        return null; // Server version wins, discard client changes
      case 'client-wins':
        return resolution.clientVersion; // Keep client data
      case 'merge':
        return resolution.mergedData; // Use merged data
      default:
        return null;
    }
  }

  async getMetadata(key: string): Promise<unknown> {
    if (!this.db) await this.initialize();

    return new Promise((resolve) => {
      const tx = this.db!.transaction([OfflineSync.METADATA_STORE], 'readonly');
      const store = tx.objectStore(OfflineSync.METADATA_STORE);
      const req = store.get(key);

      req.onsuccess = () => resolve(req.result);
    });
  }

  async setMetadata(key: string, value: unknown): Promise<void> {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([OfflineSync.METADATA_STORE], 'readwrite');
      const store = tx.objectStore(OfflineSync.METADATA_STORE);
      const req = store.put(value, key);

      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  }

  async clearQueue() {
    if (!this.db) await this.initialize();

    return new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction([OfflineSync.STORE_NAME], 'readwrite');
      const store = tx.objectStore(OfflineSync.STORE_NAME);
      const req = store.clear();

      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  }
}

// Sync manager with retry logic
export class SyncManager {
  private db: OfflineSync;
  private isProcessing = false;
  private retryConfig = {
    maxRetries: 5,
    initialDelay: 1000,
    maxDelay: 60000,
    backoffMultiplier: 2,
  };

  constructor() {
    this.db = new OfflineSync();
  }

  async initialize() {
    await this.db.initialize();
  }

  private getBackoffDelay(attempt: number): number {
    const delay = Math.min(
      this.retryConfig.initialDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt),
      this.retryConfig.maxDelay
    );
    // Add jitter
    return delay * (0.5 + Math.random());
  }

  async processSyncQueue(
    onSync: (item: SyncItem) => Promise<{ success: boolean; error?: string }>
  ) {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const queue = await this.db.getQueue(50);

      for (const item of queue) {
        try {
          const result = await onSync(item);

          if (result.success) {
            await this.db.markResolved(item.id, true);
          } else {
            await this.db.markError(item.id, result.error || 'Unknown error');
          }
        } catch (e) {
          const error = e instanceof Error ? e.message : 'Sync failed';
          await this.db.markError(item.id, error);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  async getQueueStats() {
    const total = await this.db.getQueueSize();
    const queue = await this.db.getQueue(total);
    return {
      total,
      errors: queue.filter((i) => i.error).length,
      pending: queue.filter((i) => !i.error).length,
    };
  }
}
