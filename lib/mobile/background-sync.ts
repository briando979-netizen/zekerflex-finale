/**
 * Background Sync Subsystem
 *
 * Manages offline actions, queues them, and syncs when connection restored.
 * Supports periodic sync via BackgroundSync API with fallback to manual checks.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ===== Offline Queue Management =====

export interface QueuedAction {
  id: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  payload: Record<string, unknown>;
  synced: boolean;
  syncAttempts: number;
  lastSyncError?: string;
}

/**
 * Add action to offline queue
 */
export async function queueOfflineAction(
  userId: string,
  action: string,
  resourceType: string,
  payload: Record<string, unknown>,
  resourceId?: string,
): Promise<string> {
  try {
    const queued = await prisma.offlineQueue.create({
      data: {
        userId,
        action,
        resourceType,
        resourceId,
        payload,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });

    logger.info("Action queued for offline sync", {
      userId,
      action,
      queueId: queued.id,
    });

    return queued.id;
  } catch (error) {
    logger.error("Failed to queue offline action", {
      error: (error as Error).message,
      userId,
      action,
    });
    throw error;
  }
}

/**
 * Get pending actions for a user
 */
export async function getPendingActions(userId: string): Promise<QueuedAction[]> {
  try {
    const actions = await prisma.offlineQueue.findMany({
      where: {
        userId,
        synced: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "asc" },
    });

    return actions as QueuedAction[];
  } catch (error) {
    logger.warn("Failed to get pending actions", {
      error: (error as Error).message,
      userId,
    });
    return [];
  }
}

/**
 * Mark action as synced
 */
export async function markActionSynced(queueId: string): Promise<void> {
  try {
    await prisma.offlineQueue.update({
      where: { id: queueId },
      data: {
        synced: true,
        syncedAt: new Date(),
        lastSyncError: null,
      },
    });
  } catch (error) {
    logger.warn("Failed to mark action as synced", {
      error: (error as Error).message,
      queueId,
    });
  }
}

/**
 * Record sync failure
 */
export async function recordSyncError(
  queueId: string,
  error: string,
): Promise<void> {
  try {
    const action = await prisma.offlineQueue.findUnique({
      where: { id: queueId },
      select: { syncAttempts: true },
    });

    if (!action) return;

    const attempts = action.syncAttempts + 1;
    const expired = attempts > 10; // Give up after 10 attempts

    await prisma.offlineQueue.update({
      where: { id: queueId },
      data: {
        syncAttempts: attempts,
        lastSyncError: error,
        synced: expired, // Mark as done (expired) after too many failures
      },
    });

    if (expired) {
      logger.warn("Offline action expired after failed syncs", {
        queueId,
        attempts,
      });
    }
  } catch (e) {
    logger.warn("Failed to record sync error", {
      error: (e as Error).message,
      queueId,
    });
  }
}

/**
 * Clean up old synced/expired actions (run in cron)
 */
export async function cleanupOldActions(): Promise<number> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await prisma.offlineQueue.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { synced: true, syncedAt: { lt: thirtyDaysAgo } },
        ],
      },
    });

    logger.info("Cleaned up old offline actions", { count: result.count });
    return result.count;
  } catch (error) {
    logger.error("Cleanup failed", {
      error: (error as Error).message,
    });
    return 0;
  }
}

// ===== Background Sync Registration =====

/**
 * Register a background sync task
 */
export async function registerBackgroundSync(tag: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    if ("SyncManager" in window && "sync" in registration) {
      await (registration as Record<string, unknown> & {
        sync: { register: (tag: string) => Promise<void> };
      }).sync.register(tag);
      logger.info("Background sync registered", { tag });
      return true;
    }
  } catch (error) {
    logger.warn("Background sync registration failed", {
      error: (error as Error).message,
      tag,
    });
  }
  return false;
}

/**
 * Check if background sync is available
 */
export function isBackgroundSyncAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "SyncManager" in window &&
    "sync" in (navigator.serviceWorker as Record<string, unknown>)
  );
}

// ===== Sync Task Management =====

/**
 * Create or update sync task
 */
export async function upsertSyncTask(
  userId: string,
  tag: string,
  minInterval: number = 60,
): Promise<void> {
  try {
    await prisma.syncTask.upsert({
      where: { userId_tag: { userId, tag } },
      create: {
        userId,
        tag,
        minInterval,
        status: "idle",
      },
      update: {
        minInterval,
      },
    });
  } catch (error) {
    logger.warn("Failed to upsert sync task", {
      error: (error as Error).message,
      userId,
      tag,
    });
  }
}

/**
 * Get next sync tasks due for a user
 */
export async function getNextSyncTasks(userId: string) {
  try {
    const now = new Date();
    return await prisma.syncTask.findMany({
      where: {
        userId,
        OR: [
          { status: "idle" },
          { status: "completed", nextSyncAt: { lte: now } },
        ],
      },
    });
  } catch (error) {
    logger.warn("Failed to get sync tasks", {
      error: (error as Error).message,
      userId,
    });
    return [];
  }
}

/**
 * Mark sync task as syncing
 */
export async function markSyncStarted(
  userId: string,
  tag: string,
): Promise<void> {
  try {
    await prisma.syncTask.update({
      where: { userId_tag: { userId, tag } },
      data: {
        status: "syncing",
      },
    });
  } catch (error) {
    logger.warn("Failed to mark sync started", {
      error: (error as Error).message,
      userId,
      tag,
    });
  }
}

/**
 * Mark sync task as completed
 */
export async function markSyncCompleted(
  userId: string,
  tag: string,
): Promise<void> {
  try {
    const task = await prisma.syncTask.findUnique({
      where: { userId_tag: { userId, tag } },
    });

    if (!task) return;

    const nextSync = new Date(Date.now() + task.minInterval * 1000);

    await prisma.syncTask.update({
      where: { userId_tag: { userId, tag } },
      data: {
        status: "completed",
        lastSyncAt: new Date(),
        nextSyncAt: nextSync,
        failureCount: 0,
        lastError: null,
      },
    });
  } catch (error) {
    logger.warn("Failed to mark sync completed", {
      error: (error as Error).message,
      userId,
      tag,
    });
  }
}

/**
 * Mark sync task as failed
 */
export async function markSyncFailed(
  userId: string,
  tag: string,
  error: string,
): Promise<void> {
  try {
    const task = await prisma.syncTask.findUnique({
      where: { userId_tag: { userId, tag } },
    });

    if (!task) return;

    const failureCount = task.failureCount + 1;
    // Exponential backoff: 1min, 5min, 15min, 30min, 60min...
    const backoffMinutes = Math.min(Math.pow(5, failureCount - 1), 60);
    const nextSync = new Date(Date.now() + backoffMinutes * 60 * 1000);

    await prisma.syncTask.update({
      where: { userId_tag: { userId, tag } },
      data: {
        status: "failed",
        failureCount,
        lastError: error,
        nextSyncAt: nextSync,
      },
    });
  } catch (e) {
    logger.warn("Failed to mark sync failed", {
      error: (e as Error).message,
      userId,
      tag,
    });
  }
}

// ===== Sync Execution (called by service worker or client) =====

/**
 * Sync handler: process all pending actions for a user
 */
export async function syncPendingActions(userId: string): Promise<{
  synced: number;
  failed: number;
  errors: Record<string, string>;
}> {
  const pending = await getPendingActions(userId);
  let synced = 0;
  let failed = 0;
  const errors: Record<string, string> = {};

  for (const action of pending) {
    try {
      // Dispatch to appropriate handler
      const handler = getSyncHandler(action.action);
      await handler(userId, action.payload, action.resourceId);

      await markActionSynced(action.id);
      synced++;
    } catch (error) {
      const errorMsg = (error as Error).message;
      errors[action.id] = errorMsg;
      await recordSyncError(action.id, errorMsg);
      failed++;
    }
  }

  logger.info("Sync batch completed", {
    userId,
    synced,
    failed,
  });

  return { synced, failed, errors };
}

type SyncHandler = (
  userId: string,
  payload: Record<string, unknown>,
  resourceId?: string,
) => Promise<void>;

const SYNC_HANDLERS: Record<string, SyncHandler> = {
  create_shift: async (userId, payload) => {
    // Example: sync create shift action
    const response = await fetch("/api/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  },
  apply_shift: async (userId, payload, resourceId) => {
    const response = await fetch(`/api/shifts/${resourceId}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  },
  send_message: async (userId, payload) => {
    const response = await fetch("/api/chat/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  },
};

function getSyncHandler(action: string): SyncHandler {
  return (
    SYNC_HANDLERS[action] || (async () => {
      throw new Error(`Unknown sync action: ${action}`);
    })
  );
}

/**
 * Client-side: trigger sync when online
 */
export async function triggerSync(userId: string): Promise<void> {
  if (!navigator.onLine) return;

  try {
    const response = await fetch("/api/mobile/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      logger.warn("Sync trigger failed", {
        status: response.status,
        userId,
      });
    }
  } catch (error) {
    logger.warn("Sync trigger error", {
      error: (error as Error).message,
      userId,
    });
  }
}
